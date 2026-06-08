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
// Script Wizard — MikHMON v3 OS6/OS7 compatible template
//
// MikHMON v3 (laksa19 + community fork that supports both OS6 and OS7)
// implements voucher expiry via TWO cooperating mechanisms:
//
//   1. Per-profile on-login script — runs when ANY user under the profile
//      logs in. On first login (detected by comment prefix vc/up/empty),
//      computes expire date+time, rewrites user.comment to
//      "<expDate> <expTime> <mode>" where mode is "R" (Remove) or "N"
//      (Notice). For "& Record" variants, also writes a /system/script
//      ledger entry encoding the full transaction.
//
//   2. Three master /system/scheduler entries installed once per router:
//      - Expire-Monitor: runs every minute, scans all hotspot users
//        whose comment contains current year, parses comment as
//        "<date> <time> <mode>", and removes (mode=R) or sets
//        limit-uptime=1s + kicks (mode=N) users whose expire time
//        has passed.
//      - Reset-Expire-Monitor: on router startup, restores clock from
//        the expireMonitor certificate (so vouchers aren't wiped if the
//        router lost time during reboot).
//      - Reset-Expire-Monitor-Daily: removes the expireMonitor cert
//        once per day so it's recreated fresh.
//
// MikHMON external uses the `:put (",modeCode,price,validity,sellingPrice,
// ,lockUser,,mikhmon,version,");` header at the top of the on-login script
// as metadata storage. Our parser reads that header to display per-profile
// settings without needing a separate DB lookup.
//
// Comment format (after first login):
//   "<mmm/dd/yyyy> <HH:MM:SS> <R|N>"
//   example: "jul/06/2026 20:24:44 R"
//
// Ledger script name format (when mode = remc / ntfc):
//   "<date>-|-<time>-|-<user>-|-<price>-|-<address>-|-<mac>-|-<validity>-|-<profileName>-|-<originalComment>"
//   owner = "<mmm><yyyy>" (e.g. jul2026)
//   source = "<date>"
//   comment = "mikhmon"
// ─────────────────────────────────────────────────────────────────────────

// Legacy marker — kept so existing profiles installed under the old format
// are still recognized as MikHMON-managed for uninstall and update flows.
const MIKHMON_MARKER = '#mikhmon-managed';

// New marker — the `,mikhmon,` token inside the :put header. Profiles
// installed via the OS6/OS7 reference template carry this.
const MIKHMON_PUT_MARKER = ',mikhmon,';

// Legacy per-voucher cleanup sweeper from the OS6-only era. We still
// ensure it exists for backward compat — it'll clean orphan scheduler
// entries left over from old per-voucher schedulers when operators
// upgrade their script templates.
const MASTER_SCHEDULER_NAME = 'mikhmon-cleanup';

// Script version stamped into the :put header. Lets MikHMON external (or
// future versions of our app) detect what template generated the script.
const MIKHMON_SCRIPT_VERSION = '2603001';

// MikHMON v3 external uses these 4 mode names — we mirror them exactly.
// "& Record" suffix means: additionally write a ledger entry (/system
// script with comment="mikhmon") so the Reports tab can compute revenue.
export type ExpiredMode = 'Remove' | 'Notice' | 'Remove & Record' | 'Notice & Record';

// Mapping ExpiredMode → header code (used in :put metadata):
//   Remove           → "rem"   — no ledger, comment marker R
//   Remove & Record  → "remc"  — ledger written, comment marker R
//   Notice           → "ntf"   — no ledger, comment marker N
//   Notice & Record  → "ntfc"  — ledger written, comment marker N
function modeToHeaderCode(mode: ExpiredMode): string {
    if (mode === 'Remove & Record') return 'remc';
    if (mode === 'Notice') return 'ntf';
    if (mode === 'Notice & Record') return 'ntfc';
    return 'rem'; // 'Remove' default
}

function modeToMarker(mode: ExpiredMode): 'R' | 'N' {
    return (mode === 'Notice' || mode === 'Notice & Record') ? 'N' : 'R';
}

function modeRecordsLedger(mode: ExpiredMode): boolean {
    return mode === 'Remove & Record' || mode === 'Notice & Record';
}

export interface OnLoginOpts {
    validity: string;           // "1d", "12h", "30m" — RouterOS time string, embedded literal
    expiredMode: ExpiredMode;
    price: number;              // operator cost (baked into ledger name + :put header)
    sellingPrice: number;       // voucher selling price (in :put header, cross-referenced for income)
    sharing: number;            // shared-users default for this profile (display-only)
    lockUser: boolean;
    userMode: 'vc' | 'up';
    nameLength: number;
    prefix: string;
    charType: string;           // 'lowcase' | 'upcase' | 'mix' | 'numbers'
    serverName: string;         // hotspot server name (display only)
    limitUptime?: string;       // optional cumulative uptime — separate from validity
    profileName: string;        // RouterOS profile name (baked into ledger name)
}

