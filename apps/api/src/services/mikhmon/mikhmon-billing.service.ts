/**
 * MikHMON Billing service — Phase A10.
 *
 * Three responsibilities, kept in one file because they share the
 * `mikhmon_profile_settings` table:
 *
 *  1. Profile settings CRUD (price + validity per (router, profile))
 *  2. Script Wizard — install MikHMON v3 standard on-login / on-logout
 *     scripts + master cleanup scheduler into a profile so vouchers
 *     auto-expire X time after FIRST LOGIN (MikHMON external behavior),
 *     not after X cumulative uptime (RouterOS limit-uptime semantic).
 *  3. Reports aggregator — read voucher users from MikroTik, join with
 *     stored prices, return sales/income/status breakdowns.
 *
 * Profile metadata is upserted by router_id + profile_name so the same
 * profile name on two different routers can have different prices.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { mikhmonProfileSettings } from '../../db/schema/mikhmon.js';
import { safeWrite } from '../../lib/mikrotik/connection.js';
import { setHotspotUserProfile } from '../../lib/mikrotik/hotspot-advanced.js';
import { logger } from '../../lib/logger.js';

// ─────────────────────────────────────────────────────────────────────────
// Profile settings CRUD
// ─────────────────────────────────────────────────────────────────────────

export interface ProfileSettingsInput {
    profileName: string;
    price?: number | string;
    validity?: string;
    lockUser?: boolean;
    sharedUsers?: number;
}

export async function listProfileSettings(routerId: string) {
    return db.select().from(mikhmonProfileSettings).where(eq(mikhmonProfileSettings.routerId, routerId));
}

export async function getProfileSetting(routerId: string, profileName: string) {
    const [row] = await db
        .select()
        .from(mikhmonProfileSettings)
        .where(and(
            eq(mikhmonProfileSettings.routerId, routerId),
            eq(mikhmonProfileSettings.profileName, profileName),
        ))
        .limit(1);
    return row || null;
}

export async function upsertProfileSetting(
    tenantId: string,
    routerId: string,
    input: ProfileSettingsInput,
) {
    if (!input.profileName?.trim()) throw new Error('profileName wajib');
    const existing = await getProfileSetting(routerId, input.profileName);

    const values = {
        tenantId,
        routerId,
        profileName: input.profileName,
        price: input.price !== undefined ? String(input.price) : undefined,
        validity: input.validity,
        lockUser: input.lockUser,
        sharedUsers: input.sharedUsers,
        updatedAt: new Date(),
    };

    if (existing) {
        const update: any = { updatedAt: new Date() };
        if (input.price !== undefined) update.price = String(input.price);
        if (input.validity !== undefined) update.validity = input.validity;
        if (input.lockUser !== undefined) update.lockUser = input.lockUser;
        if (input.sharedUsers !== undefined) update.sharedUsers = input.sharedUsers;
        await db.update(mikhmonProfileSettings).set(update).where(eq(mikhmonProfileSettings.id, existing.id));
        return { ...existing, ...update };
    }

    const [created] = await db.insert(mikhmonProfileSettings).values({
        tenantId,
        routerId,
        profileName: input.profileName,
        price: values.price ?? '0',
        validity: input.validity ?? null,
        lockUser: input.lockUser ?? false,
        sharedUsers: input.sharedUsers ?? 1,
    }).returning();
    return created;
}

export async function deleteProfileSetting(routerId: string, profileName: string) {
    await db.delete(mikhmonProfileSettings).where(and(
        eq(mikhmonProfileSettings.routerId, routerId),
        eq(mikhmonProfileSettings.profileName, profileName),
    ));
}

// ─────────────────────────────────────────────────────────────────────────
// Script Wizard
//
// MikHMON v3 voucher lifecycle uses scripts attached to the user profile:
//
//   on-login (first connect of a voucher):
//     - Read voucher comment to find expiry timestamp
//     - If user has no scheduler entry yet, create one that removes the
//       user at expiry time
//     - Optionally bind user to MAC (lock-user)
//     - Send a notice to the user's session (timeleft info)
//
//   on-logout:
//     - Log the logout time
//
// The master cleanup scheduler (`mikhmon-cleanup`) runs once a day to
// remove any vouchers whose expiry has passed but somehow weren't
// cleaned by their per-voucher scheduler (defensive sweep).
// ─────────────────────────────────────────────────────────────────────────

const MIKHMON_MARKER = '#mikhmon-managed';
const MASTER_SCHEDULER_NAME = 'mikhmon-cleanup';

/**
 * Build the on-login script body for a given validity string.
 * Format follows MikHMON v3 pattern with our own marker comment so the
 * Wizard can detect and refresh its own installations without clobbering
 * operator-written scripts that happen to share the same profile.
 */
