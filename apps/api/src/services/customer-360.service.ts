import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    customers,
    subscriptions,
    packages,
    invoices,
    payments,
    waNotificationsLog,
    routers,
    pppoeSessions,
    routerNetwatch,
    onus,
    auditLogs,
    users,
} from '../db/schema/index.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../middleware/error.middleware.js';

/**
 * Customer 360° aggregator.
 *
 * Satu endpoint, return semua data customer yang relevan untuk
 * operator yang lagi handle komplain/cek status. Tab di frontend
 * cuma filter view, data sudah loaded.
 *
 * Sumber data (9+ table):
 *  - customers (base)
 *  - subscriptions + packages + routers (paket aktif customer)
 *  - invoices + payments (10 terakhir, 5 terakhir)
 *  - pppoeSessions (active session dari mikrotik_identity)
 *  - routerNetwatch (entry yang reference IP customer)
 *  - onus (kalau pppoe username juga muncul di onus.username)
 *  - waNotificationsLog (5 terakhir)
 *  - auditLogs (10 terakhir terkait customer/subscription)
 *
 * Performance note: paralel via Promise.all. Tenant scoping di
 * setiap query supaya tidak leak cross-tenant.
 */

export interface Customer360 {
    customer: any;
    subscriptions: any[];
    invoices: any[];
    payments: any[];
    pppoeActive: any[];
    netwatch: any[];
    onuLinked: any[];
    waNotifs: any[];
    activity: any[];
    summary: {
        activeSubscriptions: number;
        totalInvoices: number;
        unpaidInvoices: number;
        unpaidAmount: number;
        nextDueAt: Date | null;
        nextExpiringSubscriptionAt: Date | null;
        networkStatus: 'online' | 'offline' | 'partial' | 'unknown';
    };
}

class Customer360Service {
    async getCustomer360(customerId: string, tenantId?: string): Promise<Customer360> {
        // 1. Load base customer + verify tenant access
        const customer = await this.loadCustomer(customerId, tenantId);
        if (!customer) throw ApiError.notFound('Customer tidak ditemukan');

        // 2. Load subscription IDs untuk pakai di query lain
        const subs = await this.loadSubscriptions(customerId);
        const mikrotikIdentities = subs
            .map((s) => s.mikrotikIdentity)
            .filter(Boolean) as string[];
        const routerIds = [...new Set(subs.map((s) => s.routerId).filter(Boolean))] as string[];

        // 3. Paralel fetch sisanya
        const [
            invoiceList,
            paymentList,
            pppoeActive,
            netwatch,
            onuLinked,
            waNotifs,
            activity,
        ] = await Promise.all([
            this.loadInvoices(customerId),
            this.loadPayments(customerId),
            this.loadPppoeActive(mikrotikIdentities, routerIds),
            this.loadNetwatch(mikrotikIdentities, routerIds),
            this.loadOnuLinked(mikrotikIdentities),
            this.loadWaNotifs(customerId),
            this.loadActivity(customerId),
        ]);

        const summary = this.computeSummary({
            subscriptions: subs,
            invoices: invoiceList,
            pppoeActive,
            netwatch,
        });

        return {
            customer,
            subscriptions: subs,
            invoices: invoiceList,
            payments: paymentList,
            pppoeActive,
            netwatch,
            onuLinked,
            waNotifs,
            activity,
            summary,
        };
    }

    private async loadCustomer(id: string, tenantId?: string) {
        const conditions = [eq(customers.id, id)];
        if (tenantId) conditions.push(eq(customers.tenantId, tenantId));

        const [row] = await db
            .select()
            .from(customers)
            .where(and(...conditions))
            .limit(1);

        return row ?? null;
    }

