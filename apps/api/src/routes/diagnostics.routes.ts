import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { getRedisConnection, getRouterHealthSnapshot, clearBreakers, clearAdaptiveBackoffs } from '../services/queue.service.js';
import { alertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('superadmin'));

type Severity = 'ok' | 'info' | 'warn' | 'critical';
interface HealthCheck { id: string; title: string; severity: Severity; detail: string; action?: string; }

/**
 * Pure interpretation layer over the metrics gathered by GET /diagnostics.
 * Each check produces a status, a one-line human-readable detail, and an
 * optional `action` hint (free-text) that the UI can render next to a button.
 */
function runHealthChecks(d: any): HealthCheck[] {
    const out: HealthCheck[] = [];
    const push = (c: HealthCheck) => out.push(c);

    const offline = d.fleet?.offline ?? 0;
    push({
        id: 'fleet-offline',
        title: 'Router Offline',
        severity: offline === 0 ? 'ok' : offline <= 2 ? 'warn' : 'critical',
        detail: `${offline} router offline dari ${d.fleet?.total ?? 0} total`,
        action: offline > 0 ? 'Cek koneksi & credential router yang offline' : undefined,
    });

    const stale = d.staleRouters?.length ?? 0;
    push({
        id: 'stale-routers',
        title: 'Metrics Stale',
        severity: stale === 0 ? 'ok' : stale <= 3 ? 'warn' : 'critical',
        detail: stale === 0 ? 'Semua router ingest metrics ≤10 menit terakhir' : `${stale} router belum kirim metrics dalam 10 menit`,
    });

    const maxIf = d.interfaces?.max_interfaces ?? 0;
    push({
        id: 'interface-hotspot',
        title: 'Interface Hotspot',
        severity: maxIf < 100 ? 'ok' : maxIf <= 200 ? 'info' : 'warn',
        detail: `Router dengan interface terbanyak: ${maxIf}`,
        action: maxIf > 200 ? 'Pertimbangkan exclude VLAN/PPPoE interface yang tidak penting dari polling' : undefined,
    });

    const maxNw = d.netwatch?.max_per_router ?? 0;
    push({
        id: 'netwatch-hotspot',
        title: 'Netwatch Load',
        severity: maxNw < 200 ? 'ok' : maxNw <= 500 ? 'info' : 'warn',
        detail: `Netwatch entry terbanyak per router: ${maxNw}`,
    });

    const heapPct = d.process?.heapTotalMB ? Math.round((d.process.heapUsedMB / d.process.heapTotalMB) * 100) : 0;
    push({
        id: 'heap-memory',
        title: 'Heap Memory',
        severity: heapPct < 70 ? 'ok' : heapPct <= 85 ? 'warn' : 'critical',
        detail: `${heapPct}% heap terpakai (${d.process?.heapUsedMB ?? 0}/${d.process?.heapTotalMB ?? 0} MB)`,
        action: heapPct > 85 ? 'Restart pm2 monitoring-api atau naikkan --max-old-space-size' : undefined,
    });

    const qWait = d.queue?.waiting ?? 0;
    push({
        id: 'queue-waiting',
        title: 'Queue Waiting',
        severity: qWait < 50 ? 'ok' : qWait <= 100 ? 'warn' : 'critical',
        detail: `${qWait} job menunggu di router-sync queue`,
    });

    const qFail = d.queue?.failed ?? 0;
    push({
        id: 'queue-failed',
        title: 'Queue Failures',
        severity: qFail === 0 ? 'ok' : qFail <= 5 ? 'warn' : 'critical',
        detail: `${qFail} job gagal permanen`,
        action: qFail > 5 ? 'Cek log untuk root cause; jalankan clear breakers kalau ada router stuck' : undefined,
    });

    push({
        id: 'redis-up',
        title: 'Redis / Queue Backend',
        severity: d.queue?.error ? 'critical' : 'ok',
        detail: d.queue?.error ? `Redis tidak terjangkau: ${d.queue.error}` : 'Redis OK',
        action: d.queue?.error ? 'Jalankan systemctl start redis-server' : undefined,
    });

    const breakers = d.routerHealth?.breakers?.length ?? 0;
    push({
        id: 'circuit-breakers',
        title: 'Circuit Breaker Open',
        severity: breakers === 0 ? 'ok' : breakers <= 2 ? 'warn' : 'critical',
        detail: breakers === 0 ? 'Tidak ada router dalam breaker' : `${breakers} router circuit-breaker open`,
        action: breakers > 0 ? 'Cek router yang gagal; bisa Clear Breakers setelah penyebab fix' : undefined,
    });

    const backoffs = d.routerHealth?.backoffs?.length ?? 0;
    push({
        id: 'adaptive-backoffs',
        title: 'Adaptive Back-off',
        severity: backoffs === 0 ? 'ok' : backoffs <= 5 ? 'info' : 'warn',
        detail: backoffs === 0 ? 'Tidak ada router di-throttle' : `${backoffs} router sedang adaptive back-off`,
    });

    const packetLoss = (d.alertsLast24h ?? []).find((a: any) => a.type === 'packet_loss')?.count ?? 0;
    push({
        id: 'alert-flood',
        title: 'Packet-Loss Alert Volume',
        severity: packetLoss < 1000 ? 'ok' : packetLoss <= 3000 ? 'info' : 'warn',
        detail: `${packetLoss} alert packet_loss dalam 24 jam`,
    });

    const totalUnresolved = (d.alertsLast24h ?? []).reduce((s: number, a: any) => s + (a.unresolved || 0), 0);
    push({
        id: 'unresolved-alerts',
        title: 'Unresolved Alerts',
        severity: totalUnresolved === 0 ? 'ok' : totalUnresolved <= 10 ? 'info' : 'warn',
        detail: `${totalUnresolved} alert belum di-resolve`,
        action: totalUnresolved > 10 ? 'Buka halaman Alerts dan acknowledge / sweep stale' : undefined,
    });

    const largest = d.dbSize?.[0];
    const largestGB = largest ? largest.bytes / (1024 ** 3) : 0;
    push({
        id: 'db-size',
        title: 'Database Size',
        severity: largestGB < 1 ? 'ok' : largestGB < 5 ? 'info' : largestGB < 20 ? 'warn' : 'critical',
        detail: largest ? `Tabel terbesar: ${largest.table_name} (${largest.pretty})` : 'No data',
        action: largestGB > 5 ? 'Jalankan Prune Retention untuk pangkas data lama' : undefined,
    });

    return out;
}

