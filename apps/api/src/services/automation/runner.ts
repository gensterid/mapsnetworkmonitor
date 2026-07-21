import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tenants, routers } from '../../db/schema/index.js';
import { settingsService } from '../settings.service.js';
import { routerActionService } from '../router-action.service.js';
import { listIpPools, listDhcpLeases } from '../../lib/mikrotik/ip-management.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { checkDhcpPools } from './checks/dhcp-pool.check.js';

/**
 * Runner untuk automation check yang bersifat PULL — yaitu yang perlu menarik
 * data sendiri dari router karena tidak ada jalur sync existing yang sudah
 * membawanya (mis. IP pool & lease DHCP, yang selama ini hanya diambil oleh
 * halaman MikHMON dan tidak pernah dipoll).
 *
 * Check yang datanya SUDAH lewat (mis. kecepatan interface pada syncInterfaces)
 * sengaja tidak ditaruh di sini — memanggilnya dari jalur sync lebih murah dan
 * deteksinya lebih cepat.
 */

/** Guard re-entrancy: siklus sebelumnya belum selesai → lewati, jangan menumpuk. */
let isRunning = false;

/** Batas router yang diproses bersamaan agar tidak membanjiri connection pool. */
const ROUTER_CONCURRENCY = 3;

/**
 * Batasi satu operasi agar tak menahan seluruh siklus. Library MikroTik memang
 * punya timeout sendiri, tapi jangan bergantung pada default modul lain —
 * siklus ini butuh batas waktunya sendiri seperti job scheduler lainnya.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout ${label} setelah ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

async function runForRouter(
    router: { id: string; name: string | null },
    tenantId: string
): Promise<void> {
    let api: any = null;
    try {
        await withTimeout((async () => {
            // Memakai pool koneksi yang sama dengan poller lain — untuk router yang
            // memang sedang dipoll, ini me-reuse koneksi, bukan membuka yang baru.
            api = await routerActionService.getRouterConnection(router.id, tenantId);
            const [pools, leases] = await Promise.all([listIpPools(api), listDhcpLeases(api)]);

            await checkDhcpPools({
                routerId: router.id,
                tenantId,
                routerName: router.name || router.id,
                pools,
                leases,
            });
        })(), env.SCHED_ROUTER_TIMEOUT_MS, `automation router ${router.id}`);
    } catch (err) {
        // Router tak terjangkau bukan kondisi luar biasa (bisa sedang down /
        // kredensial berubah) — cukup debug, jangan bising. Kegagalan satu
        // router tidak boleh menghentikan siklus.
        logger.debug({ err, routerId: router.id }, 'Automation: lewati router (gagal terhubung / ambil data)');
    } finally {
        // Konvensi codebase: kembalikan koneksi ke pool supaya timer idle-close
        // terjadwal. Tanpa release, koneksi yang dibuka job ini bisa menganggur
        // terbuka tanpa pernah dijadwalkan tutup.
        try { api?.release?.(); } catch { /* abaikan */ }
    }
}

/**
 * Jalankan seluruh pull-based check untuk semua tenant yang mengaktifkannya.
 * Best-effort penuh: tidak pernah melempar.
 */
export async function runAutomationChecks(): Promise<void> {
    if (isRunning) {
        logger.warn('Automation: siklus sebelumnya masih berjalan — dilewati');
        return;
    }
    isRunning = true;

    try {
        const allTenants = await db.select().from(tenants);

        for (const tenant of allTenants) {
            const masterOn = await settingsService.getSettingValue<boolean>(
                'automation_enabled', tenant.id, true
            );
            if (!masterOn) continue;

            const dhcpOn = await settingsService.getSettingValue<boolean>(
                'automation_dhcp_pool_enabled', tenant.id, true
            );
            if (!dhcpOn) continue;

            // Hanya router yang sedang online — mencoba menyambung ke router mati
            // hanya menghabiskan waktu siklus pada timeout koneksi.
            const tenantRouters = await db
                .select({ id: routers.id, name: routers.name })
                .from(routers)
                .where(and(eq(routers.tenantId, tenant.id), eq(routers.status, 'online')));

            for (let i = 0; i < tenantRouters.length; i += ROUTER_CONCURRENCY) {
                const batch = tenantRouters.slice(i, i + ROUTER_CONCURRENCY);
                await Promise.all(batch.map((r) => runForRouter(r, tenant.id)));
            }
        }
    } catch (err) {
        logger.error({ err }, 'Automation: siklus gagal');
    } finally {
        isRunning = false;
    }
}
