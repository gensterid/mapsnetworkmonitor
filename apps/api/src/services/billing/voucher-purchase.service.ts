import { randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    voucherPurchases, customers, packages, routers, billingRouterSettings,
    invoices, vouchers,
    type Customer, type VoucherPurchase,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { gatewayService } from './gateway.service.js';
import { resolveGatewayConfig } from './gateway.service.js';
import { invoiceService } from './billing.service.js';
import { generateInvoiceNumber } from './billing-helpers.js';
import type { GatewayName } from './gateway-providers.js';
import { voucherService } from './voucher.service.js';

/**
 * Voucher Online Purchase service — Phase V1.
 *
 * Customer beli voucher hotspot via halaman publik (anonymous, no auth).
 * Flow:
 *   1. create() → bikin invoice + voucher_purchases row + payment link
 *   2. customer bayar di gateway
 *   3. webhook fires → invoiceService.markPaid → fulfill(invoiceId)
 *   4. fulfill() → generate voucher + push MikroTik + (optional) WA delivery
 *
 * Anonymous buyer pattern: per-tenant 1 system customer "__voucher_buyer__"
 * (code prefix khusus supaya tidak conflict CUST-XXXX dan bisa di-filter di
 * tab Pelanggan operator).
 */

const ANONYMOUS_BUYER_CODE = '__voucher_buyer__';
const ANONYMOUS_BUYER_NAME = 'Pembeli Voucher Online';

/** Get or create per-tenant anonymous voucher buyer customer record. */
export async function getOrCreateAnonymousBuyer(tenantId: string): Promise<Customer> {
    const [existing] = await db.select().from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.code, ANONYMOUS_BUYER_CODE)))
        .limit(1);
    if (existing) return existing;

    const [created] = await db.insert(customers).values({
        tenantId,
        code: ANONYMOUS_BUYER_CODE,
        name: ANONYMOUS_BUYER_NAME,
        phone: null,
        email: null,
        address: null,
        pinCode: '0000',
        active: true,
        notes: 'System customer untuk voucher online purchase. Tidak tampil di tab Pelanggan operator.',
    }).returning();
    return created;
}

/** Pick gateway aktif dengan priority Midtrans > Xendit > Tripay.
 *  Return null kalau tidak ada yang aktif untuk router ini. */
async function pickAvailableGateway(tenantId: string, routerId: string): Promise<GatewayName | null> {
    const priorities: GatewayName[] = ['midtrans', 'xendit', 'tripay'];
    for (const g of priorities) {
        const r = await resolveGatewayConfig(tenantId, routerId, g);
        if (r.enabled && r.config) return g;
    }
    return null;
}

