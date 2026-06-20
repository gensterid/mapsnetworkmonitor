import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { getRedisConnection, closeRedisConnection, createRedisConnection } from '../lib/redis-client.js';
import { routerService } from './router.service.js';
import { env } from '../config/env.js';

// Re-export for compatibility
export { getRedisConnection };

// === Router Sync Queue ===
export const routerSyncQueue = new Queue('router-sync', {
    connection: createRedisConnection() as any,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

// === OLT Sync Queue ===
export const oltSyncQueue = new Queue('olt-sync', {
    connection: createRedisConnection() as any,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: 100,
    },
});

// === Worker Implementation ===
let worker: Worker | null = null;

/**
 * Per-router circuit breaker. After N consecutive failures, the breaker
 * "opens" and we skip the router for COOLDOWN_MS. After the cooldown the
 * breaker goes "half-open" — the next job runs; success closes the breaker,
 * failure re-opens it for another cooldown.
 *
 * This prevents one unhealthy router (slow CPU, exhausted session pool,
 * stuck PPPoE poll) from monopolising worker slots and starving healthy
 * routers in the fleet.
 */
// Per-router circuit breaker — open setelah N consecutive failures, half-open
// setelah cooldown. Tunables ada di env (lihat config/env.ts).
const CB_FAIL_THRESHOLD = env.ROUTER_CB_THRESHOLD;
const CB_COOLDOWN_MS = env.ROUTER_CB_COOLDOWN_MS;
type BreakerState = { failures: number; openUntil: number };
const breaker = new Map<string, BreakerState>();

function breakerAllow(routerId: string): boolean {
    const s = breaker.get(routerId);
    if (!s) return true;
    if (s.openUntil > Date.now()) return false;
    return true;
}
function breakerRecord(routerId: string, ok: boolean) {
    const s = breaker.get(routerId) || { failures: 0, openUntil: 0 };
    if (ok) {
        if (s.failures > 0 || s.openUntil > 0) {
            logger.info({ routerId, hadFailures: s.failures }, 'Router circuit breaker: closed');
        }
        breaker.delete(routerId);
        return;
    }
    s.failures++;
    if (s.failures >= CB_FAIL_THRESHOLD) {
        s.openUntil = Date.now() + CB_COOLDOWN_MS;
        logger.warn({ routerId, failures: s.failures, cooldownMs: CB_COOLDOWN_MS }, 'Router circuit breaker: opened — skipping until cooldown');
    }
    breaker.set(routerId, s);
}

/**
 * Per-router adaptive polling state. Tracks consecutive failures and the
 * time of the last enqueue. Used by the scheduler to decide whether a
 * router needs a fresh job this cycle, or whether it should be skipped
 * because either:
 *   (a) the circuit breaker is open,
 *   (b) the router is in adaptive back-off,
 *   (c) a job was enqueued very recently (anti-storm).
 *
 * Back-off doubles after each failure up to 16× base interval, then
 * resets on the next success.
 */
type AdaptiveState = { failures: number; nextEligibleAt: number };
const adaptive = new Map<string, AdaptiveState>();
// Adaptive back-off: skip router yang baru fail untuk cycle berikutnya,
// dengan exponential multiplier capped di MAX_MULTIPLIER.
const ADAPTIVE_BASE_MS = env.ADAPTIVE_BASE_MS;
const ADAPTIVE_MAX_MULTIPLIER = env.ADAPTIVE_MAX_MULTIPLIER;

export function shouldEnqueueRouter(routerId: string): boolean {
    if (!breakerAllow(routerId)) return false;
    const s = adaptive.get(routerId);
    if (!s) return true;
    return Date.now() >= s.nextEligibleAt;
}

function adaptiveRecord(routerId: string, ok: boolean) {
    if (ok) {
        if (adaptive.has(routerId)) adaptive.delete(routerId);
        return;
    }
    const s = adaptive.get(routerId) || { failures: 0, nextEligibleAt: 0 };
    s.failures = Math.min(s.failures + 1, 16);
    const multiplier = Math.min(2 ** s.failures, ADAPTIVE_MAX_MULTIPLIER);
    s.nextEligibleAt = Date.now() + ADAPTIVE_BASE_MS * multiplier;
    adaptive.set(routerId, s);
}

/**
 * Backpressure check — returns true if the queue is healthy enough to
 * accept more jobs. Used by the scheduler to skip an entire enqueue
 * cycle when the worker is already saturated.
 */
const BP_WAITING_LIMIT = env.QUEUE_BP_WAITING_LIMIT;

/** Reset all circuit breakers (manual admin action). */
export function clearBreakers(): number {
    const n = breaker.size;
    breaker.clear();
    if (n > 0) logger.warn({ cleared: n }, 'Router circuit breakers manually cleared');
    return n;
}

/** Reset all adaptive back-off counters (manual admin action). */
export function clearAdaptiveBackoffs(): number {
    const n = adaptive.size;
    adaptive.clear();
    if (n > 0) logger.warn({ cleared: n }, 'Router adaptive back-offs manually cleared');
    return n;
}

/** Snapshot of in-memory breaker + adaptive state for diagnostics. */
export function getRouterHealthSnapshot() {
    const now = Date.now();
    const breakers: Array<{ routerId: string; failures: number; openForSec: number }> = [];
    for (const [routerId, s] of breaker.entries()) {
        if (s.openUntil > now) {
            breakers.push({ routerId, failures: s.failures, openForSec: Math.round((s.openUntil - now) / 1000) });
        }
    }
    const backoffs: Array<{ routerId: string; failures: number; eligibleInSec: number }> = [];
    for (const [routerId, s] of adaptive.entries()) {
        if (s.nextEligibleAt > now) {
            backoffs.push({ routerId, failures: s.failures, eligibleInSec: Math.round((s.nextEligibleAt - now) / 1000) });
        }
    }
    return { breakers, backoffs };
}

export async function queueHasCapacity(): Promise<boolean> {
    try {
        const waiting = await routerSyncQueue.getWaitingCount();
        if (waiting > BP_WAITING_LIMIT) {
            logger.warn({ waiting, limit: BP_WAITING_LIMIT }, 'Queue backpressure — skipping enqueue cycle');
            return false;
        }
        return true;
    } catch (err) {
        // If we can't read the queue, fail-open to avoid blocking forever.
        return true;
    }
}

export function startQueueWorker() {
    if (worker) return;

    logger.info('🚀 Starting Queue Worker (BullMQ)...');

    worker = new Worker(
        'router-sync',
        async (job: Job) => {
            const { routerId, includeNetwatch, isFullSync, tenantId } = job.data;

            if (!breakerAllow(routerId)) {
                logger.debug({ routerId, jobId: job.id }, 'Router circuit breaker open \xe2\x80\x94 skipping');
                return { success: false, skipped: 'circuit-breaker-open' };
            }

            // Per-router timing: log "Polling router X... done in 1.2s" format
            // per spec. Operator visibility ke berapa lama tiap router (deteksi
            // slow router yang ngeblok worker pool).
            const startTime = Date.now();
            logger.debug({
                jobId: job.id,
                routerId,
                isFullSync,
            }, `\xf0\x9f\x94\x84 Polling router ${routerId}...`);

            try {
                await routerService.refreshRouterStatus(routerId, includeNetwatch, isFullSync, tenantId);
                const elapsedMs = Date.now() - startTime;
                breakerRecord(routerId, true);
                adaptiveRecord(routerId, true);

                // INFO level kalau slow (> 5s), DEBUG kalau normal (operator
                // sehari-hari tidak perlu lihat log success normal).
                const elapsedSec = (elapsedMs / 1000).toFixed(2);
                if (elapsedMs > 5000) {
                    logger.info({ routerId, jobId: job.id, elapsedMs }, `\xe2\x9c\x85 Polling router ${routerId}... done in ${elapsedSec}s (SLOW)`);
                } else {
                    logger.debug({ routerId, jobId: job.id, elapsedMs }, `\xe2\x9c\x85 Polling router ${routerId}... done in ${elapsedSec}s`);
                }

                return { success: true, elapsedMs };
            } catch (err: any) {
                const elapsedMs = Date.now() - startTime;
                breakerRecord(routerId, false);
                adaptiveRecord(routerId, false);
                logger.error({
                    err: err.message,
                    routerId,
                    jobId: job.id,
                    elapsedMs,
                }, `\xe2\x9d\x8c Polling router ${routerId}... failed in ${(elapsedMs / 1000).toFixed(2)}s`);
                throw err; // Throw to trigger BullMQ retry
            }
        },
        {
            connection: createRedisConnection() as any,
            // Concurrency: at ~15s per router poll, default 5 = drain ~20
            // routers/minute. Raise via ROUTER_SYNC_CONCURRENCY untuk cluster
            // besar, lower kalau MikroTik atau DB pool saturated.
            // Note: env schema default 5 (lebih konservatif dari sebelumnya 20).
            concurrency: env.ROUTER_SYNC_CONCURRENCY,
        }
    );

    worker.on('completed', (job: Job) => {
        // Already logged inside handler dengan timing; skip duplicate.
        logger.debug({ jobId: job.id, returnvalue: job.returnvalue }, 'BullMQ marked job completed');
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        logger.error({ jobId: job?.id, err: err.message }, 'Sync job failed permanently');
    });

    // OLT Worker Implementation
    new Worker(
        'olt-sync',
        async (job: Job) => {
            const { oltId, tenantId, type } = job.data;
            const { oltService } = await import('./olt.service.js');

            logger.debug({ oltId, type }, 'Processing OLT sync job');

            try {
                if (type === 'refresh') {
                    await oltService.refreshStatus(oltId, tenantId);
                } else if (type === 'sync-inventory') {
                    await oltService.refreshStatus(oltId, tenantId);
                    await oltService.syncOnuInventory(oltId, tenantId);
                }
                return { success: true };
            } catch (err: any) {
                logger.error({ err: err.message, oltId, type }, 'OLT sync job failed');
                throw err;
            }
        },
        {
            connection: createRedisConnection() as any,
            concurrency: env.OLT_SYNC_CONCURRENCY,
        }
    );
}

export async function stopQueueWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    await closeRedisConnection();
}