// MikHMON v3 reference helper functions, embedded verbatim. They're declared
// inside the on-login script body and used to compute the expire date and
// (for OS7) convert ISO date format to mmm/dd/yyyy.
const HELPER_ITV =
    ':local itv do={:local getITV [:pic  $v 0 ([ :len $v ] - 1)]; :return $getITV;};';

const HELPER_NDAYS =
    ':local ndays do={:local mdays  {31;28;31;30;31;30;31;31;30;31;30;31}; :local months {"jan"=1;"feb"=2;"mar"=3;"apr"=4;"may"=5;"jun"=6;"jul"=7;"aug"=8;"sep"=9;"oct"=10;"nov"=11;"dec"=12}; :local monthr  {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"}; :local dd  [:tonum [:pick $date 4 6]]; :local yy [:tonum [:pick $date 7 11]]; :local month [:pick $date 0 3]; :local mm (:$months->$month); :set dd ($dd+$days); :local dm [:pick $mdays ($mm-1)]; :if ($mm=2 && (($yy&3=0 && ($yy/100*100 != $yy)) || $yy/400*400=$yy) ) do={ :set dm 29 }; :while ($dd>$dm) do={  :set dd ($dd-$dm);  :set mm ($mm+1);  :if ($mm>12) do={    :set mm 1;    :set yy ($yy+1);  }; :set dm [:pick $mdays ($mm-1)]; :if ($mm=2 &&  (($yy&3=0 && ($yy/100*100 != $yy)) || $yy/400*400=$yy) ) do={ :set dm 29 };}; :local res "$[:pick $monthr ($mm-1)]/"; :if ($dd<10) do={ :set res ($res."0") }; :set $res "$res$dd/$yy"; :return $res;};';

const HELPER_CONVERT =
    ':local convert do={:local monthr  {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"};:local dd [:pick $date 8 11];:local yy [:tonum [:pick $date 0 4]];:local mm [:tonum [:pick $date 5 7]];:local mmm "$[:pick $monthr ($mm-1)]";:local newdate "$mmm/$dd/$yy";:return $newdate;};';

/**
 * Build the on-login script using the MikHMON v3 OS6/OS7 reference template.
 *
 * The header `:put (",modeCode,price,validity,sellingPrice,,lockUser,,mikhmon,version,");`
 * stores per-profile metadata that both MikHMON external and our app
 * can parse back. The body computes expiry date+time on first login and
 * rewrites user.comment to "<expDate> <expTime> <R|N>". For modes ending
 * in "& Record", additionally writes a /system/script ledger entry that
 * the Reports tab reads to compute sales totals.
 *
 * First-login detection: comment prefix is "vc" or "up" (original voucher
 * tag) or empty (manual user). Subsequent logins skip the body because
 * comment then looks like "jul/06/2026 20:24:44 R".
 *
 * Date handling: OS7 returns ISO format (2026-07-06) which the embedded
 * `convert` helper turns into mmm/dd/yyyy so the rest of the script can
 * work uniformly. This is why the same template runs on both OS6 and OS7.
 *
 * NOTE: We intentionally do NOT create a per-voucher scheduler. The three
 * master schedulers installed by ensureExpireMonitorTrio() handle all
 * expiry by scanning user comments every minute. This is the architecture
 * MikHMON v3 OS6/OS7 reference uses.
 */
