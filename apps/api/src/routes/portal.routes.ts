import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { portalService, issuePortalToken, verifyPortalToken } from '../services/billing/portal.service.js';
import { gatewayService } from '../services/billing/gateway.service.js';
import { db } from '../db/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { invoices, packages, billingRouterSettings } from '../db/schema/index.js';
import { voucherPurchaseService } from '../services/billing/voucher-purchase.service.js';
import { resolveRouterBySlug, slugifyRouterName } from '../lib/router-slug.js';

/**
 * Public portal routes — Phase F.
 *
 * Two surfaces:
 *   • /cekstatus    — public, no auth, identity + last4 phone
 *   • /member       — login + own-data dashboard (HMAC token in header)
 *
 * Mounted under /api/portal. NOT behind authMiddleware so customers without
 * an operator account can use it.
 */

const router = Router();

// ─── Public: cekstatus ─────────────────────────────────────────────────────

router.post('/cekstatus', asyncHandler(async (req, res) => {
    const body = z.object({
        identity: z.string().min(2),
        last4: z.string().min(4),
    }).parse(req.body);
    const result = await portalService.cekStatus(body.identity, body.last4);
    if (!result) return res.status(404).json({ error: 'Data tidak ditemukan. Pastikan username/kode pelanggan dan 4 digit terakhir nomor HP sudah benar.' });
    res.json({ data: result });
}));

// ─── Public: login ─────────────────────────────────────────────────────────

router.post('/login', asyncHandler(async (req, res) => {
    const body = z.object({
        identity: z.string().min(2),
        pin: z.string().min(4).max(8),
    }).parse(req.body);

    const customer = await portalService.loginByIdentityAndPin(body.identity, body.pin);
    if (!customer) return res.status(401).json({ error: 'Username/kode atau PIN salah.' });

    const { token, expiresAt } = issuePortalToken(customer.id);
    res.json({
        data: {
            token,
            expiresAt,
            customer: { id: customer.id, code: customer.code, name: customer.name },
        },
    });
}));

// ─── Member-protected middleware ───────────────────────────────────────────

interface MemberRequest extends Request {
    portalCustomerId?: string;
}

const requireMember = (req: any, res: any, next: any) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Portal ') ? auth.slice(7) : auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    const claims = verifyPortalToken(token);
    if (!claims) return res.status(401).json({ error: 'Sesi expired atau token tidak valid' });
    req.portalCustomerId = claims.cid;
    next();
};

// ─── Member: profile + subscriptions ───────────────────────────────────────

router.get('/me', requireMember, asyncHandler(async (req: any, res) => {
    const data = await portalService.getPortalProfile(req.portalCustomerId);
    if (!data) return res.status(404).json({ error: 'Customer tidak ditemukan' });
    res.json({ data });
}));

router.get('/me/invoices', requireMember, asyncHandler(async (req: any, res) => {
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const data = await portalService.getPortalInvoices(req.portalCustomerId, limit);
    res.json({ data });
}));

router.get('/me/vouchers', requireMember, asyncHandler(async (req: any, res) => {
    const data = await portalService.getPortalVouchers(req.portalCustomerId);
    res.json({ data });
}));

// ─── Member: create payment link for own invoice ───────────────────────────