export const voucherPurchaseService = {
    /**
     * Create voucher purchase: invoice + voucher_purchases row + payment link.
     * Returns paymentUrl untuk redirect customer + accessToken untuk halaman sukses.
     */
    async create(input: {
        routerId: string;
        tenantId: string;
        packageId: string;
        buyerPhone?: string | null;
        gateway?: GatewayName;
        /** Base URL backend (https://host) — service compose callbackUrl per gateway
         *  setelah pilih gateway. */
        origin: string;
        /** Optional frontend return URL setelah customer selesai bayar. */
        returnUrl?: string;
    }): Promise<{
        paymentUrl: string;
        accessToken: string;
        purchaseId: string;
        gateway: GatewayName;
    }> {
        // Validate router hotspot tidak disabled. Mode `native` dan `mikhmon_bridge`
        // sama-sama bisa: voucher selalu push ke MikroTik + record di DB. Operator
        // di mode bridge tetap bisa lihat voucher via parser comment (format yang
        // kita generate via generateMikhmonComment = compatible).
        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, input.routerId)).limit(1);
        if (!settings || settings.hotspotMode === 'disabled') {
            throw new Error('Hotspot di-nonaktifkan untuk router ini. Operator perlu enable di Pengaturan Router.');
        }

        // Validate package = hotspot type + belongs to tenant
        const [pkg] = await db.select().from(packages)
            .where(and(eq(packages.id, input.packageId), eq(packages.tenantId, input.tenantId)))
            .limit(1);
        if (!pkg) throw new Error('Paket tidak ditemukan');
        if (pkg.type !== 'hotspot') throw new Error('Paket bukan tipe hotspot');
        if (!pkg.active) throw new Error('Paket sedang non-aktif');

        // Auto-pick gateway kalau caller tidak specify
        const gateway = input.gateway || (await pickAvailableGateway(input.tenantId, input.routerId));
        if (!gateway) throw new Error('Belum ada gateway pembayaran aktif untuk router ini');

        // Get anonymous buyer customer
        const buyer = await getOrCreateAnonymousBuyer(input.tenantId);

        // Create one-shot invoice via invoiceService.create yang sudah handle
        // auto-numbering + status default 'unpaid'.
        const now = new Date();
        const dueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 jam expiry
        const invoice = await invoiceService.create(input.tenantId, {
            customerId: buyer.id,
            packageId: pkg.id,
            routerId: input.routerId,
            amount: pkg.price as any,
            periodStart: now,
            periodEnd: now,    // single use voucher — period sama
            dueAt,
            notes: `Voucher Online: ${pkg.name}${input.buyerPhone ? ` (HP: ${input.buyerPhone})` : ''}`,
        });

        // Insert voucher_purchases row
        const accessToken = randomUUID();
        const [purchase] = await db.insert(voucherPurchases).values({
            tenantId: input.tenantId,
            routerId: input.routerId,
            packageId: pkg.id,
            invoiceId: invoice.id,
            accessToken,
            buyerPhone: input.buyerPhone || null,
            status: 'pending',
        }).returning();

        // Create payment link via existing gateway service. Reuse yang sudah
        // include router code di merchantRef + register pending payment row.
        // Compose callbackUrl per gateway sekarang (setelah pick gateway).
        const callbackUrl = `${input.origin.replace(/\/$/, '')}/api/billing/webhook/${gateway}`;
        let paymentUrl: string;
        try {
            const result = await gatewayService.createPayment({
                invoiceId: invoice.id,
                tenantId: input.tenantId,
                gateway,
                callbackUrl,
                returnUrl: input.returnUrl,
            });
            paymentUrl = result.paymentUrl;
        } catch (err: any) {
            // Rollback voucher_purchases + invoice supaya tidak ada orphan.
            await db.delete(voucherPurchases).where(eq(voucherPurchases.id, purchase.id));
            await db.delete(invoices).where(eq(invoices.id, invoice.id));
            logger.error({ err: err?.message, packageId: pkg.id, routerId: input.routerId }, 'voucher purchase create failed at gateway');
            throw new Error(`Gagal generate link pembayaran: ${err?.message || 'unknown'}`);
        }

        return {
            paymentUrl,
            accessToken,
            purchaseId: purchase.id,
            gateway,
        };
    },

    /**
     * Fulfill: generate voucher + push MikroTik + (optional) WA delivery.
     * Dipanggil dari webhook handler setelah invoiceService.markPaid sukses.
     * No-op kalau invoice ini bukan dari voucher purchase atau purchase sudah
     * fulfilled. Best-effort: kalau gagal, status = 'failed' + errorMessage
     * untuk operator debug.
     */
    async fulfill(invoiceId: string): Promise<{ fulfilled: boolean; reason?: string }> {
        const [purchase] = await db.select().from(voucherPurchases)
            .where(eq(voucherPurchases.invoiceId, invoiceId)).limit(1);
        if (!purchase) return { fulfilled: false, reason: 'not_a_voucher_purchase' };
        if (purchase.status === 'fulfilled') return { fulfilled: true, reason: 'already_fulfilled' };
        if (purchase.status === 'failed') {
            logger.info({ purchaseId: purchase.id }, 'voucher purchase already failed, retrying...');
        }

        // Mark paid + record paidAt
        const now = new Date();
        await db.update(voucherPurchases)
            .set({ status: 'paid', paidAt: purchase.paidAt || now, updatedAt: now })
            .where(eq(voucherPurchases.id, purchase.id));

        // Generate voucher via voucherService.generateOne
        try {
            const voucher = await voucherService.generateOne({
                tenantId: purchase.tenantId,
                routerId: purchase.routerId,
                packageId: purchase.packageId,
                note: 'online-purchase',
            });

            await db.update(voucherPurchases)
                .set({
                    status: 'fulfilled',
                    voucherId: voucher.id,
                    fulfilledAt: new Date(),
                    errorMessage: null,
                    updatedAt: new Date(),
                })
                .where(eq(voucherPurchases.id, purchase.id));

            // Send WA delivery (best-effort) kalau buyerPhone diisi
            if (purchase.buyerPhone) {
                try {
                    await sendVoucherWa(purchase.tenantId, purchase.routerId, purchase.buyerPhone, voucher.code, purchase.id);
                } catch (waErr: any) {
                    logger.warn({ err: waErr?.message, purchaseId: purchase.id }, 'WA delivery failed (non-fatal)');
                }
            }

            logger.info({ purchaseId: purchase.id, voucherId: voucher.id }, 'voucher purchase fulfilled');
            return { fulfilled: true };
        } catch (err: any) {
            const errorMessage = err?.message || 'unknown error';
            await db.update(voucherPurchases)
                .set({ status: 'failed', errorMessage, updatedAt: new Date() })
                .where(eq(voucherPurchases.id, purchase.id));
            logger.error({ err: errorMessage, purchaseId: purchase.id }, 'voucher fulfill failed');
            return { fulfilled: false, reason: errorMessage };
        }
    },

    /** Status check by access token — dipakai halaman sukses untuk polling. */
    async findByAccessToken(accessToken: string): Promise<{
        purchase: VoucherPurchase;
        voucher: { code: string; password: string | null; profile: string; expiresAt: Date | null } | null;
        package: { name: string; price: string; cycleType: string; cycleValue: number } | null;
    } | null> {
        const [purchase] = await db.select().from(voucherPurchases)
            .where(eq(voucherPurchases.accessToken, accessToken)).limit(1);
        if (!purchase) return null;

        const [pkg] = await db.select({
            name: packages.name,
            price: packages.price,
            cycleType: packages.cycleType,
            cycleValue: packages.cycleValue,
        }).from(packages).where(eq(packages.id, purchase.packageId)).limit(1);

        let voucher = null;
        if (purchase.voucherId) {
            const [v] = await db.select({
                code: vouchers.code,
                password: vouchers.pinCode,
                profile: vouchers.profile,
                expiresAt: vouchers.expiresAt,
            }).from(vouchers).where(eq(vouchers.id, purchase.voucherId)).limit(1);
            voucher = v || null;
        }

        return { purchase, voucher, package: pkg || null };
    },
};