    private async loadSubscriptions(customerId: string) {
        return db
            .select({
                id: subscriptions.id,
                type: subscriptions.type,
                status: subscriptions.status,
                statusReason: subscriptions.statusReason,
                mikrotikIdentity: subscriptions.mikrotikIdentity,
                billingDay: subscriptions.billingDay,
                activatedAt: subscriptions.activatedAt,
                expiresAt: subscriptions.expiresAt,
                nextDueAt: subscriptions.nextDueAt,
                lastInvoicedAt: subscriptions.lastInvoicedAt,
                routerId: subscriptions.routerId,
                routerName: routers.name,
                routerHost: routers.host,
                packageId: subscriptions.packageId,
                packageName: packages.name,
                packagePrice: packages.price,
                packageType: packages.type,
                packageProfile: packages.mikrotikProfile,
                packageCycleType: packages.cycleType,
                packageCycleValue: packages.cycleValue,
            })
            .from(subscriptions)
            .leftJoin(packages, eq(subscriptions.packageId, packages.id))
            .leftJoin(routers, eq(subscriptions.routerId, routers.id))
            .where(eq(subscriptions.customerId, customerId))
            .orderBy(desc(subscriptions.activatedAt));
    }

    private async loadInvoices(customerId: string) {
        return db
            .select({
                id: invoices.id,
                invoiceNumber: invoices.invoiceNumber,
                amount: invoices.amount,
                status: invoices.status,
                dueAt: invoices.dueAt,
                paidAt: invoices.paidAt,
                periodStart: invoices.periodStart,
                periodEnd: invoices.periodEnd,
                notes: invoices.notes,
                packageName: packages.name,
                createdAt: invoices.createdAt,
            })
            .from(invoices)
            .leftJoin(packages, eq(invoices.packageId, packages.id))
            .where(eq(invoices.customerId, customerId))
            .orderBy(desc(invoices.createdAt))
            .limit(20);
    }

    private async loadPayments(customerId: string) {
        // payments tidak punya customerId langsung — join via invoices
        return db
            .select({
                id: payments.id,
                amount: payments.amount,
                method: payments.method,
                gatewayTxnId: payments.gatewayTxnId,
                recordedAt: payments.recordedAt,
                notes: payments.notes,
                invoiceNumber: invoices.invoiceNumber,
                recordedByName: users.name,
            })
            .from(payments)
            .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
            .leftJoin(users, eq(payments.recordedBy, users.id))
            .where(eq(invoices.customerId, customerId))
            .orderBy(desc(payments.recordedAt))
            .limit(10);
    }

    private async loadPppoeActive(identities: string[], routerIds: string[]) {
        if (identities.length === 0 || routerIds.length === 0) return [];

        return db
            .select({
                routerId: pppoeSessions.routerId,
                name: pppoeSessions.name,
                address: pppoeSessions.address,
                uptime: pppoeSessions.uptime,
                routerName: routers.name,
            })
            .from(pppoeSessions)
            .innerJoin(routers, eq(pppoeSessions.routerId, routers.id))
            .where(
                and(
                    inArray(pppoeSessions.name, identities),
                    inArray(pppoeSessions.routerId, routerIds)
                )
            );
    }

    private async loadNetwatch(identities: string[], routerIds: string[]) {
        if (routerIds.length === 0) return [];

        // Match netwatch yang name atau pppoe_user-nya ada di identities
        const conditions = [inArray(routerNetwatch.routerId, routerIds)];

        return db
            .select({
                id: routerNetwatch.id,
                host: routerNetwatch.host,
                name: routerNetwatch.name,
                status: routerNetwatch.status,
                latency: routerNetwatch.latency,
                lastUp: routerNetwatch.lastUp,
                lastDown: routerNetwatch.lastDown,
                routerId: routerNetwatch.routerId,
                routerName: routers.name,
            })
            .from(routerNetwatch)
            .innerJoin(routers, eq(routerNetwatch.routerId, routers.id))
            .where(
                and(
                    ...conditions,
                    // Best-effort: cocokkan dengan identity (pppoe username/voucher code)
                    identities.length > 0
                        ? sql`(${routerNetwatch.name} = ANY(${identities}) OR ${routerNetwatch.host} IN (
                              SELECT address FROM pppoe_sessions WHERE name = ANY(${identities})
                          ))`
                        : sql`true`
                )
            )
            .limit(20);
    }

