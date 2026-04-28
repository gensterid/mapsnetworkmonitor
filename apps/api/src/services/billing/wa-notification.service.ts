import { and, eq, gte, lt, lte, isNotNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    invoices, customers, subscriptions, packages, billingRouterSettings,
    waNotificationsLog,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { dispatchWaMessage, type WaProviderConfig, normalisePhone } from './wa-providers.js';

/**
 * WA notification dispatcher + reminder scheduler.
 *
 * Per-router settings drive everything:
 *   waProvider               'fonnte' | 'wablas' | 'webhook' | 'none'
 *   waConfig                 jsonb provider-specific
 *   waNotifH-1Enabled        send H-1 reminder
 *   waNotifDueDayEnabled     send "today is the day" reminder
 *   waNotifOverdueEnabled    send overdue reminder
 *   waNotifIsolirEnabled     send when subscription is isolir'd
 *
 * Idempotency is enforced via wa_notifications_log: before sending we look up
 * (invoiceId or subscriptionId) + type within the day window and skip if
 * already sent.
 */

const fmtIDR = (v: any): string => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d: Date): string => d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

interface SendContext {
    tenantId: string;
    routerId: string | null;
    customerId: string | null;
    subscriptionId?: string | null;
    invoiceId?: string | null;
    voucherId?: string | null;
    type: 'h_minus_1' | 'due_day' | 'overdue' | 'isolir' | 'voucher_expiry' | 'payment_received' | 'manual';
    phone: string;
    message: string;
    cfg: WaProviderConfig;
}

/**
 * Send the message via configured provider, persist log entry, return ok/err.
 */
export async function sendWaNotification(ctx: SendContext): Promise<{ ok: boolean; error?: string }> {
    const phone = normalisePhone(ctx.phone);
    if (!phone) {
        await db.insert(waNotificationsLog).values({
            tenantId: ctx.tenantId, routerId: ctx.routerId,
            customerId: ctx.customerId, subscriptionId: ctx.subscriptionId,
            invoiceId: ctx.invoiceId, voucherId: ctx.voucherId,
            toPhone: ctx.phone || '',
            type: ctx.type,
            provider: ctx.cfg.provider,
            status: 'failed',
            error: 'invalid phone',
        });
        return { ok: false, error: 'invalid phone' };
    }

    const result = await dispatchWaMessage(phone, ctx.message, ctx.cfg, {
        type: ctx.type,
        invoiceId: ctx.invoiceId,
        subscriptionId: ctx.subscriptionId,
    });

    await db.insert(waNotificationsLog).values({
        tenantId: ctx.tenantId, routerId: ctx.routerId,
        customerId: ctx.customerId, subscriptionId: ctx.subscriptionId,
        invoiceId: ctx.invoiceId, voucherId: ctx.voucherId,
        toPhone: phone,
        type: ctx.type,
        provider: ctx.cfg.provider,
        status: result.ok ? 'sent' : 'failed',
        providerResponse: result.providerResponse,
        error: result.error,
        sentAt: result.ok ? new Date() : null,
    });
    return { ok: result.ok, error: result.error };
}

/** Build canonical message text per type. */
export function buildMessage(type: SendContext['type'], data: {
    customerName: string;
    invoiceNumber?: string;
    amount?: any;
    dueAt?: Date;
    packageName?: string;
}): string {
    const dueStr = data.dueAt ? fmtDate(data.dueAt) : '-';
    const amt = data.amount ? fmtIDR(data.amount) : '-';
    const inv = data.invoiceNumber || '';

    switch (type) {
        case 'h_minus_1':
            return `Halo ${data.customerName},\nTagihan internet Anda ${inv} sebesar ${amt} jatuh tempo BESOK (${dueStr}).\nMohon segera lakukan pembayaran agar layanan tetap aktif.\nTerima kasih.`;
        case 'due_day':
            return `Halo ${data.customerName},\nTagihan ${inv} sebesar ${amt} jatuh tempo HARI INI (${dueStr}).\nSegera lakukan pembayaran untuk menghindari pemutusan layanan.`;
        case 'overdue':
            return `Halo ${data.customerName},\nTagihan ${inv} sebesar ${amt} sudah lewat jatuh tempo (${dueStr}).\nMohon segera lunasi. Layanan dapat di-isolir bila tidak dilunasi.`;
        case 'isolir':
            return `Halo ${data.customerName},\nLayanan internet Anda telah di-isolir karena tagihan ${inv} belum dibayar.\nLakukan pembayaran sekarang untuk membuka isolir.`;
        case 'payment_received':
            return `Halo ${data.customerName},\nTerima kasih, pembayaran tagihan ${inv} sebesar ${amt} telah kami terima.\nLayanan Anda aktif kembali.`;
        case 'voucher_expiry':
            return `Halo ${data.customerName},\nVoucher hotspot Anda akan berakhir dalam 1 hari.\nSilakan perpanjang bila masih membutuhkan akses.`;
        default:
            return `Halo ${data.customerName}.`;
    }
}