/**
 * Kirim voucher code via WA — best-effort. Pakai WA provider yang sudah
 * di-setup di billing_router_settings (Fonnte / Wablas / Webhook).
 *
 * Pesan template:
 *   ✅ Voucher WiFi Anda
 *   Kode: <code>
 *   Cara login: connect ke WiFi → masukkan kode di halaman login
 *   Cek status: <portal-link>
 */
async function sendVoucherWa(tenantId: string, routerId: string, phone: string, voucherCode: string, purchaseId: string): Promise<void> {
    const [settings] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId)).limit(1);
    if (!settings || settings.waProvider === 'none' || !settings.waConfig) {
        logger.debug({ routerId }, 'WA provider not configured for router, skip voucher delivery');
        return;
    }

    const cfg = settings.waConfig as any;
    let providerCfg: any;
    if (settings.waProvider === 'fonnte') {
        if (!cfg.token) return;
        providerCfg = { provider: 'fonnte', token: cfg.token, deviceId: cfg.deviceId, countryCode: cfg.countryCode };
    } else if (settings.waProvider === 'wablas') {
        if (!cfg.token) return;
        providerCfg = { provider: 'wablas', token: cfg.token, secret: cfg.secret, baseUrl: cfg.baseUrl };
    } else if (settings.waProvider === 'webhook') {
        if (!cfg.url) return;
        providerCfg = { provider: 'webhook', url: cfg.url, headers: cfg.headers, method: cfg.method };
    } else {
        return;
    }

    const message = [
        '✅ *Voucher WiFi Anda*',
        '',
        `Kode: *${voucherCode}*`,
        '',
        'Cara pakai:',
        '1. Connect ke WiFi',
        '2. Buka halaman login',
        '3. Masukkan kode di kolom username & password',
        '',
        'Selamat menikmati! 🎉',
    ].join('\n');

    const { sendOneOff } = await import('./wa-notification.service.js');
    await sendOneOff({
        tenantId,
        routerId,
        customerId: null,
        subscriptionId: null,
        invoiceId: null,
        voucherId: null,
        type: 'manual',
        phone,
        message,
    } as any);
}

export { ANONYMOUS_BUYER_CODE, ANONYMOUS_BUYER_NAME };
