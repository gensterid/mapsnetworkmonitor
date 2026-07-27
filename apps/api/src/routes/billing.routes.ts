import { Router, raw as expressRaw } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { gatewayService } from '../services/billing/gateway.service.js';
import { mikrotikSetupService } from '../services/billing/mikrotik-setup.service.js';
import {
    packageService, customerService, subscriptionService, invoiceService,
    billingSettingsService,
} from '../services/billing/billing.service.js';
import { voucherService } from '../services/billing/voucher.service.js';
import { billingReportsService } from '../services/billing/billing-reports.service.js';
import { sendWaNotification, buildMessage } from '../services/billing/wa-notification.service.js';
import type { WaProviderConfig } from '../services/billing/wa-providers.js';
import { driftDetectorService } from '../services/billing/drift-detector.service.js';
import { transactionService } from '../services/billing/transaction.service.js';
import { resolveGatewayConfig } from '../services/billing/gateway.service.js';
import { promiseToPayService } from '../services/billing/promise-to-pay.service.js';

/**
 * Billing routes — Phase B.2.
 *
 *   GET    /packages              POST  /packages       PATCH/DELETE /packages/:id
 *   GET    /customers             POST  /customers      PATCH/DELETE /customers/:id
 *   GET    /subscriptions         POST  /subscriptions  PATCH/DELETE /subscriptions/:id
 *   POST   /subscriptions/:id/isolir
 *   POST   /subscriptions/:id/unisolir
 *   POST   /subscriptions/:id/reveal-password
 *   GET    /invoices              POST  /invoices
 *   POST   /invoices/:id/pay
 *   POST   /invoices/:id/cancel
 *   GET    /settings/router/:routerId
 *   PUT    /settings/router/:routerId
 *
 * All under /api/billing. Tenant scoping via getEffectiveTenantId.
 * Operator role required (uses requireOperator) — superadmin always has access.
 */

const router = Router();

// ─── Public webhook endpoints (NO auth, raw body for signature verify) ────
// Mounted before authMiddleware so external gateways can POST without
// session/cookie. The handler does signature verification with the
// router-specific secret and rejects on mismatch.
const webhookHandler = (gateway: 'tripay' | 'midtrans' | 'xendit') =>
    asyncHandler(async (req: any, res) => {
        const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
        const result = await gatewayService.handleWebhook({
            gateway,
            rawBody,
            headers: req.headers as any,
        });
        res.status(result.status).json(result.body);
    });

router.post('/webhook/tripay',   expressRaw({ type: '*/*', limit: '256kb' }), webhookHandler('tripay'));
router.post('/webhook/midtrans', expressRaw({ type: '*/*', limit: '256kb' }), webhookHandler('midtrans'));
router.post('/webhook/xendit',   expressRaw({ type: '*/*', limit: '256kb' }), webhookHandler('xendit'));

// All routes below require authentication
router.use(authMiddleware);
// M6 (audit): seluruh route billing (di bawah) minimal Operator — cegah role
// `user` (berhak terendah) melihat PII pelanggan / tagihan. Webhook publik di
// ATAS baris ini TIDAK terpengaruh (mutasi tetap punya requireOperator sendiri).
router.use(requireOperator);

const requireTenant = (req: any, res: any, next: any) => {
    const t = getEffectiveTenantId(req);
    if (!t) return res.status(400).json({ error: 'Tenant context required' });
    req._tenantId = t;
    next();
};

// ─── Packages ──────────────────────────────────────────────────────────────

const packageSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['pppoe', 'hotspot']),
    mikrotikProfile: z.string().min(1),
    price: z.number().nonnegative().or(z.string()),
    cycleType: z.enum(['monthly', 'duration']),
    cycleValue: z.number().int().positive().default(1),
    description: z.string().optional().nullable(),
    routerId: z.string().uuid().optional().nullable(),
    active: z.boolean().optional(),
});

router.get('/packages', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await packageService.list(req._tenantId, {
        type: req.query.type as any,
        routerId: req.query.routerId as any,
        active: req.query.active === undefined ? undefined : req.query.active === 'true',
    });
    res.json({ data: rows });
}));

router.post('/packages', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = packageSchema.parse(req.body);
    const row = await packageService.create(req._tenantId, { ...body, price: String(body.price) });
    res.status(201).json({ data: row });
}));

