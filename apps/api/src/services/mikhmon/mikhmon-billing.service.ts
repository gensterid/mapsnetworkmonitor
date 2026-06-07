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
    sellingPrice?: number | string;
    validity?: string;
    limitUptime?: string;
    expiredMode?: string;
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
        if (input.sellingPrice !== undefined) update.sellingPrice = String(input.sellingPrice);
        if (input.validity !== undefined) update.validity = input.validity;
        if (input.limitUptime !== undefined) update.limitUptime = input.limitUptime;
        if (input.expiredMode !== undefined) update.expiredMode = input.expiredMode;
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
        sellingPrice: input.sellingPrice !== undefined ? String(input.sellingPrice) : (values.price ?? '0'),
        validity: input.validity ?? null,
        limitUptime: input.limitUptime ?? null,
        expiredMode: input.expiredMode ?? 'Remove',
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

// MikHMON v3 external uses these 4 mode names — we mirror them exactly.
// "& Record" suffix means: additionally write a /log info entry when the
// voucher hits expiry, so the operator has a trail in the system log
// they can audit later.
export type ExpiredMode = 'Remove' | 'Notice' | 'Remove & Record' | 'Notice & Record';

export interface OnLoginOpts {
    validity: string;           // "1d", "12h", "30m" — RouterOS time string, embedded literal
    expiredMode: ExpiredMode;
    price: number;              // operator cost
    sellingPrice: number;       // voucher selling price
    sharing: number;            // shared-users default for this profile
    lockUser: boolean;
    userMode: 'vc' | 'up';
    nameLength: number;
    prefix: string;
    charType: string;           // 'lowcase' | 'upcase' | 'mix' | 'numbers'
    serverName: string;         // hotspot server name (display only)
    limitUptime?: string;       // optional cumulative uptime — separate from validity
}

/**
 * Build the on-login script in MikHMON v3 reference format.
 *
 * Why every single :local declaration: MikHMON external + our own
 * parseMikhmonProfileConfig look for these exact variable names in the
 * on-login script body to display the values back in the User Profile
 * table. Emitting them gives:
 *   - Roundtrip parser fix (the bug operator reported)
 *   - MikHMON external compatibility (operator can run external + ours
 *     side-by-side and see identical values)
 *
 * Why the first-login detection via "exp:" comment marker (not
 * scheduler-exists check): MikHMON v3 reference uses the comment as the
 * source of truth so a manually-recreated scheduler doesn't double-fire.
 * Our previous implementation checked /system scheduler find name=$user
 * which would skip subsequent logins after the scheduler already fired,
 * but missed the case where operator deleted the scheduler manually.
 *
 * The script body is intentionally readable RouterOS — no clever one-
 * liners — so operators inspecting it via Winbox can follow what's
 * happening.
 */
