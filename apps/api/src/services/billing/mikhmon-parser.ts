/**
 * Mikhmon comment format parser.
 *
 * Mikhmon (https://github.com/laksa19/mikhmon) is a popular hotspot manager
 * for MikroTik. It is stateless on the PHP side — all per-user metadata is
 * stored in the `comment` field of `/ip hotspot user`. The format varies
 * slightly between Mikhmon versions but the canonical form is a sequence of
 * `key:value` pairs separated by ` `:
 *
 *     up:2026-04-30 12:00:00 ts:1714478400 vc:1d-100k bp:1d
 *
 * Common keys observed:
 *   up   — expire/up-to timestamp ("YYYY-MM-DD HH:MM:SS" local time)
 *   ts   — unix timestamp seconds
 *   vc   — voucher code / template tag (varies by user)
 *   bp   — billing period / package name
 *   on   — first login timestamp ("YYYY-MM-DD HH:MM:SS")
 *
 * Some scripts use a more terse format like `vc:1d / 100k` which we parse
 * as best-effort. Anything unrecognised is preserved in `extras`.
 */

export interface MikhmonComment {
    /** parsed expiry — earliest of `up` or `on + ttl` if both set */
    expiresAt: Date | null;
    /** first login timestamp if recorded */
    firstLoginAt: Date | null;
    /** voucher code / template marker (e.g. "1d-100k") */
    voucherCode: string | null;
    /** billing period / package marker (e.g. "1d", "monthly") */
    billingPeriod: string | null;
    /** keys we did not recognise — preserved verbatim */
    extras: Record<string, string>;
    /** the original raw comment string */
    raw: string;
}

const TS_KEYS = new Set(['up', 'on']);
const NUM_KEYS = new Set(['ts']);

/**
 * Parse a Mikhmon-style comment. Returns null when the input is empty,
 * otherwise always returns a result (with empty fields where not parseable).
 */
export function parseMikhmonComment(raw: string | null | undefined): MikhmonComment | null {
    if (!raw || typeof raw !== 'string' || raw.trim().length === 0) return null;

    const result: MikhmonComment = {
        expiresAt: null,
        firstLoginAt: null,
        voucherCode: null,
        billingPeriod: null,
        extras: {},
        raw,
    };

    // Tokenise: split on whitespace but keep "key:value" pairs intact.
    // Mikhmon uses single space as separator. Some user-generated comments
    // use "/" as separator inside values — we preserve those.
    const tokens = raw.trim().split(/\s+/);

    let pendingKey: string | null = null;
    for (const tok of tokens) {
        const idx = tok.indexOf(':');
        if (idx === -1) {
            // continuation of a multi-word value (e.g. "up:2026-04-30 12:00:00")
            if (pendingKey) {
                appendValue(result, pendingKey, tok);
            }
            continue;
        }
        const key = tok.slice(0, idx).toLowerCase();
        const value = tok.slice(idx + 1);
        applyKeyValue(result, key, value);
        // up/on values often span the next token (the time component) — track it
        pendingKey = TS_KEYS.has(key) ? key : null;
    }

    // Finalise extras → fill primary fields from extras when not set yet.
    if (!result.voucherCode && result.extras.vc) result.voucherCode = result.extras.vc;
    if (!result.billingPeriod && result.extras.bp) result.billingPeriod = result.extras.bp;

    return result;
}

function applyKeyValue(out: MikhmonComment, key: string, value: string): void {
    if (TS_KEYS.has(key)) {
        // first half of timestamp ("up:2026-04-30") — store now, append the time later.
        const target = key === 'up' ? 'expiresAt' : 'firstLoginAt';
        out[target] = parseDate(value);
        return;
    }
    if (NUM_KEYS.has(key)) {
        // ts:1714478400 — unix epoch
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) {
            // ts overrides expiresAt only if expiresAt is null
            if (!out.expiresAt) out.expiresAt = new Date(n * 1000);
        }
        return;
    }
    if (key === 'vc') { out.voucherCode = value; return; }
    if (key === 'bp') { out.billingPeriod = value; return; }
    out.extras[key] = value;
}

function appendValue(out: MikhmonComment, key: string, extra: string): void {
    // appending a time component "12:00:00" to a previously parsed date "2026-04-30"
    if (TS_KEYS.has(key)) {
        const target = key === 'up' ? 'expiresAt' : 'firstLoginAt';
        const cur = out[target];
        if (cur) {
            const merged = parseDate(`${cur.toISOString().slice(0, 10)} ${extra}`);
            if (merged) out[target] = merged;
        }
    }
}

function parseDate(value: string): Date | null {
    if (!value) return null;
    // Try ISO first, fall back to `YYYY-MM-DD HH:MM:SS` Mikhmon format.
    const direct = new Date(value);
    if (!isNaN(direct.getTime())) return direct;
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
        const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
        const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
        if (!isNaN(dt.getTime())) return dt;
    }
    return null;
}

/**
 * Build a Mikhmon-style comment from structured fields. Useful when the
 * native code path wants to remain interoperable with operators who later
 * switch back to Mikhmon.
 */
export function buildMikhmonComment(input: {
    expiresAt?: Date | null;
    firstLoginAt?: Date | null;
    voucherCode?: string | null;
    billingPeriod?: string | null;
    extras?: Record<string, string>;
}): string {
    const parts: string[] = [];
    if (input.expiresAt) parts.push(`up:${formatDate(input.expiresAt)} ts:${Math.floor(input.expiresAt.getTime() / 1000)}`);
    if (input.firstLoginAt) parts.push(`on:${formatDate(input.firstLoginAt)}`);
    if (input.voucherCode) parts.push(`vc:${input.voucherCode}`);
    if (input.billingPeriod) parts.push(`bp:${input.billingPeriod}`);
    if (input.extras) {
        for (const [k, v] of Object.entries(input.extras)) parts.push(`${k}:${v}`);
    }
    return parts.join(' ');
}

function formatDate(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