router.patch('/packages/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = packageSchema.partial().parse(req.body);
    const patch: any = { ...body };
    if (patch.price !== undefined) patch.price = String(patch.price);
    const row = await packageService.update(req.params.id, req._tenantId, patch);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.delete('/packages/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const ok = await packageService.delete(req.params.id, req._tenantId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
}));

// ─── Customers ─────────────────────────────────────────────────────────────

const customerSchema = z.object({
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    address: z.string().optional().nullable(),
    latitude: z.string().optional().nullable(),
    longitude: z.string().optional().nullable(),
    pinCode: z.string().min(4).max(8).optional(),
    notes: z.string().optional().nullable(),
    active: z.boolean().optional(),
});

router.get('/customers', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await customerService.list(req._tenantId, {
        search: req.query.search as any,
        active: req.query.active === undefined ? undefined : req.query.active === 'true',
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json({ data: rows });
}));

router.get('/customers/:id', requireTenant, asyncHandler(async (req: any, res) => {
    const row = await customerService.findById(req.params.id, req._tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.post('/customers', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = customerSchema.parse(req.body);
    const row = await customerService.create(req._tenantId, body as any);
    res.status(201).json({ data: row });
}));

router.patch('/customers/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = customerSchema.partial().parse(req.body);
    const row = await customerService.update(req.params.id, req._tenantId, body as any);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.delete('/customers/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const ok = await customerService.delete(req.params.id, req._tenantId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
}));

// ─── Subscriptions ─────────────────────────────────────────────────────────

const subscriptionCreateSchema = z.object({
    customerId: z.string().uuid(),
    packageId: z.string().uuid(),
    routerId: z.string().uuid(),
    mikrotikIdentity: z.string().min(1),
    plainPassword: z.string().min(1),
    billingDay: z.number().int().min(1).max(28).optional(),
    billingMode: z.enum(['anchor_day', 'anniversary']).optional(),
    activateNow: z.boolean().optional(),
});

router.get('/subscriptions', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await subscriptionService.list(req._tenantId, {
        customerId: req.query.customerId as any,
        routerId: req.query.routerId as any,
        status: req.query.status as any,
    });
    res.json({ data: rows });
}));

router.get('/subscriptions/:id', requireTenant, asyncHandler(async (req: any, res) => {
    const row = await subscriptionService.findById(req.params.id, req._tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.post('/subscriptions', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = subscriptionCreateSchema.parse(req.body);
    const row = await subscriptionService.create(req._tenantId, body);
    res.status(201).json({ data: row });
}));

/**
 * Composite endpoint: bikin customer + subscription dalam 1 transaction.
 * Dipakai oleh wizard "Tambah Pelanggan" di UI baru — operator tidak perlu
 * pindah tab untuk bikin keduanya. Kalau salah satu gagal, keduanya rollback.
 */
router.post('/customer-with-subscription', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        customer: z.object({
            name: z.string().min(1),
            phone: z.string().optional().nullable(),
            email: z.string().email().optional().nullable(),
            address: z.string().optional().nullable(),
            latitude: z.string().optional().nullable(),
            longitude: z.string().optional().nullable(),
            pinCode: z.string().min(4).max(8).optional(),
            notes: z.string().optional().nullable(),
        }),
        subscription: z.object({
            packageId: z.string().uuid(),
            routerId: z.string().uuid(),
            mikrotikIdentity: z.string().min(1),
            plainPassword: z.string().min(1),
            billingDay: z.number().int().min(1).max(28).optional(),
            billingMode: z.enum(['anchor_day', 'anniversary']).optional(),
            activateNow: z.boolean().optional(),
        }),
    }).parse(req.body);

    try {
        const customer = await customerService.create(req._tenantId, body.customer as any);
        try {
            const subscription = await subscriptionService.create(req._tenantId, {
                ...body.subscription,
                customerId: customer.id,
            });
            res.status(201).json({ data: { customer, subscription } });
        } catch (subErr: any) {
            // Rollback customer kalau subscription gagal — supaya tidak ada
            // customer orphan tanpa langganan.
            await customerService.delete(customer.id, req._tenantId).catch(() => {});
            throw subErr;
        }
    } catch (e: any) {
        res.status(400).json({ error: e?.message || 'Gagal buat pelanggan + langganan' });
    }
}));

