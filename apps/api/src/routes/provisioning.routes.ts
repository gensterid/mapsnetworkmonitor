import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAdmin, requireOperator } from '../middleware/rbac.middleware.js';
import { requireTenantContext } from '../middleware/tenant-context.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { strictLimiter } from '../config/security.js';
import { provisioningPresetService, ProvisioningPresetInput } from '../services/provisioning-preset.service.js';
import { provisioningService } from '../services/provisioning.service.js';
import { OltDriverFactory } from '../services/olt-drivers/driver.factory.js';
import { ProvisioningPreset, OnuRef } from '../services/olt-drivers/olt-provisioning.interface.js';

const router = Router();

// Allowlist ketat untuk field yang akhirnya masuk perintah CLI OLT (cegah injection).
const PROFILE_RE = /^[A-Za-z0-9_-]{1,32}$/; // id/nama profil
const PON_RE = /^\d+(\/\d+){0,3}$/; // port PON vendor, mis. 0/0, 1/3/3
const SN_RE = /^[A-Za-z0-9:.-]{4,32}$/; // SN (GPON) / MAC (EPON, pakai ':')
const ONUID_RE = /^\d{1,4}$/; // index ONU numerik

const presetSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    oltType: z.enum(['hsgq', 'cdata', 'generic']).optional(),
    oltId: z.string().uuid().optional(),
    onuTypeProfile: z.string().regex(PROFILE_RE).optional(),
    lineProfile: z.string().regex(PROFILE_RE).optional(),
    serviceProfile: z.string().regex(PROFILE_RE).optional(),
    serviceVlan: z.number().int().min(1).max(4094),
    mgmtVlan: z.number().int().min(1).max(4094).optional(),
    acsUrl: z.string().url().optional(),
    acsUsername: z.string().optional(),
    acsPassword: z.string().optional(),
    informInterval: z.number().int().positive().optional(),
    wanMode: z.enum(['bridge', 'pppoe', 'dhcp']).optional(),
    pppoeUsername: z.string().optional(),
    pppoePassword: z.string().optional(),
});

const planSchema = z.object({
    presetId: z.string().uuid(),
    ponId: z.string().regex(PON_RE, 'format PON tidak valid (mis. 0/0 atau 1/3/3)'),
    sn: z.string().regex(SN_RE).optional(),
    onuId: z.string().regex(ONUID_RE).optional(),
    oltType: z.enum(['hsgq', 'cdata', 'generic']).optional(),
});

// Authorize (TULIS-LIVE): butuh F/S/P lengkap, SN, ont-id, + confirm=true eksplisit.
const authorizeSchema = z.object({
    presetId: z.string().uuid(),
    ponId: z.string().regex(PON_RE, 'format PON tidak valid (mis. 0/0/2)'),
    sn: z.string().regex(SN_RE),
    onuId: z.string().regex(ONUID_RE),
    confirm: z.literal(true, { errorMap: () => ({ message: 'confirm harus true' }) }),
});

// Modify (TULIS-LIVE): ubah profil/VLAN ONT teregister. description terbatas
// charset aman (juga masuk perintah CLI `ont description`).
const DESC_RE = /^[A-Za-z0-9 _.\-]{1,32}$/;
const modifyBaseSchema = z.object({
    presetId: z.string().uuid(),
    ponId: z.string().regex(PON_RE, 'format PON tidak valid (mis. 0/0/2)'),
    sn: z.string().regex(SN_RE),
    onuId: z.string().regex(ONUID_RE),
    updateVlan: z.boolean().optional(),
    description: z.string().regex(DESC_RE, 'label hanya boleh huruf/angka/spasi/._-').optional(),
});
const modifySchema = modifyBaseSchema.extend({
    confirm: z.literal(true, { errorMap: () => ({ message: 'confirm harus true' }) }),
});

// ---- CRUD preset provisioning (semua tenant-scoped) ----