function buildOnLoginScript(opts: OnLoginOpts): string {
    const lock = opts.lockUser ? 'Enable' : 'Disable';
    const validity = opts.validity || '1d';

    // Runtime parser inside RouterOS — handles 1d / 12h / 30m / 2h30m
    const validityParser = `
  :local v $validity
  :local seconds 0
  :local i 0
  :local n ""
  :while ($i < [:len $v]) do={
    :local c [:pick $v $i]
    :if ([:typeof [:tonum $c]] = "num") do={ :set n ($n . $c) } else={
      :if ($c = "w") do={ :set seconds ($seconds + ([:tonum $n] * 604800)); :set n "" }
      :if ($c = "d") do={ :set seconds ($seconds + ([:tonum $n] * 86400)); :set n "" }
      :if ($c = "h") do={ :set seconds ($seconds + ([:tonum $n] * 3600)); :set n "" }
      :if ($c = "m") do={ :set seconds ($seconds + ([:tonum $n] * 60)); :set n "" }
      :if ($c = "s") do={ :set seconds ($seconds + [:tonum $n]); :set n "" }
    }
    :set i ($i + 1)
  }
  :if ($seconds = 0) do={ :set seconds 86400 }`;

    // Expiry computation — adds $seconds to current clock, derives
    // start-date and start-time for the scheduler. RouterOS :totime
    // wraps within 24h so we manually carry the day overflow.
    const expiryComputer = `
  :local now [/system clock get date]
  :local nowTime [/system clock get time]
  :local nowSec [:tonsec $nowTime]
  :local totalSec ($nowSec + $seconds)
  :local dayCarry 0
  :while ($totalSec >= 86400) do={ :set totalSec ($totalSec - 86400); :set dayCarry ($dayCarry + 1) }
  :local expTime [:totime $totalSec]
  :local expDate $now
  :if ($dayCarry > 0) do={
    :local mNames {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"}
    :local mDays {31;28;31;30;31;30;31;31;30;31;30;31}
    :local mm [:pick $now 0 3]
    :local dd [:tonum [:pick $now 4 6]]
    :local yyyy [:tonum [:pick $now 7 11]]
    :local mi 0
    :foreach idx,name in=$mNames do={ :if ($name = $mm) do={ :set mi $idx } }
    :local maxDays ($mDays->$mi)
    :if (($mi = 1) && (($yyyy % 4) = 0)) do={ :set maxDays 29 }
    :set dd ($dd + $dayCarry)
    :while ($dd > $maxDays) do={
      :set dd ($dd - $maxDays)
      :set mi ($mi + 1)
      :if ($mi >= 12) do={ :set mi 0; :set yyyy ($yyyy + 1) }
      :set maxDays ($mDays->$mi)
      :if (($mi = 1) && (($yyyy % 4) = 0)) do={ :set maxDays 29 }
    }
    :local ddStr [:tostr $dd]
    :if ([:len $ddStr] = 1) do={ :set ddStr ("0" . $ddStr) }
    :set expDate (($mNames->$mi) . "/" . $ddStr . "/" . [:tostr $yyyy])
  }
  :local expSec $totalSec`;

    return [
        MIKHMON_MARKER,
        ':put e',
        ':local content $""',
        `:local validity "${validity}"`,
        `:local sharing ${opts.sharing}`,
        `:local price "${opts.price}"`,
        `:local sellingPrice "${opts.sellingPrice}"`,
        `:local userMode "${opts.userMode}"`,
        `:local lockUser "${lock}"`,
        `:local expiredMode "${opts.expiredMode}"`,
        `:local nameLength ${opts.nameLength}`,
        `:local prefix "${opts.prefix}"`,
        `:local charType "${opts.charType}"`,
        `:local serverName "${opts.serverName}"`,
        opts.limitUptime ? `:local limitUptime "${opts.limitUptime}"` : ':local limitUptime ""',
        '',
        '# First-login detection — comment carries "exp:" marker once set',
        ':local userComment [/ip hotspot user get [find where name=$user] comment]',
        ':local firstLogin true',
        ':if ([:typeof $userComment] = "str") do={',
        '  :if ([:find $userComment "exp:"] >= 0) do={ :set firstLogin false }',
        '}',
        '',
        ':if ($firstLogin) do={',
        validityParser,
        expiryComputer,
        '',
        '  # MikHMON v3 sales ledger — write a /system script entry whose name encodes',
        '  # the full transaction (date-time-user-price-ip-mac-validity-profile-comment).',
        '  # Reports tab reads /system script print where comment="mikhmon" to render',
        '  # the sales report. Owner = "<mmm><yyyy>" (e.g. jun2026) for monthly grouping.',
        '  :local profName [/ip hotspot user get [find where name=$user] profile]',
        '  :local mmStr [:pick $now 0 3]',
        '  :local yyyyStr [:pick $now 7 11]',
        '  :local owner ($mmStr . $yyyyStr)',
        '  :local mac $"mac-address"',
        '  :local cmtTag $userComment',
        '  :if ([:typeof $cmtTag] != "str") do={ :set cmtTag "" }',
        '  :local ledgerName ($now . "-" . $nowTime . "-" . $user . "-" . $sellingPrice . "-" . $address . "-" . $mac . "-" . $validity . "-" . $profName . "-" . $cmtTag)',
        '  :do { /system script add name=$ledgerName owner=$owner comment="mikhmon" source=":nothing" } on-error={}',
        '',
        '  # Stamp expiry into user comment for next-time detection',
        '  /ip hotspot user set comment=("exp:" . $expDate . " " . $expTime . " ts:" . $expSec) [find where name=$user]',
        '',
        `  ${buildExpiredModeBranchBlock(opts.expiredMode)}`,
        '',
        '  :if ($lockUser = "Enable") do={',
        '    /ip hotspot user set mac-address=$"mac-address" [find where name=$user]',
        '  }',
        '}',
        '',
        ':put ("[MIKHMON] login " . $user)',
    ].join('\n');
}

