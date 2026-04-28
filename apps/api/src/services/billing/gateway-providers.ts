import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { logger } from '../../lib/logger.js';

/**
 * Payment gateway adapters — Phase E.
 *
 * All adapters expose two operations:
 *   createPayment(input) → returns { paymentUrl, gatewayTxnId, expiresAt? }
 *   verifyWebhook(rawBody, headers) → returns { valid, status, gatewayTxnId, amount }
 *
 * Per-router credentials live in billing_router_settings.gatewayConfig (jsonb).
 * Operator picks one gateway per request; we never auto-pick.
 *
 * Supported:
 *   • tripay   — closed loop, Indonesia (very common for ISP RT/RW)
 *   • midtrans — Snap API redirect
 *   • xendit   — Invoice API redirect
 */

export type GatewayName = 'tripay' | 'midtrans' | 'xendit';

export interface CreatePaymentInput {
    invoice: {
        id: string;
        invoiceNumber: string;
        amount: number;
        notes?: string | null;
    };
    customer: {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
    };
    returnUrl?: string;
    callbackUrl: string;
    /** gateway-specific options (mis. tripay payment method code) */
    options?: Record<string, any>;
}

export interface CreatePaymentResult {
    paymentUrl: string;
    gatewayTxnId: string;
    expiresAt?: Date;
    raw: any;
}

export interface VerifyResult {
    valid: boolean;
    status: 'paid' | 'failed' | 'pending' | 'expired' | 'unknown';
    gatewayTxnId?: string;
    amount?: number;
    invoiceNumber?: string;
    raw?: any;
    error?: string;
}

const TIMEOUT_MS = 15_000;

async function fetchJson(url: string, init: any): Promise<{ status: number; json: any; text: string }> {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { ...init, signal: ctl.signal });
        const text = await res.text();
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        return { status: res.status, json, text };
    } finally {
        clearTimeout(id);
    }
}

function hmacSha256(secret: string, data: string): string {
    return createHmac('sha256', secret).update(data).digest('hex');
}

function sha512(data: string): string {
    return createHash('sha512').update(data).digest('hex');
}

function safeEq(a: string, b: string): boolean {
    const ba = Buffer.from(a || '');
    const bb = Buffer.from(b || '');
    if (ba.length !== bb.length) return false;
    try { return timingSafeEqual(ba, bb); } catch { return false; }
}

// ─── Tripay ────────────────────────────────────────────────────────────────

interface TripayCfg {
    apiKey: string;
    privateKey: string;
    merchantCode: string;
    sandbox?: boolean;
    /** payment method code default, mis. "BRIVA" / "QRIS" / "BNIVA". Operator can override per request. */
    defaultMethod?: string;
}

const TRIPAY_BASE = (sandbox: boolean) => sandbox ? 'https://tripay.co.id/api-sandbox' : 'https://tripay.co.id/api';

async function tripayCreate(cfg: TripayCfg, input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!cfg.apiKey || !cfg.privateKey || !cfg.merchantCode) throw new Error('Tripay credentials incomplete');
    const merchantRef = input.invoice.invoiceNumber;
    const amount = Math.round(input.invoice.amount);
    const signature = hmacSha256(cfg.privateKey, `${cfg.merchantCode}${merchantRef}${amount}`);
    const method = input.options?.method || cfg.defaultMethod || 'QRIS';

    const body = {
        method,
        merchant_ref: merchantRef,
        amount,
        customer_name: input.customer.name,
        customer_email: input.customer.email || `nopay-${input.customer.id}@local`,
        customer_phone: input.customer.phone || undefined,
        order_items: [{
            name: `Tagihan ${input.invoice.invoiceNumber}`,
            price: amount,
            quantity: 1,
        }],
        return_url: input.returnUrl,
        callback_url: input.callbackUrl,
        signature,
    };

    const { status, json } = await fetchJson(`${TRIPAY_BASE(!!cfg.sandbox)}/transaction/create`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!json?.success) {
        throw new Error(json?.message || `Tripay create failed (HTTP ${status})`);
    }

    const data = json.data;
    return {
        paymentUrl: data.checkout_url || data.pay_url,
        gatewayTxnId: data.reference,
        expiresAt: data.expired_time ? new Date(data.expired_time * 1000) : undefined,
        raw: data,
    };
}

