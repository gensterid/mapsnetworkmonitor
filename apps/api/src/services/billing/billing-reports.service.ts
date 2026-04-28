import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

/**
 * Billing reports — Phase D.
 *
 * Plain SQL queries grouped per dashboard need. Period filter is always
 * inclusive of "from" and exclusive of "to" so caller can pass simple
 * month boundaries. All amounts are returned as numeric strings — caller
 * decides formatting.
 */

export const billingReportsService = {
    /**
     * Quick overview for the operator dashboard widget.
     */
    async overview(tenantId: string) {
        const [row] = await db.execute(sql`
            SELECT
                (SELECT count(*) FROM billing_customers WHERE tenant_id = ${tenantId} AND active = true)::int AS active_customers,
                (SELECT count(*) FROM billing_subscriptions WHERE tenant_id = ${tenantId} AND status = 'active')::int AS active_subscriptions,
                (SELECT count(*) FROM billing_subscriptions WHERE tenant_id = ${tenantId} AND status = 'isolir')::int AS isolir_subscriptions,
                (SELECT count(*) FROM billing_invoices WHERE tenant_id = ${tenantId} AND status = 'unpaid')::int AS unpaid_invoices,
                (SELECT count(*) FROM billing_invoices WHERE tenant_id = ${tenantId} AND status = 'overdue')::int AS overdue_invoices,
                (SELECT COALESCE(SUM(amount), 0) FROM billing_invoices WHERE tenant_id = ${tenantId} AND status IN ('unpaid','overdue'))::numeric AS receivables_total,
                (SELECT COALESCE(SUM(amount), 0) FROM billing_invoices WHERE tenant_id = ${tenantId} AND status = 'paid' AND paid_at >= date_trunc('month', NOW()))::numeric AS revenue_this_month,
                (SELECT COALESCE(SUM(amount), 0) FROM billing_invoices WHERE tenant_id = ${tenantId} AND status = 'paid' AND paid_at >= date_trunc('month', NOW() - INTERVAL '1 month') AND paid_at < date_trunc('month', NOW()))::numeric AS revenue_last_month
        `) as any[];
        return row || null;
    },

    /**
     * Monthly revenue trend (last 12 months).
     */
    async revenueByMonth(tenantId: string) {
        return db.execute(sql`
            SELECT
                to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS invoices,
                SUM(amount)::numeric AS revenue
            FROM billing_invoices
            WHERE tenant_id = ${tenantId}
              AND status = 'paid'
              AND paid_at >= NOW() - INTERVAL '12 months'
            GROUP BY 1
            ORDER BY 1 ASC
        `) as any;
    },

    /**
     * Aging report — receivables bucketed by days past due.
     */
    async aging(tenantId: string) {
        return db.execute(sql`
            SELECT
                CASE
                    WHEN due_at >= NOW() THEN 'current'
                    WHEN NOW() - due_at < INTERVAL '7 days'  THEN '1-7'
                    WHEN NOW() - due_at < INTERVAL '30 days' THEN '8-30'
                    WHEN NOW() - due_at < INTERVAL '60 days' THEN '31-60'
                    ELSE '60+'
                END AS bucket,
                COUNT(*)::int AS invoices,
                SUM(amount)::numeric AS amount
            FROM billing_invoices
            WHERE tenant_id = ${tenantId}
              AND status IN ('unpaid','overdue')
            GROUP BY 1
            ORDER BY
                CASE
                    WHEN bucket = 'current' THEN 0
                    WHEN bucket = '1-7' THEN 1
                    WHEN bucket = '8-30' THEN 2
                    WHEN bucket = '31-60' THEN 3
                    ELSE 4
                END
        `) as any;
    },

    /**
     * Customers ranked by total paid this period.
     */
    async topPayers(tenantId: string, monthsBack: number = 1, limit: number = 10) {
        return db.execute(sql`
            SELECT
                c.id, c.code, c.name,
                COUNT(i.id)::int AS invoices_paid,
                SUM(i.amount)::numeric AS total_paid
            FROM billing_invoices i
            INNER JOIN billing_customers c ON c.id = i.customer_id
            WHERE i.tenant_id = ${tenantId}
              AND i.status = 'paid'
              AND i.paid_at >= NOW() - (${monthsBack} || ' months')::interval
            GROUP BY c.id, c.code, c.name
            ORDER BY total_paid DESC
            LIMIT ${limit}
        `) as any;
    },

    /**
     * Voucher sales aggregated per package this period.
     */
    async voucherSales(tenantId: string, monthsBack: number = 1) {
        return db.execute(sql`
            SELECT
                p.id AS package_id, p.name AS package_name,
                COUNT(v.id)::int AS vouchers_sold,
                SUM(v.price)::numeric AS revenue
            FROM billing_vouchers v
            INNER JOIN billing_packages p ON p.id = v.package_id
            WHERE v.tenant_id = ${tenantId}
              AND v.status IN ('active','expired')
              AND v.created_at >= NOW() - (${monthsBack} || ' months')::interval
            GROUP BY p.id, p.name
            ORDER BY revenue DESC
        `) as any;
    },

    /**
     * Recent payments (for the dashboard).
     */
    async recentPayments(tenantId: string, limit: number = 20) {
        return db.execute(sql`
            SELECT
                p.id, p.amount, p.method, p.recorded_at,
                p.notes,
                i.invoice_number, i.id AS invoice_id,
                c.id AS customer_id, c.name AS customer_name, c.code AS customer_code
            FROM billing_payments p
            INNER JOIN billing_invoices i ON i.id = p.invoice_id
            INNER JOIN billing_customers c ON c.id = i.customer_id
            WHERE p.tenant_id = ${tenantId}
            ORDER BY p.recorded_at DESC
            LIMIT ${limit}
        `) as any;
    },

    /**
     * WA notification log — last N entries.
     */
    async waNotifLog(tenantId: string, limit: number = 100) {
        return db.execute(sql`
            SELECT
                l.id, l.to_phone, l.type, l.provider, l.status, l.error,
                l.sent_at, l.created_at,
                c.name AS customer_name, c.code AS customer_code,
                i.invoice_number
            FROM billing_wa_notifications_log l
            LEFT JOIN billing_customers c ON c.id = l.customer_id
            LEFT JOIN billing_invoices i ON i.id = l.invoice_id
            WHERE l.tenant_id = ${tenantId}
            ORDER BY l.created_at DESC
            LIMIT ${limit}
        `) as any;
    },
};