router.patch('/subscriptions/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        packageId: z.string().uuid().optional(),
        plainPassword: z.string().optional(),
        billingDay: z.number().int().min(1).max(28).optional(),
        billingMode: z.enum(['anchor_day', 'anniversary']).optional(),
        status: z.enum(['active', 'isolir', 'expired', 'cancelled', 'suspended']).optional(),
        statusReason: z.string().optional(),
    }).parse(req.body);
    const row = await subscriptionService.update(req.params.id, req._tenantId, body);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.delete('/subscriptions/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const ok = await subscriptionService.delete(req.params.id, req._tenantId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
}));

router.post('/subscriptions/:id/isolir', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const row = await subscriptionService.isolir(req.params.id, req._tenantId, req.body?.reason || 'manual');
    res.json({ data: row });
}));

router.post('/subscriptions/:id/unisolir', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const row = await subscriptionService.unisolir(req.params.id, req._tenantId);
    res.json({ data: row });
}));

router.post('/subscriptions/:id/reveal-password', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const pwd = await subscriptionService.revealPassword(req.params.id, req._tenantId);
    if (pwd === null) return res.status(404).json({ error: 'Not found or no password' });
    res.json({ data: { password: pwd } });
}));

router.post('/subscriptions/:id/shift-due', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        // YYYY-MM-DD diutamakan (UI date picker). ISO datetime juga accept untuk
        // programmatic call. Service akan parse string sebagai midnight di
        // tenant TZ supaya tidak salah TZ dari browser.
        nextDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T|$)/, 'Format wajib YYYY-MM-DD'),
    }).parse(req.body);
    const row = await subscriptionService.shiftNextDue(req.params.id, req._tenantId, body.nextDueAt);
    if (!row) return res.status(404).json({ error: 'Subscription tidak ditemukan' });
    res.json({ data: row });
}));

// ─── Invoices ──────────────────────────────────────────────────────────────

const invoiceCreateSchema = z.object({
    customerId: z.string().uuid(),
    subscriptionId: z.string().uuid().optional(),
    packageId: z.string().uuid().optional(),
    routerId: z.string().uuid().optional(),
    amount: z.number().nonnegative().or(z.string()),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    dueAt: z.string().datetime().optional(),
    notes: z.string().optional(),
});

router.get('/invoices', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await invoiceService.list(req._tenantId, {
        customerId: req.query.customerId as any,
        routerId: req.query.routerId as any,
        status: req.query.status as any,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: rows });
}));

router.post('/invoices', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = invoiceCreateSchema.parse(req.body);
    const row = await invoiceService.create(req._tenantId, {
        ...body,
        periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    });
    res.status(201).json({ data: row });
}));

router.post('/invoices/:id/pay', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        amount: z.number().nonnegative().or(z.string()),
        method: z.enum(['manual_cash', 'manual_transfer', 'gateway_tripay', 'gateway_midtrans', 'gateway_xendit']),
        gatewayTxnId: z.string().optional(),
        gatewayPayload: z.any().optional(),
        notes: z.string().optional(),
    }).parse(req.body);
    const result = await invoiceService.markPaid(req.params.id, req._tenantId, {
        ...body,
        recordedBy: req.user?.id,
    });
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result });
}));

router.post('/invoices/:id/cancel', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const row = await invoiceService.cancel(req.params.id, req._tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ data: row });
}));

router.post('/invoices/:id/payment-link', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        gateway: z.enum(['tripay', 'midtrans', 'xendit']),
        returnUrl: z.string().url().optional(),
        options: z.record(z.any()).optional(),
    }).parse(req.body);

    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https') as string;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${proto}://${host}/api/billing/webhook/${body.gateway}`;

    const result = await gatewayService.createPayment({
        invoiceId: req.params.id,
        tenantId: req._tenantId,
        gateway: body.gateway,
        returnUrl: body.returnUrl,
        callbackUrl,
        options: body.options,
    });
    res.json({ data: result });
}));

// ─── Vouchers (Phase C) ────────────────────────────────────────────────────

