import { emitFinding, resolveFinding } from '../emit.js';
import { settingsService } from '../../settings.service.js';
import { parseSpeedMbps, formatSpeedMbps } from '../../../lib/link-speed.js';
import { logger } from '../../../lib/logger.js';

export const INTERFACE_SPEED_CHECK = 'interface-speed';

/** Satu interface yang nilai `speed`-nya berubah pada siklus sync ini. */
export interface InterfaceSpeedSample {
    interfaceId: string;
    name: string;
    oldSpeed: string | null;
    newSpeed: string | null;
}

export interface InterfaceSpeedCheckInput {
    routerId: string;
    tenantId: string;
    routerName: string;
    samples: InterfaceSpeedSample[];
}

/**
 * Deteksi PENURUNAN kecepatan link — mis. 1Gbps → 100Mbps → 10Mbps.
 *
 * Penurunan negosiasi biasanya bukan hal normal: penyebab tersering adalah
 * kabel/konektor bermasalah (pasangan kabel putus sehingga hanya 2 pasang yang
 * terpakai), SFP melemah, atau auto-negotiation gagal. Gejalanya sering tidak
 * terlihat sampai trafik mentok, karena link tetap "up".
 *
 * Kenaikan kecepatan sengaja diabaikan (itu perbaikan, bukan masalah).
 *
 * @returns jumlah alert yang benar-benar dibuat.
 */
export async function checkInterfaceSpeed(input: InterfaceSpeedCheckInput): Promise<number> {
    if (!input.samples.length) return 0;

    // Toggle per tenant: master switch + switch khusus check ini.
    try {
        const masterOn = await settingsService.getSettingValue<boolean>(
            'automation_enabled', input.tenantId, true
        );
        if (!masterOn) return 0;

        const checkOn = await settingsService.getSettingValue<boolean>(
            'automation_interface_speed_enabled', input.tenantId, true
        );
        if (!checkOn) return 0;
    } catch (err) {
        // Setting tak terbaca → jalan dengan default aktif, jangan diam-diam mati.
        logger.debug({ err, tenantId: input.tenantId }, 'Automation: gagal baca setting, pakai default aktif');
    }

    let created = 0;

    for (const sample of input.samples) {
        const oldMbps = parseSpeedMbps(sample.oldSpeed);
        const newMbps = parseSpeedMbps(sample.newSpeed);

        // Nilai tak dikenal diperlakukan sebagai "tidak tahu", bukan 0 — mencegah
        // alert palsu saat sync pertama (belum ada nilai lama) atau saat port
        // down sehingga speed kosong.
        if (oldMbps === null || newMbps === null) continue;

        if (newMbps > oldMbps) {
            // Link pulih/naik → tutup alert lama. Tanpa ini, alert yang masih
            // terbuka akan membungkam penurunan BERIKUTNYA selamanya.
            await resolveFinding(INTERFACE_SPEED_CHECK, sample.interfaceId, input.routerId);
            continue;
        }
        // Sama persis (mis. hanya beda format "1Gbps" vs "1000Mbps") → bukan perubahan nyata.
        if (newMbps === oldMbps) continue;

        // Kritis bila jatuh ke kelas 10Mbps, atau turun ≥10x (mis. 1G → 100M).
        const ratio = oldMbps / newMbps;
        const severity = newMbps <= 10 || ratio >= 10 ? 'critical' : 'warning';

        const ok = await emitFinding({
            checkKey: INTERFACE_SPEED_CHECK,
            entityKey: sample.interfaceId,
            routerId: input.routerId,
            tenantId: input.tenantId,
            severity,
            title: `Link Turun: ${sample.name} (${input.routerName})`,
            message: `Kecepatan link ${sample.name} turun dari ${formatSpeedMbps(oldMbps)} ke ${formatSpeedMbps(newMbps)}. Indikasi kabel/konektor bermasalah, SFP melemah, atau auto-negotiation gagal.`,
        });
        if (ok) created++;
    }

    return created;
}