function buildOnLoginScript(validity: string, lockUser: boolean): string {
    // Use `:put` for log visibility, then a :do block that:
    //  - Reads current user comment
    //  - If a per-user scheduler with name=$user doesn't exist, creates one
    //  - The scheduler's on-event removes the user (RouterOS auto-cleans
    //    its own scheduler row when the user is gone, via /system scheduler
    //    remove [find name=$user] after we delete the user)
    //
    // Time math uses :totime with adding seconds. We compute validity in
    // seconds upfront and embed it as a constant so the script doesn't
    // need to parse RouterOS time strings at runtime.
    const seconds = parseValidityToSeconds(validity);
    if (!seconds || seconds < 60) throw new Error(`validity '${validity}' tidak valid (min 1m)`);

    const lockMac = lockUser
        ? '/ip hotspot user set mac-address=$mac [find name=$user];'
        : '';

    return [
        MIKHMON_MARKER,
        ':local validitySeconds ' + seconds + ';',
        ':local now [/system clock get date];',
        ':local nowTime [/system clock get time];',
        ':local expSec ([:tonsec $nowTime] + $validitySeconds);',
        ':local expDate $now;',
        ':if ($expSec >= 86400) do={ :set expSec ($expSec - 86400); :set expDate ([:tostr ([:totime ([:tonsec $now] + 86400)])]); };',
        ':local expTime [:totime $expSec];',
        ':if ([:len [/system scheduler find name=$user]] = 0) do={',
        '  /system scheduler add name=$user start-date=$expDate start-time=$expTime ' +
        'on-event=("/ip hotspot user remove [find name=" . $user . "]; /system scheduler remove [find name=" . $user . "]");',
        '};',
        lockMac,
        ':put ("[MIKHMON] login " . $user . " exp:" . $expDate . " " . $expTime);',
    ].filter(Boolean).join('\n');
}

function buildOnLogoutScript(): string {
    return [
        MIKHMON_MARKER,
        ':put ("[MIKHMON] logout " . $user);',
    ].join('\n');
}

/**
 * Convert a RouterOS-style validity string to seconds.
 * Accepts forms like: "1d", "12h", "30m", "2h30m", "1d6h", "1w".
 */
export function parseValidityToSeconds(s: string): number {
    if (!s) return 0;
    const re = /(\d+)\s*([wdhms])/gi;
    let total = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        if (unit === 'w') total += n * 7 * 86400;
        else if (unit === 'd') total += n * 86400;
        else if (unit === 'h') total += n * 3600;
        else if (unit === 'm') total += n * 60;
        else if (unit === 's') total += n;
    }
    return total;
}

/**
 * Install or refresh the MikHMON-managed scripts on a hotspot user profile.
 * Idempotent — running twice with the same validity is a no-op upgrade.
 */
export async function installMikhmonScripts(
    api: any,
    profileId: string,
    profileName: string,
    validity: string,
    lockUser: boolean,
): Promise<void> {
    const onLogin = buildOnLoginScript(validity, lockUser);
    const onLogout = buildOnLogoutScript();
    await setHotspotUserProfile(api, profileId, {
        onLogin,
        onLogout,
    });

    // Ensure the master sweeper exists. It removes scheduler entries whose
    // start-date has passed but whose linked user was already deleted by
    // some other path (manual delete, kicked, etc).
    await ensureMasterScheduler(api);
    logger.info({ profileId, profileName, validity, lockUser }, '[MikHMON] scripts installed');
}

