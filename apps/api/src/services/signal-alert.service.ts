import { and, eq, gte, ilike } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Signal/Redaman alert — deteksi perubahan redaman (RX power optik ONU) yang
 * signifikan saat OLT sync, lalu buat alert.
 *
 * "Redaman" = optical attenuation. RX power dalam dBm, makin negatif = sinyal
 * makin lemah = redaman makin besar = makin buruk. Contoh GPON sehat: -8..-25.
 *
 * Trigger (degradasi-focused, sesuai concern operator):
 *   - Penurunan >= SIGNAL_DROP_THRESHOLD_DB (default 3 dBm), ATAU
 *   - RX power baru masuk zona kritis (<= SIGNAL_CRITICAL_DBM, default -27)
 *     padahal sebelumnya masih sehat.
 *
 * Severity:
 *   - critical: RX power baru <= ambang kritis, ATAU drop >= 2x threshold.
 *   - warning : drop >= threshold.
 *
 * Anti-spam: skip kalau sudah ada alert redaman belum-resolved untuk SN yang
 * sama, atau ada yang baru dibuat dalam cooldown window.
 *
 * Pakai type 'threshold' (enum alert existing) supaya tidak perlu migrasi enum.
 * Title/message eksplisit "Redaman" supaya operator paham.
 */

const ALERT_TYPE = 'threshold' as const;

function parseDbm(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    // Nilai bisa "-24.5", "-24.5 dBm", number, dst. Ambil angka pertama.
    const m = String(raw).match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    if (!Number.isFinite(n)) return null;
    // RX power ONU GPON selalu negatif. Nilai positif = parse keliru / data
    // sampah → abaikan (per review LOW).
    if (n > 0) return null;
    return n;
}

export interface SignalChangeInput {
    routerId: string | null;
    tenantId: string | null;
    onuName: string;
    sn: string;
    oltName?: string;
    source?: 'olt' | 'acs'; // titik ukur redaman (OLT port vs ONU/CPE). Untuk label pesan.
    oldSignal: unknown; // dBm lama (string/number/null)
    newSignal: unknown; // dBm baru
    tx?: any;
}

/**
 * Cek perubahan redaman & buat alert kalau signifikan. Best-effort: error
 * di-log, tidak melempar (jangan ganggu OLT sync utama).
 *
 * @returns true kalau alert dibuat (untuk caller cap jumlah per sync-cycle).
 */
export async function checkSignalChange(input: SignalChangeInput): Promise<boolean> {
    const { routerId, tenantId, onuName, sn, oltName, source, oldSignal, newSignal } = input;

    // Semua operasi alert (dedup + create) pakai `db`, INDEPENDEN dari transaksi
    // OLT sync — supaya alert persist walau sync rollback + dedup baca data
    // committed. input.tx diabaikan untuk alert logic.
    if (!routerId || !tenantId) return false;

    const oldDbm = parseDbm(oldSignal);
    const newDbm = parseDbm(newSignal);
    // Butuh dua-duanya untuk hitung delta. Kalau salah satu kosong, skip
    // (first-discovery tidak perlu alert).
    if (oldDbm === null || newDbm === null) return false;

    const threshold = env.SIGNAL_DROP_THRESHOLD_DB; // mis. 3
    const criticalDbm = env.SIGNAL_CRITICAL_DBM; // mis. -27

    // delta < 0 = degradasi (sinyal makin negatif / redaman naik).
    const delta = newDbm - oldDbm;
    const drop = -delta; // besar penurunan (positif kalau degradasi)

    const enteredCritical = newDbm <= criticalDbm && oldDbm > criticalDbm;
    const significantDrop = drop >= threshold;

    if (!enteredCritical && !significantDrop) return false;

    try {
        // Dedup pakai delimiter eksak `[SN xxx]` (bukan `%sn%`) supaya tidak
        // ada substring-collision antar SN (mis. SN "1234" match "12345678").
        // Per review MEDIUM-1. ILIKE memperlakukan [ ] sebagai literal.
        const snPattern = `%[SN ${sn}]%`;

        // Anti-spam: ada alert redaman belum-resolved untuk SN ini?
        const existing = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(
                and(
                    eq(alerts.routerId, routerId),
                    eq(alerts.type, ALERT_TYPE),
                    eq(alerts.resolved, false),
                    ilike(alerts.message, snPattern),
                ),
            )
            .limit(1);
        if (existing.length > 0) return false;

        // Cooldown: ada alert redaman untuk SN ini dalam X menit terakhir?
        const cutoff = new Date(Date.now() - env.SIGNAL_ALERT_COOLDOWN_MIN * 60 * 1000);
        const recent = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(
                and(
                    eq(alerts.routerId, routerId),
                    eq(alerts.type, ALERT_TYPE),
                    ilike(alerts.message, snPattern),
                    gte(alerts.createdAt, cutoff),
                ),
            )
            .limit(1);
        if (recent.length > 0) return false;

        const severity: 'warning' | 'critical' =
            newDbm <= criticalDbm || drop >= threshold * 2 ? 'critical' : 'warning';

        const direction = delta < 0 ? 'turun' : 'naik';
        const oltPart = oltName ? ` (OLT ${oltName})` : '';
        // Label sumber pengukuran: OLT (sisi port OLT) vs ACS (sisi ONU/CPE).
        const srcPart = source === 'acs' ? ' [sumber: ACS/CPE]' : source === 'olt' ? ' [sumber: OLT]' : '';
        const message =
            `Redaman ${onuName} [SN ${sn}]${oltPart}${srcPart} ${direction} ` +
            `${Math.abs(delta).toFixed(1)} dBm: ${oldDbm.toFixed(1)} → ${newDbm.toFixed(1)} dBm.` +
            (newDbm <= criticalDbm ? ' Sinyal di zona kritis — cek fisik/fiber.' : '');

        // Title sertakan SN supaya notificationCache (key routerId:type:title,
        // TTL 10 menit) UNIK per-ONU — kalau title sama untuk semua ONU, ONU
        // ke-2+ di router sama ke-suppress notifikasinya. Per review HIGH-2.
        const title = `Redaman Signifikan: ${onuName} [${sn}]`;

        // Pakai db (bukan tx) supaya alert PERSIST walau transaksi sync
        // rollback — event hardware nyata tetap ter-record. Konsisten dengan
        // syncOnuInventory path. Per review MEDIUM-2.
        await alertService.create(
            {
                routerId,
                tenantId,
                type: ALERT_TYPE,
                severity,
                title,
                message,
            } as any,
            db,
        );

        logger.info({ sn, oldDbm, newDbm, delta, severity }, 'Signal/redaman alert created');
        return true;
    } catch (err: any) {
        logger.error({ err: err?.message || String(err), sn }, 'checkSignalChange failed');
        return false;
    }
}

export const signalAlertService = { checkSignalChange };