function buildOnLoginScript(opts: OnLoginOpts): string {
    const lock = opts.lockUser ? 'Enable' : 'Disable';
    const validity = opts.validity || '1d';
    const headerCode = modeToHeaderCode(opts.expiredMode);
    const marker = modeToMarker(opts.expiredMode);
    const recordLedger = modeRecordsLedger(opts.expiredMode);

    // :put metadata header. Field positions (split by comma):
    //   0: empty
    //   1: header mode code (rem | remc | ntf | ntfc)
    //   2: price (cost, also baked into ledger position 3)
    //   3: validity
    //   4: selling price (used for income calc in Reports)
    //   5: noexp marker for free-tier profiles (we omit — empty)
    //   6: lock user (Enable | Disable)
    //   7: empty
    //   8: "mikhmon" literal marker
    //   9: script version
    //  10: trailing empty
    const header = `:put (",${headerCode},${opts.price},${validity},${opts.sellingPrice},,${lock},,mikhmon,${MIKHMON_SCRIPT_VERSION},");`;

    // Notice mode uses [find where name="$user"] indirection in the
    // reference because $user can be the username (string) rather than an
    // .id reference. Remove mode uses $user directly. We follow the
    // reference exactly to stay byte-compatible.
    const userFindForGet = (marker === 'N')
        ? '[/ip hotspot user find where name="$user"]'
        : '$user';
    const userRefForSet = (marker === 'N')
        ? '[find where name="$user"]'
        : '$user';

    // Ledger line — only emitted for "& Record" modes. Separator is "-|-"
    // (not "-") so the parser can split unambiguously even when profile
    // name or comment contain "-".
    const ledgerCmd = recordLedger
        ? `/system script add name="$date-|-$time-|-$user-|-${opts.price}-|-$address-|-$mac-|-${validity}-|-${opts.profileName}-|-$comment" owner="$month$year" source="$date" comment="mikhmon"`
        : '';

    return [
        header,
        `:local mode "${marker}";`,
        '{',
        HELPER_ITV,
        HELPER_NDAYS,
        HELPER_CONVERT,
        '',
        `:local validity "${validity}";`,
        ':local date [ /system clock get date ];',
        'if ([:pick $date 4 5] = "-" and [:pick $date 7 8] = "-" ) do={:set date [$convert date=$date];} else={:set date $date;};',
        ':local year [ :pick $date 7 11 ];',
        ':local month [ :pick $date 0 3 ];',
        ':local time [ /system clock get time ];',
        `:local comment [/ip hotspot user get ${userFindForGet} comment];`,
        ':local ucode [:pic $comment 0 2];',
        ':if ($ucode = "vc" or $ucode = "up" or $comment = "") do={',
        '    :local days "";',
        '    :local ndate "";',
        '    :local ctime "";',
        '    :local getDT [:pic  $validity ([ :len $validity ] - 1) [ :len $validity ]];',
        '    :if ($getDT= "d") do={',
        '        :set days [$itv v=$validity];',
        '        :set ndate [$ndays date=$date days=$days ];',
        '        :set ctime $time;',
        '    };',
        '    :if ($getDT = "h" or $getDT = "m") do={',
        '        :local curt ([/system clock get time]+$validity);',
        '        :if ([:len $curt] > 8) do={',
        '            :set validity [:pic  $curt 0 ([ :len $curt ] - 8) ];',
        '            :set curt [:pic  $curt [ :len $validity ] [ :len $curt ] ];',
        '            :set days [$itv v=$validity];',
        '            :set ndate [$ndays date=$date days=$days ];',
        '            :set ctime $curt;',
        '        } else={',
        '            :set days 0;',
        '            :set ndate $date;',
        '            :set ctime $curt;',
        '        }',
        '    };',
        `    /ip hotspot user set ${userRefForSet} comment="$ndate $ctime $mode";`,
        recordLedger ? '    :local mac $"mac-address";' : '',
        recordLedger ? '    :local time [/system clock get time ];' : '',
        recordLedger ? `    ${ledgerCmd}` : '',
        lock === 'Enable' ? `    /ip hotspot user set ${userRefForSet} mac-address=$"mac-address";` : '',
        '}',
        '}',
    ].filter(Boolean).join('\n');
}

/**
 * Build the on-logout script — empty for the OS6/OS7 reference template.
 *
 * MikHMON v3 OS6/OS7 doesn't use on-logout for expiry tracking; the
 * Expire-Monitor scheduler handles everything by scanning comments.
 * We emit just the metadata marker so isProfileMikhmonManaged() can
 * still detect that this profile is under our management.
 */
function buildOnLogoutScript(): string {
    return MIKHMON_MARKER;
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
        profileName,
    });
    const onLogout = buildOnLogoutScript();
    await setHotspotUserProfile(api, profileId, {
        onLogin,
        onLogout,
    });

    // Install the three master schedulers that drive MikHMON v3 OS6/OS7
    // expiry behavior. Idempotent — skips if already present. Without
    // these, vouchers won't auto-expire.
    await ensureExpireMonitorTrio(api);

    // Legacy sweeper from old per-voucher scheduler era. Kept for
    // backward compat — cleans orphan scheduler entries that earlier
    // template versions left behind.
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
    const isMikhmon = (s: any) =>
        typeof s === 'string' && (s.includes(MIKHMON_MARKER) || s.includes(MIKHMON_PUT_MARKER));
    const update: any = {};
    if (isMikhmon(cur['on-login'])) update.onLogin = '';
    if (isMikhmon(cur['on-logout'])) update.onLogout = '';
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

// MikHMON v3 OS6/OS7 reference Expire-Monitor script. Runs every minute,
// scans hotspot users whose comment contains the current/prev/next year
// (filtering to MikHMON-managed users), parses comment as
// "<mmm/dd/yyyy> <HH:MM:SS> <R|N>", and either removes (R) or sets
// limit-uptime=1s + kicks (N) users whose expire time has passed.
//
// Uses a certificate named "expireMonitor" as a state/lock mechanism —
// the `unit` field stores "<status>#<startTime>#<userCount>#<lastTime>#<lastDate>#".
// This survives router reboots and prevents overlapping runs.
const EXPIRE_MONITOR_NAME = 'Expire-Monitor';
const RESET_EM_NAME = 'Reset-Expire-Monitor';
const RESET_EM_DAILY_NAME = 'Reset-Expire-Monitor-Daily';

