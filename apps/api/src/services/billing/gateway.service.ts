import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    invoices, customers, billingRouterSettings, payments, appSettings, routers,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { gatewayCreatePayment, gatewayVerifyWebhook, type GatewayName } from './gateway-providers.js';
import { invoiceService } from './billing.service.js';

/**
 * Resolve gateway config dengan fallback chain:
 *   1. Router-level setting (billing_router_settings.gateway_*) — kalau enabled
 *      di router itu + ada cfg
 *   2. Tenant-level default (app_settings key='billing_gateway_defaults') —
 *      kalau gateway enabled di tenant default + ada cfg
 *   3. Disabled / null
 *
 * Tenant-level value shape:
 *   {
 *     tripayEnabled: boolean,
 *     midtransEnabled: boolean,
 *     xenditEnabled: boolean,
 *     config: { tripay: {...}, midtrans: {...}, xendit: {...} }
 *   }
 *
 * Operator setup tenant default sekali → semua router auto-pakai.
 * Router boleh override per-instance kalau perlu credential beda.
 */
export async function resolveGatewayConfig(tenantId: string, routerId: string, gateway: GatewayName): Promise<{
    enabled: boolean;
    config: any;
    source: 'router' | 'tenant' | null;
}> {
    // Step 1: router-level
    const [routerSettings] = await db.select().from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId)).limit(1);

    if (routerSettings) {
        const enabledByRouter = (
            (gateway === 'tripay' && routerSettings.gatewayTripayEnabled) ||
            (gateway === 'midtrans' && routerSettings.gatewayMidtransEnabled) ||
            (gateway === 'xendit' && routerSettings.gatewayXenditEnabled)
        );
        const routerCfg = (routerSettings.gatewayConfig as any)?.[gateway];
        if (enabledByRouter && routerCfg) {
            return { enabled: true, config: routerCfg, source: 'router' };
        }
    }

    // Step 2: tenant-level default
    const [tenantRow] = await db.select().from(appSettings)
        .where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, 'billing_gateway_defaults')))
        .limit(1);

    const tenantCfg = tenantRow?.value as any;
    if (tenantCfg) {
        const enabledByTenant = (
            (gateway === 'tripay' && tenantCfg.tripayEnabled) ||
            (gateway === 'midtrans' && tenantCfg.midtransEnabled) ||
            (gateway === 'xendit' && tenantCfg.xenditEnabled)
        );
        const cfg = tenantCfg.config?.[gateway];
        if (enabledByTenant && cfg) {
            return { enabled: true, config: cfg, source: 'tenant' };
        }
    }

    return { enabled: false, config: null, source: null };
}

/**
 * Gateway orchestration. The provider files do the HTTP/crypto work; this
 * file resolves per-router credentials, attaches invoice context, and
 * persists the resulting transaction reference.
 */