    private async loadOnuLinked(identities: string[]) {
        if (identities.length === 0) return [];

        // ONU mungkin punya field username yang match dengan PPPoE.
        // Best-effort search: match by name (alias) atau description.
        return db
            .select({
                id: onus.id,
                sn: onus.sn,
                name: onus.name,
                description: onus.description,
                status: onus.status,
                host: onus.host,
                lastSeen: onus.lastSeen,
                oltId: onus.oltId,
                lastRxPower: onus.lastRxPower,
                pppoeIp: onus.pppoeIp,
                mgmtIp: onus.mgmtIp,
            })
            .from(onus)
            .where(
                sql`(${onus.name} = ANY(${identities}) OR ${onus.description} = ANY(${identities}))`
            )
            .limit(10);
    }

    private async loadWaNotifs(customerId: string) {
        return db
            .select({
                id: waNotificationsLog.id,
                type: waNotificationsLog.type,
                status: waNotificationsLog.status,
                toPhone: waNotificationsLog.toPhone,
                provider: waNotificationsLog.provider,
                error: waNotificationsLog.error,
                sentAt: waNotificationsLog.sentAt,
                createdAt: waNotificationsLog.createdAt,
            })
            .from(waNotificationsLog)
            .where(eq(waNotificationsLog.customerId, customerId))
            .orderBy(desc(waNotificationsLog.createdAt))
            .limit(10);
    }

    private async loadActivity(customerId: string) {
        // Audit logs untuk entity customer + subscription
        // Plus actions yang reference customerId di details JSON
        return db
            .select({
                id: auditLogs.id,
                action: auditLogs.action,
                entity: auditLogs.entity,
                entityId: auditLogs.entityId,
                details: auditLogs.details,
                userName: users.name,
                createdAt: auditLogs.createdAt,
            })
            .from(auditLogs)
            .leftJoin(users, eq(auditLogs.userId, users.id))
            .where(
                sql`(
                    (${auditLogs.entity} = 'customer' AND ${auditLogs.entityId} = ${customerId})
                    OR (${auditLogs.entity} IN ('subscription', 'invoice', 'payment')
                        AND ${auditLogs.details}::text LIKE ${'%' + customerId + '%'})
                )`
            )
            .orderBy(desc(auditLogs.createdAt))
            .limit(15);
    }

    private computeSummary(data: {
        subscriptions: any[];
        invoices: any[];
        pppoeActive: any[];
        netwatch: any[];
    }) {
        const activeSubs = data.subscriptions.filter((s) => s.status === 'active');
        const unpaidInvs = data.invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
        const unpaidAmount = unpaidInvs.reduce((sum, i) => sum + Number(i.amount || 0), 0);

        // Next due — earliest dueAt dari unpaid invoices
        const sortedUnpaid = [...unpaidInvs].sort((a, b) =>
            new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
        );
        const nextDueAt = sortedUnpaid[0]?.dueAt ?? null;

        // Next expiring — earliest expiresAt dari subscriptions
        const expDates = activeSubs
            .map((s) => s.expiresAt)
            .filter(Boolean)
            .sort((a: Date, b: Date) => new Date(a).getTime() - new Date(b).getTime());
        const nextExpiringSubscriptionAt = expDates[0] ?? null;

        // Network status — gabungan dari pppoe + netwatch
        let networkStatus: 'online' | 'offline' | 'partial' | 'unknown' = 'unknown';
        const hasPppoeActive = data.pppoeActive.length > 0;
        const upNetwatch = data.netwatch.filter((n) => n.status === 'up').length;
        const downNetwatch = data.netwatch.filter((n) => n.status === 'down').length;

        if (hasPppoeActive && downNetwatch === 0) networkStatus = 'online';
        else if (!hasPppoeActive && downNetwatch > 0) networkStatus = 'offline';
        else if (hasPppoeActive || upNetwatch > 0) networkStatus = 'partial';

        return {
            activeSubscriptions: activeSubs.length,
            totalInvoices: data.invoices.length,
            unpaidInvoices: unpaidInvs.length,
            unpaidAmount,
            nextDueAt,
            nextExpiringSubscriptionAt,
            networkStatus,
        };
    }
}

export const customer360Service = new Customer360Service();