/**
 * Return status of each scaling Fase A/B feature so superadmin can see
 * what's enabled and at what config without reading source.
 */
function getFeatureStatus() {
    return [
        { id: 'A.1', title: 'Skip non-essential interfaces', active: true, config: 'lo, zerotier1, tunnel, vrrp excluded' },
        { id: 'A.2', title: 'Retention policy', active: true, config: 'bandwidth/metrics 30d, resolved alerts 30d' },
        { id: 'A.3', title: 'Packet-loss alert dedupe', active: true, config: '30 min cooldown via index' },
        { id: 'A.4', title: 'BullMQ concurrency', active: true, config: `ROUTER_SYNC_CONCURRENCY=${process.env.ROUTER_SYNC_CONCURRENCY || '20'}` },
        { id: 'A.5', title: 'Circuit breaker per-router', active: true, config: `threshold=${process.env.ROUTER_CB_THRESHOLD || '5'}, cooldown=${(parseInt(process.env.ROUTER_CB_COOLDOWN_MS || '300000') / 60000)}min` },
        { id: 'B.1', title: 'Adaptive polling interval', active: true, config: `base=${(parseInt(process.env.ADAPTIVE_BASE_MS || '30000') / 1000)}s, max=${process.env.ADAPTIVE_MAX_MULTIPLIER || '16'}×` },
        { id: 'B.2', title: 'Queue backpressure', active: true, config: `limit=${process.env.QUEUE_BP_WAITING_LIMIT || '200'}` },
        { id: 'B.3', title: 'Diagnostics health snapshot', active: true, config: 'exposed via /api/diagnostics' },
    ];
}

/**
 * GET /api/diagnostics
 * Returns aggregated health/scale metrics for the fleet. Admin-only,
 * intended to surface the same kind of data the SSH profiling scripts
 * produce so operators can sanity-check capacity without shell access.
 */
