import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    customers, subscriptions, invoices, packages,
} from '../../db/schema/index.js';
import { defaultPinForCustomer } from './billing-helpers.js';

/**
 * Customer-facing self-service portal — Phase F.
 *
 * Authentication is intentionally lightweight: a HMAC-signed token tying a
 * customerId to an expiry. No database session table — customers don't need
 * device-level revocation. Token format:
 *
 *     base64url(JSON({ cid, exp, nonce })) + "." + hex(hmac256(payload))
 *
 * Verified on each request via verifyPortalToken. Default lifetime 7 days.
 */

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
    const s = process.env.PORTAL_TOKEN_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET;
    if (!s) {
        // Last-resort default — operators should set PORTAL_TOKEN_SECRET.
        // Hard-coding a fallback would re-issue valid tokens across deploys
        // which is undesirable but better than crashing in dev.
        return 'change-me-portal-secret';
    }
    return s;
}

function b64urlEncode(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Buffer {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface PortalTokenClaims {
    cid: string;
    exp: number;
    nonce: string;
}

export function issuePortalToken(customerId: string): { token: string; expiresAt: Date } {
    const claims: PortalTokenClaims = {
        cid: customerId,
        exp: Date.now() + TOKEN_TTL_MS,
        nonce: randomBytes(8).toString('hex'),
    };
    const payload = b64urlEncode(Buffer.from(JSON.stringify(claims)));
    const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
    return { token: `${payload}.${sig}`, expiresAt: new Date(claims.exp) };
}

export function verifyPortalToken(token: string): PortalTokenClaims | null {
    if (!token || typeof token !== 'string') return null;
    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const payload = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return null;
    try { if (!timingSafeEqual(a, b)) return null; } catch { return null; }
    let claims: PortalTokenClaims;
    try { claims = JSON.parse(b64urlDecode(payload).toString('utf8')); } catch { return null; }
    if (!claims.cid || !claims.exp || claims.exp < Date.now()) return null;
    return claims;
}

// ─── Lookups ───────────────────────────────────────────────────────────────

/**
 * Public lookup used by /cekstatus. Returns sanitised summary so the page
 * stays useful without exposing sensitive fields.
 *
 * Match strategy:
 *   1. Try subscription by mikrotik_identity, narrow by customer.phone
 *      ending with provided last4.
 *   2. Fall back to customer.code matching identity exactly.
 */
export const portalService = {
    async cekStatus(identity: string, last4: string) {
        if (!identity || identity.length < 3) return null;
        const last4Clean = (last4 || '').replace(/\D/g, '').slice(-4);
        if (last4Clean.length < 4) return null;

        // Try by subscription identity first
        const subs = await db.select({ sub: subscriptions, cust: customers, pkg: packages })
            .from(subscriptions)
            .innerJoin(customers, eq(customers.id, subscriptions.customerId))
            .leftJoin(packages, eq(packages.id, subscriptions.packageId))
            .where(eq(subscriptions.mikrotikIdentity, identity));

        const matched = subs.filter(({ cust }) => {
            const digits = (cust.phone || '').replace(/\D/g, '');
            return digits.length >= 4 && digits.slice(-4) === last4Clean;
        });

        if (matched.length === 0) {
            // Fallback: customer.code lookup
            const byCode = await db.select().from(customers).where(eq(customers.code, identity));
            const found = byCode.find(c => {
                const d = (c.phone || '').replace(/\D/g, '');
                return d.length >= 4 && d.slice(-4) === last4Clean;
            });
            if (!found) return null;
            // Pull related subscriptions
            const csubs = await db.select({ sub: subscriptions, pkg: packages })
                .from(subscriptions)
                .leftJoin(packages, eq(packages.id, subscriptions.packageId))
                .where(eq(subscriptions.customerId, found.id));
            return projectStatus(found, csubs.map(r => ({ ...r.sub, package: r.pkg })));
        }

        // Use the first match's customer
        const cust = matched[0].cust;
        const csubs = matched.map(m => ({ ...m.sub, package: m.pkg }));
        return projectStatus(cust, csubs);
    },

    async loginByIdentityAndPin(identity: string, pin: string) {
        const cleanPin = (pin || '').trim();
        if (!identity || cleanPin.length < 4) return null;

        const subs = await db.select({ sub: subscriptions, cust: customers })
            .from(subscriptions)
            .innerJoin(customers, eq(customers.id, subscriptions.customerId))
            .where(eq(subscriptions.mikrotikIdentity, identity));

        let customer = subs.find(({ cust }) => (cust.pinCode || defaultPinForCustomer({ phone: cust.phone, code: cust.code })) === cleanPin)?.cust;

        if (!customer) {
            // Fallback: by customer code
            const list = await db.select().from(customers).where(eq(customers.code, identity));
            customer = list.find(c => (c.pinCode || defaultPinForCustomer({ phone: c.phone, code: c.code })) === cleanPin);
        }

        if (!customer || customer.active === false) return null;
        return customer;
    },

    async getPortalProfile(customerId: string) {
        const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
        if (!cust) return null;

        const subs = await db.select({ sub: subscriptions, pkg: packages })
            .from(subscriptions)
            .leftJoin(packages, eq(packages.id, subscriptions.packageId))
            .where(eq(subscriptions.customerId, customerId));

        return {
            customer: {
                id: cust.id,
                code: cust.code,
                name: cust.name,
                phone: maskPhone(cust.phone),
                email: cust.email,
                address: cust.address,
            },
            subscriptions: subs.map(s => ({
                id: s.sub.id,
                identity: s.sub.mikrotikIdentity,
                type: s.sub.type,
                status: s.sub.status,
                statusReason: s.sub.statusReason,
                billingDay: s.sub.billingDay,
                activatedAt: s.sub.activatedAt,
                expiresAt: s.sub.expiresAt,
                nextDueAt: s.sub.nextDueAt,
                packageName: s.pkg?.name || null,
                price: s.pkg?.price || null,
            })),
        };
    },

    async getPortalInvoices(customerId: string, limit: number = 50) {
        const rows = await db.select().from(invoices)
            .where(eq(invoices.customerId, customerId))
            .orderBy(desc(invoices.createdAt))
            .limit(limit);
        return rows.map(r => ({
            id: r.id,
            invoiceNumber: r.invoiceNumber,
            amount: r.amount,
            status: r.status,
            dueAt: r.dueAt,
            paidAt: r.paidAt,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            notes: r.notes,
        }));
    },

    /**
     * Customer-owned check: ensure invoice belongs to the authenticated
     * customer before letting them act on it (e.g. create a payment link).
     */
    async assertOwnsInvoice(customerId: string, invoiceId: string) {
        const [row] = await db.select().from(invoices)
            .where(and(eq(invoices.id, invoiceId), eq(invoices.customerId, customerId)))
            .limit(1);
        return row || null;
    },
};

function projectStatus(cust: any, subs: any[]) {
    return {
        customer: {
            code: cust.code,
            name: cust.name,
            phone: maskPhone(cust.phone),
        },
        subscriptions: subs.map((s: any) => ({
            identity: s.mikrotikIdentity,
            type: s.type,
            status: s.status,
            statusReason: s.statusReason,
            packageName: s.package?.name || null,
            expiresAt: s.expiresAt,
            nextDueAt: s.nextDueAt,
        })),
    };
}

function maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return phone;
    return digits.slice(0, 3) + '*'.repeat(Math.max(0, digits.length - 7)) + digits.slice(-4);
}