function tripayVerify(cfg: TripayCfg, rawBody: string, headers: Record<string, any>): VerifyResult {
    const sig = headers['x-callback-signature'] || headers['X-Callback-Signature'];
    if (!sig) return { valid: false, status: 'unknown', error: 'missing X-Callback-Signature' };
    const expected = hmacSha256(cfg.privateKey, rawBody);
    if (!safeEq(String(sig), expected)) return { valid: false, status: 'unknown', error: 'signature mismatch' };

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return { valid: false, status: 'unknown', error: 'bad json' }; }

    const tStatus = String(payload.status || '').toUpperCase();
    let status: VerifyResult['status'] = 'unknown';
    if (tStatus === 'PAID') status = 'paid';
    else if (tStatus === 'EXPIRED') status = 'expired';
    else if (tStatus === 'FAILED') status = 'failed';
    else if (tStatus === 'UNPAID') status = 'pending';

    return {
        valid: true,
        status,
        gatewayTxnId: payload.reference,
        amount: payload.total_amount,
        invoiceNumber: payload.merchant_ref,
        raw: payload,
    };
}

// ─── Midtrans ──────────────────────────────────────────────────────────────

interface MidtransCfg {
    serverKey: string;
    clientKey?: string;
    sandbox?: boolean;
    isProduction?: boolean;
}

const MIDTRANS_BASE = (production: boolean) => production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';

async function midtransCreate(cfg: MidtransCfg, input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!cfg.serverKey) throw new Error('Midtrans serverKey missing');
    const isProd = cfg.isProduction ?? !cfg.sandbox;
    const orderId = `${input.invoice.invoiceNumber}-${Date.now()}`;
    const auth = Buffer.from(`${cfg.serverKey}:`).toString('base64');

    const body = {
        transaction_details: {
            order_id: orderId,
            gross_amount: Math.round(input.invoice.amount),
        },
        customer_details: {
            first_name: input.customer.name,
            email: input.customer.email || undefined,
            phone: input.customer.phone || undefined,
        },
        item_details: [{
            id: input.invoice.id,
            name: `Tagihan ${input.invoice.invoiceNumber}`.slice(0, 50),
            price: Math.round(input.invoice.amount),
            quantity: 1,
        }],
        callbacks: input.returnUrl ? { finish: input.returnUrl } : undefined,
        // Midtrans webhook URL is configured globally in dashboard, not per-request
    };

    const { status, json } = await fetchJson(`${MIDTRANS_BASE(isProd)}/snap/v1/transactions`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (status >= 400 || !json?.token) {
        throw new Error(json?.error_messages?.[0] || `Midtrans create failed (HTTP ${status})`);
    }

    return {
        paymentUrl: json.redirect_url,
        gatewayTxnId: orderId,
        raw: { ...json, orderId },
    };
}

function midtransVerify(cfg: MidtransCfg, rawBody: string, _headers: Record<string, any>): VerifyResult {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return { valid: false, status: 'unknown', error: 'bad json' }; }

    const expected = sha512(`${payload.order_id}${payload.status_code}${payload.gross_amount}${cfg.serverKey}`);
    const provided = String(payload.signature_key || '');
    if (!safeEq(provided, expected)) return { valid: false, status: 'unknown', error: 'signature mismatch' };

    const t = String(payload.transaction_status || '').toLowerCase();
    let status: VerifyResult['status'] = 'unknown';
    if (t === 'capture' || t === 'settlement') status = 'paid';
    else if (t === 'pending') status = 'pending';
    else if (t === 'expire') status = 'expired';
    else if (t === 'cancel' || t === 'deny' || t === 'failure') status = 'failed';

    // order_id format: INV-YYYYMM-NNNN-<timestamp>; recover invoice number
    const orderId = String(payload.order_id || '');
    const invoiceNumber = orderId.split('-').slice(0, 3).join('-');

    return {
        valid: true,
        status,
        gatewayTxnId: orderId,
        amount: parseFloat(payload.gross_amount || '0'),
        invoiceNumber,
        raw: payload,
    };
}