router.get('/vouchers/router/:routerId', requireTenant, asyncHandler(async (req: any, res) => {
    try {
        const result = await voucherService.listForRouter(req._tenantId, req.params.routerId);
        res.json({ data: result });
    } catch (e: any) {
        const msg = String(e?.message || '');
        const { logger } = await import('../lib/logger.js');
        logger.warn({ err: msg, routerId: req.params.routerId }, 'voucher list failed');
        // MikroTik bridge mode tergantung router — kalau router lambat/down, return
        // 503 dengan empty list supaya UI tetap render (bukan crash dengan 500).
        if (msg.includes('timed out') || msg.includes('ECONNREFUSED') || msg.includes('EHOSTUNREACH')) {
            return res.status(503).json({
                data: { mode: 'unknown', items: [] },
                error: 'Router tidak merespons — bridge mode butuh koneksi MikroTik yang aktif. Coba ganti ke mode Native atau cek status router.',
            });
        }
        res.status(500).json({ error: msg || 'Gagal baca voucher' });
    }
}));

router.get('/vouchers/batches', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await voucherService.listBatches(req._tenantId, {
        routerId: req.query.routerId as any,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: rows });
}));

router.get('/vouchers/batches/:id', requireTenant, asyncHandler(async (req: any, res) => {
    const batch = await voucherService.getBatch(req.params.id, req._tenantId);
    if (!batch) return res.status(404).json({ error: 'Not found' });
    const list = await voucherService.listNative(req._tenantId, { batchId: req.params.id });
    res.json({ data: { batch, vouchers: list } });
}));

router.post('/vouchers/batches', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        routerId: z.string().uuid(),
        packageId: z.string().uuid(),
        count: z.number().int().min(1).max(500),
        codeMode: z.enum(['vc', 'up']),
        charsetMode: z.enum(['lower', 'upper', 'upplow', 'mix', 'mix1', 'mix2', 'num']),
        codeLength: z.number().int().min(3).max(12),
        prefix: z.string().optional(),
        note: z.string().optional(),
    }).parse(req.body);

    const result = await voucherService.generateBatch({
        tenantId: req._tenantId,
        ...body,
        generatedBy: req.user?.id,
    });
    res.status(201).json({ data: result });
}));

router.delete('/vouchers/batches/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const result = await voucherService.deleteBatch(req.params.id, req._tenantId);
    res.json({ data: result });
}));

router.post('/vouchers/batches/:id/mark-printed', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    await voucherService.markPrinted(req.params.id, req._tenantId);
    res.json({ data: { ok: true } });
}));

router.delete('/vouchers/:id', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const ok = await voucherService.deleteVoucher(req.params.id, req._tenantId);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
}));

// ─── MikroTik introspection helpers (Phase B+) ─────────────────────────────

router.get('/router/:id/ppp-profiles', requireTenant, asyncHandler(async (req: any, res) => {
    const { routerActionService } = await import('../services/router-action.service.js');
    const { getPppProfiles } = await import('../lib/mikrotik/billing.js');
    try {
        const api = await routerActionService.getRouterConnection(req.params.id, req._tenantId);
        const profiles = await getPppProfiles(api);
        res.json({ data: profiles });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'gagal baca profile dari router' });
    }
}));

router.post('/router/:id/ppp-profiles', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        name: z.string().min(1),
        rateLimit: z.string().optional(),
        localAddress: z.string().optional(),
        remoteAddress: z.string().optional(),
        addressList: z.string().optional(),
        onlyOne: z.enum(['yes', 'no', 'default']).optional(),
        comment: z.string().optional(),
    }).parse(req.body);
    const { routerActionService } = await import('../services/router-action.service.js');
    const { addPppProfile } = await import('../lib/mikrotik/billing.js');
    try {
        const api = await routerActionService.getRouterConnection(req.params.id, req._tenantId);
        const id = await addPppProfile(api, body);
        res.status(201).json({ data: { id, name: body.name } });
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'gagal buat profile' });
    }
}));

router.get('/router/:id/isolir-firewall', requireTenant, asyncHandler(async (req: any, res) => {
    const { routerActionService } = await import('../services/router-action.service.js');
    const { inspectIsolirFirewall } = await import('../lib/mikrotik/billing.js');
    const listName = (req.query.list as string) || 'isolir';
    try {
        const api = await routerActionService.getRouterConnection(req.params.id, req._tenantId);
        const status = await inspectIsolirFirewall(api, listName);
        res.json({ data: status });
    } catch (e: any) {
        res.status(500).json({ error: e?.message });
    }
}));

