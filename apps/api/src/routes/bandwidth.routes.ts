import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { logger } from '../lib/logger.js';

/**
 * Per-client bandwidth analytics (Phase 1).
 *
 * Routes:
 *   GET  /api/bandwidth/router/:routerId/top
 *   GET  /api/bandwidth/router/:routerId/client/:identifier/history
 *   GET  /api/bandwidth/router/:routerId/summary
 *
 * Mounted from routes/index.ts as `/bandwidth`. Tenant scoping comes from
 * getEffectiveTenantId so superadmin viewing a tenant works as expected.
 */

const router = Router();

router.use(authMiddleware);

const periodSchema = z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h');

function periodToInterval(period: string): string {
    switch (period) {
        case '1h': return '1 hour';
        case '6h': return '6 hours';
        case '7d': return '7 days';
        case '30d': return '30 days';
        case '24h':
        default:
            return '24 hours';
    }
}

/**
 * Pick a sensible time-bucket for charts so we always return roughly 50–200
 * points regardless of the requested range.
 */
function bucketForPeriod(period: string): string {
    switch (period) {
        case '1h': return '1 minute';
        case '6h': return '5 minutes';
        case '7d': return '1 hour';
        case '30d': return '6 hours';
        case '24h':
        default:
            return '15 minutes';
    }
}

// GET /bandwidth/router/:routerId/top?period=24h&limit=20&type=pppoe_user
router.get('/router/:routerId/top', asyncHandler(async (req, res) => {
    const routerId = req.params.routerId as string;
    const tenantId = getEffectiveTenantId(req);
    const period = periodSchema.parse(req.query.period || '24h');
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20);
    const identifierType = req.query.type ? String(req.query.type) : null;

    const interval = periodToInterval(period);
    const tenantClause = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
    const typeClause = identifierType ? sql`AND identifier_type = ${identifierType}` : sql``;

    const rows = await db.execute(sql`
        SELECT
            identifier,
            identifier_type,
            SUM(tx_bytes_delta)::bigint AS tx_bytes,
            SUM(rx_bytes_delta)::bigint AS rx_bytes,
            (SUM(tx_bytes_delta) + SUM(rx_bytes_delta))::bigint AS total_bytes,
            count(*)::int AS samples,
            min(recorded_at) AS first_seen,
            max(recorded_at) AS last_seen
        FROM client_bandwidth_history
        WHERE router_id = ${routerId}
          AND recorded_at >= NOW() - (${interval}::interval)
          ${tenantClause}
          ${typeClause}
        GROUP BY identifier, identifier_type
        ORDER BY total_bytes DESC
        LIMIT ${limit}
    `) as any[];

    res.json({ data: rows, period, limit });
}));

// GET /bandwidth/router/:routerId/client/:identifier/history?period=24h&type=pppoe_user
router.get('/router/:routerId/client/:identifier/history', asyncHandler(async (req, res) => {
    const routerId = req.params.routerId as string;
    const identifier = req.params.identifier as string;
    const tenantId = getEffectiveTenantId(req);
    const period = periodSchema.parse(req.query.period || '24h');
    const identifierType = req.query.type ? String(req.query.type) : null;
    const interval = periodToInterval(period);
    const bucket = bucketForPeriod(period);

    const tenantClause = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
    const typeClause = identifierType ? sql`AND identifier_type = ${identifierType}` : sql``;

    const rows = await db.execute(sql`
        SELECT
            date_trunc('minute', recorded_at) AS ts,
            SUM(tx_bytes_delta)::bigint AS tx_bytes,
            SUM(rx_bytes_delta)::bigint AS rx_bytes,
            SUM(interval_seconds)::int AS interval_total
        FROM client_bandwidth_history
        WHERE router_id = ${routerId}
          AND identifier = ${identifier}
          AND recorded_at >= NOW() - (${interval}::interval)
          ${tenantClause}
          ${typeClause}
        GROUP BY 1
        ORDER BY 1 ASC
    `) as any[];

    // Bucket aggregation in JS so we don't need to detect TimescaleDB time_bucket
    // availability per environment. Caps at the chart-friendly bucket size.
    const bucketSeconds = bucketSecondsFromInterval(bucket);
    const bucketed = bucketRows(rows, bucketSeconds);

    res.json({ data: bucketed, period, bucket });
}));

// GET /bandwidth/router/:routerId/summary
router.get('/router/:routerId/summary', asyncHandler(async (req, res) => {
    const routerId = req.params.routerId as string;
    const tenantId = getEffectiveTenantId(req);
    const tenantClause = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;

    try {
        const [summary] = await db.execute(sql`
            SELECT
                count(DISTINCT identifier) FILTER (WHERE recorded_at >= NOW() - INTERVAL '24 hours')::int AS active_clients_24h,
                COALESCE(SUM(tx_bytes_delta) FILTER (WHERE recorded_at >= NOW() - INTERVAL '24 hours'), 0)::bigint AS tx_bytes_24h,
                COALESCE(SUM(rx_bytes_delta) FILTER (WHERE recorded_at >= NOW() - INTERVAL '24 hours'), 0)::bigint AS rx_bytes_24h,
                count(*) FILTER (WHERE recorded_at >= NOW() - INTERVAL '24 hours')::int AS samples_24h,
                max(recorded_at) AS last_recorded
            FROM client_bandwidth_history
            WHERE router_id = ${routerId}
              ${tenantClause}
        `) as any[];
        res.json({ data: summary || null });
    } catch (err: any) {
        logger.warn({ err: err?.message, routerId }, 'bandwidth summary failed');
        res.json({ data: null });
    }
}));

function bucketSecondsFromInterval(interval: string): number {
    const [n, unit] = interval.split(' ');
    const x = parseInt(n, 10) || 1;
    if (unit?.startsWith('minute')) return x * 60;
    if (unit?.startsWith('hour')) return x * 3600;
    if (unit?.startsWith('day')) return x * 86400;
    return 900; // default 15 min
}

function bucketRows(rows: any[], bucketSeconds: number): any[] {
    if (!rows || rows.length === 0) return [];
    const buckets = new Map<number, { ts: Date; tx: number; rx: number; interval: number }>();
    for (const r of rows) {
        const t = new Date(r.ts).getTime();
        const slot = Math.floor(t / (bucketSeconds * 1000)) * bucketSeconds * 1000;
        const cur = buckets.get(slot) || { ts: new Date(slot), tx: 0, rx: 0, interval: 0 };
        cur.tx += Number(r.tx_bytes || 0);
        cur.rx += Number(r.rx_bytes || 0);
        cur.interval += Number(r.interval_total || 0);
        buckets.set(slot, cur);
    }
    return Array.from(buckets.values())
        .sort((a, b) => a.ts.getTime() - b.ts.getTime())
        .map(b => ({
            ts: b.ts.toISOString(),
            tx_bytes: b.tx,
            rx_bytes: b.rx,
            tx_bps: b.interval > 0 ? Math.round((b.tx * 8) / b.interval) : 0,
            rx_bps: b.interval > 0 ? Math.round((b.rx * 8) / b.interval) : 0,
        }));
}

export default router;