// Verbatim from MikHMON v3 external (laksa19 community fork) version
// 2603001 — operators comparing scripts side-by-side via Winbox should
// see byte-identical content so there's no behavioral drift between
// MikHMON external and our app. Differences from the older 2601049 we
// previously embedded:
//   - cert unit has 4 fields (status#start#users#time#) instead of 5
//   - new validateTime helper repairs malformed time strings
//   - two-pass collect-then-act algorithm with do/on-error wrapper
//   - better N (notice) vs R (remove) split in logging
const EXPIRE_MONITOR_SCRIPT = `:local expMonVer 2603001; :local expireMonitor [/certificate find where name="expireMonitor"]; :if ([:len $expireMonitor] > 1) do={ /certificate remove [find where name="expireMonitor"] }; :delay 1; :if ([:len $expireMonitor] = 0) do={ /certificate add name="expireMonitor" unit="0#0#0#0#" days-valid=2 key-size=1024; :set expireMonitor [/certificate find where name="expireMonitor"] }; :local dateint do={ :local montharray ("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"); :local days [:pick $d 4 6]; :local month [:pick $d 0 3]; :local year [:pick $d 7 11]; :local monthint ([:find $montharray $month]); :local month ($monthint + 1); :if ([:len [:tostr $month]] = 1) do={ :local zero "0"; :return [:tonum ("$year$zero$month$days")] } else={ :return [:tonum ("$year$month$days")] } }; :local timeint do={ :local hours [:tonum [:pick $t 0 2]]; :local minutes [:tonum [:pick $t 3 5]]; :return ($hours * 60 + $minutes) }; :local convert do={ :local monthr {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"}; :local dd [:pick $date 8 11]; :local yy [:tonum [:pick $date 0 4]]; :local mm [:tonum [:pick $date 5 7]]; :local mmm "$[:pick $monthr ($mm-1)]"; :local newdate "$mmm/$dd/$yy"; :return $newdate }; :local getField do={ :local line $1; :local delimiter $2; :local index $3; :local start 0; :local end 0; :local count 0; :do { :set end [:find $line $delimiter $start]; :if ($end = -1) do={ :set end [:len $line] }; :if ($count = $index) do={ :return [:pick $line $start $end] }; :set start ($end + [:len $delimiter]); :set count ($count + 1) } while=($end < [:len $line]); :return "" }; :local validateTime do={ :if ([:pick $time 2 3] = ":" and [:pick $time 5 6] = ":") do={ :return $time } else={ :local anomaloustime [:pick $time 5 7]; :set anomaloustime "$anomaloustime:59:59"; :return $anomaloustime } }; :local date [/system clock get date]; :local ldate $date; :if ([:pick $date 4 5] = "-" and [:pick $date 7 8] = "-") do={ :set date [$convert date=$date] } else={ :set date $date }; :local time [/system clock get time]; :local today [$dateint d=$date]; :local curtime [$timeint t=$time]; :local tyear [:pick $date 7 11]; :local lyear ($tyear-1); :local nyear ($tyear+1); :local statusValue [/certificate get $expireMonitor unit]; :local status [:tonum [$getField $statusValue "#" 0]]; :local start [:tonum [$getField $statusValue "#" 1]]; :local checkUsers [:tonum [$getField $statusValue "#" 2]]; :local lastRun [$getField $statusValue "#" 3]; :if ([($curtime - $start)] > 9 and $status = 1) do={ /certificate set $expireMonitor unit="0#$curtime#$checkUsers#$time#"; :delay 0.2; :local schowner [/sys sch get [find name=Expire-Monitor] owner]; /sys scr job rem [find where owner=$schowner] }; do { :if ($status != 1) do={ :local userlogin [/ip hotspot user find where comment~"/$tyear" || comment~"/$lyear" || comment~"$tyear-" || comment~"$lyear-" || comment~"/$nyear" || comment~"$nyear-"]; :local totlogin 0; :local expId ""; :foreach i in=$userlogin do={ :local userinfo [/ip hotspot user get $i]; :local comment ($userinfo -> "comment"); :local expdate ""; :local exptime ""; :local gettime ""; :if ([:pick $comment 4 5] = "-" and [:pick $comment 7 8] = "-") do={ :set expdate [$convert date=[:pick $comment 0 10]]; :set gettime [:pick $comment 11 20]; :set gettime [$validateTime time=$gettime]; :set exptime [$timeint t=$gettime] } else={ :set expdate [:pick $comment 0 11]; :set gettime [:pick $comment 12 20]; :set gettime [$validateTime time=$gettime]; :set exptime [$timeint t=$gettime] }; :if ([:pick $expdate 3] = "/" and [:pick $expdate 6] = "/") do={ :set totlogin ([:tonum $totlogin] + 1); :local expd [$dateint d=$expdate]; :if (($expd < $today) or ($expd = $today and $exptime < $curtime)) do={ :local limit ($userinfo -> "limit-uptime"); :local name ($userinfo -> "name"); :local mode ""; :if ($limit != "00:00:01") do={ :if ([:pick $comment 21] = "N") do={ :set mode "N" } else={ :set mode "R" }; :set expId "$expId,$i|$name|$mode" } } } }; /log warning "checking $totlogin users login..."; /certificate set $expireMonitor unit="1#$curtime#$totlogin#$time#"; :set expId [:toarray $expId]; :local totExpId [:len $expId]; :delay 0.2; :local removed 0; :local expired 0; :if ($totExpId > 0) do={ :local expiredN ""; :local expiredR ""; /log warning "about to expire $totExpId user(s)..."; :foreach i in=$expId do={ :local user [$getField $i "|" 0]; :local name [$getField $i "|" 1]; :local mode [$getField $i "|" 2]; :if ($mode = "N") do={ [/ip hotspot user set limit-uptime=1s $user]; [/ip hotspot active remove [find where user=$name]]; :set expired ($expired + 1); :set expiredN "| $expired expired" } else={ :set removed ($removed + 1); [/ip hotspot user remove $user]; [/ip hotspot active remove [find where user=$name]]; :set expiredR "| $removed removed" } }; /log warning "expire monitor done! $expiredR $expiredN"; } else={ /log warning "expire monitor done! no expired users found"; }; /certificate set $expireMonitor unit="0#$curtime#$totlogin#$time#" } } on-error={ /certificate set $expireMonitor unit="0#$curtime#$checkUsers#$time#"; :delay 0.2; /log warning "expire monitor error."; }`;

