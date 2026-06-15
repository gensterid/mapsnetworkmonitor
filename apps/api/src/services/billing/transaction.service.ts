import { and, desc, eq, gte, lte, inArray, ilike, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    payments, invoices, customers, subscriptions, routers,
} from '../../db/schema/index.js';

/**
 * Transactions service — aggregate view of billing_payments dengan join
 * customer/invoice/router supaya UI bisa tampil informasi lengkap dalam 1
 * query. Termasuk pending payment dari gateway (gatewayPayload.pending=true)
 * supaya operator bisa lihat transaksi yang sudah generate link tapi belum
 * dibayar customer.
 */

export interface TransactionListFilter {
    method?: 'manual' | 'gateway_tripay' | 'gateway_midtrans' | 'gateway_xendit';
    status?: 'pending' | 'paid' | 'failed';
    routerId?: string;
    customerId?: string;
    search?: string;        // cari nama customer / invoice number / txn id
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

export interface TransactionRow {
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string | null;
    customerPhone: string | null;
    routerId: string | null;
    routerName: string | null;
    amount: string;
    method: string;
    gatewayTxnId: string | null;
    /** derived: 'pending' kalau gatewayPayload.pending=true, else 'paid' */
    status: 'pending' | 'paid' | 'failed';
    paymentUrl: string | null;
    notes: string | null;
    recordedAt: Date;
    gatewayPayload: any;
}

export const transactionService = {
    /**
     * List transactions with filter + pagination. Returns derived status
     * based on payment row + invoice status.
     */
    async list(tenantId: string, filter: TransactionListFilter = {}): Promise<{
        rows: TransactionRow[];
        total: number;
    }> {
        const conds = [eq(payments.tenantId, tenantId)];
        if (filter.method) conds.push(eq(payments.method, filter.method as any));
        if (filter.routerId) conds.push(eq(invoices.routerId, filter.routerId));
        if (filter.customerId) conds.push(eq(invoices.customerId, filter.customerId));
        if (filter.startDate) conds.push(gte(payments.recordedAt, filter.startDate));
        if (filter.endDate) conds.push(lte(payments.recordedAt, filter.endDate));

        const baseQuery = db.select({
            id: payments.id,
            invoiceId: payments.invoiceId,
            invoiceNumber: invoices.invoiceNumber,
            invoiceStatus: invoices.status,
            customerId: invoices.customerId,
            customerName: customers.name,
            customerPhone: customers.phone,
            routerId: invoices.routerId,
            routerName: routers.name,
            amount: payments.amount,
            method: payments.method,
            gatewayTxnId: payments.gatewayTxnId,
            gatewayPayload: payments.gatewayPayload,
            notes: payments.notes,
            recordedAt: payments.recordedAt,
        })
            .from(payments)
            .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
            .innerJoin(customers, eq(customers.id, invoices.customerId))
            .leftJoin(routers, eq(routers.id, invoices.routerId))
            .where(and(...conds));

        const allRows = await baseQuery
            .orderBy(desc(payments.recordedAt))
            .limit((filter.limit ?? 50) + (filter.offset ?? 0));

        // Hitung total tanpa pagination — buat counter di UI
        const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
            .from(payments)
            .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
            .innerJoin(customers, eq(customers.id, invoices.customerId))
            .where(and(...conds));

        const offset = filter.offset ?? 0;
        const pagedRows = allRows.slice(offset);

        let mapped: TransactionRow[] = pagedRows.map(r => {
            const payload = r.gatewayPayload as any;
            const isPending = payload?.pending === true && r.invoiceStatus !== 'paid';
            const paymentUrl = payload?.paymentUrl ?? null;
            return {
                id: r.id,
                invoiceId: r.invoiceId,
                invoiceNumber: r.invoiceNumber,
                customerId: r.customerId,
                customerName: r.customerName,
                customerPhone: r.customerPhone,
                routerId: r.routerId,
                routerName: r.routerName,
                amount: r.amount,
                method: r.method as string,
                gatewayTxnId: r.gatewayTxnId,
                status: isPending ? 'pending' : (r.invoiceStatus === 'paid' ? 'paid' : 'paid'),
                paymentUrl,
                notes: r.notes,
                recordedAt: r.recordedAt,
                gatewayPayload: payload,
            };
        });

        // Filter status di app-level karena status di-derive dari payload + invoice.
        if (filter.status) {
            mapped = mapped.filter(t => t.status === filter.status);
        }

        // Filter search di app-level juga (multi-field)
        if (filter.search) {
            const q = filter.search.toLowerCase();
            mapped = mapped.filter(t =>
                (t.customerName || '').toLowerCase().includes(q) ||
                t.invoiceNumber.toLowerCase().includes(q) ||
                (t.gatewayTxnId || '').toLowerCase().includes(q)
            );
        }

        return { rows: mapped, total: Number(total) };
    },

    /**
     * Summary untuk dashboard / badge: count per status + total revenue
     * dalam range tanggal.
     */
    async summary(tenantId: string, opts: { startDate?: Date; endDate?: Date } = {}): Promise<{
        totalPaid: number;
        totalPending: number;
        countPaid: number;
        countPending: number;
        revenueByMethod: Record<string, number>;
    }> {
        const conds = [eq(payments.tenantId, tenantId)];
        if (opts.startDate) conds.push(gte(payments.recordedAt, opts.startDate));
        if (opts.endDate) conds.push(lte(payments.recordedAt, opts.endDate));

        const rows = await db.select({
            amount: payments.amount,
            method: payments.method,
            gatewayPayload: payments.gatewayPayload,
            invoiceStatus: invoices.status,
        })
            .from(payments)
            .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
            .where(and(...conds));

        let totalPaid = 0, totalPending = 0, countPaid = 0, countPending = 0;
        const revenueByMethod: Record<string, number> = {};

        for (const r of rows) {
            const isPending = (r.gatewayPayload as any)?.pending === true && r.invoiceStatus !== 'paid';
            const amt = Number(r.amount);
            if (isPending) {
                totalPending += amt;
                countPending++;
            } else if (r.invoiceStatus === 'paid') {
                totalPaid += amt;
                countPaid++;
                revenueByMethod[r.method] = (revenueByMethod[r.method] || 0) + amt;
            }
        }

        return { totalPaid, totalPending, countPaid, countPending, revenueByMethod };
    },
};
