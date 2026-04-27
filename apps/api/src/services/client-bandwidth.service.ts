import { db } from '../db/index.js';
import { clientBandwidthHistory, type NewClientBandwidthHistory } from '../db/schema/index.js';
import type { PppSession, SimpleQueueData } from '../lib/mikrotik/types.js';
import { logger } from '../lib/logger.js';

/**
 * ClientBandwidthService — Phase 1.
 *
 * Tracks per-client bandwidth deltas from RouterOS counters and persists
 * them as a time-series. Counters are cumulative-per-session/queue, so we
 * keep an in-memory snapshot of the previous read and insert (current −
 * previous) on every poll.
 *
 * Sumber data:
 *   • PPPoE active  → identifier=username, identifierType='pppoe_user'
 *   • Simple Queue  → identifier=queue.name, identifierType='queue_name'
 *
 * Counter reset (session disconnect, queue rebuild, router reboot) is
 * detected by `current < previous` → new baseline saved, no negative delta
 * inserted.
 */

interface Reading {
    txBytes: number;
    rxBytes: number;
    ts: number;
}

interface BandwidthSnapshot {
    routerId: string;
    tenantId: string;
    pppActive?: PppSession[];
    simpleQueues?: SimpleQueueData[];
}

class ClientBandwidthService {
    /** key: `${routerId}:${identifierType}:${identifier}` */
    private readings: Map<string, Reading> = new Map();

    /**
     * Maximum age of a reading before treating it as stale (router was offline,
     * data not comparable). 15 minutes covers a couple of missed 2-min cycles.
     */
    private readonly STALE_AFTER_MS = 15 * 60 * 1000;

    private key(routerId: string, identifierType: string, identifier: string): string {
        return `${routerId}:${identifierType}:${identifier}`;
    }

    /**
     * Record a poll cycle. Pulls cumulative byte counters from PPPoE active
     * and/or simple queues, computes deltas vs the previous snapshot, persists
     * a row per identifier with non-zero traffic.
     */
    async record(snapshot: BandwidthSnapshot): Promise<number> {
        const { routerId, tenantId } = snapshot;
        if (!tenantId || !routerId) return 0;

        const now = Date.now();
        const rows: NewClientBandwidthHistory[] = [];
        const recordedAt = new Date(now);

        const pushDelta = (
            identifier: string,
            identifierType: 'pppoe_user' | 'queue_name',
            currentTx: number,
            currentRx: number,
        ) => {
            if (!Number.isFinite(currentTx) || !Number.isFinite(currentRx)) return;
            if (currentTx < 0 || currentRx < 0) return;

            const k = this.key(routerId, identifierType, identifier);
            const prev = this.readings.get(k);
            this.readings.set(k, { txBytes: currentTx, rxBytes: currentRx, ts: now });

            // First reading or stale baseline → seed only, don't insert.
            if (!prev || (now - prev.ts) > this.STALE_AFTER_MS) return;

            // Counter reset → re-baseline, skip this cycle.
            if (currentTx < prev.txBytes || currentRx < prev.rxBytes) return;

            const txDelta = currentTx - prev.txBytes;
            const rxDelta = currentRx - prev.rxBytes;
            if (txDelta === 0 && rxDelta === 0) return;

            const intervalSeconds = Math.max(1, Math.round((now - prev.ts) / 1000));

            rows.push({
                tenantId,
                routerId,
                identifier,
                identifierType,
                txBytesDelta: txDelta,
                rxBytesDelta: rxDelta,
                intervalSeconds,
                recordedAt,
            });
        };

        // PPPoE — RouterOS reports bytes from the *server* perspective:
        //   bytes-in  = bytes received from the client (client TX / upload)
        //   bytes-out = bytes sent to the client (client RX / download)
        // Mapping to our DB column names (which are tx/rx from CLIENT perspective):
        //   txBytesDelta = client TX = bytes-in
        //   rxBytesDelta = client RX = bytes-out
        if (Array.isArray(snapshot.pppActive)) {
            for (const s of snapshot.pppActive) {
                if (!s?.name) continue;
                pushDelta(
                    s.name,
                    'pppoe_user',
                    Number(s.bytesIn ?? 0),
                    Number(s.bytesOut ?? 0),
                );
            }
        }

        // Simple Queue — `bytes` is "tx/rx" combined string e.g. "12345/67890".
        // First number = bytes uploaded by target, second = bytes downloaded.
        // We map upload→txBytesDelta, download→rxBytesDelta.
        if (Array.isArray(snapshot.simpleQueues)) {
            for (const q of snapshot.simpleQueues) {
                if (!q?.name || q.disabled) continue;
                const raw = String(q.bytes || '');
                const parts = raw.split('/');
                if (parts.length !== 2) continue;
                const tx = parseInt(parts[0], 10);
                const rx = parseInt(parts[1], 10);
                if (!Number.isFinite(tx) || !Number.isFinite(rx)) continue;
                pushDelta(q.name, 'queue_name', tx, rx);
            }
        }

        if (rows.length === 0) return 0;

        try {
            await db.insert(clientBandwidthHistory).values(rows);
            return rows.length;
        } catch (err: any) {
            logger.warn({ err: err?.message, routerId, count: rows.length }, 'client-bandwidth insert failed');
            return 0;
        }
    }

    /**
     * Drop in-memory baseline for a router (e.g. when router is deleted or
     * goes offline for an extended period). Called by router lifecycle hooks.
     */
    clearRouter(routerId: string): void {
        const prefix = `${routerId}:`;
        for (const k of this.readings.keys()) {
            if (k.startsWith(prefix)) this.readings.delete(k);
        }
    }
}

export const clientBandwidthService = new ClientBandwidthService();