/**
 * Remove MikHMON-managed scripts from a profile (revert to operator-blank).
 * Only clears scripts that still carry the MIKHMON_MARKER, so operator
 * scripts are preserved.
 */
export async function uninstallMikhmonScripts(api: any, profileId: string): Promise<void> {
    const printed = await safeWrite(api, ['/ip/hotspot/user/profile/print', `?.id=${profileId}`]);
    const cur = printed?.[0];
    if (!cur) return;
    const update: any = {};
    if (typeof cur['on-login'] === 'string' && cur['on-login'].includes(MIKHMON_MARKER)) update.onLogin = '';
    if (typeof cur['on-logout'] === 'string' && cur['on-logout'].includes(MIKHMON_MARKER)) update.onLogout = '';
    if (Object.keys(update).length > 0) {
        await setHotspotUserProfile(api, profileId, update);
    }
}

async function ensureMasterScheduler(api: any): Promise<void> {
    const list = await safeWrite(api, ['/system/scheduler/print', `?name=${MASTER_SCHEDULER_NAME}`]);
    if (list?.length > 0) return;
    await safeWrite(api, [
        '/system/scheduler/add',
        `=name=${MASTER_SCHEDULER_NAME}`,
        '=start-time=startup',
        '=interval=1d',
        `=on-event=:foreach s in=[/system scheduler find ] do={ :local n [/system scheduler get $s name]; :if ([:len [/ip hotspot user find name=$n]] = 0 && $n != "${MASTER_SCHEDULER_NAME}") do={ /system scheduler remove $s; }; };`,
        `=comment=${MIKHMON_MARKER} master cleanup`,
    ]);
}

/**
 * Detect whether a profile already has MikHMON-managed scripts (used by
 * the UI to badge "MikHMON-managed" rows).
 */
export function isProfileMikhmonManaged(profile: any): boolean {
    const a = String(profile?.onLogin || profile?.['on-login'] || '');
    return a.includes(MIKHMON_MARKER);
}

/**
 * Parse MikHMON v3 configuration embedded as RouterOS `:local` variables
 * in a profile's on-login script.
 *
 * MikHMON external stores per-profile metadata (validity, price, sharing,
 * lock, mode, prefix, etc.) by writing them to the top of the on-login
 * script as :local declarations. This lets the config travel WITH the
 * profile on the router itself — operators who later switch routers /
 * browsers keep their setup. Example header MikHMON v3 emits:
 *
 *   :local validity "1d"
 *   :local sharing 1
 *   :local price "5000"
 *   :local sellingPrice "5000"
 *   :local userMode "vc"
 *   :local lockUser "Disable"
 *   :local nameLength 4
 *   :local prefix ""
 *   :local charType "lowcase"
 *   :local serverName ""
 *
 * Returns null when the script doesn't contain a recognizable MikHMON
 * config (so operator-written profiles aren't mis-identified).
 */
export interface ParsedMikhmonConfig {
    validity?: string;
    price?: number;
    sellingPrice?: number;
    sharing?: number;
    lockUser?: boolean;
    userMode?: string;
    nameLength?: number;
    prefix?: string;
    charType?: string;
    serverName?: string;
}

const MIKHMON_LOCAL_RE = /^\s*:local\s+(\w+)\s+(?:"([^"]*)"|(-?\d+(?:\.\d+)?)|(\S+))\s*;?\s*$/;

