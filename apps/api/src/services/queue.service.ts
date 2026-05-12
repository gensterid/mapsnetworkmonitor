import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { getRedisConnection, closeRedisConnection, createRedisConnection } from '../lib/redis-client.js';
import { routerService } from './router.service.js';

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
const CB_FAIL_THRESHOLD = parseInt(process.env.ROUTER_CB_THRESHOLD || '5', 10);
const CB_COOLDOWN_MS = parseInt(process.env.ROUTER_CB_COOLDOWN_MS || '300000', 10); // 5 min
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
const ADAPTIVE_BASE_MS = parseInt(process.env.ADAPTIVE_BASE_MS || '30000', 10);
const ADAPTIVE_MAX_MULTIPLIER = parseInt(process.env.ADAPTIVE_MAX_MULTIPLIER || '16', 10);

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
const BP_WAITING_LIMIT = parseInt(process.env.QUEUE_BP_WAITING_LIMIT || '200', 10);

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
                logger.debug({ routerId, jobId: job.id }, 'Router circuit breaker open — skipping');
                return { success: false, skipped: 'circuit-breaker-open' };
            }

            logger.debug({
                jobId: job.id,
                routerId,
                isFullSync
            }, 'Processing router sync job');

            try {
                // We use routerService directly which handles state/db updates
                await routerService.refreshRouterStatus(routerId, includeNetwatch, isFullSync, tenantId);
                breakerRecord(routerId, true);
                adaptiveRecord(routerId, true);
                return { success: true };
            } catch (err: any) {
                breakerRecord(routerId, false);
                adaptiveRecord(routerId, false);
                logger.error({
                    err: err.message,
                    routerId,
                    jobId: job.id
                }, 'Router sync job failed');
                throw err; // Throw to trigger BullMQ retry
            }
        },
        {
            connection: createRedisConnection() as any,
            // Tunable: at ~15s per router poll, concurrency=20 lets us drain
            // 80 routers per minute. Raise for larger fleets, lower if MikroTik
            // boxes or the DB connection pool become saturated.
            concurrency: parseInt(process.env.ROUTER_SYNC_CONCURRENCY || '20', 10),
        }
    );

    worker.on('completed', (job: Job) => {
        logger.debug({ jobId: job.id }, 'Sync job completed');
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
            concurrency: parseInt(process.env.OLT_SYNC_CONCURRENCY || '10', 10),
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
