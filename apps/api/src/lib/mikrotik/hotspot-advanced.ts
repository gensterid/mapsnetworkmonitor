/**
 * MikroTik /ip/hotspot/* CRUD helpers that the existing billing.ts didn't
 * cover (it only had hotspot user CRUD + read-only profile list). This
 * file owns the rest of the surface that MikHMON v3 exposes:
 *
 *   - /ip/hotspot/user/profile      (user profiles, full CRUD)
 *   - /ip/hotspot/profile           (server profiles, full CRUD)   [A6]
 *   - /ip/hotspot/walled-garden     (whitelist add/remove)         [A3]
 *   - /ip/hotspot/ip-binding        (MAC bypass, full CRUD)        [A3]
 *   - /ip/hotspot/cookie            (login cookie list/remove)     [A5]
 *   - /ip/hotspot/host              (live host table, read-only)   [A5]
 *
 * Phase A2 lands user-profile CRUD only. Later phases bolt on the rest.
 * All helpers expect an open RouterOS connection (`api`) and use the
 * same safeWrite wrapper as billing.ts to keep timeout/retry semantics
 * uniform.
 */
import { safeWrite } from './connection.js';

// ─────────────────────────────────────────────────────────────────────────
// Hotspot User Profile
// ─────────────────────────────────────────────────────────────────────────

export interface HotspotUserProfileFull {
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
    // MikHMON v3 also surfaces these — keep them in the wire model so
    // operators can read/write the same fields they used to in MikHMON
    macCookieTimeout?: string;
    addressPool?: string;
    parentQueue?: string;
    transparentProxy?: boolean;
    incomingFilter?: string;
    outgoingFilter?: string;
    incomingPacketMark?: string;
    outgoingPacketMark?: string;
    openStatusPage?: string;
    addMacCookie?: boolean;
    default?: boolean;       // RouterOS marks the built-in `default` profile
}

export interface HotspotUserProfileInput {
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
    macCookieTimeout?: string;
    addressPool?: string;
    parentQueue?: string;
    transparentProxy?: boolean;
    incomingFilter?: string;
    outgoingFilter?: string;
    incomingPacketMark?: string;
    outgoingPacketMark?: string;
    openStatusPage?: string;
    addMacCookie?: boolean;
}

const toBool = (v: any): boolean | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no') return false;
    return undefined;
};

function mapProfile(p: any): HotspotUserProfileFull {
    return {
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
        macCookieTimeout: p['mac-cookie-timeout'],
        addressPool: p['address-pool'],
        parentQueue: p['parent-queue'],
        transparentProxy: toBool(p['transparent-proxy']),
        incomingFilter: p['incoming-filter'],
        outgoingFilter: p['outgoing-filter'],
        incomingPacketMark: p['incoming-packet-mark'],
        outgoingPacketMark: p['outgoing-packet-mark'],
        openStatusPage: p['open-status-page'],
        addMacCookie: toBool(p['add-mac-cookie']),
        // RouterOS reports `default=true` flag for the built-in profile
        default: toBool(p['default']),
    };
}

/**
 * Build the `=key=value` argument array RouterOS expects. Only fields
 * with non-empty input are forwarded so that `set` doesn't accidentally
 * blank existing values when the form omits them. Booleans serialize to
 * 'yes'/'no' to match RouterOS conventions.
 */
function profileToArgs(input: Partial<HotspotUserProfileInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') {
            args.push(`=${key}=${val ? 'yes' : 'no'}`);
        } else {
            args.push(`=${key}=${val}`);
        }
    };

    push('name', input.name);
    push('shared-users', input.sharedUsers);
    push('rate-limit', input.rateLimit);
    push('session-timeout', input.sessionTimeout);
    push('idle-timeout', input.idleTimeout);
    push('keepalive-timeout', input.keepaliveTimeout);
    push('status-autorefresh', input.statusAutorefresh);
    push('on-login', input.onLogin);
    push('on-logout', input.onLogout);
    push('address-list', input.addressList);
    push('mac-cookie-timeout', input.macCookieTimeout);
    push('address-pool', input.addressPool);
    push('parent-queue', input.parentQueue);
    push('transparent-proxy', input.transparentProxy);
    push('incoming-filter', input.incomingFilter);
    push('outgoing-filter', input.outgoingFilter);
    push('incoming-packet-mark', input.incomingPacketMark);
    push('outgoing-packet-mark', input.outgoingPacketMark);
    push('open-status-page', input.openStatusPage);
    push('add-mac-cookie', input.addMacCookie);
    return args;
}

export async function listHotspotUserProfiles(api: any): Promise<HotspotUserProfileFull[]> {
    const result = await safeWrite(api, '/ip/hotspot/user/profile/print');
    return result.map(mapProfile);
}

export async function addHotspotUserProfile(api: any, input: HotspotUserProfileInput): Promise<string> {
    if (!input.name?.trim()) throw new Error('name wajib');
    const args = profileToArgs(input);
    const result = await safeWrite(api, ['/ip/hotspot/user/profile/add', ...args]);
    // RouterOS responds with [{ ret: '*XX' }] on add
    return result?.[0]?.ret || '';
}

export async function setHotspotUserProfile(
    api: any,
    id: string,
    input: Partial<HotspotUserProfileInput>,
): Promise<void> {
    if (!id) throw new Error('id wajib');
    const args = profileToArgs(input);
    // RouterOS .id starts with '*' — pass as-is
    await safeWrite(api, ['/ip/hotspot/user/profile/set', `=.id=${id}`, ...args]);
}

export async function removeHotspotUserProfile(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/user/profile/remove', `=.id=${id}`]);
}
