import { db } from '../db/index.js';
import { olts, type Olt } from '../db/schema/olts.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../lib/encryption.js';
import { escapeHtml } from '../lib/html-escape.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';
import {
    UnconfiguredOnu,
    IOltProvisioningDriver,
    ProvisioningPreset,
    ProvisionResult,
    ProvisionPlan,
    RegisteredOnu,
    OltProfiles,
    ModifyOptions,
    OnuRef,
} from './olt-drivers/olt-provisioning.interface.js';
import { probeTelnetBanner, probeTelnetExec, sanitizeTelnetBanner } from './olt-drivers/telnet-olt.client.js';
import { notificationService } from './notification.service.js';
import { provisioningPresetService } from './provisioning-preset.service.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { logger } from '../lib/logger.js';

// Serialisasi authorize per-OLT (cegah TOCTOU/konkuren tulis ke OLT sama).
// Rantai promise per oltId: tiap panggilan menunggu pemegang sebelumnya selesai.
const oltAuthChains = new Map<string, Promise<unknown>>();
function withOltLock<T>(oltId: string, fn: () => Promise<T>): Promise<T> {
    const prev = oltAuthChains.get(oltId) ?? Promise.resolve();
    const next = prev.then(fn, fn); // jalankan setelah pemegang sebelumnya settle
    oltAuthChains.set(oltId, next.then(() => {}, () => {})); // tail: telan error agar rantai lanjut
    return next;
}

// Port Telnet default OLT. TODO: bila unit pakai port/kredensial telnet berbeda
// dari web, tambah kolom khusus (telnet_port/telnet_username/telnet_password).
const TELNET_DEFAULT_PORT = 23;

// Batas panjang blok mentah SETELAH escape HTML. Dihitung pasca-escape (bukan
// pra-escape) supaya ekspansi entity ('<' → '&lt;') tak bisa menembus limit
// pesan Telegram (4096). Sisa ~600 char untuk header + pembungkus <pre>.
const RAW_ESCAPED_BUDGET = 3500;

type NotifySummary = { delivered: number; groups: number; errors: string[] };
type TelnetParams = { host: string; port: number; username?: string; password?: string };

// decrypt() menelan error dan mengembalikan '' → perlakukan '' sebagai gagal agar
// telnet-secret rusak jatuh ke fallback web, bukan diam-diam jadi password kosong.
function safeDecrypt(v?: string | null): string | undefined {
    if (!v) return undefined;
    return decrypt(v) || undefined;
}

/**
 * Resolve OLT (di-scope tenant) lalu bangun driver provisioning dari
 * kredensialnya. Kredensial telnet pakai khusus bila diisi, jika tidak fallback
 * ke web* (C-Data CLI sering admin/admin atau root/admin — beda dari login web).
 *
 * Mengembalikan row OLT + param telnet ter-resolve agar pemanggil bisa
 * memformat laporan (nama/host), menentukan target push (`olt.tenantId`), dan
 * memakai kredensial yang sama untuk probe diagnostik.
 */
