import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { getRedisConnection } from '../services/queue.service.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

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

        out.collectedAt = new Date().toISOString();
        res.json({ data: out });
    })
);

export default router;