router.post('/router/:id/isolir-firewall/setup', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        listName: z.string().optional(),
        redirectIp: z.string().min(1),
        redirectPort: z.number().int().optional(),
        addWalledGarden: z.boolean().optional(),
    }).parse(req.body);
    const { routerActionService } = await import('../services/router-action.service.js');
    const { setupIsolirFirewall } = await import('../lib/mikrotik/billing.js');
    try {
        const api = await routerActionService.getRouterConnection(req.params.id, req._tenantId);
        const result = await setupIsolirFirewall(api, body);
        res.json({ data: result });
    } catch (e: any) {
        res.status(500).json({ error: e?.message });
    }
}));

// ─── MikroTik setup helpers (Phase B fitur tambahan) ───────────────────────

router.get('/mikrotik/:routerId/ppp-profiles', requireTenant, asyncHandler(async (req: any, res) => {
    try {
        const profiles = await mikrotikSetupService.listPppProfiles(req.params.routerId, req._tenantId);
        res.json({ data: profiles });
    } catch (e: any) {
        const msg = e?.message || 'Gagal baca profile dari MikroTik';
        const { logger } = await import('../lib/logger.js');
        logger.warn({ err: msg, code: e?.code, cause: e?.cause?.message, routerId: req.params.routerId, tenantId: req._tenantId }, 'mikrotik ppp-profiles failed');
        res.status(502).json({ error: msg, code: e?.code, detail: e?.cause?.message });
    }
}));

router.get('/mikrotik/:routerId/isolir-status', requireTenant, asyncHandler(async (req: any, res) => {
    const profileName = (req.query.profile as string) || 'pppoe-isolir';
    const listName = (req.query.list as string) || 'isolir';
    try {
        const data = await mikrotikSetupService.getIsolirReadiness(req.params.routerId, profileName, listName, req._tenantId);
        res.json({ data });
    } catch (e: any) {
        const { logger } = await import('../lib/logger.js');
        logger.warn({ err: e?.message, code: e?.code, cause: e?.cause?.message, routerId: req.params.routerId, tenantId: req._tenantId }, 'mikrotik isolir-status failed');
        res.status(502).json({ error: e?.message || 'Gagal baca status isolir' });
    }
}));

router.get('/mikrotik/:routerId/billing-scheduler-status', requireTenant, asyncHandler(async (req: any, res) => {
    try {
        const data = await mikrotikSetupService.getBillingSchedulerStatus(req.params.routerId, req._tenantId);
        res.json({ data });
    } catch (e: any) {
        res.status(502).json({ error: e?.message || 'Gagal baca scheduler' });
    }
}));

router.post('/mikrotik/:routerId/billing-scheduler-setup', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        isolirProfile: z.string().optional(),
        interval: z.string().optional(),
        startHour: z.number().int().min(0).max(23).optional(),
        endHour: z.number().int().min(0).max(23).optional(),
    }).parse(req.body || {});
    try {
        // Fallback: kalau startHour/endHour tidak dikirim dari body, ambil
        // dari billing_router_settings supaya operator tidak perlu input ulang.
        let startHour = body.startHour;
        let endHour = body.endHour;
        if (startHour === undefined || endHour === undefined) {
            const settings = await billingSettingsService.getForRouter(req.params.routerId, req._tenantId);
            startHour = startHour ?? settings?.isolirCheckStartHour ?? 8;
            endHour = endHour ?? settings?.isolirCheckEndHour ?? 17;
        }
        const result = await mikrotikSetupService.setupBillingScheduler(req.params.routerId, req._tenantId, {
            ...body, startHour, endHour,
        });
        res.json({ data: result });
    } catch (e: any) {
        const msg = e?.message || 'Gagal setup scheduler';
        const { logger } = await import('../lib/logger.js');
        logger.warn({ err: msg, routerId: req.params.routerId }, 'billing scheduler setup failed');
        res.status(502).json({ error: msg });
    }
}));

router.get('/mikrotik/:routerId/audit-comments', requireTenant, asyncHandler(async (req: any, res) => {
    try {
        const data = await mikrotikSetupService.auditSubscriptionComments(req.params.routerId, req._tenantId);
        res.json({ data });
    } catch (e: any) {
        res.status(502).json({ error: e?.message || 'Gagal audit comment' });
    }
}));