export function parseMikhmonProfileConfig(onLogin: string | undefined | null): ParsedMikhmonConfig | null {
    if (!onLogin || typeof onLogin !== 'string') return null;

    const found: Record<string, string> = {};
    for (const line of onLogin.split('\n')) {
        const m = MIKHMON_LOCAL_RE.exec(line);
        if (!m) continue;
        const key = m[1];
        const value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        found[key] = value;
    }

    // Heuristic: only treat as MikHMON config if at least one of the
    // distinctive keys is present. This avoids false positives on
    // operator scripts that happen to use :local for unrelated reasons.
    const hasCore = ['validity', 'price', 'sellingPrice', 'userMode', 'lockUser'].some((k) => k in found);
    if (!hasCore) return null;

    const parsedNum = (s: string | undefined): number | undefined => {
        if (s === undefined || s === null || s === '') return undefined;
        const n = parseFloat(String(s).replace(/,/g, ''));
        return Number.isFinite(n) ? n : undefined;
    };
    const parsedInt = (s: string | undefined): number | undefined => {
        if (s === undefined || s === null || s === '') return undefined;
        const n = parseInt(String(s), 10);
        return Number.isFinite(n) ? n : undefined;
    };

    return {
        validity: found.validity || undefined,
        price: parsedNum(found.price),
        sellingPrice: parsedNum(found.sellingPrice),
        sharing: parsedInt(found.sharing),
        // MikHMON v3 stores "Enable" / "Disable" strings
        lockUser: found.lockUser ? /enable|true|yes|1/i.test(found.lockUser) : undefined,
        userMode: found.userMode || undefined,
        nameLength: parsedInt(found.nameLength),
        prefix: found.prefix || undefined,
        charType: found.charType || undefined,
        serverName: found.serverName || undefined,
    };
}

/**
 * Merge stored DB settings with parsed-script fallback. DB always wins
 * when present — operators who explicitly set values via the ⚡ button
 * should not be overridden by an old MikHMON external script.
 */
