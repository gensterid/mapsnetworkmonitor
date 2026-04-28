import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    invoices, customers, billingRouterSettings, payments,
} from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { gatewayCreatePayment, gatewayVerifyWebhook, type GatewayName } from './gateway-providers.js';
import { invoiceService } from './billing.service.js';

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

        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, inv.routerId)).limit(1);
        if (!settings) throw new Error('Billing settings not configured for router');

        const enabled = (
            (input.gateway === 'tripay' && settings.gatewayTripayEnabled) ||
            (input.gateway === 'midtrans' && settings.gatewayMidtransEnabled) ||
            (input.gateway === 'xendit' && settings.gatewayXenditEnabled)
        );
        if (!enabled) throw new Error(`Gateway ${input.gateway} disabled for router`);

        const gatewayCfgRaw = (settings.gatewayConfig as any) || {};
        const cfg = gatewayCfgRaw[input.gateway];
        if (!cfg) throw new Error(`Gateway ${input.gateway} credentials not configured`);

        const [cust] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
        if (!cust) throw new Error('Customer not found');

        const result = await gatewayCreatePayment(input.gateway, cfg, {
            invoice: {
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                amount: Number(inv.amount),
                notes: inv.notes,
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
        const invoiceNumber =
            payload.merchant_ref ||
            payload.external_id?.split('-').slice(0, 3).join('-') ||
            payload.order_id?.split('-').slice(0, 3).join('-');

        if (!invoiceNumber) return { status: 400, body: { error: 'invoice number not found in payload' } };

        const [inv] = await db.select().from(invoices)
            .where(eq(invoices.invoiceNumber, invoiceNumber))
            .limit(1);
        if (!inv) return { status: 404, body: { error: 'invoice not found' } };
        if (!inv.routerId) return { status: 400, body: { error: 'invoice has no router' } };

        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, inv.routerId)).limit(1);
        if (!settings) return { status: 400, body: { error: 'router billing settings missing' } };

        const cfg = (settings.gatewayConfig as any)?.[input.gateway];
        if (!cfg) return { status: 400, body: { error: `${input.gateway} not configured for router` } };

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
