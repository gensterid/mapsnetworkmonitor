import { safeWrite } from './connection.js';
import { logger } from '../logger.js';

/**
 * MikroTik billing-related CRUD helpers.
 *
 * - PPPoE secret management   (/ppp/secret)
 * - Hotspot user management   (/ip/hotspot/user)
 * - PPP profile listing       (/ppp/profile)
 * - Hotspot profile listing   (/ip/hotspot/user/profile)
 *
 * All helpers expect an opened RouterOS API connection (`api`) and will
 * throw on failure. Higher layers should catch and translate to typed
 * errors / Result objects.
 */

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface PppSecret {
    id: string;             // RouterOS .id, e.g. *1A
    name: string;
    service?: string;       // pppoe / pptp / l2tp / ovpn / sstp / any
    profile?: string;
    callerId?: string;
    password?: string;      // not always returned by RouterOS for security
    comment?: string;
    disabled: boolean;
    lastLoggedOut?: string;
}

export interface PppProfile {
    id: string;
    name: string;
    localAddress?: string;
    remoteAddress?: string;
    rateLimit?: string;
    parentQueue?: string;
    onlyOne?: string;
    comment?: string;
}

export interface HotspotUser {
    id: string;
    name: string;
    password?: string;
    profile?: string;
    server?: string;
    macAddress?: string;
    address?: string;
    email?: string;
    limitUptime?: string;
    limitBytesIn?: string;
    limitBytesOut?: string;
    limitBytesTotal?: string;
    bytesIn?: string;
    bytesOut?: string;
    uptime?: string;
    comment?: string;
    disabled: boolean;
}

export interface HotspotUserProfile {
    id: string;
    name: string;
    sharedUsers?: string;
    rateLimit?: string;
    sessionTimeout?: string;
    idleTimeout?: string;
    keepaliveTimeout?: string;
    statusAutorefresh?: string;
    onLogin?: string;
    onLogout?: string;
    addressList?: string;
}

const toBool = (v: any): boolean => v === true || v === 'true' || v === 'yes';

// ─────────────────────────────────────────────────────────────────────────
// PPP secret CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function getPppSecrets(api: any): Promise<PppSecret[]> {
    const result = await safeWrite(api, '/ppp/secret/print');
    return result.map((s: any) => ({
        id: s['.id'],
        name: s.name,
        service: s.service,
        profile: s.profile,
        callerId: s['caller-id'],
        password: s.password,
        comment: s.comment,
        disabled: toBool(s.disabled),
        lastLoggedOut: s['last-logged-out'],
    }));
}

export async function getPppSecretByName(api: any, name: string): Promise<PppSecret | null> {
    const result = await safeWrite(api, ['/ppp/secret/print', `?name=${name}`]);
    if (!result?.length) return null;
    const s = result[0];
    return {
        id: s['.id'],
        name: s.name,
        service: s.service,
        profile: s.profile,
        callerId: s['caller-id'],
        password: s.password,
        comment: s.comment,
        disabled: toBool(s.disabled),
        lastLoggedOut: s['last-logged-out'],
    };
}

export interface AddPppSecretInput {
    name: string;
    password: string;
    profile?: string;
    service?: string;
    comment?: string;
    disabled?: boolean;
}

export async function addPppSecret(api: any, input: AddPppSecretInput): Promise<string> {
    const args: string[] = ['/ppp/secret/add', `=name=${input.name}`, `=password=${input.password}`];
    if (input.profile) args.push(`=profile=${input.profile}`);
    if (input.service) args.push(`=service=${input.service}`);
    if (input.comment) args.push(`=comment=${input.comment}`);
    if (input.disabled) args.push(`=disabled=yes`);

    const result = await safeWrite(api, args);
    const id = (result?.[0]?.ret as string) || '';
    logger.info({ name: input.name, id }, 'Added PPP secret');
    return id;
}