export function mergeMikhmonProfileSettings(
    dbRow: any | null,
    parsed: ParsedMikhmonConfig | null,
) {
    const pickPrice = (a: any, b: any) => {
        const aHas = a !== null && a !== undefined && a !== '' && Number(a) > 0;
        return aHas ? a : (b ?? 0);
    };
    return {
        validity: dbRow?.validity ?? parsed?.validity ?? null,
        price: pickPrice(dbRow?.price, parsed?.sellingPrice ?? parsed?.price),
        sellingPrice: pickPrice(dbRow?.price, parsed?.sellingPrice ?? parsed?.price),
        sharedUsers: dbRow?.sharedUsers ?? parsed?.sharing ?? null,
        lockUser: dbRow?.lockUser ?? parsed?.lockUser ?? false,
        scriptsInstalled: !!dbRow?.scriptsInstalled,
        // From parser only — operator-side info
        userMode: parsed?.userMode ?? null,
        prefix: parsed?.prefix ?? null,
        charType: parsed?.charType ?? null,
        nameLength: parsed?.nameLength ?? null,
        serverName: parsed?.serverName ?? null,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Reports
//
// Aggregation is computed live from MikroTik hotspot users (filtered by
// the MikHMON v3 comment regex) plus the stored profile prices. We
// avoid persisting per-voucher rows in our DB so the source of truth
// stays MikroTik — operators can clean up MikroTik directly and the
// reports reflect it on next call.
// ─────────────────────────────────────────────────────────────────────────

const MIKHMON_VOUCHER_RE = /^\s*(?:.+?\s+)?(up|vc)-(\d{3})-(\d{2})\.(\d{2})\.(\d{2})-(.*)$/;

export interface VoucherSnapshot {
    name: string;
    profile: string;
    mode: 'vc' | 'up';
    note?: string;
    generatedAt: Date;
    uptime?: string;
    bytesIn?: string;
    bytesOut?: string;
    /** true when /system/scheduler still has the per-user expiry entry */
    hasExpiryScheduler: boolean;
    disabled: boolean;
}

async function loadVoucherSnapshot(api: any): Promise<VoucherSnapshot[]> {
    const [users, schedulers] = await Promise.all([
        safeWrite(api, '/ip/hotspot/user/print'),
        safeWrite(api, '/system/scheduler/print'),
    ]);
    const schedNames = new Set<string>((schedulers || []).map((s: any) => s.name));
    const out: VoucherSnapshot[] = [];
    for (const u of (users || [])) {
        const m = MIKHMON_VOUCHER_RE.exec(String(u.comment || '').trim());
        if (!m) continue;
        const [, mode, , mm, dd, yy, note] = m;
        const generatedAt = new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
        out.push({
            name: u.name,
            profile: u.profile,
            mode: (mode === 'up' ? 'up' : 'vc'),
            note: note?.trim() || undefined,
            generatedAt,
            uptime: u.uptime,
            bytesIn: u['bytes-in'],
            bytesOut: u['bytes-out'],
            hasExpiryScheduler: schedNames.has(u.name),
            disabled: u.disabled === 'true' || u.disabled === true,
        });
    }
    return out;
}

export interface ReportsSummary {
    total: number;
    unused: number;
    used: number;
    expired: number;
    income: number;
    by: { profile: string; count: number; income: number }[];
    byDay: { date: string; count: number; income: number }[];
}

function classifyStatus(v: VoucherSnapshot): 'unused' | 'used' | 'expired' {
    const hasUptime = v.uptime && v.uptime !== '0s' && v.uptime !== '00:00:00';
    if (!v.hasExpiryScheduler && hasUptime) return 'expired';
    if (hasUptime) return 'used';
    return 'unused';
}

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

export async function computeReports(
    api: any,
    routerId: string,
    range: { from?: Date; to?: Date } = {},
): Promise<ReportsSummary> {
    const [snapshot, prices, profilesRaw] = await Promise.all([
        loadVoucherSnapshot(api),
        db.select().from(mikhmonProfileSettings).where(eq(mikhmonProfileSettings.routerId, routerId)),
        safeWrite(api, '/ip/hotspot/user/profile/print'),
    ]);

    // Per-profile price lookup with the same merge rules as the UI:
    //   1. DB row price (operator explicitly set it via ⚡ button)
    //   2. Parsed `:local sellingPrice` from on-login script
    //   3. Parsed `:local price` from on-login script
    //   4. 0 if neither
    // This is how vouchers from a MikHMON external setup (where prices
    // live in the profile script) end up contributing real income to
    // the Reports tab without the operator having to re-enter them.
    const priceByProfile = new Map<string, number>();
    for (const row of profilesRaw || []) {
        const parsed = parseMikhmonProfileConfig(row['on-login']);
        const scriptPrice = parsed?.sellingPrice ?? parsed?.price ?? 0;
        if (scriptPrice > 0) priceByProfile.set(row.name, scriptPrice);
    }
    // DB rows override the script fallback
    for (const p of prices) {
        const v = parseFloat(String(p.price)) || 0;
        if (v > 0) priceByProfile.set(p.profileName, v);
    }

    const fromTs = range.from?.getTime() ?? 0;
    const toTs = range.to?.getTime() ?? Date.now() + 86400_000;

    const filtered = snapshot.filter((v) => {
        const t = v.generatedAt.getTime();
        return t >= fromTs && t <= toTs;
    });

    const summary: ReportsSummary = {
        total: filtered.length,
        unused: 0,
        used: 0,
        expired: 0,
        income: 0,
        by: [],
        byDay: [],
    };
    const byProfile = new Map<string, { count: number; income: number }>();
    const byDay = new Map<string, { count: number; income: number }>();

    for (const v of filtered) {
        const status = classifyStatus(v);
        summary[status]++;
        const price = priceByProfile.get(v.profile) || 0;

        // MikHMON external "Sold" semantic: income recognized at generation
        // time (operator already collected money for the voucher when it
        // was printed/sold), regardless of whether the end-user has
        // logged in yet. Matches MikHMON v3 Reports tab behavior.
        summary.income += price;

        const p = byProfile.get(v.profile) || { count: 0, income: 0 };
        p.count++;
        p.income += price;
        byProfile.set(v.profile, p);

        const day = ymd(v.generatedAt);
        const d = byDay.get(day) || { count: 0, income: 0 };
        d.count++;
        d.income += price;
        byDay.set(day, d);
    }

    summary.by = Array.from(byProfile.entries())
        .map(([profile, v]) => ({ profile, ...v }))
        .sort((a, b) => b.count - a.count);
    summary.byDay = Array.from(byDay.entries())
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return summary;
}