router.post('/subscriptions/:id/resync-comment', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    try {
        const result = await mikrotikSetupService.resyncSubscriptionComment(req.params.id, req._tenantId);
        if (!result.ok) return res.status(404).json({ error: 'Tidak bisa resync (subscription/secret tidak ditemukan)' });
        res.json({ data: result });
    } catch (e: any) {
        res.status(502).json({ error: e?.message || 'Gagal resync comment' });
    }
}));

router.get('/mikrotik/:routerId/import-candidates', requireTenant, asyncHandler(async (req: any, res) => {
    const type = (req.query.type as string) === 'hotspot' ? 'hotspot' : 'pppoe';
    try {
        const candidates = await mikrotikSetupService.listImportCandidates(req.params.routerId, req._tenantId, type);
        res.json({ data: candidates });
    } catch (e: any) {
        const msg = e?.message || 'Gagal baca user dari MikroTik';
        const { logger } = await import('../lib/logger.js');
        logger.warn({ err: msg, routerId: req.params.routerId }, 'mikrotik import-candidates failed');
        res.status(502).json({ error: msg });
    }
}));

router.post('/mikrotik/:routerId/isolir-setup', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        profileName: z.string().optional(),
        rateLimit: z.string().optional(),
        remoteAddress: z.string().optional(),
        addressListName: z.string().optional(),
        redirectIp: z.string().optional(),
        redirectPort: z.number().int().min(1).max(65535).optional(),
        addWalledGarden: z.boolean().optional(),
    }).parse(req.body);

    try {
        const result = await mikrotikSetupService.autoCreateIsolir(req.params.routerId, body, req._tenantId);
        res.json({ data: result });
    } catch (e: any) {
        const msg = e?.message || 'Gagal auto-setup isolir';
        res.status(502).json({ error: msg, code: e?.code, detail: e?.cause?.message });
    }
}));

// ─── Per-router settings ───────────────────────────────────────────────────

router.get('/settings/router/:routerId', requireTenant, asyncHandler(async (req: any, res) => {
    const row = await billingSettingsService.getForRouter(req.params.routerId, req._tenantId);
    res.json({ data: row });
}));

// ─── Reports (Phase D) ─────────────────────────────────────────────────────

router.get('/reports/overview', requireTenant, asyncHandler(async (req: any, res) => {
    const data = await billingReportsService.overview(req._tenantId);
    res.json({ data });
}));

router.get('/reports/revenue-by-month', requireTenant, asyncHandler(async (req: any, res) => {
    const data = await billingReportsService.revenueByMonth(req._tenantId);
    res.json({ data });
}));

router.get('/reports/aging', requireTenant, asyncHandler(async (req: any, res) => {
    const data = await billingReportsService.aging(req._tenantId);
    res.json({ data });
}));

router.get('/reports/top-payers', requireTenant, asyncHandler(async (req: any, res) => {
    const months = Math.max(1, Math.min(12, parseInt(String(req.query.months ?? '1'), 10) || 1));
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const data = await billingReportsService.topPayers(req._tenantId, months, limit);
    res.json({ data });
}));

router.get('/reports/voucher-sales', requireTenant, asyncHandler(async (req: any, res) => {
    const months = Math.max(1, Math.min(12, parseInt(String(req.query.months ?? '1'), 10) || 1));
    const data = await billingReportsService.voucherSales(req._tenantId, months);
    res.json({ data });
}));

router.get('/reports/recent-payments', requireTenant, asyncHandler(async (req: any, res) => {
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const data = await billingReportsService.recentPayments(req._tenantId, limit);
    res.json({ data });
}));

// ─── WA notification log + test ────────────────────────────────────────────

router.get('/wa-log', requireTenant, asyncHandler(async (req: any, res) => {
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? '100'), 10) || 100));
    const data = await billingReportsService.waNotifLog(req._tenantId, limit);
    res.json({ data });
}));