/**
 * Has a notification of (type, invoice_id) already been sent today?
 */
async function alreadySentToday(invoiceId: string, type: SendContext['type']): Promise<boolean> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = await db.select({ id: waNotificationsLog.id }).from(waNotificationsLog)
        .where(and(
            eq(waNotificationsLog.invoiceId, invoiceId),
            eq(waNotificationsLog.type, type),
            gte(waNotificationsLog.createdAt, today),
            eq(waNotificationsLog.status, 'sent'),
        ))
        .limit(1);
    return rows.length > 0;
}

function getProviderConfig(settings: any): WaProviderConfig | null {
    if (!settings) return null;
    if (settings.waProvider === 'none' || !settings.waProvider) return null;
    const cfg = settings.waConfig || {};
    if (settings.waProvider === 'fonnte') {
        if (!cfg.token) return null;
        return { provider: 'fonnte', token: cfg.token, deviceId: cfg.deviceId, countryCode: cfg.countryCode };
    }
    if (settings.waProvider === 'wablas') {
        if (!cfg.token) return null;
        return { provider: 'wablas', token: cfg.token, secret: cfg.secret, baseUrl: cfg.baseUrl };
    }
    if (settings.waProvider === 'webhook') {
        if (!cfg.url) return null;
        return { provider: 'webhook', url: cfg.url, headers: cfg.headers, method: cfg.method };
    }
    return null;
}

/**
 * Daily sweep — find candidates per type, send if not already sent today.
 * Called by the scheduler at most a few times per day; safe to invoke
 * frequently because of the per-day idempotency check.
 */
export async function runWaReminderSweep(): Promise<{ sent: number; skipped: number; failed: number }> {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow); dayAfter.setDate(dayAfter.getDate() + 1);
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1);

    let sent = 0, skipped = 0, failed = 0;

    // Build a per-router settings map up front to avoid N+1.
    const allSettings = await db.select().from(billingRouterSettings);
    const settingsByRouter = new Map<string, any>();
    for (const s of allSettings) settingsByRouter.set(s.routerId, s);

    // Pull all unpaid/overdue invoices that fall into any reminder window.
    const reminders = await db.select({ inv: invoices, sub: subscriptions, cust: customers, pkg: packages })
        .from(invoices)
        .innerJoin(customers, eq(customers.id, invoices.customerId))
        .leftJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
        .leftJoin(packages, eq(packages.id, invoices.packageId))
        .where(and(
            inArray(invoices.status, ['unpaid', 'overdue']),
            isNotNull(invoices.dueAt),
        ));

    for (const r of reminders) {
        const inv = r.inv;
        const cust = r.cust;
        const sub = r.sub;
        const phone = cust.phone;
        if (!phone) { skipped++; continue; }

        const routerId = sub?.routerId || inv.routerId;
        if (!routerId) { skipped++; continue; }
        const settings = settingsByRouter.get(routerId);
        const cfg = getProviderConfig(settings);
        if (!cfg) { skipped++; continue; }

        // Determine which reminder type fits this invoice.
        let type: SendContext['type'] | null = null;
        const dueTs = new Date(inv.dueAt!).getTime();

        if (settings.waNotifHMinus1Enabled && dueTs >= tomorrow.getTime() && dueTs < dayAfter.getTime()) {
            type = 'h_minus_1';
        } else if (settings.waNotifDueDayEnabled && dueTs >= startToday.getTime() && dueTs < endToday.getTime() && inv.status === 'unpaid') {
            type = 'due_day';
        } else if (settings.waNotifOverdueEnabled && inv.status === 'overdue') {
            type = 'overdue';
        }

        if (!type) { skipped++; continue; }

        if (await alreadySentToday(inv.id, type)) { skipped++; continue; }

        const message = buildMessage(type, {
            customerName: cust.name,
            invoiceNumber: inv.invoiceNumber,
            amount: inv.amount,
            dueAt: new Date(inv.dueAt!),
            packageName: r.pkg?.name,
        });

        const res = await sendWaNotification({
            tenantId: inv.tenantId, routerId,
            customerId: cust.id,
            subscriptionId: sub?.id || null,
            invoiceId: inv.id,
            type, phone, message, cfg,
        });
        if (res.ok) sent++; else failed++;
    }

    logger.info({ sent, skipped, failed }, 'WA reminder sweep complete');
    return { sent, skipped, failed };
}

/**
 * Helper called by other services (subscription isolir/unisolir, payment
 * recorded) to send a one-off notification immediately.
 */
export async function sendOneOff(params: {
    tenantId: string;
    routerId: string;
    customerId: string;
    subscriptionId?: string | null;
    invoiceId?: string | null;
    type: SendContext['type'];
    phone: string;
    message: string;
}): Promise<{ ok: boolean; error?: string }> {
    const [settings] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, params.routerId)).limit(1);
    const cfg = getProviderConfig(settings);
    if (!cfg) return { ok: false, error: 'WA not configured for router' };
    return sendWaNotification({ ...params, cfg, voucherId: null });
}