const RESET_EM_SCRIPT = `:local certName "expireMonitor";:local data "";:do { :set data [/certificate get [find where name=$certName] unit] } on-error={:log warning ("restore-clock: cert $certName tidak ditemukan");:error "no-cert";};:if ([:len $data] = 0) do={ :log warning "restore-clock: field unit kosong"; :error "empty" };:local getField do={:local line $1; :local delimiter $2; :local index $3;:local start 0; :local end 0; :local count 0;:do {:set end [:find $line $delimiter $start];:if ($end = -1) do={ :set end [:len $line]; };:if ($count = $index) do={ :return [:pick $line $start $end]; };:set start ($end + [:len $delimiter]);:set count ($count + 1);} while=($end < [:len $line]);:return "";};:local time [$getField $data "#" 3];:local date [$getField $data "#" 4];:if ([:len $time] < 7 || [:len $date] < 8) do={:log warning ("restore-clock: format unit tidak valid: $data");:error "bad-format";};/system clock set time=$time date=$date;:log info ("restore-clock: clock diset dari cert -> time=$time date=$date");/system ntp client set enable=yes server=time.cloudflare.com;:delay 1; /certificate remove [find where name="expireMonitor"];`;

const RESET_EM_DAILY_SCRIPT = `/certificate remove [find where name="expireMonitor"];`;

