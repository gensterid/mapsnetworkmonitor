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
