import { emitFinding, resolveFinding } from '../emit.js';
import { settingsService } from '../../settings.service.js';
import { parseIpv4Ranges, countAddresses, isIpInRanges } from '../../../lib/ip-range.js';
import { logger } from '../../../lib/logger.js';
import type { IpPoolFull, DhcpLeaseFull } from '../../../lib/mikrotik/ip-management.js';
import type { AutomationSeverity } from '../types.js';

export const DHCP_POOL_CHECK = 'dhcp-pool';

const DEFAULT_WARN_PCT = 80;
const DEFAULT_CRITICAL_PCT = 95;

/**
 * Baca ambang persentase dari setting DENGAN validasi.
 *
 * `settingsService.getSettingValue` hanya melakukan cast atas kolom jsonb,
 * tanpa validasi. Tanpa penjagaan di sini: nilai `false` lolos sebagai 0
 * (setiap pool yang terpakai sedikit pun langsung warning → banjir alert),
 * sedangkan objek/array menjadi NaN (semua perbandingan false → alert mati
 * diam-diam padahal operator mengira aktif). Keduanya gagal tanpa suara,
 * jadi nilai di luar 0–100 dikembalikan ke default.
 */
async function readPct(key: string, tenantId: string, fallback: number): Promise<number> {
    const raw = await settingsService.getSettingValue<unknown>(key, tenantId, fallback);
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return fallback;
    return n;
}

export interface DhcpPoolCheckInput {
    routerId: string;
    tenantId: string;
    routerName: string;
    pools: IpPoolFull[];
    leases: DhcpLeaseFull[];
}

/**
 * Pantau okupansi IP pool DHCP.
 *
 * Pool yang penuh membuat pelanggan baru gagal dapat IP — gejalanya di
 * lapangan terlihat seperti "internet mati" padahal jaringannya sehat, dan
 * biasanya baru ketahuan setelah ada keluhan. Pengecekan ini memberi
 * peringatan sebelum pool benar-benar habis.
 *
 * Okupansi dihitung dengan mencocokkan alamat lease ke rentang pool
 * (IP-in-range), bukan lewat pemetaan dhcp-server → pool, supaya tidak perlu
 * query tambahan dan tetap benar saat satu pool dipakai beberapa server.
 *
 * Keterbatasan yang disengaja: pool yang HANYA dipakai PPPoE tidak punya
 * lease DHCP, sehingga terbaca 0% dan tidak pernah memicu alert. Itu
 * false-negative (diam), bukan false-positive (alert palsu) — aman. Okupansi
 * pool PPPoE menyusul di fase berikutnya lewat data sesi PPPoE.
 *
 * @returns jumlah alert yang dibuat.
 */
export async function checkDhcpPools(input: DhcpPoolCheckInput): Promise<number> {
    if (!input.pools.length) return 0;

    let warnPct = DEFAULT_WARN_PCT;
    let criticalPct = DEFAULT_CRITICAL_PCT;
    try {
        const masterOn = await settingsService.getSettingValue<boolean>(
            'automation_enabled', input.tenantId, true
        );
        if (!masterOn) return 0;

        const checkOn = await settingsService.getSettingValue<boolean>(
            'automation_dhcp_pool_enabled', input.tenantId, true
        );
        if (!checkOn) return 0;

        warnPct = await readPct('automation_dhcp_pool_warn_pct', input.tenantId, DEFAULT_WARN_PCT);
        criticalPct = await readPct('automation_dhcp_pool_critical_pct', input.tenantId, DEFAULT_CRITICAL_PCT);
    } catch (err) {
        logger.debug({ err, tenantId: input.tenantId }, 'Automation DHCP: gagal baca setting, pakai default');
    }

    let created = 0;

    for (const pool of input.pools) {
        const ranges = parseIpv4Ranges(pool.ranges);
        // Pool tanpa rentang IPv4 yang bisa diurai (kosong / IPv6) dilewati —
        // bukan dianggap penuh.
        if (!ranges.length) continue;

        const total = countAddresses(ranges);
        if (total <= 0) continue;

        // Set alamat unik: satu alamat bisa muncul lebih dari sekali (mis. lease
        // statis + entri dinamisnya), dan itu tetap satu alamat terpakai.
        const usedAddresses = new Set<string>();
        for (const lease of input.leases) {
            if (lease.disabled) continue;
            const address = lease.address || lease.activeAddress;
            if (isIpInRanges(address, ranges)) usedAddresses.add(address as string);
        }

        const used = usedAddresses.size;
        const pct = (used / total) * 100;
        const free = total - used;

        const isExhausted = free <= 0;
        const rawSeverity: AutomationSeverity | null =
            isExhausted || pct >= criticalPct ? 'critical'
                : pct >= warnPct ? 'warning'
                    : null;

        if (rawSeverity === null) {
            // Kembali sehat → tutup alert lama supaya kejadian berikutnya bisa
            // memicu alert lagi.
            await resolveFinding(DHCP_POOL_CHECK, pool.name, input.routerId);
            continue;
        }

        // Pool dengan `next-pool` otomatis dialihkan RouterOS ke pool lanjutan
        // saat penuh, sehingga pelanggan baru TETAP dapat IP. Menyebutnya
        // "habis" atau critical adalah false-positive: turunkan ke warning dan
        // ubah kalimatnya. (Kedalaman rantai next-pool belum ditelusuri —
        // pool lanjutannya sendiri dievaluasi terpisah sebagai pool biasa.)
        const hasFallbackPool = !!pool.nextPool;
        const severity: AutomationSeverity =
            hasFallbackPool && rawSeverity === 'critical' ? 'warning' : rawSeverity;

        const headline = isExhausted
            ? (hasFallbackPool
                ? `IP pool "${pool.name}" penuh dan dialihkan ke pool lanjutan "${pool.nextPool}".`
                : `IP pool "${pool.name}" HABIS — perangkat baru tidak akan dapat IP.`)
            : `IP pool "${pool.name}" terpakai ${pct.toFixed(0)}%.`;

        const state = isExhausted
            ? (hasFallbackPool ? 'Penuh (ada lanjutan)' : 'Habis')
            : 'Hampir Penuh';

        const ok = await emitFinding({
            checkKey: DHCP_POOL_CHECK,
            entityKey: pool.name,
            routerId: input.routerId,
            tenantId: input.tenantId,
            severity,
            title: `IP Pool ${state}: ${pool.name} (${input.routerName})`,
            message: `${headline} Terpakai ${used} dari ${total} alamat, sisa ${free}. Rentang: ${pool.ranges}.`,
        });
        if (ok) created++;
    }

    return created;
}
