import { db } from '../db/index.js';
import { olts, type Olt } from '../db/schema/olts.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../lib/encryption.js';
import { escapeHtml } from '../lib/html-escape.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';
import { UnconfiguredOnu, IOltProvisioningDriver } from './olt-drivers/olt-provisioning.interface.js';
import { notificationService } from './notification.service.js';

// Port Telnet default OLT. TODO: bila unit pakai port/kredensial telnet berbeda
// dari web, tambah kolom khusus (telnet_port/telnet_username/telnet_password).
const TELNET_DEFAULT_PORT = 23;

// Batas panjang blok mentah SETELAH escape HTML. Dihitung pasca-escape (bukan
// pra-escape) supaya ekspansi entity ('<' → '&lt;') tak bisa menembus limit
// pesan Telegram (4096). Sisa ~600 char untuk header + pembungkus <pre>.
const RAW_ESCAPED_BUDGET = 3500;

type NotifySummary = { delivered: number; groups: number; errors: string[] };

/**
 * Resolve OLT (di-scope tenant) lalu bangun driver provisioning dari
 * kredensialnya. Mirror pola olt.service: decrypt webPassword sebelum dipakai.
 * Kredensial telnet SEMENTARA memakai ulang kredensial web.
 *
 * Mengembalikan row OLT juga agar pemanggil bisa memformat laporan (nama/host)
 * dan menentukan target push notifikasi (`olt.tenantId`).
 */
async function resolveOltAndDriver(
    oltId: string,
    tenantId?: string | null,
): Promise<{ olt: Olt; driver: IOltProvisioningDriver }> {
    const [olt] = await db
        .select()
        .from(olts)
        .where(and(eq(olts.id, oltId), tenantId ? eq(olts.tenantId, tenantId) : undefined));
    if (!olt) {
        throw new Error('OLT tidak ditemukan atau bukan milik tenant ini');
    }

    const password = olt.webPassword ? decrypt(olt.webPassword) : undefined;

    const driver = OltDriverFactory.getProvisioningDriver(olt.type, {
        host: olt.host,
        port: TELNET_DEFAULT_PORT,
        protocol: 'telnet',
        username: olt.webUsername ?? undefined,
        password,
    });

    return { olt, driver };
}

/** Ambil discovery kaya (parse + mentah) bila driver mendukung; fallback ke parse saja. */
async function discover(driver: IOltProvisioningDriver): Promise<{ onus: UnconfiguredOnu[]; raw: string }> {
    if (typeof driver.getUnconfiguredDetailed === 'function') {
        return driver.getUnconfiguredDetailed();
    }
    return { onus: await driver.getUnconfiguredOnus(), raw: '' };
}

/** Format laporan hasil tes koneksi telnet ke OLT (HTML Telegram). */
function formatTestConnectionReport(olt: Olt, result: { success: boolean; error?: string }): string {
    const head = `🔌 <b>Tes koneksi OLT</b>\n<b>${escapeHtml(olt.name)}</b> (${escapeHtml(olt.host)})`;
    return result.success
        ? `${head}\n\n✅ Telnet tersambung &amp; CLI merespons.`
        : `${head}\n\n❌ Gagal: ${escapeHtml(result.error || 'tidak diketahui')}`;
}

/**
 * Pangkas teks HTML-escaped ke `max` char TANPA meninggalkan entity terpotong
 * (mis. '&lt' tanpa ';' akan merusak render Telegram). Entity maksimal 6 char
 * ('&#039;'), jadi cukup buang sisa setelah '&' terakhir bila belum ditutup.
 */
function clampEscaped(escaped: string, max: number): { text: string; clipped: boolean } {
    if (escaped.length <= max) return { text: escaped, clipped: false };
    let cut = escaped.slice(0, max);
    const lastAmp = cut.lastIndexOf('&');
    if (lastAmp !== -1 && !cut.slice(lastAmp).includes(';')) {
        cut = cut.slice(0, lastAmp);
    }
    return { text: cut, clipped: true };
}

/**
 * Format laporan ONU belum ter-authorize (HTML Telegram). Menyertakan output
 * MENTAH `show ont autofind all` dalam blok <pre> untuk kalibrasi parser —
 * di-escape lalu dipangkas pasca-escape agar tak menembus limit pesan Telegram.
 */
function formatUnconfiguredReport(olt: Olt, onus: UnconfiguredOnu[], raw: string): string {
    const head =
        `🔌 <b>ONU belum ter-authorize</b>\n` +
        `<b>${escapeHtml(olt.name)}</b> (${escapeHtml(olt.host)})\n` +
        `Parser mengekstrak: <b>${onus.length}</b> ONU`;

    const trimmed = raw.trim();
    if (!trimmed) {
        return `${head}\n\n<i>(tidak ada output mentah dari OLT)</i>`;
    }

    const { text: rawEsc, clipped } = clampEscaped(escapeHtml(trimmed), RAW_ESCAPED_BUDGET);
    const suffix = clipped ? `\n<i>…output dipangkas (batas pesan Telegram).</i>` : '';

    return `${head}\n\n<b>RAW autofind:</b>\n<pre>${rawEsc}</pre>${suffix}`;
}

export const provisioningService = {
    /**
     * FASE-1 baca (READ-ONLY): daftar ONU yang belum ter-authorize di OLT.
     * Melempar bila merk OLT belum punya driver provisioning (mis. HSGQ → HAR).
     *
     * Bila `opts.notify`, dorong laporan (termasuk output mentah untuk kalibrasi)
     * ke grup Telegram pemilik OLT.
     */
    getUnconfiguredOnus: async (
        oltId: string,
        tenantId?: string | null,
        opts?: { notify?: boolean },
    ): Promise<{ onus: UnconfiguredOnu[]; notify?: NotifySummary }> => {
        const { olt, driver } = await resolveOltAndDriver(oltId, tenantId);
        const { onus, raw } = await discover(driver);

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            notify = await notificationService.pushTextToTenant(
                olt.tenantId,
                formatUnconfiguredReport(olt, onus, raw),
            );
        }
        return { onus, notify };
    },

    /**
     * Uji koneksi transport provisioning (telnet) ke OLT. Bila `opts.notify`,
     * kirim hasilnya ke grup Telegram pemilik OLT (biar bisa dites dari HP).
     */
    testConnection: async (
        oltId: string,
        tenantId?: string | null,
        opts?: { notify?: boolean },
    ): Promise<{ result: { success: boolean; error?: string }; notify?: NotifySummary }> => {
        const { olt, driver } = await resolveOltAndDriver(oltId, tenantId);
        const result = await driver.testConnection();

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            notify = await notificationService.pushTextToTenant(
                olt.tenantId,
                formatTestConnectionReport(olt, result),
            );
        }
        return { result, notify };
    },
};
