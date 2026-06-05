import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { portalService, issuePortalToken, verifyPortalToken } from '../services/billing/portal.service.js';
import { gatewayService } from '../services/billing/gateway.service.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { invoices } from '../db/schema/index.js';

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

export default router;
