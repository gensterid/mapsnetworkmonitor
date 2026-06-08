/**
 * MikHMON voucher template engine.
 *
 * Handlebars-style {{variable}} substitution — no code execution.
 * Operators copy MikHMON external templates and rewrite the <?= $var ?>
 * PHP placeholders to {{var}}; the rest of the HTML/CSS stays identical.
 *
 * Block helpers supported:
 *   {{#if name}}...{{/if}}    — render the inner block when name is truthy
 *   {{#unless name}}...{{/unless}} — render when name is falsy
 *   {{#eq a b}}...{{/eq}}     — render when a == b (string compare)
 *
 * Variables passed in by Cetak Cepat at render time:
 *   logo, hotspotname, username, password, validity, timelimit,
 *   datalimit, price, profile, comment, dnsname, qrcode, num, usermode
 *
 * Derived booleans for {{#if}}:
 *   usermode_vc — true when mode = "vc"
 *   usermode_up — true when mode = "up"
 *   has_logo, has_qr, has_validity, has_timelimit, has_datalimit, has_price
 */
import { eq, and } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '../../db/index.js';
import { mikhmonVoucherTemplates } from '../../db/schema/mikhmon.js';
import { logger } from '../../lib/logger.js';

export const DEFAULT_TEMPLATE_BODY = `<style>
.voucher { width: 230px; font-family: system-ui, sans-serif; border-collapse: collapse; }
.voucher td { padding: 2px 4px; vertical-align: middle; }
.voucher .price { font-weight: bold; border-right: 1px solid #000; text-align: center; }
.voucher .price span {
    -ms-writing-mode: tb-rl;
    -webkit-writing-mode: vertical-rl;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
}
.voucher .hotspotname { font-weight: bold; font-size: 11px; }
.voucher .code { font-weight: bold; font-size: 20px; text-align: center; letter-spacing: 1px; }
.voucher .userpass { font-weight: bold; font-size: 13px; text-align: center; line-height: 1.3; }
.voucher .meta { font-size: 9px; color: #555; }
.voucher .login { font-size: 9px; color: #777; }
.voucher .logo, .voucher .qr { width: 60px; height: 60px; object-fit: contain; }
</style>

<table class="voucher">
    <tbody>
        <tr>
            <td class="price" rowspan="4"><span>Rp {{price}}</span></td>
            <td class="hotspotname" colspan="2">{{hotspotname}}</td>
            {{#if has_qr}}
            <td rowspan="3"><img class="qr" src="{{qrcode}}" alt="qr" /></td>
            {{/if}}
            {{#unless has_qr}}
            {{#if has_logo}}
            <td rowspan="3"><img class="logo" src="{{logo}}" alt="logo" /></td>
            {{/if}}
            {{/unless}}
        </tr>
        <tr>
            {{#if usermode_vc}}
            <td class="code" colspan="2">{{username}}</td>
            {{/if}}
            {{#if usermode_up}}
            <td class="userpass" colspan="2">User: {{username}}<br/>Pass: {{password}}</td>
            {{/if}}
        </tr>
        <tr>
            <td class="meta" colspan="2">{{validity}} {{timelimit}} {{datalimit}}</td>
        </tr>
        <tr>
            <td class="login" colspan="3">Login: {{dnsname}} <span>[{{num}}]</span></td>
        </tr>
    </tbody>
</table>`;

export interface RenderVars {
    logo?: string;        // data: URL
    hotspotname?: string;
    username: string;
    password: string;
    validity?: string;
    timelimit?: string;
    datalimit?: string;
    price?: string | number;
    profile?: string;
    comment?: string;
    dnsname?: string;
    qrcode?: string;      // data: URL
    num?: number | string;
    usermode?: 'vc' | 'up';
}

/**
 * Format a RouterOS validity string ("1d", "12h") into a human label
 * matching MikHMON external convention.
 */
export function formatValidityLabel(v: string | null | undefined): string {
    if (!v) return '';
    const s = String(v).trim();
    const last = s.slice(-1);
    const num = s.slice(0, -1);
    if (last === 'd') return `Aktif:${num}Hari`;
    if (last === 'h') return `Aktif:${num}Jam`;
    if (last === 'm') return `Aktif:${num}Menit`;
    if (last === 'w') return `Aktif:${parseInt(num, 10) * 7}Hari`;
    return `Aktif:${s}`;
}

export function formatTimelimitLabel(v: string | null | undefined): string {
    if (!v) return '';
    const s = String(v).trim();
    const last = s.slice(-1);
    const num = s.slice(0, -1);
    if (last === 'd') return `Durasi:${num}Hari`;
    if (last === 'h') return `Durasi:${num}Jam`;
    if (last === 'm') return `Durasi:${num}Menit`;
    if (last === 'w') return `Durasi:${parseInt(num, 10) * 7}Hari`;
    return `Durasi:${s}`;
}