export const gatewayService = {
    /**
     * Create a payment URL for an invoice via a chosen gateway. Stores a
     * pending payment row keyed on (method, gatewayTxnId) for later
     * webhook reconciliation.
     */
    async createPayment(input: {
        invoiceId: string;
        tenantId: string;
        gateway: GatewayName;
        returnUrl?: string;
        callbackUrl: string;
        options?: Record<string, any>;
    }): Promise<{ paymentUrl: string; gatewayTxnId: string; expiresAt?: Date }> {
        const inv = await invoiceService.findById(input.invoiceId, input.tenantId);
        if (!inv) throw new Error('Invoice not found');
        if (inv.status === 'paid') throw new Error('Invoice already paid');
        if (!inv.routerId) throw new Error('Invoice has no router context');

        const resolved = await resolveGatewayConfig(input.tenantId, inv.routerId, input.gateway);
        if (!resolved.enabled) throw new Error(`Gateway ${input.gateway} disabled (router & tenant default)`);
        if (!resolved.config) throw new Error(`Gateway ${input.gateway} credentials not configured`);
        const cfg = resolved.config;
        logger.debug({ routerId: inv.routerId, gateway: input.gateway, source: resolved.source }, 'Gateway config resolved');

        // Build merchant reference dengan router code di tengah supaya
        // dashboard gateway (Midtrans/Tripay/Xendit) bisa langsung lihat
        // transaksi ini dari router mana. Format: INV-{ROUTERCODE}-YYYYMM-NNNN
        // Webhook parser handle backward-compat untuk invoice lama tanpa code.
        const [routerRow] = await db.select({ name: routers.name }).from(routers)
            .where(eq(routers.id, inv.routerId)).limit(1);
        const safeRouterCode = (routerRow?.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        const merchantRef = safeRouterCode
            ? `INV-${safeRouterCode}-${inv.invoiceNumber.replace(/^INV-/, '')}`
            : inv.invoiceNumber;

        const [cust] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
        if (!cust) throw new Error('Customer not found');

        const result = await gatewayCreatePayment(input.gateway, cfg, {
            invoice: {
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                amount: Number(inv.amount),
                notes: inv.notes,
                merchantRef,
            },
            customer: {
                id: cust.id,
                name: cust.name,
                email: cust.email,
                phone: cust.phone,
            },
            returnUrl: input.returnUrl,
            callbackUrl: input.callbackUrl,
            options: input.options,
        });

        // Persist a pending payment row so webhook reconciliation has a target
        // and the operator UI can show "menunggu pembayaran" status.
        await db.insert(payments).values({
            tenantId: input.tenantId,
            invoiceId: inv.id,
            amount: String(inv.amount),
            method: input.gateway === 'tripay' ? 'gateway_tripay' :
                    input.gateway === 'midtrans' ? 'gateway_midtrans' : 'gateway_xendit',
            gatewayTxnId: result.gatewayTxnId,
            gatewayPayload: { pending: true, paymentUrl: result.paymentUrl, ...result.raw },
            notes: 'pending payment via gateway',
        }).onConflictDoNothing({ target: [payments.method, payments.gatewayTxnId] }).catch(() => {});

        return { paymentUrl: result.paymentUrl, gatewayTxnId: result.gatewayTxnId, expiresAt: result.expiresAt };
    },

    /**
     * Process an incoming webhook. Verifies signature, finds the matching
     * invoice via merchant_ref / external_id, marks it paid if status=paid.
     *
     * Caller must have captured the raw body for signature verification —
     * Express body parser cannot be used because Tripay/Xendit hash the
     * exact bytes received.
     */
    async handleWebhook(input: {
        gateway: GatewayName;
        rawBody: string;
        headers: Record<string, any>;
    }): Promise<{ status: number; body: any }> {
        // Webhook config stored alongside per-router billing settings — we
        // don't know which router a webhook belongs to until we parse the
        // payload. Strategy: parse first to get invoice_number, then look up
        // the router via invoice, then load that router's gateway cfg, then
        // verify with that cfg.
        let payload: any;
        try { payload = JSON.parse(input.rawBody); } catch { return { status: 400, body: { error: 'invalid json' } }; }

        // Try to identify the invoice. Each gateway uses a different field.
        // Format ref: INV[-ROUTER]-YYYYMM-NNNN[-timestamp].
        // Extract pakai regex yang match optional router code di tengah.
        const rawRef = payload.merchant_ref || payload.external_id || payload.order_id || '';
        const m = String(rawRef).match(/INV-(?:[A-Z0-9]+-)?(\d{6})-(\d+)/);
        const invoiceNumber = m ? `INV-${m[1]}-${m[2]}` : '';

        if (!invoiceNumber) return { status: 400, body: { error: 'invoice number not found in payload' } };

        const [inv] = await db.select().from(invoices)
            .where(eq(invoices.invoiceNumber, invoiceNumber))
            .limit(1);
        if (!inv) return { status: 404, body: { error: 'invoice not found' } };
        if (!inv.routerId) return { status: 400, body: { error: 'invoice has no router' } };

        // Resolve gateway config dengan router → tenant fallback.
        const resolved = await resolveGatewayConfig(inv.tenantId, inv.routerId, input.gateway);
        if (!resolved.config) return { status: 400, body: { error: `${input.gateway} not configured (router & tenant default)` } };
        const cfg = resolved.config;

        // Verify signature with the right key
        const verify = gatewayVerifyWebhook(input.gateway, cfg, input.rawBody, input.headers);
        if (!verify.valid) {
            logger.warn({ gateway: input.gateway, error: verify.error, invoiceNumber }, 'webhook signature invalid');
            return { status: 401, body: { error: verify.error || 'signature invalid' } };
        }

        if (verify.status === 'paid') {
            // Idempotency check: if a payment row with this gatewayTxnId already
            // exists AND its invoice is paid, just OK.
            if (inv.status === 'paid') {
                return { status: 200, body: { ok: true, note: 'already paid' } };
            }

            try {
                await invoiceService.markPaid(inv.id, inv.tenantId, {
                    amount: verify.amount ?? Number(inv.amount),
                    method: input.gateway === 'tripay' ? 'gateway_tripay' :
                            input.gateway === 'midtrans' ? 'gateway_midtrans' : 'gateway_xendit',
                    gatewayTxnId: verify.gatewayTxnId,
                    gatewayPayload: verify.raw,
                    notes: `paid via ${input.gateway}`,
                });
                logger.info({ gateway: input.gateway, invoiceNumber, amount: verify.amount }, 'gateway webhook → invoice marked paid');

                // Phase V1: kalau invoice ini dari voucher online purchase,
                // trigger fulfillment (generate voucher + push MikroTik + WA).
                // Best-effort: kalau fail, status purchase = failed dan operator
                // alert di tab Transaksi. Webhook tetap return 200 supaya
                // gateway tidak retry.
                try {
                    const { voucherPurchaseService } = await import('./voucher-purchase.service.js');
                    const result = await voucherPurchaseService.fulfill(inv.id);
                    if (result.fulfilled) {
                        logger.info({ invoiceId: inv.id }, 'voucher purchase fulfilled via webhook');
                    } else if (result.reason !== 'not_a_voucher_purchase') {
                        logger.warn({ invoiceId: inv.id, reason: result.reason }, 'voucher purchase fulfillment skipped/failed');
                    }
                } catch (vpErr: any) {
                    logger.error({ err: vpErr?.message, invoiceId: inv.id }, 'voucher purchase fulfill threw — operator should investigate');
                }
            } catch (err: any) {
                if (String(err?.message || '').includes('unique')) {
                    // Already recorded by a previous duplicate webhook
                    return { status: 200, body: { ok: true, note: 'duplicate webhook' } };
                }
                throw err;
            }
        } else {
            logger.info({ gateway: input.gateway, invoiceNumber, status: verify.status }, 'gateway webhook received (non-paid status)');
        }

        return { status: 200, body: { ok: true, status: verify.status } };
    },
};