async function findScheduler(api: any, name: string): Promise<any | null> {
    const list = await safeWrite(api, ['/system/scheduler/print', `?name=${name}`]);
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

// Bumping this string forces the next ensureExpireMonitorTrio() call to
// detect old installs and rewrite them with the new EXPIRE_MONITOR_SCRIPT.
// Must match the `:local expMonVer <N>` at the top of EXPIRE_MONITOR_SCRIPT.
const EXPIRE_MONITOR_VERSION = '2603001';

/**
 * Install the three MikHMON v3 OS6/OS7 master schedulers. Idempotent —
 * skips any that already exist AND are running the current version. If
 * an older Expire-Monitor is found (different :local expMonVer literal),
 * it's removed and recreated with the new script so operators upgrading
 * don't get stuck on stale behavior.
 *
 * Reset-Expire-Monitor and Reset-Expire-Monitor-Daily aren't versioned
 * the same way — their scripts are tiny and stable — so they're just
 * created if missing.
 */
async function ensureExpireMonitorTrio(api: any): Promise<void> {
    const existing = await findScheduler(api, EXPIRE_MONITOR_NAME);
    const currentVersionMarker = `:local expMonVer ${EXPIRE_MONITOR_VERSION}`;
    const onEvent = String(existing?.['on-event'] || '');

    if (!existing) {
        await safeWrite(api, [
            '/system/scheduler/add',
            `=name=${EXPIRE_MONITOR_NAME}`,
            '=start-time=00:00:00',
            '=interval=00:01:00',
            `=on-event=${EXPIRE_MONITOR_SCRIPT}`,
            '=comment=mikhmon expire monitor',
        ]);
    } else if (!onEvent.includes(currentVersionMarker)) {
        // Older version present — replace with current.
        await safeWrite(api, ['/system/scheduler/remove', `=.id=${existing['.id']}`]);
        await safeWrite(api, [
            '/system/scheduler/add',
            `=name=${EXPIRE_MONITOR_NAME}`,
            '=start-time=00:00:00',
            '=interval=00:01:00',
            `=on-event=${EXPIRE_MONITOR_SCRIPT}`,
            '=comment=mikhmon expire monitor',
        ]);
        logger.info({ from: 'old', to: EXPIRE_MONITOR_VERSION }, '[MikHMON] Expire-Monitor upgraded');
    }

    if (!(await findScheduler(api, RESET_EM_NAME))) {
        await safeWrite(api, [
            '/system/scheduler/add',
            `=name=${RESET_EM_NAME}`,
            '=start-time=startup',
            '=interval=00:00:00',
            `=on-event=${RESET_EM_SCRIPT}`,
            '=comment=mikhmon clock restore on boot',
        ]);
    }
    if (!(await findScheduler(api, RESET_EM_DAILY_NAME))) {
        await safeWrite(api, [
            '/system/scheduler/add',
            `=name=${RESET_EM_DAILY_NAME}`,
            '=start-time=00:00:00',
            '=interval=1d 00:00:00',
            `=on-event=${RESET_EM_DAILY_SCRIPT}`,
            '=comment=mikhmon daily cert cleanup',
        ]);
    }
}

/**
 * Explicitly install the Expire-Monitor trio. Exposed for the setup
 * endpoint so operators can install schedulers without touching profiles.
 */
export async function installExpireMonitor(api: any): Promise<void> {
    await ensureExpireMonitorTrio(api);
}

/**
 * Delete all sales ledger entries (`/system script` with comment="mikhmon")
 * for a given month-owner bucket. Mirrors MikHMON external "Hapus data
 * jun2026" button — wipes the month's history in one shot.
 *
 * Owner format: "<mmm><yyyy>" lowercase, e.g. "jun2026". Returns the
 * number of entries removed so the UI can confirm to the operator.
 */
export async function deleteSalesLedgerByOwner(api: any, ownerFilter: string): Promise<number> {
    if (!ownerFilter || !ownerFilter.trim()) throw new Error('ownerFilter wajib (mis. "jun2026")');
    const scripts: any[] = await safeWrite(api, ['/system/script/print']);
    const matches = (scripts || []).filter((s) => {
        if (String(s.comment || '').trim().toLowerCase() !== 'mikhmon') return false;
        return String(s.owner || '').toLowerCase() === ownerFilter.toLowerCase();
    });
    if (matches.length === 0) return 0;
    // RouterOS supports multi-id remove via comma-separated .id list.
    // Batch in groups of 100 to keep command length manageable.
    const ids = matches.map((s) => s['.id']).filter(Boolean);
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        await safeWrite(api, ['/system/script/remove', `=.id=${chunk.join(',')}`]);
    }
    logger.info({ ownerFilter, removed: ids.length }, '[MikHMON ledger] deleted by owner');
    return ids.length;
}

/**
 * Detect whether a profile already has MikHMON-managed scripts (used by
 * the UI to badge "MikHMON-managed" rows).
 *
 * Recognizes both the legacy marker (#mikhmon-managed) and the new OS6/OS7
 * reference marker (",mikhmon," literal inside the :put header).
 */
export function isProfileMikhmonManaged(profile: any): boolean {
    const a = String(profile?.onLogin || profile?.['on-login'] || '');
    return a.includes(MIKHMON_MARKER) || a.includes(MIKHMON_PUT_MARKER);
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

// MikHMON v3 OS6/OS7 :put header. Field positions split by comma (0-indexed):
//   0: empty       1: modeCode (rem|remc|ntf|ntfc|noexp variants)
//   2: price       3: validity     4: sellingPrice    5: noexp marker
//   6: lockUser    7: empty        8: "mikhmon"       9: version  10: trailing
//
// Examples seen in the wild (from user's reference):
//   :put (",remc,3500,1d,5000,,Disable,,mikhmon,2603001,");
//   :put (",,0,,,noexp,Disable,")                              ← free profile, short form
//   :put (",ntf,0,30d,0,,Disable,,mikhmon,2312005,");
const MIKHMON_PUT_RE = /:put\s*\(\s*"([^"]*)"\s*\)\s*;?/;

function headerCodeToExpiredMode(code: string | undefined): string | undefined {
    if (!code) return undefined;
    switch (code) {
        case 'remc': return 'Remove & Record';
        case 'rem':  return 'Remove';
        case 'ntfc': return 'Notice & Record';
        case 'ntf':  return 'Notice';
        default:     return undefined;
    }
}