/**
 * Reverse the xss-style entity encoding the sanitize middleware used
 * to do on PUT bodies for this route. Templates saved before commit
 * 2fc899b have `&lt;style&gt;` literally — without this, those rows
 * render as visible CSS text.
 *
 * Safe in all directions: real `&amp;` becomes `&`, `&lt;` becomes `<`.
 * No double-unescape because all four entity forms produce raw chars
 * that won't match the entity regex again.
 */
function unescapeHtmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Render Handlebars-style template with the given vars. */
export function renderTemplate(bodyIn: string, varsRaw: RenderVars): string {
    // Defensive: unescape entities so legacy rows saved with escaped HTML
    // (before the sanitize-middleware bypass) still render correctly.
    const body = unescapeHtmlEntities(bodyIn);
    const vars: Record<string, any> = {
        ...varsRaw,
        usermode_vc: varsRaw.usermode === 'vc',
        usermode_up: varsRaw.usermode === 'up',
        has_logo: !!varsRaw.logo,
        has_qr: !!varsRaw.qrcode,
        has_validity: !!varsRaw.validity,
        has_timelimit: !!varsRaw.timelimit,
        has_datalimit: !!varsRaw.datalimit,
        has_price: !!varsRaw.price && String(varsRaw.price) !== '0',
    };

    let out = body;

    // {{#unless name}}...{{/unless}}
    out = out.replace(/\{\{#unless\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, name, inner) => {
        return vars[name] ? '' : inner;
    });

    // {{#if name}}...{{/if}}
    out = out.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, name, inner) => {
        return vars[name] ? inner : '';
    });

    // {{#eq a b}}...{{/eq}} — a is variable name, b is "literal" or number
    out = out.replace(/\{\{#eq\s+(\w+)\s+"?([^"\s}]+)"?\s*\}\}([\s\S]*?)\{\{\/eq\}\}/g,
        (_, name, val, inner) => String(vars[name]) === String(val) ? inner : '');

    // {{variable}}
    out = out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
        const v = vars[name];
        if (v == null) return '';
        return String(v);
    });

    return out;
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

export interface TemplateRow {
    id: string;
    name: string;
    body: string;
    qrEnabled: boolean;
    logoEnabled: boolean;
    logoFilename: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getTemplate(routerId: string, name = 'default'): Promise<TemplateRow | null> {
    const [row] = await db.select().from(mikhmonVoucherTemplates).where(
        and(
            eq(mikhmonVoucherTemplates.routerId, routerId),
            eq(mikhmonVoucherTemplates.name, name),
        ),
    ).limit(1);
    return row || null;
}

export async function getOrCreateDefaultTemplate(
    tenantId: string,
    routerId: string,
): Promise<TemplateRow> {
    const existing = await getTemplate(routerId, 'default');
    if (existing) return existing;
    const [created] = await db.insert(mikhmonVoucherTemplates).values({
        tenantId,
        routerId,
        name: 'default',
        body: DEFAULT_TEMPLATE_BODY,
        qrEnabled: true,
        logoEnabled: true,
    }).returning();
    return created;
}

export async function saveTemplate(
    tenantId: string,
    routerId: string,
    input: {
        name?: string;
        body: string;
        qrEnabled?: boolean;
        logoEnabled?: boolean;
        logoFilename?: string | null;
    },
): Promise<TemplateRow> {
    const name = input.name || 'default';
    const existing = await getTemplate(routerId, name);
    if (existing) {
        const [updated] = await db.update(mikhmonVoucherTemplates)
            .set({
                body: input.body,
                qrEnabled: input.qrEnabled ?? existing.qrEnabled,
                logoEnabled: input.logoEnabled ?? existing.logoEnabled,
                logoFilename: input.logoFilename !== undefined ? input.logoFilename : existing.logoFilename,
                updatedAt: new Date(),
            })
            .where(eq(mikhmonVoucherTemplates.id, existing.id))
            .returning();
        logger.info({ routerId, name }, '[MikHMON Template] updated');
        return updated;
    }
    const [created] = await db.insert(mikhmonVoucherTemplates).values({
        tenantId,
        routerId,
        name,
        body: input.body,
        qrEnabled: input.qrEnabled ?? true,
        logoEnabled: input.logoEnabled ?? true,
        logoFilename: input.logoFilename || null,
    }).returning();
    logger.info({ routerId, name }, '[MikHMON Template] created');
    return created;
}

export async function resetTemplate(
    tenantId: string,
    routerId: string,
    name = 'default',
): Promise<TemplateRow> {
    return saveTemplate(tenantId, routerId, {
        name,
        body: DEFAULT_TEMPLATE_BODY,
        qrEnabled: true,
        logoEnabled: true,
        logoFilename: null,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// QR code helper
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate a QR code as a data: URL. Default encodes the voucher username
 * (the actual login credential), but operators can override the payload
 * (e.g. encode a login URL with auto-fill).
 */
export async function generateQrDataUrl(payload: string): Promise<string> {
    return QRCode.toDataURL(payload, {
        margin: 1,
        scale: 4,
        errorCorrectionLevel: 'M',
    });
}