router.post('/wa-test', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        routerId: z.string().uuid(),
        phone: z.string().min(6),
        message: z.string().optional(),
    }).parse(req.body);

    const settings = await billingSettingsService.getForRouter(body.routerId, req._tenantId);
    if (!settings) return res.status(404).json({ error: 'Router settings not found' });
    if (settings.waProvider === 'none' || !settings.waProvider) {
        return res.status(400).json({ error: 'WA provider belum dikonfigurasi untuk router ini' });
    }

    const cfg = settings.waConfig || {};
    let providerCfg: WaProviderConfig;
    if (settings.waProvider === 'fonnte') {
        if (!(cfg as any).token) return res.status(400).json({ error: 'Fonnte token belum diisi' });
        providerCfg = { provider: 'fonnte', token: (cfg as any).token, deviceId: (cfg as any).deviceId, countryCode: (cfg as any).countryCode };
    } else if (settings.waProvider === 'wablas') {
        if (!(cfg as any).token) return res.status(400).json({ error: 'Wablas token belum diisi' });
        providerCfg = { provider: 'wablas', token: (cfg as any).token, secret: (cfg as any).secret, baseUrl: (cfg as any).baseUrl };
    } else if (settings.waProvider === 'webhook') {
        if (!(cfg as any).url) return res.status(400).json({ error: 'Webhook URL belum diisi' });
        providerCfg = { provider: 'webhook', url: (cfg as any).url, headers: (cfg as any).headers, method: (cfg as any).method };
    } else {
        return res.status(400).json({ error: 'Unknown provider' });
    }

    const message = body.message || buildMessage('manual', { customerName: 'Test' });
    const result = await sendWaNotification({
        tenantId: req._tenantId, routerId: body.routerId,
        customerId: null,
        type: 'manual', phone: body.phone, message, cfg: providerCfg,
    });
    res.json({ data: result });
}));

router.put('/settings/router/:routerId', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        pppoeBillingEnabled: z.boolean().optional(),
        hotspotMode: z.enum(['native', 'mikhmon_bridge', 'disabled']).optional(),
        isolirProfile: z.string().optional(),
        isolirRedirectUrl: z.string().optional().nullable(),
        isolirGraceDays: z.number().int().min(0).optional(),
        isolirCheckStartHour: z.number().int().min(0).max(23).optional(),
        isolirCheckEndHour: z.number().int().min(0).max(23).optional(),
        defaultBillingDay: z.number().int().min(1).max(28).optional(),
        waProvider: z.enum(['fonnte', 'wablas', 'webhook', 'none']).optional(),
        waConfig: z.any().optional(),
        waNotifHMinus1Enabled: z.boolean().optional(),
        waNotifDueDayEnabled: z.boolean().optional(),
        waNotifOverdueEnabled: z.boolean().optional(),
        waNotifIsolirEnabled: z.boolean().optional(),
        gatewayTripayEnabled: z.boolean().optional(),
        gatewayMidtransEnabled: z.boolean().optional(),
        gatewayXenditEnabled: z.boolean().optional(),
        gatewayConfig: z.any().optional(),
        invoiceFooterText: z.string().optional().nullable(),
        voucherTemplate: z.string().optional(),
    }).parse(req.body);
    const row = await billingSettingsService.upsert(req.params.routerId, req._tenantId, body);
    res.json({ data: row });
}));

// ─── Transactions / Payments ───────────────────────────────────────────────

router.get('/transactions', requireTenant, asyncHandler(async (req: any, res) => {
    const q = req.query;
    const result = await transactionService.list(req._tenantId, {
        method: q.method,
        status: q.status,
        routerId: q.routerId,
        customerId: q.customerId,
        search: q.search,
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
        limit: q.limit ? Number(q.limit) : 50,
        offset: q.offset ? Number(q.offset) : 0,
    });
    res.json({ data: result.rows, meta: { total: result.total } });
}));

router.get('/transactions/summary', requireTenant, asyncHandler(async (req: any, res) => {
    const q = req.query;
    const data = await transactionService.summary(req._tenantId, {
        startDate: q.startDate ? new Date(q.startDate) : undefined,
        endDate: q.endDate ? new Date(q.endDate) : undefined,
    });
    res.json({ data });
}));

// ─── Tenant-level Payment Gateway defaults ─────────────────────────────────

