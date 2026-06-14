import { and, eq, lt, lte, gte, desc, isNull, ne, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    promiseToPay, invoices, subscriptions, customers, billingRouterSettings,
    type PromiseToPay,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { auditRepository } from '../../repositories/audit.repository.js';

/**
 * Promise to Pay service — Phase B MVP.
 *
 * Aturan bisnis:
 *  - Max 2 active (pending atau broken) promise per invoice. Cegah customer
 *    "geser terus".
 *  - promised_for harus > today (tidak boleh defer ke masa lalu).
 *  - Saat invoice di-pay (status='paid'), semua pending promise yang link
 *    ke invoice itu otomatis ditandai 'fulfilled'.
 *  - Saat operator manual cancel promise, status='cancelled' + log.
 *
 * Tidak menggantikan logic isolir — hanya menunda. Saat ada pending
 * promise dengan promised_for >= now, billing-scheduler step 3 skip
 * auto-isolir untuk subscription tsb.
 */

const MAX_PROMISES_PER_INVOICE = 2;

export const promiseToPayService = {
    /**
     * Buat promise baru. Validate:
     *  - invoice exists, not paid, not cancelled
     *  - promised_for di masa depan
     *  - count existing (pending|broken) promise < MAX
     */
    async create(tenantId: string, input: {
        invoiceId: string;
        promisedFor: Date;
        notes?: string;
        autoIsolirIfBroken?: boolean;
        createdBy?: string | null;
    }): Promise<PromiseToPay> {
        const [inv] = await db.select().from(invoices)
            .where(and(eq(invoices.id, input.invoiceId), eq(invoices.tenantId, tenantId)))
            .limit(1);
        if (!inv) throw new Error('Invoice tidak ditemukan');
        if (inv.status === 'paid') throw new Error('Tagihan sudah lunas — tidak perlu defer');
        if (inv.status === 'cancelled') throw new Error('Tagihan sudah dibatalkan');
        if (!inv.subscriptionId) throw new Error('Tagihan tidak ada subscription terkait');

        const now = new Date();
        if (input.promisedFor.getTime() <= now.getTime()) {
            throw new Error('Tanggal janji bayar harus di masa depan');
        }

        const existingCount = await db.select({ c: count() }).from(promiseToPay)
            .where(and(
                eq(promiseToPay.invoiceId, input.invoiceId),
                eq(promiseToPay.tenantId, tenantId),
                sql`${promiseToPay.status} IN ('pending', 'broken')`,
            ));
        if ((existingCount[0]?.c ?? 0) >= MAX_PROMISES_PER_INVOICE) {
            throw new Error(`Sudah ${MAX_PROMISES_PER_INVOICE}× di-defer untuk tagihan ini — maksimal. Operator harus follow-up manual.`);
        }

        // Cancel previous pending promise (kalau ada) — supaya cuma 1 active per invoice
        await db.update(promiseToPay)
            .set({ status: 'cancelled', resolvedAt: now, updatedAt: now })
            .where(and(
                eq(promiseToPay.invoiceId, input.invoiceId),
                eq(promiseToPay.status, 'pending'),
            ));

        const [row] = await db.insert(promiseToPay).values({
            tenantId,
            subscriptionId: inv.subscriptionId,
            invoiceId: input.invoiceId,
            promisedFor: input.promisedFor,
            notes: input.notes,
            autoIsolirIfBroken: input.autoIsolirIfBroken ?? false,
            createdBy: input.createdBy ?? null,
            status: 'pending',
        }).returning();

        try {
            await auditRepository.create({
                tenantId,
                userId: input.createdBy ?? null,
                action: 'billing.promise.create',
                entity: 'invoice',
                entityId: input.invoiceId,
                details: {
                    promiseId: row.id,
                    subscriptionId: inv.subscriptionId,
                    promisedFor: input.promisedFor.toISOString(),
                    notes: input.notes,
                    autoIsolirIfBroken: input.autoIsolirIfBroken ?? false,
                },
            } as any);
        } catch (e: any) {
            logger.warn({ err: e?.message }, 'audit log for promise create failed');
        }
        return row;
    },

    /**
     * Tandai promise sebagai fulfilled (customer sudah bayar).
     * Operator panggil ini kalau bayar manual (tidak otomatis via gateway).
     */
    async fulfill(id: string, tenantId: string, actorUserId?: string | null): Promise<PromiseToPay | null> {
        const now = new Date();
        const [row] = await db.update(promiseToPay)
            .set({ status: 'fulfilled', resolvedAt: now, updatedAt: now })
            .where(and(
                eq(promiseToPay.id, id),
                eq(promiseToPay.tenantId, tenantId),
                eq(promiseToPay.status, 'pending'),
            ))
            .returning();
        if (!row) return null;
        try {
            await auditRepository.create({
                tenantId, userId: actorUserId ?? null,
                action: 'billing.promise.fulfill', entity: 'promise', entityId: row.id,
                details: { invoiceId: row.invoiceId, subscriptionId: row.subscriptionId },
            } as any);
        } catch { /* non-fatal */ }
        return row;
    },

    /** Cancel promise (operator change of mind). */
    async cancel(id: string, tenantId: string, actorUserId?: string | null): Promise<PromiseToPay | null> {
        const now = new Date();
        const [row] = await db.update(promiseToPay)
            .set({ status: 'cancelled', resolvedAt: now, updatedAt: now })
            .where(and(
                eq(promiseToPay.id, id),
                eq(promiseToPay.tenantId, tenantId),
                eq(promiseToPay.status, 'pending'),
            ))
            .returning();
        if (!row) return null;
        try {
            await auditRepository.create({
                tenantId, userId: actorUserId ?? null,
                action: 'billing.promise.cancel', entity: 'promise', entityId: row.id,
                details: { invoiceId: row.invoiceId, subscriptionId: row.subscriptionId },
            } as any);
        } catch { /* non-fatal */ }
        return row;
    },

    /** List promises dengan join customer + invoice info untuk UI. */
    async list(tenantId: string, opts: {
        status?: 'pending' | 'fulfilled' | 'broken' | 'cancelled';
        limit?: number;
    } = {}): Promise<Array<PromiseToPay & {
        customerName?: string;
        customerPhone?: string;
        invoiceNumber?: string;
        invoiceAmount?: string;
        mikrotikIdentity?: string;
        daysUntilPromise?: number;
    }>> {
        const rows = await db.select({
            promise: promiseToPay,
            customerName: customers.name,
            customerPhone: customers.phone,
            invoiceNumber: invoices.invoiceNumber,
            invoiceAmount: invoices.amount,
            mikrotikIdentity: subscriptions.mikrotikIdentity,
        })
            .from(promiseToPay)
            .innerJoin(invoices, eq(invoices.id, promiseToPay.invoiceId))
            .innerJoin(subscriptions, eq(subscriptions.id, promiseToPay.subscriptionId))
            .innerJoin(customers, eq(customers.id, subscriptions.customerId))
            .where(and(
                eq(promiseToPay.tenantId, tenantId),
                opts.status ? eq(promiseToPay.status, opts.status) : undefined as any,
            ))
            .orderBy(desc(promiseToPay.promisedFor))
            .limit(opts.limit || 100);

        const now = Date.now();
        return rows.map(r => ({
            ...r.promise,
            customerName: r.customerName,
            customerPhone: r.customerPhone || undefined,
            invoiceNumber: r.invoiceNumber,
            invoiceAmount: r.invoiceAmount,
            mikrotikIdentity: r.mikrotikIdentity,
            daysUntilPromise: Math.ceil((new Date(r.promise.promisedFor).getTime() - now) / 86400_000),
        }));
    },

    /** Quick summary count untuk badge UI. */
    async summary(tenantId: string): Promise<{ pending: number; overdue: number }> {
        const now = new Date();
        const rows = await db.select({
            status: promiseToPay.status,
            promisedFor: promiseToPay.promisedFor,
        }).from(promiseToPay).where(and(
            eq(promiseToPay.tenantId, tenantId),
            eq(promiseToPay.status, 'pending'),
        ));
        let pending = 0;
        let overdue = 0;
        for (const r of rows) {
            pending++;
            if (new Date(r.promisedFor).getTime() < now.getTime()) overdue++;
        }
        return { pending, overdue };
    },

    /**
     * Cek: ada gak pending promise untuk subscription ini yang masih dalam jangka
     * waktu (promised_for >= now). Dipanggil dari billing-scheduler step 3
     * untuk skip auto-isolir.
     */
    async hasActivePromiseForSubscription(tenantId: string, subscriptionId: string, now: Date = new Date()): Promise<boolean> {
        const rows = await db.select({ id: promiseToPay.id }).from(promiseToPay)
            .where(and(
                eq(promiseToPay.tenantId, tenantId),
                eq(promiseToPay.subscriptionId, subscriptionId),
                eq(promiseToPay.status, 'pending'),
                gte(promiseToPay.promisedFor, now),
            ))
            .limit(1);
        return rows.length > 0;
    },

    /**
     * Sweeper: panggil dari scheduler periodik untuk:
     *  - Tandai promise yang lewat tanpa fulfill → status 'broken'
     *  - Kalau auto_isolir_if_broken=true → trigger isolir
     *  - Send WA reminder H-1 dan H+0
     *
     * Idempotent — pakai field reminder_*_sent_at supaya tidak double-send.
     */
    async runSweeper(): Promise<{ broken: number; remindersSent: number; isolirTriggered: number }> {
        const now = new Date();
        const today00 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow00 = new Date(today00);
        tomorrow00.setDate(tomorrow00.getDate() + 1);
        const dayAfter00 = new Date(today00);
        dayAfter00.setDate(dayAfter00.getDate() + 2);

        let broken = 0;
        let remindersSent = 0;
        let isolirTriggered = 0;

        // 1. Mark broken + maybe isolir — pending yang promised_for < hari ini 00:00
        const overduePromises = await db.select({
            promise: promiseToPay,
            sub: subscriptions,
        })
            .from(promiseToPay)
            .innerJoin(subscriptions, eq(subscriptions.id, promiseToPay.subscriptionId))
            .where(and(
                eq(promiseToPay.status, 'pending'),
                lt(promiseToPay.promisedFor, today00),
            ));

        for (const { promise, sub } of overduePromises) {
            try {
                await db.update(promiseToPay)
                    .set({ status: 'broken', updatedAt: now })
                    .where(eq(promiseToPay.id, promise.id));
                broken++;

                if (promise.autoIsolirIfBroken && sub.status === 'active') {
                    try {
                        const { subscriptionService } = await import('./billing.service.js');
                        await subscriptionService.isolir(sub.id, sub.tenantId, 'Janji bayar lewat tanpa pelunasan');
                        isolirTriggered++;
                    } catch (err: any) {
                        logger.error({ err: err?.message, subId: sub.id }, 'Auto-isolir from broken promise failed');
                    }
                }
            } catch (err: any) {
                logger.warn({ err: err?.message, promiseId: promise.id }, 'mark broken promise failed');
            }
        }

        // 2. H-1 reminder — promised_for di [tomorrow00..dayAfter00)
        // 3. H+0 reminder — promised_for di [today00..tomorrow00)
        const reminderTargets = await db.select({
            promise: promiseToPay,
            sub: subscriptions,
            customerPhone: customers.phone,
            customerName: customers.name,
            invoiceNumber: invoices.invoiceNumber,
            invoiceAmount: invoices.amount,
            settings: billingRouterSettings,
        })
            .from(promiseToPay)
            .innerJoin(subscriptions, eq(subscriptions.id, promiseToPay.subscriptionId))
            .innerJoin(customers, eq(customers.id, subscriptions.customerId))
            .innerJoin(invoices, eq(invoices.id, promiseToPay.invoiceId))
            .leftJoin(billingRouterSettings, eq(billingRouterSettings.routerId, subscriptions.routerId))
            .where(and(
                eq(promiseToPay.status, 'pending'),
                gte(promiseToPay.promisedFor, today00),
                lt(promiseToPay.promisedFor, dayAfter00),
            ));

        for (const t of reminderTargets) {
            const phone = t.customerPhone;
            if (!phone) continue;
            const pf = new Date(t.promise.promisedFor);
            const isHMinus1 = pf >= tomorrow00 && pf < dayAfter00 && !t.promise.reminderHMinus1SentAt;
            const isHZero = pf >= today00 && pf < tomorrow00 && !t.promise.reminderHZeroSentAt;
            if (!isHMinus1 && !isHZero) continue;

            try {
                const { sendOneOff } = await import('./wa-notification.service.js');
                const dateStr = pf.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                const message = isHMinus1
                    ? `Halo ${t.customerName}, mengingatkan janji bayar Anda besok (${dateStr}) untuk tagihan ${t.invoiceNumber} sebesar Rp ${Number(t.invoiceAmount).toLocaleString('id-ID')}. Terima kasih.`
                    : `Halo ${t.customerName}, hari ini adalah tanggal janji bayar Anda (${dateStr}) untuk tagihan ${t.invoiceNumber} sebesar Rp ${Number(t.invoiceAmount).toLocaleString('id-ID')}. Mohon segera dilunasi. Terima kasih.`;

                await sendOneOff({
                    tenantId: t.promise.tenantId,
                    routerId: t.sub.routerId,
                    customerId: t.sub.customerId,
                    subscriptionId: t.sub.id,
                    invoiceId: t.promise.invoiceId,
                    type: isHMinus1 ? 'promise_reminder_h1' as any : 'promise_reminder_d0' as any,
                    phone,
                    message,
                });

                await db.update(promiseToPay)
                    .set(isHMinus1
                        ? { reminderHMinus1SentAt: now, updatedAt: now }
                        : { reminderHZeroSentAt: now, updatedAt: now })
                    .where(eq(promiseToPay.id, t.promise.id));
                remindersSent++;
            } catch (err: any) {
                logger.warn({ err: err?.message, promiseId: t.promise.id }, 'WA reminder for promise failed');
            }
        }

        if (broken > 0 || remindersSent > 0 || isolirTriggered > 0) {
            logger.info({ broken, remindersSent, isolirTriggered }, 'Promise sweeper cycle complete');
        }

        return { broken, remindersSent, isolirTriggered };
    },
};