export interface UpdatePppSecretInput {
    profile?: string;
    password?: string;
    service?: string;
    comment?: string;
    disabled?: boolean;
}

export async function updatePppSecret(api: any, id: string, input: UpdatePppSecretInput): Promise<void> {
    const args: string[] = ['/ppp/secret/set', `=.id=${id}`];
    if (input.profile !== undefined) args.push(`=profile=${input.profile}`);
    if (input.password !== undefined) args.push(`=password=${input.password}`);
    if (input.service !== undefined) args.push(`=service=${input.service}`);
    if (input.comment !== undefined) args.push(`=comment=${input.comment}`);
    if (input.disabled !== undefined) args.push(`=disabled=${input.disabled ? 'yes' : 'no'}`);
    await safeWrite(api, args);
}

export async function deletePppSecret(api: any, id: string): Promise<void> {
    await safeWrite(api, ['/ppp/secret/remove', `=.id=${id}`]);
}

/**
 * Disconnect any active PPP session for the given username so a profile change
 * (e.g. moving to isolir profile) takes effect immediately.
 */
export async function kickPppSession(api: any, name: string): Promise<void> {
    const active = await safeWrite(api, ['/ppp/active/print', `?name=${name}`]);
    for (const s of active) {
        if (s['.id']) {
            try { await safeWrite(api, ['/ppp/active/remove', `=.id=${s['.id']}`]); }
            catch (e: any) { logger.warn({ err: e?.message, name }, 'kick ppp session failed'); }
        }
    }
}

export async function getPppProfiles(api: any): Promise<PppProfile[]> {
    const result = await safeWrite(api, '/ppp/profile/print');
    return result.map((p: any) => ({
        id: p['.id'],
        name: p.name,
        localAddress: p['local-address'],
        remoteAddress: p['remote-address'],
        rateLimit: p['rate-limit'],
        parentQueue: p['parent-queue'],
        onlyOne: p['only-one'],
        comment: p.comment,
    }));
}

export interface AddPppProfileInput {
    name: string;
    rateLimit?: string;          // "256k/256k"
    localAddress?: string;
    remoteAddress?: string;       // pool name
    addressList?: string;         // address-list firewall (untuk redirect/walled garden)
    onlyOne?: 'yes' | 'no' | 'default';
    comment?: string;
}

export async function addPppProfile(api: any, input: AddPppProfileInput): Promise<string> {
    const args: string[] = ['/ppp/profile/add', `=name=${input.name}`];
    if (input.rateLimit) args.push(`=rate-limit=${input.rateLimit}`);
    if (input.localAddress) args.push(`=local-address=${input.localAddress}`);
    if (input.remoteAddress) args.push(`=remote-address=${input.remoteAddress}`);
    if (input.addressList) args.push(`=address-list=${input.addressList}`);
    if (input.onlyOne) args.push(`=only-one=${input.onlyOne}`);
    if (input.comment) args.push(`=comment=${input.comment}`);
    const result = await safeWrite(api, args);
    const id = (result?.[0]?.ret as string) || '';
    logger.info({ name: input.name, id }, 'Added PPP profile');
    return id;
}

// ─────────────────────────────────────────────────────────────────────────
// Isolir firewall redirect — detect + auto-create
// ─────────────────────────────────────────────────────────────────────────

export interface IsolirFirewallStatus {
    addressListPresent: boolean;
    natRedirectPresent: boolean;
    walledGardenPresent: boolean;
    redirectRules: any[];
}

/**
 * Inspect firewall to see if a working "isolir" walled-garden / redirect is
 * already configured. We look for:
 *   - any /ip firewall address-list with name "isolir"
 *   - any /ip firewall nat dst-nat rule whose comment contains "isolir"
 *   - walled-garden = filter rule that allows the billing host while
 *     blocking other forward
 */
