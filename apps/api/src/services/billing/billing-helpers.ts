import { db } from '../../db/index.js';
import { invoices, customers, billingRouterSettings } from '../../db/schema/index.js';
import { sql, eq, and } from 'drizzle-orm';

/**
 * Generate the next invoice number for a tenant in format INV-YYYYMM-NNNN.
 * Counter resets monthly. Race-safe via SELECT FOR UPDATE on the latest row.
 */
export async function generateInvoiceNumber(tenantId: string, when: Date = new Date()): Promise<string> {
    const yyyy = when.getFullYear();
    const mm = String(when.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${yyyy}${mm}-`;

    const rows = await db.execute(sql`
        SELECT invoice_number FROM billing_invoices
        WHERE tenant_id = ${tenantId} AND invoice_number LIKE ${prefix + '%'}
        ORDER BY invoice_number DESC
        LIMIT 1
    `) as any[];

    let nextSeq = 1;
    if (rows[0]?.invoice_number) {
        const parts = String(rows[0].invoice_number).split('-');
        const seq = parseInt(parts[2] || '0', 10);
        if (Number.isFinite(seq)) nextSeq = seq + 1;
    }
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * Generate the next customer code per tenant in format CUST-NNNN.
 */
export async function generateCustomerCode(tenantId: string): Promise<string> {
    const rows = await db.execute(sql`
        SELECT code FROM billing_customers
        WHERE tenant_id = ${tenantId} AND code LIKE 'CUST-%'
        ORDER BY code DESC LIMIT 1
    `) as any[];
    let next = 1;
    if (rows[0]?.code) {
        const seq = parseInt(String(rows[0].code).slice(5), 10);
        if (Number.isFinite(seq)) next = seq + 1;
    }
    return `CUST-${String(next).padStart(4, '0')}`;
}

/**
 * Compute the next billing-day timestamp from an anchor day. If today's day
 * has already passed for the current month, jump to next month.
 */
export function computeNextDueAt(billingDay: number, from: Date = new Date()): Date {
    const day = Math.max(1, Math.min(28, billingDay));
    const next = new Date(from.getFullYear(), from.getMonth(), day, 0, 0, 0, 0);
    if (next.getTime() <= from.getTime()) next.setMonth(next.getMonth() + 1);
    return next;
}

/**
 * Anniversary mode — shift `cycleMonths` bulan kalender dari reference date.
 *   from=12 Mei, cycle=1 → 12 Jun
 *   from=31 Jan, cycle=1 → 28 Feb (clamp ke last day kalau bulan tujuan pendek)
 */
export function computeNextDueAtAnniversary(from: Date, cycleMonths: number = 1): Date {
    const cycles = Math.max(1, cycleMonths);
    const target = new Date(from);
    const srcDay = target.getDate();
    target.setMonth(target.getMonth() + cycles);
    if (target.getDate() !== srcDay) target.setDate(0);
    return target;
}

/**
 * Dispatch ke compute helper sesuai billing mode subscription.
 */
export function computeNextDueByMode(opts: {
    mode: 'anchor_day' | 'anniversary';
    from: Date;
    billingDay?: number | null;
    cycleMonths?: number | null;
}): Date {
    if (opts.mode === 'anniversary') {
        return computeNextDueAtAnniversary(opts.from, opts.cycleMonths || 1);
    }
    return computeNextDueAt(opts.billingDay || 1, opts.from);
}

/**
 * Get or create the billing settings row for a router (one-to-one).
 */
export async function getOrCreateRouterSettings(routerId: string, tenantId: string) {
    const [existing] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId)).limit(1);
    if (existing) return existing;

    const [created] = await db.insert(billingRouterSettings).values({
        tenantId, routerId,
    }).returning();
    return created;
}

/**
 * Default PIN derivation: last 4 digits of phone, or last 4 of customer code.
 */
export function defaultPinForCustomer(c: { phone?: string | null; code: string }): string {
    const digits = (c.phone || '').replace(/\D/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    const code = c.code.replace(/\D/g, '');
    return code.padStart(4, '0').slice(-4);
}

const MONTH_NAMES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Mikhmon-style date "jun/06/2026" (lowercase month, zero-padded day, 4-digit year). */
export function formatDateMikhmon(d: Date): string {
    const mm = MONTH_NAMES_EN[d.getMonth()];
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

/** Numeric "YYYYMMDD" for fast string-as-number comparison in RouterOS scripts. */
export function formatDateNumeric(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

/**
 * Build the canonical PPP secret comment used by our billing system.
 *
 * Format: "<isolirDate-mmm/dd/yyyy> subscription:<uuid> dn:<YYYYMMDD> paket:<name>"
 *
 * Tanggal isolir di prefix (11 char pertama) supaya kompatibel dengan
 * scheduler MikroTik "isolir-pppoe-harian" yang baca [:pick $comment 0 11]
 * sebagai mmm/dd/yyyy. Pattern ini bikin scheduler sisi MikroTik bisa jadi
 * safety net kalau app down — dia tetap isolir customer yang due-nya jatuh
 * hari ini, tanpa nunggu app naik.
 *
 * App scheduler tetap primary (jalan tiap jam, generate invoice + isolir +
 * mark overdue). Scheduler MikroTik 1× sehari sebagai fallback — idempotent
 * karena cek profile (skip kalau sudah ISOLIR).
 *
 * Comment harus di-update SETIAP nextDueAt bergeser:
 *  - billing-scheduler.ts step 1 — invoice generated, nextDueAt +1 bulan
 *  - billing.service.ts unisolir() — after payment, restore active profile
 *
 * Field `dn:` (YYYYMMDD) tetap dipertahankan untuk backward-compat —
 * scheduler lain mungkin baca format itu untuk filtering.
 */
export function buildSubscriptionComment(opts: {
    subscriptionId: string;
    isolirDate?: Date | null;
    packageName?: string | null;
}): string {
    const datePrefix = opts.isolirDate ? `${formatDateMikhmon(opts.isolirDate)} ` : '';
    const parts = [`subscription:${opts.subscriptionId}`];
    if (opts.isolirDate) {
        parts.push(`dn:${formatDateNumeric(opts.isolirDate)}`);
    }
    if (opts.packageName) parts.push(`paket:${opts.packageName.replace(/\s+/g, '_')}`);
    return datePrefix + parts.join(' ');
}

/**
 * Compute the date when a subscription SHOULD be isolired:
 *   nextDueAt + graceDays
 *
 * Returns null if nextDueAt is missing.
 */
export function computeIsolirDate(nextDueAt: Date | null | undefined, graceDays: number = 0): Date | null {
    if (!nextDueAt) return null;
    const d = new Date(nextDueAt);
    d.setDate(d.getDate() + Math.max(0, graceDays));
    return d;
}