router.get('/settings/gateway-defaults', requireTenant, asyncHandler(async (req: any, res) => {
    const { appSettings } = await import('../db/schema/index.js');
    const { db } = await import('../db/index.js');
    const { and, eq } = await import('drizzle-orm');
    const [row] = await db.select().from(appSettings)
        .where(and(eq(appSettings.tenantId, req._tenantId), eq(appSettings.key, 'billing_gateway_defaults')))
        .limit(1);
    res.json({ data: row?.value || null });
}));

router.put('/settings/gateway-defaults', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        tripayEnabled: z.boolean().optional(),
        midtransEnabled: z.boolean().optional(),
        xenditEnabled: z.boolean().optional(),
        config: z.object({
            tripay: z.any().optional(),
            midtrans: z.any().optional(),
            xendit: z.any().optional(),
        }).optional(),
    }).parse(req.body);
    const { settingsService } = await import('../services/index.js');
    const result = await settingsService.setSetting(
        'billing_gateway_defaults',
        body,
        req._tenantId,
        'Default payment gateway untuk semua router di tenant. Per-router setting jadi override.',
    );
    if (!result.ok) return res.status(500).json({ error: 'Gagal simpan' });
    res.json({ data: result.value });
}));

router.get('/settings/gateway-resolved/:routerId/:gateway', requireTenant, asyncHandler(async (req: any, res) => {
    const resolved = await resolveGatewayConfig(
        req._tenantId,
        req.params.routerId,
        req.params.gateway as any,
    );
    // Jangan return credential mentah — cuma flags
    res.json({ data: {
        enabled: resolved.enabled,
        source: resolved.source,
        hasConfig: !!resolved.config,
    }});
}));

// ─── Drift Detection (Phase 7 MVP) ─────────────────────────────────────────

router.get('/drift/summary', requireTenant, asyncHandler(async (req: any, res) => {
    const s = driftDetectorService.summary(req._tenantId);
    res.json({ data: s || { count: 0, scannedAt: null, routersFailed: 0 } });
}));

router.post('/drift/scan', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const report = await driftDetectorService.scan(req._tenantId);
    res.json({ data: report });
}));

router.post('/drift/resync/:subscriptionId', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        kickSession: z.boolean().optional(),
    }).parse(req.body || {});
    const result = await driftDetectorService.resyncToMikrotik(req._tenantId, req.params.subscriptionId, {
        actorUserId: req.user?.id || null,
        kickSession: body.kickSession,
    });
    if (!result.ok) return res.status(400).json({ error: result.message, data: result });
    res.json({ data: result });
}));

// ─── Promise to Pay (Janji Bayar) ──────────────────────────────────────────

router.get('/promises', requireTenant, asyncHandler(async (req: any, res) => {
    const rows = await promiseToPayService.list(req._tenantId, {
        status: req.query.status as any,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: rows });
}));

router.get('/promises/summary', requireTenant, asyncHandler(async (req: any, res) => {
    const s = await promiseToPayService.summary(req._tenantId);
    res.json({ data: s });
}));

router.post('/promises', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const body = z.object({
        invoiceId: z.string().uuid(),
        promisedFor: z.string().datetime().or(z.string().min(8)),
        notes: z.string().optional(),
        autoIsolirIfBroken: z.boolean().optional(),
    }).parse(req.body);
    try {
        const row = await promiseToPayService.create(req._tenantId, {
            invoiceId: body.invoiceId,
            promisedFor: new Date(body.promisedFor),
            notes: body.notes,
            autoIsolirIfBroken: body.autoIsolirIfBroken,
            createdBy: req.user?.id || null,
        });
        res.status(201).json({ data: row });
    } catch (e: any) {
        res.status(400).json({ error: e?.message || 'Gagal buat janji bayar' });
    }
}));

router.post('/promises/:id/fulfill', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const row = await promiseToPayService.fulfill(req.params.id, req._tenantId, req.user?.id || null);
    if (!row) return res.status(404).json({ error: 'Janji bayar tidak ditemukan atau sudah resolved' });
    res.json({ data: row });
}));

router.post('/promises/:id/cancel', requireTenant, requireOperator, asyncHandler(async (req: any, res) => {
    const row = await promiseToPayService.cancel(req.params.id, req._tenantId, req.user?.id || null);
    if (!row) return res.status(404).json({ error: 'Janji bayar tidak ditemukan atau sudah resolved' });
    res.json({ data: row });
}));

export default router;
