/**
 * MikHMON-native voucher generator.
 *
 * Writes vouchers directly to MikroTik /ip/hotspot/user with the MikHMON
 * v3 legacy comment format (`vc-NNN-mm.dd.yy-<note>`). This is the
 * SAME format MikHMON external emits, so the Billing app's
 * mikhmon-parser.ts picks them up automatically when the router is in
 * `hotspot_mode=mikhmon_bridge`.
 *
 * IMPORTANT: this service does NOT write to billing_vouchers. The path
 * is intentionally separate so MikHMON internal stays a drop-in
 * replacement for MikHMON external (same on-router state, same parser
 * downstream, no DB coupling). See plan FAQ Q1 for the full reasoning.
 */
import { safeWrite } from '../../lib/mikrotik/connection.js';
import { logger } from '../../lib/logger.js';

// ─────────────────────────────────────────────────────────────────────────
// Code generator
// ─────────────────────────────────────────────────────────────────────────

const CHARSETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    mix: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    num: '0123456789',
    alnum: 'abcdefghijklmnopqrstuvwxyz0123456789',
};

export type Charset = keyof typeof CHARSETS;

function randomChar(charset: string): string {
    return charset.charAt(Math.floor(Math.random() * charset.length));
}

function generateCode(opts: { length: number; charset: Charset; prefix?: string }): string {
    const cs = CHARSETS[opts.charset] || CHARSETS.num;
    let body = '';
    for (let i = 0; i < opts.length; i++) body += randomChar(cs);
    return (opts.prefix || '') + body;
}

/**
 * MikHMON v3 legacy comment date — mm.dd.yy of generation date.
 * Example: 06/06/2026 → "06.06.26".
 */
function mikhmonDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${pad(d.getFullYear() % 100)}`;
}

function mikhmonRand(): string {
    return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

// ─────────────────────────────────────────────────────────────────────────
// Generate
// ─────────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
    count: number;
    length: number;
    charset: Charset;
    prefix?: string;
    profile: string;
    server?: string;
    /**
     * UP mode (mikhmon "Username + Password" — two distinct strings),
     * versus VC mode (single voucher code used for both username and
     * password). Defaults to vc since that's MikHMON's default.
     */
    mode?: 'vc' | 'up';
    /** RouterOS limit-uptime · e.g. "1d", "12h", "30d". */
    limitUptime?: string;
    /** RouterOS limit-bytes-total · e.g. "5G". */
    limitBytesTotal?: string;
    /** Override the note that appears after the date in the comment. */
    noteOverride?: string;
    /** Optional comment prefix added BEFORE the mikhmon legacy block. */
    commentPrefix?: string;
}

export interface GeneratedVoucher {
    name: string;        // username on the router
    password: string;    // in vc mode = name
    comment: string;
    routerId: string;
    /** RouterOS .id returned by add (`*XXX`) */
    routerEntryId: string;
}

export async function generateMikhmonVouchers(
    api: any,
    routerId: string,
    opts: GenerateOptions,
): Promise<GeneratedVoucher[]> {
    const count = Math.max(1, Math.min(500, opts.count | 0));
    const length = Math.max(3, Math.min(20, opts.length | 0));
    const charset = (opts.charset && CHARSETS[opts.charset]) ? opts.charset : 'num';
    const mode = opts.mode === 'up' ? 'up' : 'vc';
    const today = new Date();
    const datePart = mikhmonDate(today);
    const note = (opts.noteOverride ?? opts.profile ?? '').trim();

    const created: GeneratedVoucher[] = [];
    const seenNames = new Set<string>();

    for (let i = 0; i < count; i++) {
        // Generate name (and password if up mode); retry on collision within batch
        let name = '';
        let password = '';
        for (let attempt = 0; attempt < 8; attempt++) {
            name = generateCode({ length, charset, prefix: opts.prefix });
            if (!seenNames.has(name)) break;
        }
        if (seenNames.has(name)) {
            // Extremely unlikely, but stop early if charset is too small
            logger.warn({ routerId, name }, '[MikHMON Voucher] collision after retries, aborting batch');
            break;
        }
        seenNames.add(name);
        password = mode === 'up' ? generateCode({ length, charset, prefix: '' }) : name;

        // MikHMON v3 comment: "[<prefix> ]<mode>-<rand3>-<mm.dd.yy>-<note>"
        const legacyBlock = `${mode}-${mikhmonRand()}-${datePart}-${note}`;
        const comment = opts.commentPrefix ? `${opts.commentPrefix} ${legacyBlock}` : legacyBlock;

        const args: string[] = [
            '/ip/hotspot/user/add',
            `=name=${name}`,
            `=password=${password}`,
            `=profile=${opts.profile}`,
            `=comment=${comment}`,
        ];
        if (opts.server) args.push(`=server=${opts.server}`);
        if (opts.limitUptime) args.push(`=limit-uptime=${opts.limitUptime}`);
        if (opts.limitBytesTotal) args.push(`=limit-bytes-total=${opts.limitBytesTotal}`);

        try {
            const result = await safeWrite(api, args);
            const routerEntryId = (result?.[0]?.ret as string) || '';
            created.push({ name, password, comment, routerId, routerEntryId });
        } catch (err: any) {
            // RouterOS rejects duplicate name — log + continue with next
            logger.warn({ routerId, name, err: err?.message }, '[MikHMON Voucher] add failed');
        }
    }

    return created;
}

// ─────────────────────────────────────────────────────────────────────────
// List + Remove (operates on hotspot users where comment matches MikHMON
// legacy pattern — gives operators a focused view of just the vouchers,
// separate from the regular hotspot user table)
// ─────────────────────────────────────────────────────────────────────────

const MIKHMON_LEGACY_RE = /^\s*(?:(.+?)\s+)?(up|vc)-(\d{3})-(\d{2})\.(\d{2})\.(\d{2})-(.*)$/;

export interface MikhmonVoucherView {
    id: string;
    name: string;
    password?: string;
    profile?: string;
    server?: string;
    mode: 'vc' | 'up';
    note?: string;
    generatedAt?: string;
    uptime?: string;
    limitUptime?: string;
    bytesIn?: string;
    bytesOut?: string;
    comment?: string;
    disabled?: boolean;
}

const toBool = (v: any): boolean => v === true || v === 'true' || v === 'yes';

export async function listMikhmonVouchers(api: any): Promise<MikhmonVoucherView[]> {
    const result = await safeWrite(api, '/ip/hotspot/user/print');
    const out: MikhmonVoucherView[] = [];
    for (const u of result) {
        const comment: string = u.comment || '';
        const m = MIKHMON_LEGACY_RE.exec(comment.trim());
        if (!m) continue; // skip non-voucher users
        const [, , mode, , mm, dd, yy, note] = m;
        const year = 2000 + parseInt(yy, 10);
        const generatedAt = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10)).toISOString();
        out.push({
            id: u['.id'],
            name: u.name,
            password: u.password,
            profile: u.profile,
            server: u.server,
            mode: (mode === 'up' ? 'up' : 'vc') as 'vc' | 'up',
            note: note?.trim() || undefined,
            generatedAt,
            uptime: u.uptime,
            limitUptime: u['limit-uptime'],
            bytesIn: u['bytes-in'],
            bytesOut: u['bytes-out'],
            comment,
            disabled: toBool(u.disabled),
        });
    }
    // Newest first (by generation date)
    out.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
    return out;
}

export async function removeMikhmonVoucher(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/user/remove', `=.id=${id}`]);
}