router.get(
    '/',
    asyncHandler(async (_req, res) => {
        const out: Record<string, any> = {};

        // 1. Fleet overview
        const [fleet] = (await db.execute(sql`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status='online')::int AS online,
                COUNT(*) FILTER (WHERE status='offline')::int AS offline,
                COUNT(*) FILTER (WHERE use_snmp=true)::int AS snmp_enabled,
                COUNT(*) FILTER (WHERE use_genieacs=true)::int AS genieacs_enabled,
                COUNT(DISTINCT tenant_id)::int AS tenants
            FROM routers
        `)) as unknown as any[];
        out.fleet = fleet;

        // 2. Interface count stats
        const [ifaces] = (await db.execute(sql`
            SELECT
                COALESCE(ROUND(AVG(cnt)::numeric, 1), 0)::float AS avg_interfaces,
                COALESCE(MAX(cnt), 0)::int AS max_interfaces,
                COALESCE(SUM(cnt), 0)::int AS total_interfaces
            FROM (SELECT router_id, COUNT(*) AS cnt FROM router_interfaces GROUP BY router_id) sub
        `)) as unknown as any[];
        out.interfaces = ifaces;

        // 3. Netwatch stats
        const [nw] = (await db.execute(sql`
            SELECT
                COUNT(*)::int AS total_entries,
                COUNT(DISTINCT router_id)::int AS routers_with_netwatch,
                COALESCE(ROUND(AVG(cnt)::numeric, 1), 0)::float AS avg_per_router,
                COALESCE(MAX(cnt), 0)::int AS max_per_router
            FROM (SELECT router_id, COUNT(*) AS cnt FROM router_netwatch GROUP BY router_id) sub
        `)) as unknown as any[];
        out.netwatch = nw;

        // 4. PPPoE active sessions
        const [pppoe] = (await db.execute(sql`
            SELECT
                COUNT(*)::int AS total_sessions,
                COUNT(DISTINCT router_id)::int AS routers_with_pppoe
            FROM pppoe_sessions
        `)) as unknown as any[];
        out.pppoe = pppoe;

        // 5. ONU inventory
        const [onu] = (await db.execute(sql`
            SELECT
                COUNT(*)::int AS total_onus,
                COUNT(*) FILTER (WHERE status='online')::int AS online,
                COUNT(DISTINCT olt_id)::int AS olts
            FROM onus
        `)) as unknown as any[];
        out.onu = onu;

        // 6. Alert volume last 24h
        const alertVol = (await db.execute(sql`
            SELECT type::text AS type, COUNT(*)::int AS count,
                   COUNT(*) FILTER (WHERE resolved=false)::int AS unresolved
            FROM alerts WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY type ORDER BY count DESC LIMIT 10
        `)) as unknown as any[];
        out.alertsLast24h = alertVol;

        // 7. DB size summary
        const dbSize = (await db.execute(sql`
            SELECT tablename::text AS table_name,
                   pg_total_relation_size('public.' || tablename)::bigint AS bytes,
                   pg_size_pretty(pg_total_relation_size('public.' || tablename))::text AS pretty
            FROM pg_tables WHERE schemaname='public'
            ORDER BY pg_total_relation_size('public.' || tablename) DESC
            LIMIT 10
        `)) as unknown as any[];
        out.dbSize = dbSize;

        // 8. Polling health — routers that haven't ingested metrics recently
        const stale = (await db.execute(sql`
            SELECT r.name::text AS name, r.host::text AS host,
                   EXTRACT(EPOCH FROM (NOW() - MAX(rm.recorded_at)))/60::float AS minutes_since_last_metric,
                   r.status::text AS status,
                   r.last_error_message::text AS last_error
            FROM routers r
            LEFT JOIN router_metrics rm ON rm.router_id = r.id
            GROUP BY r.id, r.name, r.host, r.status, r.last_error_message
            HAVING (MAX(rm.recorded_at) IS NULL OR MAX(rm.recorded_at) < NOW() - INTERVAL '10 minutes')
            ORDER BY minutes_since_last_metric DESC NULLS FIRST
            LIMIT 10
        `)) as unknown as any[];
        out.staleRouters = stale;

        // 9. Top routers by interface count (potential hotspots)
        const hotspots = (await db.execute(sql`
            SELECT r.name::text, r.host::text, COUNT(ri.id)::int AS interface_count
            FROM routers r
            LEFT JOIN router_interfaces ri ON ri.router_id = r.id
            GROUP BY r.id, r.name, r.host
            ORDER BY interface_count DESC LIMIT 5
        `)) as unknown as any[];
        out.interfaceHotspots = hotspots;

        // 10. Process memory
        const mem = process.memoryUsage();
        out.process = {
            rssMB: Math.round(mem.rss / 1024 / 1024),
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            externalMB: Math.round(mem.external / 1024 / 1024),
            uptimeSec: Math.round(process.uptime()),
        };

        // 11. Redis / BullMQ queue depth
        try {
            const redis = getRedisConnection() as any;
            if (redis && typeof redis.llen === 'function') {
                const waiting = await redis.llen('bull:router-sync:wait').catch(() => 0);
                const active = await redis.llen('bull:router-sync:active').catch(() => 0);
                const delayed = await redis.zcard('bull:router-sync:delayed').catch(() => 0);
                const failed = await redis.zcard('bull:router-sync:failed').catch(() => 0);
                out.queue = { waiting, active, delayed, failed };
            } else {
                out.queue = { error: 'Redis client not available' };
            }
        } catch (err: any) {
            out.queue = { error: err?.message || 'redis error' };
        }

        // 12. Per-router health snapshot (circuit-breaker + adaptive back-off)
        out.routerHealth = getRouterHealthSnapshot();

        // 13. Derived: health checks + feature status (interpretation layer)
        out.healthChecks = runHealthChecks(out);
        out.features = getFeatureStatus();

        // 14. Verdict roll-up — overall severity = worst across checks
        const order: Severity[] = ['ok', 'info', 'warn', 'critical'];
        let worst: Severity = 'ok';
        const counts = { ok: 0, info: 0, warn: 0, critical: 0 };
        for (const c of out.healthChecks as HealthCheck[]) {
            counts[c.severity]++;
            if (order.indexOf(c.severity) > order.indexOf(worst)) worst = c.severity;
        }
        out.verdict = { severity: worst, counts };

        out.collectedAt = new Date().toISOString();
        res.json({ data: out });
    })
);