// ─── Xendit ────────────────────────────────────────────────────────────────

interface XenditCfg {
    secretKey: string;
    /** webhook verification token from Xendit dashboard (X-CALLBACK-TOKEN) */
    callbackToken: string;
    sandbox?: boolean;
}

async function xenditCreate(cfg: XenditCfg, input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!cfg.secretKey) throw new Error('Xendit secretKey missing');
    const auth = Buffer.from(`${cfg.secretKey}:`).toString('base64');
    const externalId = `${input.invoice.invoiceNumber}-${Date.now()}`;

    const body = {
        external_id: externalId,
        amount: Math.round(input.invoice.amount),
        payer_email: input.customer.email || undefined,
        description: `Tagihan ${input.invoice.invoiceNumber}`,
        success_redirect_url: input.returnUrl,
        failure_redirect_url: input.returnUrl,
        currency: 'IDR',
        // Xendit webhook URL configured globally in dashboard
    };

    const { status, json } = await fetchJson('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (status >= 400 || !json?.invoice_url) {
        throw new Error(json?.message || `Xendit create failed (HTTP ${status})`);
    }

    return {
        paymentUrl: json.invoice_url,
        gatewayTxnId: json.id || externalId,
        expiresAt: json.expiry_date ? new Date(json.expiry_date) : undefined,
        raw: json,
    };
}

function xenditVerify(cfg: XenditCfg, rawBody: string, headers: Record<string, any>): VerifyResult {
    const token = headers['x-callback-token'] || headers['X-CALLBACK-TOKEN'] || headers['X-Callback-Token'];
    if (!token) return { valid: false, status: 'unknown', error: 'missing x-callback-token' };
    if (!safeEq(String(token), cfg.callbackToken)) return { valid: false, status: 'unknown', error: 'callback token mismatch' };

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return { valid: false, status: 'unknown', error: 'bad json' }; }

    const xs = String(payload.status || '').toUpperCase();
    let status: VerifyResult['status'] = 'unknown';
    if (xs === 'PAID' || xs === 'SETTLED') status = 'paid';
    else if (xs === 'PENDING') status = 'pending';
    else if (xs === 'EXPIRED') status = 'expired';
    else if (xs === 'FAILED') status = 'failed';

    const externalId = String(payload.external_id || '');
    const invoiceNumber = externalId.split('-').slice(0, 3).join('-');

    return {
        valid: true,
        status,
        gatewayTxnId: payload.id || externalId,
        amount: payload.amount,
        invoiceNumber,
        raw: payload,
    };
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function gatewayCreatePayment(name: GatewayName, cfg: any, input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (name === 'tripay') return tripayCreate(cfg, input);
    if (name === 'midtrans') return midtransCreate(cfg, input);
    if (name === 'xendit') return xenditCreate(cfg, input);
    throw new Error(`Unknown gateway: ${name}`);
}

export function gatewayVerifyWebhook(name: GatewayName, cfg: any, rawBody: string, headers: Record<string, any>): VerifyResult {
    try {
        if (name === 'tripay') return tripayVerify(cfg, rawBody, headers);
        if (name === 'midtrans') return midtransVerify(cfg, rawBody, headers);
        if (name === 'xendit') return xenditVerify(cfg, rawBody, headers);
        return { valid: false, status: 'unknown', error: 'unknown gateway' };
    } catch (e: any) {
        logger.warn({ err: e?.message, name }, 'gateway verify error');
        return { valid: false, status: 'unknown', error: e?.message };
    }
}