export async function inspectIsolirFirewall(api: any, listName: string = 'isolir'): Promise<IsolirFirewallStatus> {
    const status: IsolirFirewallStatus = {
        addressListPresent: false,
        natRedirectPresent: false,
        walledGardenPresent: false,
        redirectRules: [],
    };

    try {
        const al = await safeWrite(api, ['/ip/firewall/address-list/print', `?list=${listName}`]);
        status.addressListPresent = Array.isArray(al) && al.length > 0;
    } catch { /* address-list missing = false */ }

    try {
        const natRules = await safeWrite(api, '/ip/firewall/nat/print');
        const matches = (natRules || []).filter((r: any) =>
            (r.comment || '').toLowerCase().includes(listName) ||
            (r['src-address-list'] === listName && r.action === 'dst-nat'));
        status.natRedirectPresent = matches.length > 0;
        status.redirectRules = matches;
    } catch { /* ignore */ }

    try {
        const filterRules = await safeWrite(api, '/ip/firewall/filter/print');
        status.walledGardenPresent = (filterRules || []).some((r: any) =>
            (r.comment || '').toLowerCase().includes(listName));
    } catch { /* ignore */ }

    return status;
}

export interface SetupIsolirFirewallInput {
    listName?: string;          // default "isolir"
    redirectIp: string;         // billing host IP, mis. 10.10.0.5
    redirectPort?: number;      // default 80
    /** kalau true, juga buat filter rule walled-garden (allow billing IP, drop sisanya) */
    addWalledGarden?: boolean;
}

export interface SetupIsolirFirewallResult {
    addressListId: string | null;
    natRedirectId: string | null;
    filterAllowId: string | null;
    filterDropId: string | null;
}

/**
 * Auto-create the firewall pieces needed for the isolir redirect to work.
 * Idempotent — if a piece already exists (matched by comment), we skip it.
 */