// ============ Action Endpoints ============

/** POST /api/diagnostics/actions/prune-retention — manually run retention SQL. */
router.post(
    '/actions/prune-retention',
    asyncHandler(async (req, res) => {
        const days = Number(req.body?.days) || 30;
        logger.warn({ userId: req.user?.id, days }, 'Manual retention prune triggered');
        const [r1] = (await db.execute(sql`SELECT prune_client_bandwidth_history(${days}) AS n`)) as unknown as any[];
        const [r2] = (await db.execute(sql`SELECT prune_router_metrics(${days}) AS n`)) as unknown as any[];
        const [r3] = (await db.execute(sql`SELECT prune_resolved_alerts(${days}) AS n`)) as unknown as any[];
        res.json({
            ok: true,
            data: {
                bandwidthDeleted: Number(r1?.n || 0),
                metricsDeleted: Number(r2?.n || 0),
                resolvedAlertsDeleted: Number(r3?.n || 0),
                days,
            },
        });
    })
);

/** POST /api/diagnostics/actions/clear-breakers — reset breaker + back-off state. */
router.post(
    '/actions/clear-breakers',
    asyncHandler(async (req, res) => {
        logger.warn({ userId: req.user?.id }, 'Manual breaker/back-off clear triggered');
        const breakersCleared = clearBreakers();
        const backoffsCleared = clearAdaptiveBackoffs();
        res.json({ ok: true, data: { breakersCleared, backoffsCleared } });
    })
);

/** POST /api/diagnostics/actions/sweep-alerts — trigger netwatch alert sweeper. */
router.post(
    '/actions/sweep-alerts',
    asyncHandler(async (req, res) => {
        logger.warn({ userId: req.user?.id }, 'Manual netwatch alert sweep triggered');
        const resolved = await alertService.sweepStaleNetwatchAlerts();
        res.json({ ok: true, data: { resolved } });
    })
);

/** POST /api/diagnostics/actions/vacuum-analyze — VACUUM ANALYZE a whitelisted table. */
const VACUUM_WHITELIST = new Set([
    'client_bandwidth_history',
    'alerts',
    'router_interfaces',
    'router_metrics',
    'pppoe_sessions',
]);
router.post(
    '/actions/vacuum-analyze',
    asyncHandler(async (req, res) => {
        const table = String(req.body?.table || '');
        if (!VACUUM_WHITELIST.has(table)) {
            res.status(400).json({ error: 'Invalid table', allowed: Array.from(VACUUM_WHITELIST) });
            return;
        }
        logger.warn({ userId: req.user?.id, table }, 'Manual VACUUM ANALYZE triggered');
        await db.execute(sql.raw(`VACUUM (ANALYZE) ${table}`));
        res.json({ ok: true, data: { table } });
    })
);

export default router;
