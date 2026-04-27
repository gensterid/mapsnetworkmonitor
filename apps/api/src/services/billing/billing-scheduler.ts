import { and, eq, lte, lt, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    subscriptions, invoices, packages,
    billingRouterSettings,
    type Subscription,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { invoiceService, subscriptionService } from './billing.service.js';
import { computeNextDueAt } from './billing-helpers.js';

/**
 * Daily billing job:
 *   1. For every active monthly subscription whose next_due_at has arrived,
 *      generate an unpaid invoice for the upcoming period and shift
 *      next_due_at one month forward.
 *   2. For every unpaid invoice past dueAt + graceDays, isolir the
 *      subscription.
 *   3. For every overdue invoice older than overdueGraceDays, mark status
 *      'overdue' so reports/UI can highlight them.
 *
 * Runs idempotently: if a row was already processed this cycle, the
 * compute_next_due window guarantees no double-issue. Designed to be safe
 * to run multiple times per day.
 */

const DEFAULT_INVOICE_DUE_DAYS = 7;
const DEFAULT_OVERDUE_THRESHOLD_DAYS = 1;

export async function runBillingDailyJob(): Promise<{
    invoicesGenerated: number;
    isolirApplied: number;
    overdueMarked: number;
}> {
    const now = new Date();
    let invoicesGenerated = 0;
    let isolirApplied = 0;
    let overdueMarked = 0;

    // ─── 1. Generate due invoices ────────────────────────────────────────
    try {
        const dueSubs = await db.select({
            sub: subscriptions,
            pkg: packages,
        })
            .from(subscriptions)
            .innerJoin(packages, eq(packages.id, subscriptions.packageId))
            .where(and(
                eq(subscriptions.status, 'active'),
                eq(packages.cycleType, 'monthly'),
                isNotNull(subscriptions.nextDueAt),
                lte(subscriptions.nextDueAt, now),
            ));

        for (const { sub, pkg } of dueSubs) {
            try {
                // Avoid double-issue if an unpaid invoice for this exact period
                // already exists (e.g. job ran twice).
                const periodStart = sub.nextDueAt!;
                const periodEnd = new Date(periodStart);
                periodEnd.setMonth(periodEnd.getMonth() + (pkg.cycleValue || 1));

                const existing = await db.select().from(invoices)
                    .where(and(
                        eq(invoices.subscriptionId, sub.id),
                        eq(invoices.periodStart, periodStart),
                    ))
                    .limit(1);
                if (existing.length === 0) {
                    const dueAt = new Date(periodStart);
                    dueAt.setDate(dueAt.getDate() + DEFAULT_INVOICE_DUE_DAYS);
                    await invoiceService.create(sub.tenantId, {
                        customerId: sub.customerId,
                        subscriptionId: sub.id,
                        packageId: sub.packageId,
                        routerId: sub.routerId,
                        amount: pkg.price as any,
                        periodStart,
                        periodEnd,
                        dueAt,
                    });
                    invoicesGenerated++;
                }

                // Shift next_due_at forward.
                const newNext = computeNextDueAt(sub.billingDay || 1, periodStart);
                await db.update(subscriptions)
                    .set({ nextDueAt: newNext, lastInvoicedAt: now, updatedAt: now })
                    .where(eq(subscriptions.id, sub.id));
            } catch (err: any) {
                logger.error({ err: err?.message, subId: sub.id }, 'Failed to generate invoice for subscription');
            }
        }
    } catch (err: any) {
        logger.error({ err: err?.message }, 'billing job: generate-invoices step failed');
    }

    // ─── 2. Mark overdue invoices ────────────────────────────────────────
    try {
        const cutoffOverdue = new Date(now.getTime() - DEFAULT_OVERDUE_THRESHOLD_DAYS * 86400_000);
        const r = await db.update(invoices)
            .set({ status: 'overdue', updatedAt: now })
            .where(and(
                eq(invoices.status, 'unpaid'),
                lt(invoices.dueAt, cutoffOverdue),
            ));
        overdueMarked = (r as any).rowCount || 0;
    } catch (err: any) {
        logger.error({ err: err?.message }, 'billing job: mark-overdue step failed');
    }

    // ─── 3. Auto-isolir ──────────────────────────────────────────────────
    try {
        // Find unpaid+overdue invoices whose subscriptions are still active and
        // past the per-router grace period. The grace lookup is per-router so
        // operators with strict ISP policies can keep grace=0 while RT/RW
        // operators give a few days.
        const candidates = await db.select({
            inv: invoices,
            sub: subscriptions,
            settings: billingRouterSettings,
        })
            .from(invoices)
            .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
            .leftJoin(billingRouterSettings, eq(billingRouterSettings.routerId, subscriptions.routerId))
            .where(and(
                eq(invoices.status, 'overdue'),
                eq(subscriptions.status, 'active'),
            ));

        for (const { inv, sub, settings } of candidates) {
            const grace = settings?.isolirGraceDays ?? 0;
            const isolirAfter = new Date(inv.dueAt);
            isolirAfter.setDate(isolirAfter.getDate() + grace);
            if (now.getTime() < isolirAfter.getTime()) continue;

            try {
                await subscriptionService.isolir(sub.id, sub.tenantId, `Tagihan ${inv.invoiceNumber} lewat jatuh tempo`);
                isolirApplied++;
            } catch (err: any) {
                logger.error({ err: err?.message, subId: sub.id, invId: inv.id }, 'Auto-isolir failed');
            }
        }
    } catch (err: any) {
        logger.error({ err: err?.message }, 'billing job: auto-isolir step failed');
    }

    logger.info({ invoicesGenerated, isolirApplied, overdueMarked }, 'Billing daily job completed');
    return { invoicesGenerated, isolirApplied, overdueMarked };
}