async function resolveOltAndDriver(
    oltId: string,
    tenantId?: string | null,
): Promise<{ olt: Olt; driver: IOltProvisioningDriver; telnet: TelnetParams }> {
    const [olt] = await db
        .select()
        .from(olts)
        .where(and(eq(olts.id, oltId), tenantId ? eq(olts.tenantId, tenantId) : undefined));
    if (!olt) {
        throw new Error('OLT tidak ditemukan atau bukan milik tenant ini');
    }

    const telnet: TelnetParams = {
        host: olt.host,
        // Port telnet override (mis. VPN port-forward custom → OLT:23); fallback 23.
        port: olt.telnetPort ?? TELNET_DEFAULT_PORT,
        username: olt.telnetUsername || olt.webUsername || undefined,
        password: safeDecrypt(olt.telnetPassword) ?? safeDecrypt(olt.webPassword),
    };

    const driver = OltDriverFactory.getProvisioningDriver(olt.type, { ...telnet, protocol: 'telnet' });

    return { olt, driver, telnet };
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

/**
 * Petakan preset publik (row redaksi) → ProvisioningPreset yang dipakai driver.
 * Secret (acsPassword/pppoePassword) TAK diperlukan untuk C-Data authorize
 * (ACS bukan via CLI); pppoe.password placeholder bila ada username.
 */
function toProvisioningPreset(p: {
    id: string;
    name: string;
    onuTypeProfile?: string | null;
    lineProfile?: string | null;
    serviceProfile?: string | null;
    serviceVlan: number;
    mgmtVlan?: number | null;
    acsUrl?: string | null;
    acsUsername?: string | null;
    informInterval?: number | null;
    wanMode: ProvisioningPreset['wanMode'];
    pppoeUsername?: string | null;
}): ProvisioningPreset {
    return {
        id: p.id,
        name: p.name,
        onuTypeProfile: p.onuTypeProfile ?? undefined,
        lineProfile: p.lineProfile ?? undefined,
        serviceProfile: p.serviceProfile ?? undefined,
        serviceVlan: p.serviceVlan,
        mgmtVlan: p.mgmtVlan ?? undefined,
        acsUrl: p.acsUrl ?? undefined,
        acsUsername: p.acsUsername ?? undefined,
        informInterval: p.informInterval ?? undefined,
        wanMode: p.wanMode,
        pppoe: p.pppoeUsername ? { username: p.pppoeUsername, password: '' } : undefined,
    };
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
                { provisioning: true },
            );
        }
        return { onus, notify };
    },

    /**
     * DIAGNOSTIK: dump banner mentah (byte awal) yang dikirim OLT saat telnet
     * connect — untuk kalibrasi prompt saat login gagal "response not received".
     * Tak login; hanya socket TCP mentah + baca. Bila `opts.notify`, kirim ke
     * grup Telegram pemilik OLT.
     */
    probeTelnet: async (
        oltId: string,
        tenantId?: string | null,
        opts?: { notify?: boolean },
    ): Promise<{ host: string; port: number; banner: string; notify?: NotifySummary }> => {
        const { olt } = await resolveOltAndDriver(oltId, tenantId);
        const port = olt.telnetPort ?? TELNET_DEFAULT_PORT;
        const raw = await probeTelnetBanner(olt.host, port);
        const banner = sanitizeTelnetBanner(raw) || '(tidak ada data diterima dari device)';

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            const msg =
                `🔌 <b>Probe Telnet mentah</b>\n` +
                `<b>${escapeHtml(olt.name)}</b> (${escapeHtml(olt.host)}:${port})\n\n` +
                `<pre>${escapeHtml(banner.slice(0, 3000))}</pre>`;
            notify = await notificationService.pushTextToTenant(olt.tenantId, msg, { provisioning: true });
        }
        return { host: olt.host, port, banner, notify };
    },

    /**
     * DIAGNOSTIK: login penuh + jalankan `show ont autofind all` via socket
     * mentah, dump SEMUA byte output (pager persis, prompt, validitas perintah).
     * Dipakai saat `exec()` telnet-client gagal "response not received" agar kita
     * lihat sumber macetnya. Bila `opts.notify`, kirim ke Telegram pemilik OLT.
     */
    probeAutofind: async (
        oltId: string,
        tenantId?: string | null,
        opts?: { notify?: boolean; command?: string; enable?: boolean },
    ): Promise<{ host: string; port: number; command: string; enable: boolean; dump: string; notify?: NotifySummary }> => {
        const { olt, telnet } = await resolveOltAndDriver(oltId, tenantId);
        // Perintah bisa dioverride (diagnostik discovery), default autofind lama.
        // Route sudah membatasi hanya show/display/enable/help/? (read-only).
        const command = opts?.command || 'show ont autofind all';
        const enable = opts?.enable ?? false;
        // Enable password sering sama dengan password login → pakai ulang.
        const raw = await probeTelnetExec({ ...telnet, command, enable, enablePassword: telnet.password });
        const dump = sanitizeTelnetBanner(raw) || '(tidak ada output setelah perintah)';

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            const msg =
                `🔌 <b>Probe CLI mentah</b>${enable ? ' <i>(enable)</i>' : ''}\n` +
                `<b>${escapeHtml(olt.name)}</b> (${escapeHtml(telnet.host)}:${telnet.port})\n` +
                `<code>${escapeHtml(command)}</code>\n\n` +
                `<pre>${escapeHtml(dump.slice(0, 3200))}</pre>`;
            notify = await notificationService.pushTextToTenant(olt.tenantId, msg, { provisioning: true });
        }
        return { host: telnet.host, port: telnet.port, command, enable, dump, notify };
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
                { provisioning: true },
            );
        }
        return { result, notify };
    },

    /**
     * TULIS-LIVE: authorize satu ONU pakai preset. WAJIB `input.confirm === true`
     * (pengaman: operator sudah lihat preview via /plan). Idempoten & aman-tabrakan
     * ditangani di driver. Bila `opts.notify`, kirim hasil ke Telegram pemilik OLT.
     */
    authorize: async (
        oltId: string,
        tenantId: string | null | undefined,
        input: { presetId: string; onu: OnuRef; confirm: boolean },
        opts?: { notify?: boolean; actor?: { userId?: string; ip?: string; userAgent?: string } },
    ): Promise<{ result: ProvisionResult; notify?: NotifySummary }> => {
        if (input.confirm !== true) {
            throw new Error('Konfirmasi diperlukan (confirm=true) sebelum authorize.');
        }
        const preset = await provisioningPresetService.findById(input.presetId, tenantId);
        if (!preset) throw new Error('Preset tidak ditemukan atau bukan milik tenant ini.');

        const { olt, driver } = await resolveOltAndDriver(oltId, tenantId);
        // Preset terikat OLT lain tak boleh dipakai ke OLT ini (VLAN/profil OLT-specific).
        if (preset.oltId && preset.oltId !== oltId) {
            throw new Error('Preset ini terikat ke OLT lain — pilih preset untuk OLT ini atau preset global.');
        }

        // Serialisasi per-OLT (anti-TOCTOU) — hanya satu authorize berjalan per OLT.
        const result = await withOltLock(oltId, () => driver.authorizeOnu(input.onu, toProvisioningPreset(preset)));

        // Audit (best-effort — kegagalan audit tak boleh membatalkan hasil authorize).
        try {
            await auditRepository.create({
                userId: opts?.actor?.userId ?? null,
                tenantId: olt.tenantId ?? null,
                action: result.alreadyProvisioned ? 'authorize-skip' : result.success ? 'authorize' : 'authorize-fail',
                entity: 'olt',
                entityId: oltId,
                details: {
                    ponId: input.onu.ponId,
                    sn: input.onu.sn,
                    onuId: input.onu.onuId,
                    presetId: input.presetId,
                    success: result.success,
                    alreadyProvisioned: result.alreadyProvisioned ?? false,
                    message: result.message ?? null,
                    error: result.error ?? null,
                },
                ipAddress: opts?.actor?.ip ?? null,
                userAgent: opts?.actor?.userAgent ?? null,
            });
        } catch (e) {
            logger.warn({ err: e, oltId }, 'Gagal menulis audit log authorize');
        }

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            const icon = result.success ? (result.alreadyProvisioned ? 'ℹ️' : '✅') : '❌';
            const msg =
                `${icon} <b>Authorize ONU</b>\n` +
                `<b>${escapeHtml(olt.name)}</b> · SN <code>${escapeHtml(input.onu.sn || '-')}</code> · PON ${escapeHtml(input.onu.ponId || '-')}\n` +
                `${escapeHtml(result.message || result.error || '')}`;
            notify = await notificationService.pushTextToTenant(olt.tenantId, msg, { provisioning: true });
        }
        return { result, notify };
    },

    /** READ-ONLY: daftar line/srv profile OLT (untuk dropdown isi preset). */
    getProfiles: async (oltId: string, tenantId?: string | null): Promise<OltProfiles> => {
        const { driver } = await resolveOltAndDriver(oltId, tenantId);
        if (typeof driver.getProfiles !== 'function') {
            throw new Error('Driver OLT ini belum mendukung baca profil.');
        }
        return driver.getProfiles();
    },

    /** READ-ONLY: daftar ONT yang SUDAH teregister (mode auto-auth) untuk Modify. */
    getRegisteredOnus: async (oltId: string, tenantId?: string | null): Promise<RegisteredOnu[]> => {
        const { driver } = await resolveOltAndDriver(oltId, tenantId);
        if (typeof driver.getRegisteredOnus !== 'function') {
            throw new Error("Driver OLT ini belum mendukung daftar ONT teregister.");
        }
        return driver.getRegisteredOnus();
    },

    /** Preview MURNI perintah modify (tanpa menyentuh OLT). */
    planModify: async (
        oltId: string,
        tenantId: string | null | undefined,
        input: { presetId: string; onu: OnuRef; opts?: ModifyOptions },
    ): Promise<ProvisionPlan> => {
        const preset = await provisioningPresetService.findById(input.presetId, tenantId);
        if (!preset) throw new Error('Preset tidak ditemukan atau bukan milik tenant ini.');
        const { driver } = await resolveOltAndDriver(oltId, tenantId);
        if (typeof driver.planModify !== 'function') throw new Error('Driver OLT ini belum mendukung modify.');
        return driver.planModify(input.onu, toProvisioningPreset(preset), input.opts);
    },

    /**
     * TULIS-LIVE: modify ONT teregister (rebind profil, opsional VLAN/label).
     * Sama seperti authorize: confirm wajib, serialisasi per-OLT, audit, notify.
     */
    modifyOnu: async (
        oltId: string,
        tenantId: string | null | undefined,
        input: { presetId: string; onu: OnuRef; opts?: ModifyOptions; confirm: boolean },
        opts?: { notify?: boolean; actor?: { userId?: string; ip?: string; userAgent?: string } },
    ): Promise<{ result: ProvisionResult; notify?: NotifySummary }> => {
        if (input.confirm !== true) throw new Error('Konfirmasi diperlukan (confirm=true) sebelum modify.');
        const preset = await provisioningPresetService.findById(input.presetId, tenantId);
        if (!preset) throw new Error('Preset tidak ditemukan atau bukan milik tenant ini.');
        const { olt, driver } = await resolveOltAndDriver(oltId, tenantId);
        if (typeof driver.modifyOnu !== 'function') throw new Error('Driver OLT ini belum mendukung modify.');
        if (preset.oltId && preset.oltId !== oltId) {
            throw new Error('Preset ini terikat ke OLT lain — pilih preset untuk OLT ini atau preset global.');
        }

        const result = await withOltLock(oltId, () => driver.modifyOnu!(input.onu, toProvisioningPreset(preset), input.opts));

        try {
            await auditRepository.create({
                userId: opts?.actor?.userId ?? null,
                tenantId: olt.tenantId ?? null,
                action: result.success ? 'modify-onu' : 'modify-onu-fail',
                entity: 'olt',
                entityId: oltId,
                details: {
                    ponId: input.onu.ponId,
                    sn: input.onu.sn,
                    onuId: input.onu.onuId,
                    presetId: input.presetId,
                    updateVlan: input.opts?.updateVlan ?? false,
                    success: result.success,
                    message: result.message ?? null,
                    error: result.error ?? null,
                },
                ipAddress: opts?.actor?.ip ?? null,
                userAgent: opts?.actor?.userAgent ?? null,
            });
        } catch (e) {
            logger.warn({ err: e, oltId }, 'Gagal menulis audit log modify');
        }

        let notify: NotifySummary | undefined;
        if (opts?.notify) {
            const icon = result.success ? '🔧' : '❌';
            const msg =
                `${icon} <b>Modify ONU</b>\n` +
                `<b>${escapeHtml(olt.name)}</b> · SN <code>${escapeHtml(input.onu.sn || '-')}</code> · PON ${escapeHtml(input.onu.ponId || '-')}\n` +
                `${escapeHtml(result.message || result.error || '')}`;
            notify = await notificationService.pushTextToTenant(olt.tenantId, msg, { provisioning: true });
        }
        return { result, notify };
    },
};