export async function setupIsolirFirewall(api: any, input: SetupIsolirFirewallInput): Promise<SetupIsolirFirewallResult> {
    const list = input.listName || 'isolir';
    const port = input.redirectPort || 80;
    const tag = `auto-billing-isolir`;
    const result: SetupIsolirFirewallResult = {
        addressListId: null, natRedirectId: null, filterAllowId: null, filterDropId: null,
    };

    // 1. Seed an empty address-list entry so the list exists. RouterOS only
    //    keeps lists alive while they have at least one entry. We use a
    //    placeholder so when no PPP user is currently isolir the list is
    //    still discoverable.
    try {
        const seeded = await safeWrite(api, ['/ip/firewall/address-list/print', `?list=${list}`, '?comment=' + tag]);
        if (!seeded?.length) {
            const r = await safeWrite(api, [
                '/ip/firewall/address-list/add',
                `=list=${list}`,
                '=address=127.255.255.254',
                `=comment=${tag} placeholder`,
            ]);
            result.addressListId = (r?.[0]?.ret as string) || null;
        }
    } catch (e: any) {
        logger.warn({ err: e?.message }, 'isolir setup: address-list seed failed (non-fatal)');
    }

    // 2. NAT dst-nat rule: redirect HTTP from isolir users to billing host
    try {
        const existing = await safeWrite(api, '/ip/firewall/nat/print');
        const has = (existing || []).find((r: any) =>
            r.action === 'dst-nat' &&
            r['src-address-list'] === list &&
            String(r['dst-port']) === String(port));
        if (!has) {
            const r = await safeWrite(api, [
                '/ip/firewall/nat/add',
                '=chain=dstnat',
                '=protocol=tcp',
                `=dst-port=${port}`,
                `=src-address-list=${list}`,
                '=action=dst-nat',
                `=to-addresses=${input.redirectIp}`,
                `=to-ports=${port}`,
                `=comment=${tag} redirect to billing page`,
            ]);
            result.natRedirectId = (r?.[0]?.ret as string) || null;
        }
    } catch (e: any) {
        logger.warn({ err: e?.message }, 'isolir setup: NAT add failed');
    }

    // 3. (Optional) walled-garden allow + drop. Without these, customers in
    //    isolir can still browse non-HTTP traffic (HTTPS, gaming, dll).
    if (input.addWalledGarden) {
        try {
            const filterRules = await safeWrite(api, '/ip/firewall/filter/print');

            const hasAllow = (filterRules || []).find((r: any) =>
                r.action === 'accept' &&
                r['src-address-list'] === list &&
                r['dst-address'] === input.redirectIp);
            if (!hasAllow) {
                const r = await safeWrite(api, [
                    '/ip/firewall/filter/add',
                    '=chain=forward',
                    '=action=accept',
                    `=src-address-list=${list}`,
                    `=dst-address=${input.redirectIp}`,
                    `=comment=${tag} allow billing host`,
                ]);
                result.filterAllowId = (r?.[0]?.ret as string) || null;
            }

            const hasDrop = (filterRules || []).find((r: any) =>
                r.action === 'drop' &&
                r['src-address-list'] === list);
            if (!hasDrop) {
                const r = await safeWrite(api, [
                    '/ip/firewall/filter/add',
                    '=chain=forward',
                    '=action=drop',
                    `=src-address-list=${list}`,
                    `=comment=${tag} drop other traffic`,
                ]);
                result.filterDropId = (r?.[0]?.ret as string) || null;
            }
        } catch (e: any) {
            logger.warn({ err: e?.message }, 'isolir setup: filter walled-garden add failed');
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot user CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function getHotspotUsers(api: any): Promise<HotspotUser[]> {
    const result = await safeWrite(api, '/ip/hotspot/user/print');
    return result.map(mapHotspotUser);
}

export async function getHotspotUserByName(api: any, name: string): Promise<HotspotUser | null> {
    const result = await safeWrite(api, ['/ip/hotspot/user/print', `?name=${name}`]);
    if (!result?.length) return null;
    return mapHotspotUser(result[0]);
}

function mapHotspotUser(u: any): HotspotUser {
    return {
        id: u['.id'],
        name: u.name,
        password: u.password,
        profile: u.profile,
        server: u.server,
        macAddress: u['mac-address'],
        address: u.address,
        email: u.email,
        limitUptime: u['limit-uptime'],
        limitBytesIn: u['limit-bytes-in'],
        limitBytesOut: u['limit-bytes-out'],
        limitBytesTotal: u['limit-bytes-total'],
        bytesIn: u['bytes-in'],
        bytesOut: u['bytes-out'],
        uptime: u.uptime,
        comment: u.comment,
        disabled: toBool(u.disabled),
    };
}

export interface AddHotspotUserInput {
    name: string;
    password: string;
    profile?: string;
    server?: string;
    limitUptime?: string;        // e.g. "1d", "12h"
    limitBytesTotal?: string;
    macAddress?: string;
    comment?: string;
    disabled?: boolean;
}

export async function addHotspotUser(api: any, input: AddHotspotUserInput): Promise<string> {
    const args: string[] = ['/ip/hotspot/user/add', `=name=${input.name}`, `=password=${input.password}`];
    if (input.profile) args.push(`=profile=${input.profile}`);
    if (input.server) args.push(`=server=${input.server}`);
    if (input.limitUptime) args.push(`=limit-uptime=${input.limitUptime}`);
    if (input.limitBytesTotal) args.push(`=limit-bytes-total=${input.limitBytesTotal}`);
    if (input.macAddress) args.push(`=mac-address=${input.macAddress}`);
    if (input.comment) args.push(`=comment=${input.comment}`);
    if (input.disabled) args.push(`=disabled=yes`);

    const result = await safeWrite(api, args);
    return (result?.[0]?.ret as string) || '';
}

export interface UpdateHotspotUserInput {
    password?: string;
    profile?: string;
    limitUptime?: string;
    limitBytesTotal?: string;
    comment?: string;
    disabled?: boolean;
}

export async function updateHotspotUser(api: any, id: string, input: UpdateHotspotUserInput): Promise<void> {
    const args: string[] = ['/ip/hotspot/user/set', `=.id=${id}`];
    if (input.password !== undefined) args.push(`=password=${input.password}`);
    if (input.profile !== undefined) args.push(`=profile=${input.profile}`);
    if (input.limitUptime !== undefined) args.push(`=limit-uptime=${input.limitUptime}`);
    if (input.limitBytesTotal !== undefined) args.push(`=limit-bytes-total=${input.limitBytesTotal}`);
    if (input.comment !== undefined) args.push(`=comment=${input.comment}`);
    if (input.disabled !== undefined) args.push(`=disabled=${input.disabled ? 'yes' : 'no'}`);
    await safeWrite(api, args);
}

export async function deleteHotspotUser(api: any, id: string): Promise<void> {
    await safeWrite(api, ['/ip/hotspot/user/remove', `=.id=${id}`]);
}

/**
 * Force disconnect any active hotspot session for the user — used when
 * disabling, expiring, or changing the user's profile.
 */
export async function kickHotspotSession(api: any, name: string): Promise<void> {
    const active = await safeWrite(api, ['/ip/hotspot/active/print', `?user=${name}`]);
    for (const s of active) {
        if (s['.id']) {
            try { await safeWrite(api, ['/ip/hotspot/active/remove', `=.id=${s['.id']}`]); }
            catch (e: any) { logger.warn({ err: e?.message, name }, 'kick hotspot session failed'); }
        }
    }
}

export async function getHotspotUserProfiles(api: any): Promise<HotspotUserProfile[]> {
    const result = await safeWrite(api, '/ip/hotspot/user/profile/print');
    return result.map((p: any) => ({
        id: p['.id'],
        name: p.name,
        sharedUsers: p['shared-users'],
        rateLimit: p['rate-limit'],
        sessionTimeout: p['session-timeout'],
        idleTimeout: p['idle-timeout'],
        keepaliveTimeout: p['keepalive-timeout'],
        statusAutorefresh: p['status-autorefresh'],
        onLogin: p['on-login'],
        onLogout: p['on-logout'],
        addressList: p['address-list'],
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// MikroTik /system/scheduler — Mikhmon-compatible auto-expire
// ─────────────────────────────────────────────────────────────────────────

export interface SchedulerEntry {
    id: string;
    name: string;
    onEvent?: string;
    startTime?: string;
    interval?: string;
    comment?: string;
    disabled: boolean;
}

export async function getSchedulers(api: any): Promise<SchedulerEntry[]> {
    const result = await safeWrite(api, '/system/scheduler/print');
    return result.map((s: any) => ({
        id: s['.id'],
        name: s.name,
        onEvent: s['on-event'],
        startTime: s['start-time'],
        interval: s.interval,
        comment: s.comment,
        disabled: toBool(s.disabled),
    }));
}

export async function addScheduler(api: any, input: {
    name: string;
    onEvent: string;
    startTime?: string;
    startDate?: string;
    interval?: string;
    comment?: string;
    disabled?: boolean;
}): Promise<string> {
    const args: string[] = ['/system/scheduler/add', `=name=${input.name}`, `=on-event=${input.onEvent}`];
    if (input.startTime) args.push(`=start-time=${input.startTime}`);
    if (input.startDate) args.push(`=start-date=${input.startDate}`);
    if (input.interval) args.push(`=interval=${input.interval}`);
    if (input.comment) args.push(`=comment=${input.comment}`);
    if (input.disabled) args.push(`=disabled=yes`);
    const result = await safeWrite(api, args);
    return (result?.[0]?.ret as string) || '';
}

export async function deleteScheduler(api: any, id: string): Promise<void> {
    await safeWrite(api, ['/system/scheduler/remove', `=.id=${id}`]);
}