// GET /provisioning/presets — Operator+ (bisa memuat konteks kredensial)
router.get('/presets', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    try {
        const data = await provisioningPresetService.findAll(getEffectiveTenantId(req));
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /provisioning/presets/:id
router.get('/presets/:id', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    try {
        const preset = await provisioningPresetService.findById(req.params.id as string, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ data: preset });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// POST /provisioning/presets — Admin
router.post('/presets', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const input = presetSchema.parse(req.body) as ProvisioningPresetInput;
        const tenantId = getEffectiveTenantId(req);
        if (input.oltId && !(await provisioningPresetService.isOltOwned(input.oltId, tenantId))) {
            return res.status(400).json({ error: 'oltId tidak ditemukan atau bukan milik tenant ini' });
        }
        const preset = await provisioningPresetService.create(input, tenantId);
        res.status(201).json({ data: preset });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// PATCH /provisioning/presets/:id — Admin
router.patch('/presets/:id', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const input = presetSchema.partial().parse(req.body) as Partial<ProvisioningPresetInput>;
        const tenantId = getEffectiveTenantId(req);
        if (input.oltId && !(await provisioningPresetService.isOltOwned(input.oltId, tenantId))) {
            return res.status(400).json({ error: 'oltId tidak ditemukan atau bukan milik tenant ini' });
        }
        const preset = await provisioningPresetService.update(req.params.id as string, input, tenantId);
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ data: preset });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// DELETE /provisioning/presets/:id — Admin
router.delete('/presets/:id', authMiddleware, requireTenantContext, requireAdmin, async (req, res) => {
    try {
        const preset = await provisioningPresetService.delete(req.params.id as string, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// ---- Preview rencana authorize (MURNI, tanpa menyentuh OLT) ----
// POST /provisioning/plan — Operator+. Menampilkan perintah persis dari preset.
router.post('/plan', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    try {
        const { presetId, ponId, sn, onuId, oltType } = planSchema.parse(req.body);

        const preset = await provisioningPresetService.findById(presetId, getEffectiveTenantId(req));
        if (!preset) return res.status(404).json({ error: 'Preset not found' });

        // Petakan row (nullable) -> ProvisioningPreset (optional). Secret TIDAK
        // dibutuhkan untuk preview; pppoe pakai placeholder bila ada username.
        const provPreset: ProvisioningPreset = {
            id: preset.id,
            name: preset.name,
            onuTypeProfile: preset.onuTypeProfile ?? undefined,
            lineProfile: preset.lineProfile ?? undefined,
            serviceProfile: preset.serviceProfile ?? undefined,
            serviceVlan: preset.serviceVlan,
            mgmtVlan: preset.mgmtVlan ?? undefined,
            acsUrl: preset.acsUrl ?? undefined,
            acsUsername: preset.acsUsername ?? undefined,
            informInterval: preset.informInterval ?? undefined,
            wanMode: preset.wanMode,
            pppoe: preset.pppoeUsername ? { username: preset.pppoeUsername, password: '' } : undefined,
        };

        const resolvedType = oltType ?? preset.oltType ?? 'cdata';
        // Config stub — preview tak membuka koneksi ke OLT.
        const driver = OltDriverFactory.getProvisioningDriver(resolvedType, { host: '', port: 0 });

        const onu: OnuRef = { ponId, sn, onuId };
        const plan = await driver.planAuthorize(onu, provPreset);
        res.json({ data: plan });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// ---- Fase-1 TULIS: authorize ONU (Operator+, wajib confirm=true) ----

// POST /provisioning/olts/:oltId/authorize — jalankan authorize dari preset.
// Pengaman: confirm=true wajib (operator sudah lihat preview via /plan). Driver
// idempoten (cek SN) & tolak tabrakan ont-id. ?notify=1 → hasil ke Telegram.
router.post('/olts/:oltId/authorize', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const body = authorizeSchema.parse(req.body);
        const { result, notify } = await provisioningService.authorize(
            idCheck.data,
            getEffectiveTenantId(req),
            {
                presetId: body.presetId,
                onu: { ponId: body.ponId, sn: body.sn, onuId: body.onuId },
                confirm: body.confirm,
            },
            {
                notify: wantsNotify(req),
                actor: { userId: req.user?.id, ip: req.ip, userAgent: req.headers['user-agent'] },
            },
        );
        // Authorize gagal (mis. tabrakan ont-id) tetap 200 dgn result.success=false
        // agar UI bisa tampilkan pesan; error tak terduga → catch di bawah (500).
        res.json({ data: result, notify });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// ---- Modify ONT teregister (mode auto-auth): rebind profil/VLAN by SN ----

// GET /provisioning/olts/:oltId/profiles — daftar line/srv profile OLT (untuk isi preset).
router.get('/olts/:oltId/profiles', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const data = await provisioningService.getProfiles(idCheck.data, getEffectiveTenantId(req));
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /provisioning/olts/:oltId/registered — daftar ONT teregister (Operator+).
router.get('/olts/:oltId/registered', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const data = await provisioningService.getRegisteredOnus(idCheck.data, getEffectiveTenantId(req));
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// POST /provisioning/olts/:oltId/plan-modify — preview MURNI (tanpa sentuh OLT).
router.post('/olts/:oltId/plan-modify', authMiddleware, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const body = modifyBaseSchema.parse(req.body);
        const plan = await provisioningService.planModify(idCheck.data, getEffectiveTenantId(req), {
            presetId: body.presetId,
            onu: { ponId: body.ponId, sn: body.sn, onuId: body.onuId },
            opts: { updateVlan: body.updateVlan, description: body.description },
        });
        res.json({ data: plan });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// POST /provisioning/olts/:oltId/modify — TULIS-LIVE (Operator+, confirm=true wajib).
router.post('/olts/:oltId/modify', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const body = modifySchema.parse(req.body);
        const { result, notify } = await provisioningService.modifyOnu(
            idCheck.data,
            getEffectiveTenantId(req),
            {
                presetId: body.presetId,
                onu: { ponId: body.ponId, sn: body.sn, onuId: body.onuId },
                opts: { updateVlan: body.updateVlan, description: body.description },
                confirm: body.confirm,
            },
            {
                notify: wantsNotify(req),
                actor: { userId: req.user?.id, ip: req.ip, userAgent: req.headers['user-agent'] },
            },
        );
        res.json({ data: result, notify });
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// ---- Fase-1 baca: ONU belum ter-authorize di OLT (Telnet, READ-ONLY) ----

// Presence flag `?notify=1` / `?notify=telegram` → dorong hasil ke Telegram
// (Level 1 "push-hasil": tes dari HP, output mentah ikut untuk kalibrasi parser).
const wantsNotify = (req: { query: Record<string, unknown> }): boolean => {
    // `qs` mengubah param berulang (?notify=1&notify=1) jadi array — tangani agar
    // proxy/HP yang menduplikasi param tak diam-diam menonaktifkan notify.
    const raw = req.query.notify;
    const values = Array.isArray(raw) ? raw : [raw];
    return values.some((v) => v === '1' || v === 'telegram');
};

// GET /provisioning/olts/:oltId/unconfigured — Operator+
router.get('/olts/:oltId/unconfigured', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const { onus, notify } = await provisioningService.getUnconfiguredOnus(
            idCheck.data,
            getEffectiveTenantId(req),
            { notify: wantsNotify(req) },
        );
        res.json({ data: onus, notify });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// Probe CLI: allowlist verb non-destruktif untuk discovery (show/display baca,
// enable/help/list/? untuk eksplorasi mode & daftar perintah). Cegah aksi
// berbahaya (reboot/delete/config) & injection. Satu perintah per sesi →
// `enable` sendirian hanya pindah mode, tak bisa dirangkai jadi aksi merusak.
const CLI_PROBE_RE = /^(?:show|display|enable|help|list|\?)[\w ?/.\-]{0,74}$/i;
// Navigasi mode untuk DIAGNOSA mode-entry (kenapa `config`/`interface gpon`
// ditolak lewat transport kita padahal jalan di PuTTY). Non-destruktif:
// probe = SATU perintah per sesi TANPA `save` → tak ada yang persist & tak bisa
// dirangkai jadi tulis. Membedakan bug transport vs sekuens perintah.
const CLI_NAV_RE = /^(?:config(?:ure)?|conf|end|exit|quit|interface gpon [0-9]+\/[0-9]+)$/i;

// GET /provisioning/olts/:oltId/autofind-probe — login + jalankan perintah, dump mentah.
// ?cmd=<show...> override perintah (default `show ont autofind all`) untuk discovery.
router.get('/olts/:oltId/autofind-probe', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });

    const rawCmd = Array.isArray(req.query.cmd) ? req.query.cmd[0] : req.query.cmd;
    let command: string | undefined;
    if (typeof rawCmd === 'string' && rawCmd.trim().length > 0) {
        const c = rawCmd.trim();
        if (!CLI_PROBE_RE.test(c) && !CLI_NAV_RE.test(c)) {
            return res.status(400).json({ error: 'cmd hanya boleh show/display atau navigasi mode (config/interface/end/exit) — diagnostik' });
        }
        command = c;
    }

    const enable = req.query.enable === '1' || req.query.enable === 'true';

    try {
        const data = await provisioningService.probeAutofind(idCheck.data, getEffectiveTenantId(req), {
            notify: wantsNotify(req),
            command,
            enable,
        });
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /provisioning/olts/:oltId/telnet-probe — dump banner mentah (diagnostik prompt)
router.get('/olts/:oltId/telnet-probe', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const data = await provisioningService.probeTelnet(idCheck.data, getEffectiveTenantId(req), { notify: wantsNotify(req) });
        res.json({ data });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// GET /provisioning/olts/:oltId/test-connection — uji telnet ke OLT (Operator+)
router.get('/olts/:oltId/test-connection', authMiddleware, strictLimiter, requireTenantContext, requireOperator, async (req, res) => {
    const idCheck = z.string().uuid().safeParse(req.params.oltId);
    if (!idCheck.success) return res.status(400).json({ error: 'oltId tidak valid' });
    try {
        const { result, notify } = await provisioningService.testConnection(
            idCheck.data,
            getEffectiveTenantId(req),
            { notify: wantsNotify(req) },
        );
        res.json({ data: result, notify });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

export default router;