export function parseMikhmonProfileConfig(onLogin: string | undefined | null): ParsedMikhmonConfig | null {
    if (!onLogin || typeof onLogin !== 'string') return null;

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

    // Try the new OS6/OS7 reference format first: :put (",modeCode,price,validity,sellingPrice,,lockUser,,mikhmon,version,");
    const putMatch = MIKHMON_PUT_RE.exec(onLogin);
    if (putMatch) {
        const inner = putMatch[1];
        // Treat as MikHMON only if "mikhmon" or "noexp" appears in the
        // header (so a stray :put in operator scripts isn't misparsed).
        if (inner.includes('mikhmon') || inner.includes('noexp')) {
            const fields = inner.split(',');
            // Free-tier profile (noexp) has short header — only 7 fields:
            //   "",,0,,,noexp,Disable,
            // No expiry, no ledger. Return minimal config.
            if (fields[5] === 'noexp') {
                return {
                    price: parsedNum(fields[2]),
                    lockUser: fields[6] ? /enable/i.test(fields[6]) : undefined,
                    expiredMode: undefined,
                };
            }
            return {
                price: parsedNum(fields[2]),
                validity: fields[3] || undefined,
                sellingPrice: parsedNum(fields[4]),
                lockUser: fields[6] ? /enable/i.test(fields[6]) : undefined,
                expiredMode: headerCodeToExpiredMode(fields[1]),
            };
        }
    }

    // Fall back to legacy :local declarations (older app-generated profiles).
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
        // Don't default to 'Remove' here — MikHMON external leaves the
        // Mode Kedaluwarsa column blank when no script is installed. We
        // want the table to mirror that exactly so operators can tell at
        // a glance which profiles still need configuring.
        expiredMode: dbRow?.expiredMode ?? parsed?.expiredMode ?? null,
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
    // 60s timeout — /ip/hotspot/user/print can hold thousands of voucher
    // users on busy routers and competes for the same MikroTik connection
    // as the ledger fetch. Default 30s is too tight when both endpoints
    // are hit concurrently from the Reports page.
    const [users, schedulers] = await Promise.all([
        safeWrite(api, '/ip/hotspot/user/print', 60_000),
        safeWrite(api, '/system/scheduler/print', 60_000),
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

/**
 * Normalize a RouterOS date string to ISO YYYY-MM-DD format.
 * Returns empty string for invalid input so caller can drop the entry.
 *
 * Used for date-range filtering via lexicographic string comparison
 * (avoids the timezone bugs we hit with Date.getTime() math on servers
 * not running in UTC).
 */
function normalizeEntryDate(date: string): string {
    const dt = String(date || '').trim();
    const m6 = /^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i.exec(dt);
    if (m6) {
        const moIdx = MONTH_NAMES_LOWER.indexOf(m6[1].toLowerCase());
        if (moIdx < 0) return '';
        const mm = String(moIdx + 1).padStart(2, '0');
        const dd = m6[2].padStart(2, '0');
        return `${m6[3]}-${mm}-${dd}`;
    }
    const m7 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
    if (m7) return dt;
    return '';
}

// MikHMON v3 OS6/OS7 reference uses "-|-" separator in /system script names
// because profile names and voucher comments contain "-". This parser tries
// "-|-" first (new format), then falls back to legacy "-" (old generator).
function parseScriptName(name: string): Omit<SalesEntry, 'owner' | 'scriptId' | 'timestamp'> | null {
    // New format with -|- separator
    if (name.includes('-|-')) {
        const parts = name.split('-|-');
        // Expected: [date, time, user, price, address, mac, validity, profile, comment(+rest)]
        if (parts.length >= 8) {
            const [date, time, username, priceStr, address, macAddress, validity, profile, ...commentParts] = parts;
            return {
                date,
                time,
                username,
                price: parseInt(priceStr, 10) || 0,
                address,
                macAddress,
                validity,
                profile,
                comment: commentParts.join('-|-'),
            };
        }
        return null;
    }

    // Legacy format with "-" separator (script entries from earlier generator).
    // Profile name and comment can contain "-", so anchor by structure:
    // date / time / user(no hyphen) / price(num) / IPv4 / MAC / validity / rest
    // and then split rest at "-vc-" or "-up-" marker.
    const re = /^([a-z]{3}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})-(\d{1,2}:\d{2}:\d{2})-([^-]+)-(\d+)-(\d{1,3}(?:\.\d{1,3}){3})-([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})-(\d+[wdhms](?:\d+[wdhms])*)-(.+)$/;
    const m = re.exec(name);
    if (!m) return null;
    const rest = m[8];

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
    // Fetch profiles in parallel — we cross-reference profile name → selling
    // price because the ledger script name bakes the per-voucher price at
    // position 3. MikHMON Reports shows whatever's in the profile's :put
    // header sellingPrice (falls back to the baked value when profile is
    // gone or has no selling price set).
    //
    // Always full-fetch — owner-side filter (?owner=jun2026) was observed
    // timing out after 30s on production routers with 11k+ scripts. The
    // router applies the filter LATE in the response pipeline so it costs
    // nearly as much as the full fetch but with a timeout ceiling.
    //
    // Two optimizations to make the full fetch reliable on big ledgers:
    //   1. .proplist=.id,name,owner,comment — trims response per entry to
    //      ~80 bytes (vs ~400 with source field). Cuts total payload 5x.
    //   2. timeout=120000 (2 min) — default safeWrite is 30s which isn't
    //      enough on a router with 11k+ scripts when it's busy. 2 minutes
    //      is generous enough to never block the Reports page unless
    //      something is genuinely wrong.
    let scripts: any[] = [];
    try {
        const proplist = '=.proplist=.id,name,owner,comment';
        scripts = await safeWrite(api, ['/system/script/print', proplist], 120_000);
        logger.info({ count: scripts?.length || 0 }, '[MikHMON ledger] full fetch');
    } catch (e: any) {
        logger.error({ err: e?.message || String(e) }, '[MikHMON ledger] fetch failed');
        scripts = [];
    }

    const profilesRaw: any[] = await safeWrite(api, '/ip/hotspot/user/profile/print');

    const sellingByProfile = new Map<string, number>();
    for (const p of profilesRaw || []) {
        const parsed = parseMikhmonProfileConfig(p['on-login']);
        const sell = parsed?.sellingPrice ?? parsed?.price ?? 0;
        if (sell > 0) sellingByProfile.set(p.name, sell);
    }

    const entries: SalesEntry[] = [];

    // String-based date filter avoids timezone bugs we hit with timestamp
    // math (server in +7 vs UTC date parsing). Frontend sends "YYYY-MM-DD"
    // and entry dates parse to that same format — direct lexicographic
    // comparison gives the right inclusive [from, to] window in local time.
    const fromYmd = opts.from ? opts.from.toISOString().slice(0, 10) : '';
    const toYmd = opts.to ? opts.to.toISOString().slice(0, 10) : '';

    // Per-stage drop counters so pm2 logs show where entries are getting
    // filtered out — comment-mismatch, owner-mismatch, parse-fail, date-invalid,
    // date-out-of-range.
    let dropComment = 0, dropOwner = 0, dropParse = 0, dropDate = 0, dropBadDate = 0;
    let sampleName = '';

    for (const s of scripts || []) {
        // JS-side filter: comment must be "mikhmon" (trimmed, case-insensitive).
        // Operator-written scripts that happen to have similar names but no
        // mikhmon comment are correctly skipped.
        if (String(s.comment || '').trim().toLowerCase() !== 'mikhmon') { dropComment++; continue; }

        const owner = String(s.owner || '');
        if (opts.ownerFilter && owner.toLowerCase() !== opts.ownerFilter.toLowerCase()) { dropOwner++; continue; }

        const nameStr = String(s.name || '');
        if (!sampleName) sampleName = nameStr;
        const parsed = parseScriptName(nameStr);
        if (!parsed) { dropParse++; continue; }

        // Convert entry's mmm/dd/yyyy or YYYY-MM-DD to a normalized
        // YYYY-MM-DD string for range comparison. If date doesn't match
        // either format, the entry is malformed — drop it (the previous
        // `if (ts && ...)` check let these slip through because ts was 0).
        const entryYmd = normalizeEntryDate(parsed.date);
        if (!entryYmd) { dropBadDate++; continue; }
        if (fromYmd && entryYmd < fromYmd) { dropDate++; continue; }
        if (toYmd && entryYmd > toYmd) { dropDate++; continue; }

        const ts = routerDateToTimestamp(parsed.date, parsed.time);

        // Override ledger's COST price with profile's SELLING price when known.
        // If the profile no longer exists (deleted by operator after sale),
        // fall back to whatever's in the ledger name.
        const sellingPrice = sellingByProfile.get(parsed.profile) ?? parsed.price;
        entries.push({
            ...parsed,
            price: sellingPrice,
            owner,
            scriptId: s['.id'] || '',
            timestamp: ts,
        });
    }

    entries.sort((a, b) => b.timestamp - a.timestamp);

    logger.info({
        fetched: scripts?.length || 0,
        kept: entries.length,
        dropped: { comment: dropComment, owner: dropOwner, parse: dropParse, badDate: dropBadDate, date: dropDate },
        rangeFrom: fromYmd, rangeTo: toYmd,
        sampleName: sampleName.slice(0, 200),
        ownerFilter: opts.ownerFilter,
    }, '[MikHMON ledger] parse summary');

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
