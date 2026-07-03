import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch } from '../../db/schema/index.js';
import { routerActionService } from '../router-action.service.js';
import { routerNetwatchService } from '../router-netwatch.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Ping entry netwatch "app-only" (isAppOnly = true) secara berkala.
 *
 * Kenapa perlu: entry app-only TIDAK ada di list netwatch native MikroTik,
 * jadi tidak dapat status dari sync `/tool/netwatch`. Sebelumnya statusnya
 * cuma ter-update sebagai efek samping router-sync saat `includeNetwatch`
 * kebetulan aktif — sering tidak jalan → status nyangkut 'unknown'.
 *
 * Poller ini ping tiap entry app-only VIA koneksi router induknya
 * (`measureLatency` pakai RouterOS `/ping`) — andal karena router pasti
 * satu jaringan dengan device (justru itu gunanya app-only). Koneksi
 * di-pool via getRouterConnection (tidak dibuka/tutup manual).
 */
export async function pingAppOnlyNetwatch(): Promise<{ checked: number; routers: number }> {
    const entries = await db
        .select()
        .from(routerNetwatch)
        .where(eq(routerNetwatch.isAppOnly, true));

    if (!entries.length) return { checked: 0, routers: 0 };

    // Grup per router induk.
    const byRouter = new Map<string, any[]>();
    for (const e of entries) {
        if (!e.routerId) continue;
        const host = (e.host || '').trim();
        if (!host || host === '0.0.0.0' || host.length < 5) continue;
        if (!byRouter.has(e.routerId)) byRouter.set(e.routerId, []);
        byRouter.get(e.routerId)!.push(e);
    }

    let checked = 0;
    let routersDone = 0;

    for (const [routerId, targets] of byRouter) {
        // Hanya router yang online — kalau router offline, ping via-nya pasti gagal.
        const [r] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!r || r.status !== 'online') continue;

        try {
            const conn = await routerActionService.getRouterConnection(routerId, r.tenantId || undefined);
            // measureLatency menulis status up/down + latency untuk row isAppOnly.
            await routerNetwatchService.measureLatency(routerId, r.name, conn, targets);
            checked += targets.length;
            routersDone++;
        } catch (err) {
            logger.error({ err, routerId }, 'App-only netwatch ping cycle failed for router');
        }
    }

    return { checked, routers: routersDone };
}
