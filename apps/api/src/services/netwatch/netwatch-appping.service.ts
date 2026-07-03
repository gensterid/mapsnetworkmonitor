import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routerNetwatch } from '../../db/schema/index.js';
import { measureLatency } from '../../lib/network-utils.js';
import { logger } from '../../lib/logger.js';

const CONCURRENCY = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ping entry netwatch "app-only" (isAppOnly = true) secara berkala LANGSUNG
 * dari server aplikasi (ICMP), sesuai deskripsi fitur di UI:
 * "pinged directly by the application backend ... devices on the same subnet".
 *
 * Kenapa langsung (bukan via router): entry app-only justru dipakai untuk
 * device yang dijangkau dari server app, bukan dari router. Banyak IP mgmt
 * (mis. SFP/OLT 192.168.87.x) TIDAK bisa di-ICMP oleh router walau link-nya
 * membawa trafik — kalau ping via router, semua salah DOWN.
 *
 * Prasyarat: host harus reachable dari host server app. Kalau tidak, device
 * sebaiknya dimonitor via netwatch native MikroTik (uncheck "Monitor via App").
 */
export async function pingAppOnlyNetwatch(): Promise<{ checked: number; up: number; down: number }> {
    const entries = await db
        .select()
        .from(routerNetwatch)
        .where(eq(routerNetwatch.isAppOnly, true));

    const targets = entries.filter((e) => {
        const h = (e.host || '').trim();
        return h && h !== '0.0.0.0' && h.length >= 5;
    });
    if (!targets.length) return { checked: 0, up: 0, down: 0 };

    let up = 0;
    let down = 0;

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(async (e) => {
                const host = (e.host || '').trim();
                // Retry sekali — cegah flap gara-gara 1 paket drop transient.
                let latency = await measureLatency(host);
                if (latency < 0) {
                    await sleep(300);
                    latency = await measureLatency(host);
                }
                const now = new Date();
                if (latency >= 0) {
                    up++;
                    await db.update(routerNetwatch).set({
                        status: 'up',
                        latency,
                        lastKnownLatency: latency,
                        packetLoss: 0,
                        lastUp: now,
                        lastCheck: now,
                        updatedAt: now,
                    }).where(eq(routerNetwatch.id, e.id));
                } else {
                    down++;
                    await db.update(routerNetwatch).set({
                        status: 'down',
                        latency: null,
                        packetLoss: 100,
                        lastDown: now,
                        lastCheck: now,
                        updatedAt: now,
                    }).where(eq(routerNetwatch.id, e.id));
                }
            })
        );
    }

    logger.debug({ checked: targets.length, up, down }, 'App-only netwatch direct-ping cycle complete');
    return { checked: targets.length, up, down };
}
