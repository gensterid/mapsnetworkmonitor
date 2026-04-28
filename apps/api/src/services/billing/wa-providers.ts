import { logger } from '../../lib/logger.js';

/**
 * WhatsApp gateway provider adapters.
 *
 * All providers expose the same `send(...)` shape so the calling service
 * doesn't need to know which one is configured. Per-tenant config lives in
 * billing_router_settings.waConfig (jsonb).
 *
 * Supported providers:
 *   • fonnte   — https://docs.fonnte.com (free tier, very popular in ID)
 *   • wablas   — https://wablas.com (paid, Indonesia)
 *   • webhook  — POSTs JSON to a user-provided URL (any custom gateway)
 */

export interface WaSendResult {
    ok: boolean;
    providerStatus?: number;
    providerResponse?: any;
    error?: string;
}

export type WaProviderConfig =
    | { provider: 'fonnte'; token: string; deviceId?: string; countryCode?: string }
    | { provider: 'wablas'; token: string; secret?: string; baseUrl?: string }
    | { provider: 'webhook'; url: string; headers?: Record<string, string>; method?: 'POST' | 'PUT' };

/**
 * Indonesian-friendly phone normaliser. Fonnte/Wablas both accept the
 * "62xxxxxxxx" form (no plus, no leading zero). We strip everything
 * non-digit, replace leading 0 with 62.
 */
export function normalisePhone(input: string | null | undefined, defaultCountry = '62'): string | null {
    if (!input) return null;
    let digits = String(input).replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
    if (digits.startsWith(defaultCountry)) return digits;
    return digits;
}

const TIMEOUT_MS = 12000;

async function fetchWithTimeout(url: string, init: any = {}): Promise<Response> {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctl.signal });
    } finally {
        clearTimeout(id);
    }
}

async function sendFonnte(toPhone: string, message: string, cfg: { token: string; deviceId?: string; countryCode?: string }): Promise<WaSendResult> {
    const target = normalisePhone(toPhone, cfg.countryCode || '62');
    if (!target) return { ok: false, error: 'invalid phone' };
    if (!cfg.token) return { ok: false, error: 'fonnte token missing' };

    try {
        const res = await fetchWithTimeout('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Authorization': cfg.token,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                target,
                message,
                ...(cfg.deviceId ? { device: cfg.deviceId } : {}),
                countryCode: cfg.countryCode || '62',
            }).toString(),
        });
        const json = await res.json().catch(() => ({}));
        // Fonnte returns { status: true, ... } on success
        const ok = res.ok && (json?.status === true || json?.detail === 'success');
        return { ok, providerStatus: res.status, providerResponse: json, error: ok ? undefined : json?.reason || `HTTP ${res.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

async function sendWablas(toPhone: string, message: string, cfg: { token: string; secret?: string; baseUrl?: string }): Promise<WaSendResult> {
    const phone = normalisePhone(toPhone);
    if (!phone) return { ok: false, error: 'invalid phone' };
    if (!cfg.token) return { ok: false, error: 'wablas token missing' };

    const base = (cfg.baseUrl || 'https://console.wablas.com').replace(/\/+$/, '');
    const auth = cfg.secret ? `${cfg.token}.${cfg.secret}` : cfg.token;

    try {
        const res = await fetchWithTimeout(`${base}/api/send-message`, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone, message }),
        });
        const json = await res.json().catch(() => ({}));
        // Wablas returns { status: true, ... } on success
        const ok = res.ok && (json?.status === true);
        return { ok, providerStatus: res.status, providerResponse: json, error: ok ? undefined : json?.message || `HTTP ${res.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

async function sendWebhook(toPhone: string, message: string, cfg: { url: string; headers?: Record<string, string>; method?: 'POST' | 'PUT' }, meta: any = {}): Promise<WaSendResult> {
    if (!cfg.url) return { ok: false, error: 'webhook url missing' };
    const phone = normalisePhone(toPhone);
    if (!phone) return { ok: false, error: 'invalid phone' };

    try {
        const res = await fetchWithTimeout(cfg.url, {
            method: cfg.method || 'POST',
            headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
            body: JSON.stringify({ phone, message, ...meta }),
        });
        const text = await res.text().catch(() => '');
        let json: any = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        return { ok: res.ok, providerStatus: res.status, providerResponse: json, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

export async function dispatchWaMessage(toPhone: string, message: string, cfg: WaProviderConfig, meta: any = {}): Promise<WaSendResult> {
    try {
        if (cfg.provider === 'fonnte') return await sendFonnte(toPhone, message, cfg);
        if (cfg.provider === 'wablas') return await sendWablas(toPhone, message, cfg);
        if (cfg.provider === 'webhook') return await sendWebhook(toPhone, message, cfg, meta);
        return { ok: false, error: 'unknown provider' };
    } catch (e: any) {
        logger.warn({ err: e?.message, provider: (cfg as any).provider }, 'wa dispatch unexpected error');
        return { ok: false, error: e?.message || String(e) };
    }
}