/**
 * Returns the RouterOS block that handles voucher expiry depending on
 * the operator's chosen expiredMode. Called inside the firstLogin branch
 * of buildOnLoginScript.
 *
 *   Remove           — schedule a hard delete at expiry
 *   Notice           — only log; voucher stays but flagged in comment
 *   Notice & Remove  — both — adds a notice marker AND schedules removal
 */
function buildExpiredModeBranchBlock(mode: ExpiredMode): string {
    // Hard-delete scheduler: removes the user (and the scheduler itself)
    // when expiry passes.
    const removeScheduler = [
        '  :if ([:len [/system scheduler find name=$user]] = 0) do={',
        '    /system scheduler add name=$user start-date=$expDate start-time=$expTime ',
        '      on-event=("/ip hotspot user remove [find name=\\"" . $user . "\\"]; /system scheduler remove [find name=\\"" . $user . "\\"]")',
        '  }',
    ].join('\n  ');

    // Notice scheduler: kicks any active session + writes a notice-style
    // comment marker, but does NOT delete the user so they can re-login
    // (and the operator can see they were notified).
    const noticeScheduler = [
        '  :if ([:len [/system scheduler find name=$user]] = 0) do={',
        '    /system scheduler add name=$user start-date=$expDate start-time=$expTime ',
        '      on-event=(":local ac [/ip hotspot active find where user=\\"" . $user . "\\"]; :if ([:len $ac] > 0) do={ /ip hotspot active remove $ac }; /system scheduler remove [find name=\\"" . $user . "\\"]")',
        '  }',
        '  :local cmtn [/ip hotspot user get [find where name=$user] comment]',
        '  /ip hotspot user set comment=($cmtn . " notice:end") [find where name=$user]',
    ].join('\n  ');

    // & Record additionally writes a /log info entry on expiry — gives
    // the operator a searchable trail in /log print where topics=info.
    // Embedded as part of the on-event so it fires at the actual expiry
    // time, not at install time.
    const recordSuffix = ' :log info (\\"MIKHMON record \\" . $user . \\" expired sellingPrice:\\" . $sellingPrice);';
    const withRecord = (sched: string) => sched.replace(
        /on-event=\("/g,
        `on-event=("${recordSuffix.trim()} `,
    );

    if (mode === 'Notice') return noticeScheduler;
    if (mode === 'Notice & Record') return withRecord(noticeScheduler);
    if (mode === 'Remove & Record') return withRecord(removeScheduler);
    return removeScheduler; // 'Remove' default
}

/**
 * Build the on-logout script — appends last-logout timestamp to the user
 * comment for usage tracking. MikHMON external reads this to display
 * "last seen" info in the active sessions tab.
 *
 * Idempotent for repeated logouts: strips any prior `logout:` marker
 * before appending the new one, so the comment doesn't grow unbounded
 * across many sessions.
 */
function buildOnLogoutScript(): string {
    return [
        MIKHMON_MARKER,
        ':put e',
        ':local cur [/ip hotspot user get [find where name=$user] comment]',
        ':local stripped $cur',
        ':if ([:typeof $cur] = "str") do={',
        '  :local idx [:find $cur " logout:"]',
        '  :if ($idx >= 0) do={ :set stripped [:pick $cur 0 $idx] }',
        '}',
        ':local stamp ([/system clock get date] . " " . [/system clock get time])',
        '/ip hotspot user set comment=($stripped . " logout:" . $stamp) [find where name=$user]',
        ':put ("[MIKHMON] logout " . $user . " at " . $stamp)',
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

export interface InstallScriptsInput {
    validity: string;
    expiredMode?: ExpiredMode;
    price?: number;
    sellingPrice?: number;
    sharing?: number;
    lockUser?: boolean;
    userMode?: 'vc' | 'up';
    nameLength?: number;
    prefix?: string;
    charType?: string;
    serverName?: string;
    limitUptime?: string;
}

/**
 * Install or refresh the MikHMON-managed scripts on a hotspot user profile.
 *
 * Sanity-check validity first so the wizard fails early with a clean
 * error instead of writing a malformed script. The actual time math
 * happens inside RouterOS at login time using the embedded :local
 * validity string — we just validate the string here is parseable.
 */
export async function installMikhmonScripts(
    api: any,
    profileId: string,
    profileName: string,
    input: InstallScriptsInput,
): Promise<void> {
    const validity = (input.validity || '').trim();
    const seconds = parseValidityToSeconds(validity);
    if (!seconds || seconds < 60) throw new Error(`validity '${validity}' tidak valid (min 1m)`);

    const onLogin = buildOnLoginScript({
        validity,
        expiredMode: input.expiredMode || 'Remove',
        price: Number(input.price ?? 0),
        sellingPrice: Number(input.sellingPrice ?? input.price ?? 0),
        sharing: Number(input.sharing ?? 1),
        lockUser: !!input.lockUser,
        userMode: input.userMode || 'vc',
        nameLength: Number(input.nameLength ?? 4),
        prefix: input.prefix || '',
        charType: input.charType || 'lowcase',
        serverName: input.serverName || '',
        limitUptime: input.limitUptime || undefined,
    });
    const onLogout = buildOnLogoutScript();
    await setHotspotUserProfile(api, profileId, {
        onLogin,
        onLogout,
    });

    // Ensure the master sweeper exists. It removes scheduler entries whose
    // start-date has passed but whose linked user was already deleted by
    // some other path (manual delete, kicked, etc).
    await ensureMasterScheduler(api);
    logger.info({ profileId, profileName, validity, expiredMode: input.expiredMode }, '[MikHMON] scripts installed');
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
    expiredMode?: string;
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
        expiredMode: found.expiredMode || undefined,
        userMode: found.userMode || undefined,
        nameLength: parsedInt(found.nameLength),
        prefix: found.prefix || undefined,
        charType: found.charType || undefined,
        serverName: found.serverName || undefined,
    };
}

/**
 * Fallback parser for MikHMON forks that write profile metadata into
 * the profile's `comment` field instead of (or in addition to) the
 * on-login script. Common formats seen in the wild:
 *
 *   "1 | 5000 | catatan"                 — sharing | sellingPrice | note
 *   "validity:1d|price:5000|lock:no"     — key:value pipe list
 *   "1d | 5000"                          — validity | sellingPrice
 *
 * Returns the same ParsedMikhmonConfig shape so callers can treat it
 * the same as the on-login parser. Returns null when no recognizable
 * pattern is found.
 */
export function parseProfileCommentConfig(comment: string | undefined | null): ParsedMikhmonConfig | null {
    if (!comment || typeof comment !== 'string') return null;
    const trimmed = comment.trim();
    if (!trimmed) return null;

    const parsedNum = (s: string | undefined): number | undefined => {
        if (s === undefined || s === null || s === '') return undefined;
        const n = parseFloat(String(s).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const out: ParsedMikhmonConfig = {};

    // Try key:value pipe-list first (most explicit)
    const kvMatches = trimmed.matchAll(/(\w+)\s*:\s*([^|;,]+)/gi);
    let kvCount = 0;
    for (const m of kvMatches) {
        kvCount++;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'validity' || key === 'valid') out.validity = value;
        else if (key === 'price' || key === 'cost') out.price = parsedNum(value);
        else if (key === 'selling' || key === 'sellingprice' || key === 'sell' || key === 'jual') out.sellingPrice = parsedNum(value);
        else if (key === 'sharing' || key === 'shared') out.sharing = parseInt(value, 10) || undefined;
        else if (key === 'lock' || key === 'lockuser') out.lockUser = /enable|true|yes|1/i.test(value);
        else if (key === 'mode' || key === 'expiredmode') out.expiredMode = value;
    }
    if (kvCount >= 1 && (out.validity || out.price || out.sellingPrice)) return out;

    // Pipe-separated positional (sharing | sellingPrice | note) OR
    // (validity | sellingPrice). RouterOS profile name is the implicit
    // first column from caller, so positional starts at sharing.
    const parts = trimmed.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
        // Heuristic: if the FIRST part looks like a number (sharing) and the
        // SECOND looks numeric, treat as "sharing | sellingPrice"
        // If the FIRST has letter (e.g. "1d"), treat as "validity | sellingPrice"
        const a = parts[0];
        const b = parts[1];
        const aNum = parsedNum(a);
        const bNum = parsedNum(b);
        if (aNum !== undefined && bNum !== undefined && aNum < 100) {
            // sharing | sellingPrice | note
            out.sharing = parseInt(a, 10);
            out.sellingPrice = bNum;
        } else if (/^\d+[hdwms]/i.test(a) && bNum !== undefined) {
            out.validity = a;
            out.sellingPrice = bNum;
        }
        if (out.validity || out.sellingPrice) return out;
    }

    return null;
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
        limitUptime: dbRow?.limitUptime ?? null,
        expiredMode: dbRow?.expiredMode ?? parsed?.expiredMode ?? 'Remove',
        // Price = cost, sellingPrice = revenue. When operator only filled
        // one of them (legacy 0046 schema or single-input UI), use it as
        // both so the column displays meaningful values either way.
        price: pickPrice(dbRow?.price, parsed?.price ?? parsed?.sellingPrice),
        sellingPrice: pickPrice(
            dbRow?.sellingPrice && Number(dbRow.sellingPrice) > 0 ? dbRow.sellingPrice : dbRow?.price,
            parsed?.sellingPrice ?? parsed?.price,
        ),
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

    // Per-profile "selling price" (Harga Jual) lookup with merge rules:
    //   1. DB row selling_price (operator set via ⚡ / bulk import)
    //   2. DB row price (legacy when only one field was filled)
    //   3. Parsed from on-login `:local sellingPrice/price` (MikHMON variants
    //      that write to script)
    //   4. Parsed from profile.comment (MikHMON variants that write there)
    //   5. 0 if none
    // Reports income = SUM(sellingPrice across vouchers). Matches MikHMON
    // external "Sales Report" semantic.
    const priceByProfile = new Map<string, number>();
    for (const row of profilesRaw || []) {
        const fromScript = parseMikhmonProfileConfig(row['on-login']);
        const fromComment = parseProfileCommentConfig(row.comment);
        const scriptPrice = fromScript?.sellingPrice ?? fromScript?.price ?? 0;
        const commentPrice = fromComment?.sellingPrice ?? fromComment?.price ?? 0;
        const v = scriptPrice > 0 ? scriptPrice : commentPrice;
        if (v > 0) priceByProfile.set(row.name, v);
    }
    // DB rows override the script/comment fallback. Prefer selling_price;
    // fall back to price for rows created before 0047 migration that only
    // populated `price`.
    for (const p of prices) {
        const sell = parseFloat(String(p.sellingPrice ?? '0')) || 0;
        const cost = parseFloat(String(p.price ?? '0')) || 0;
        const v = sell > 0 ? sell : cost;
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

// ─────────────────────────────────────────────────────────────────────────
// Sales Ledger (MikHMON v3 reference behavior)
//
// MikHMON external (laksa19/Mikhmonv3) implements its "Laporan Penjualan"
// tab by reading /system script print where comment="mikhmon". Each entry
// has a name that encodes one voucher transaction:
//
//   <date>-<time>-<user>-<sellingPrice>-<ip>-<mac>-<validity>-<profile>-<originalComment>
//   ex: jun/01/2026-00:22:25-bmxfde7-5000-10.31.31.76-EA:17:B5:F4:26:14-1d-PAKET-1HARI-vc-288-05.17.26-
//
// Owner is "<mmm><yyyy>" (e.g. "jun2026") for monthly grouping.
// The script source is :nothing — the entry exists purely as a ledger
// record. Our on-login script emits this entry once per voucher first
// login (see buildOnLoginScript ledger block).
//
// We mirror this contract so operators who switch between our app and
// MikHMON external see identical Reports data — they share the same
// underlying ledger in RouterOS.
// ─────────────────────────────────────────────────────────────────────────

export interface SalesEntry {
    date: string;        // 'jun/01/2026' — raw RouterOS date string
    time: string;        // '00:22:25'
    username: string;
    price: number;
    address: string;
    macAddress: string;
    validity: string;
    profile: string;
    comment: string;     // original voucher comment (vc-NNN-mm.dd.yy-note)
    owner: string;       // 'jun2026' — the monthly group bucket
    scriptId: string;
    timestamp: number;   // unix ms — derived from date+time for client sort/filter
}

const MONTH_NAMES_LOWER = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function routerDateToTimestamp(date: string, time: string): number {
    // RouterOS 6 emits "jun/01/2026" / "00:22:25"
    // RouterOS 7 emits "2026-06-01" / "00:22:25"
    const dt = date.trim();
    let y = 0, mo = 0, d = 0;
    let m6 = /^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i.exec(dt);
    if (m6) {
        mo = MONTH_NAMES_LOWER.indexOf(m6[1].toLowerCase());
        d = parseInt(m6[2], 10);
        y = parseInt(m6[3], 10);
    } else {
        const m7 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
        if (!m7) return 0;
        y = parseInt(m7[1], 10);
        mo = parseInt(m7[2], 10) - 1;
        d = parseInt(m7[3], 10);
    }
    const tm = /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(time.trim());
    const hh = tm ? parseInt(tm[1], 10) : 0;
    const mm = tm ? parseInt(tm[2], 10) : 0;
    const ss = tm ? parseInt(tm[3], 10) : 0;
    return new Date(y, mo, d, hh, mm, ss).getTime();
}

// Script names contain hyphens within the profile (e.g. "PAKET-1HARI") and
// within the comment (e.g. "vc-288-05.17.26-"), so we can't naively split
// by "-". Strategy: anchor on the well-defined leading fields (date, time,
// username with no hyphens, numeric price, IPv4, MAC), then anchor on the
// voucher comment marker (^vc-|^up-) at the END, and treat everything in
// between as the profile name.
function parseScriptName(name: string): Omit<SalesEntry, 'owner' | 'scriptId' | 'timestamp'> | null {
    const datePart = /^([a-z]{3}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i.exec(name);
    if (!datePart) return null;
    const re = /^([a-z]{3}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})-(\d{1,2}:\d{2}:\d{2})-([^-]+)-(\d+)-(\d{1,3}(?:\.\d{1,3}){3})-([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})-(\d+[wdhms](?:\d+[wdhms])*)-(.+)$/;
    const m = re.exec(name);
    if (!m) return null;
    const rest = m[8];

    // Split rest into profile + comment. Comment starts at first occurrence
    // of "vc-" or "up-" prefix (MikHMON voucher format). If no such marker
    // exists, treat whole rest as profile with empty comment.
    let profile = rest;
    let comment = '';
    const cm = /-((?:vc|up)-\d+-\d{2}\.\d{2}\.\d{2}.*)$/.exec(rest);
    if (cm) {
        profile = rest.slice(0, cm.index);
        comment = cm[1];
    }

    return {
        date: m[1],
        time: m[2],
        username: m[3],
        price: parseInt(m[4], 10),
        address: m[5],
        macAddress: m[6],
        validity: m[7],
        profile,
        comment,
    };
}

export interface SalesReport {
    entries: SalesEntry[];
    total: number;          // total income (sum of price)
    countByProfile: { profile: string; count: number; income: number }[];
}

/**
 * Read the MikHMON v3 sales ledger from RouterOS.
 *
 * Pass `ownerFilter` like "jun2026" to scope to a single month; omit to
 * return all entries the ledger contains.
 */
export async function listSalesReport(
    api: any,
    opts: { ownerFilter?: string; from?: Date; to?: Date } = {},
): Promise<SalesReport> {
    const scripts: any[] = await safeWrite(api, ['/system/script/print', '?comment=mikhmon']);
    const entries: SalesEntry[] = [];
    const fromTs = opts.from?.getTime() ?? 0;
    const toTs = opts.to?.getTime() ?? Date.now() + 86_400_000;

    for (const s of scripts || []) {
        const owner = String(s.owner || '');
        if (opts.ownerFilter && owner.toLowerCase() !== opts.ownerFilter.toLowerCase()) continue;
        const parsed = parseScriptName(String(s.name || ''));
        if (!parsed) continue;
        const ts = routerDateToTimestamp(parsed.date, parsed.time);
        if (ts && (ts < fromTs || ts > toTs)) continue;
        entries.push({ ...parsed, owner, scriptId: s['.id'] || '', timestamp: ts });
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    let total = 0;
    const byProfile = new Map<string, { count: number; income: number }>();
    for (const e of entries) {
        total += e.price;
        const p = byProfile.get(e.profile) || { count: 0, income: 0 };
        p.count++;
        p.income += e.price;
        byProfile.set(e.profile, p);
    }
    const countByProfile = Array.from(byProfile.entries())
        .map(([profile, v]) => ({ profile, ...v }))
        .sort((a, b) => b.income - a.income);

    return { entries, total, countByProfile };
}