router.post('/me/invoices/:id/payment-link', requireMember, asyncHandler(async (req: any, res) => {
    const body = z.object({
        gateway: z.enum(['tripay', 'midtrans', 'xendit']),
        returnUrl: z.string().url().optional(),
    }).parse(req.body);

    const inv = await portalService.assertOwnsInvoice(req.portalCustomerId, req.params.id);
    if (!inv) return res.status(404).json({ error: 'Tagihan tidak ditemukan atau bukan milik Anda' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Tagihan sudah lunas' });
    if (inv.status === 'cancelled') return res.status(400).json({ error: 'Tagihan dibatalkan' });

    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https') as string;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${proto}://${host}/api/billing/webhook/${body.gateway}`;

    const result = await gatewayService.createPayment({
        invoiceId: inv.id,
        tenantId: inv.tenantId,
        gateway: body.gateway,
        returnUrl: body.returnUrl,
        callbackUrl,
    });
    res.json({ data: result });
}));

// ─── Public: Voucher Online Purchase (Phase V1) ────────────────────────────
//
// Public, no auth. Customer akses /beli/<routerSlug> di halaman publik
// → pilih paket → bayar via gateway → terima voucher.
//
// 3 endpoint:
//   GET  /voucher-purchase/router/:slug   — list paket hotspot router itu
//   POST /voucher-purchase/create         — create purchase + payment link
//   GET  /voucher-purchase/status/:token  — polling status untuk halaman sukses

router.get('/voucher-purchase/router/:slug', asyncHandler(async (req, res) => {
    const router_ = await resolveRouterBySlug(String(req.params.slug));
    if (!router_) {
        return res.status(404).json({ error: 'Router tidak ditemukan atau URL ambigu' });
    }

    // Cek hotspot mode + gateway availability untuk router ini
    const [settings] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, router_.id)).limit(1);
    const supportsOnline = settings?.hotspotMode === 'native';

    // List paket hotspot yang aktif + bisa di-assign ke router ini.
    // Paket dengan routerId=null adalah global (semua router), kalau ada
    // routerId spesifik harus match.
    const pkgs = await db.select({
        id: packages.id,
        name: packages.name,
        price: packages.price,
        mikrotikProfile: packages.mikrotikProfile,
        cycleType: packages.cycleType,
        cycleValue: packages.cycleValue,
        description: packages.description,
    }).from(packages).where(and(
        eq(packages.tenantId, router_.tenantId),
        eq(packages.type, 'hotspot'),
        eq(packages.active, true),
    ));
    const filtered = pkgs.filter(p => true); // semua paket hotspot tenant ini

    res.json({ data: {
        router: { id: router_.id, name: router_.name, slug: slugifyRouterName(router_.name) },
        packages: filtered,
        supportsOnline,
        unsupportedReason: !supportsOnline ? 'Router ini tidak mendukung pembelian online. Silakan hubungi operator.' : null,
    }});
}));

router.post('/voucher-purchase/create', asyncHandler(async (req: any, res) => {
    const body = z.object({
        routerSlug: z.string().min(1),
        packageId: z.string().uuid(),
        buyerPhone: z.string().optional().nullable(),
        gateway: z.enum(['tripay', 'midtrans', 'xendit']).optional(),
    }).parse(req.body);

    const router_ = await resolveRouterBySlug(body.routerSlug);
    if (!router_) return res.status(404).json({ error: 'Router tidak ditemukan' });

    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https') as string;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = `${proto}://${host}`;
    // Callback URL akan di-set saat tahu gateway-nya (service yang pick gateway).
    // Untuk simpler: pass tanpa gateway suffix dulu, service pick gateway dan
    // construct callback. Tapi cara existing pass langsung — kita pakai pattern
    // yang sama: service return gateway, kita panggil ulang? Tidak, service
    // sudah include semua. Kita kasih callbackUrl placeholder per gateway.

    try {
        const successUrl = `${origin}/beli/sukses/<TOKEN>`;
        const result = await voucherPurchaseService.create({
            routerId: router_.id,
            tenantId: router_.tenantId,
            packageId: body.packageId,
            buyerPhone: body.buyerPhone || null,
            gateway: body.gateway,
            origin,
            returnUrl: successUrl.replace('<TOKEN>', 'pending'), // pre-flight; real link include accessToken
        });

        res.json({ data: {
            paymentUrl: result.paymentUrl,
            accessToken: result.accessToken,
            gateway: result.gateway,
            successUrl: `${origin}/beli/sukses/${result.accessToken}`,
        }});
    } catch (err: any) {
        res.status(400).json({ error: err?.message || 'Gagal membuat pembelian' });
    }
}));

router.get('/voucher-purchase/status/:accessToken', asyncHandler(async (req, res) => {
    const data = await voucherPurchaseService.findByAccessToken(String(req.params.accessToken));
    if (!data) return res.status(404).json({ error: 'Pembelian tidak ditemukan' });

    // Sanitize: tidak expose tenantId, routerId, invoiceId ke public
    const { purchase, voucher, package: pkg } = data;
    res.json({ data: {
        status: purchase.status,
        buyerPhone: purchase.buyerPhone,
        paidAt: purchase.paidAt,
        fulfilledAt: purchase.fulfilledAt,
        errorMessage: purchase.errorMessage,
        package: pkg ? {
            name: pkg.name,
            price: pkg.price,
            cycleType: pkg.cycleType,
            cycleValue: pkg.cycleValue,
        } : null,
        voucher: voucher ? {
            code: voucher.code,
            password: voucher.password || voucher.code,  // VC mode = code juga password
            profile: voucher.profile,
            expiresAt: voucher.expiresAt,
        } : null,
    }});
}));

export default router;
