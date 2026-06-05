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

// ─────────────────────────────────────────────────────────────────────────
// IP Binding — Phase A3
// ─────────────────────────────────────────────────────────────────────────

export type IpBindingType = 'regular' | 'bypassed' | 'blocked';

export interface IpBindingFull {
    id: string;
    macAddress?: string;
    address?: string;
    toAddress?: string;
    server?: string;
    type?: IpBindingType;
    comment?: string;
    disabled?: boolean;
    dynamic?: boolean;
    // Hits is computed by RouterOS for some firmware
    hits?: string;
}

export interface IpBindingInput {
    macAddress?: string;
    address?: string;
    toAddress?: string;
    server?: string;
    type: IpBindingType;
    comment?: string;
    disabled?: boolean;
}

function mapIpBinding(p: any): IpBindingFull {
    return {
        id: p['.id'],
        macAddress: p['mac-address'],
        address: p['address'],
        toAddress: p['to-address'],
        server: p['server'],
        type: p['type'] as IpBindingType,
        comment: p['comment'],
        disabled: toBool(p['disabled']),
        dynamic: toBool(p['dynamic']),
        hits: p['hits'],
    };
}

function ipBindingToArgs(input: Partial<IpBindingInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('mac-address', input.macAddress);
    push('address', input.address);
    push('to-address', input.toAddress);
    push('server', input.server);
    push('type', input.type);
    push('comment', input.comment);
    push('disabled', input.disabled);
    return args;
}

export async function listIpBindings(api: any): Promise<IpBindingFull[]> {
    const result = await safeWrite(api, '/ip/hotspot/ip-binding/print');
    return result.map(mapIpBinding);
}

export async function addIpBinding(api: any, input: IpBindingInput): Promise<string> {
    // RouterOS requires at least one of mac-address / address to identify the binding.
    if (!input.macAddress && !input.address) {
        throw new Error('Salah satu dari MAC address atau IP address wajib diisi');
    }
    if (!input.type) throw new Error('type wajib (regular | bypassed | blocked)');
    const result = await safeWrite(api, ['/ip/hotspot/ip-binding/add', ...ipBindingToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setIpBinding(api: any, id: string, input: Partial<IpBindingInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/ip-binding/set', `=.id=${id}`, ...ipBindingToArgs(input)]);
}

export async function removeIpBinding(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/ip-binding/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// Walled Garden — Phase A3
//
// RouterOS exposes two walled-garden tables. We focus on the L7/HTTP table
// (`/ip/hotspot/walled-garden`) which is what MikHMON shows by default and
// which most ISPs use to whitelist captive-portal-friendly domains (auth
// server, payment gateway, etc.). The IP-level table at
// `/ip/hotspot/walled-garden/ip` could be added later if needed.
// ─────────────────────────────────────────────────────────────────────────

export type WalledGardenAction = 'allow' | 'deny';

export interface WalledGardenFull {
    id: string;
    dstHost?: string;
    serverName?: string;
    path?: string;
    method?: string;
    action?: WalledGardenAction;
    comment?: string;
    disabled?: boolean;
    dynamic?: boolean;
    hits?: string;
}

export interface WalledGardenInput {
    dstHost?: string;
    serverName?: string;
    path?: string;
    method?: string;
    action?: WalledGardenAction;
    comment?: string;
    disabled?: boolean;
}

function mapWalledGarden(p: any): WalledGardenFull {
    return {
        id: p['.id'],
        dstHost: p['dst-host'],
        serverName: p['server'],
        path: p['path'],
        method: p['method'],
        action: p['action'] as WalledGardenAction,
        comment: p['comment'],
        disabled: toBool(p['disabled']),
        dynamic: toBool(p['dynamic']),
        hits: p['hits'],
    };
}

function walledGardenToArgs(input: Partial<WalledGardenInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('dst-host', input.dstHost);
    push('server', input.serverName);
    push('path', input.path);
    push('method', input.method);
    push('action', input.action);
    push('comment', input.comment);
    push('disabled', input.disabled);
    return args;
}

export async function listWalledGarden(api: any): Promise<WalledGardenFull[]> {
    const result = await safeWrite(api, '/ip/hotspot/walled-garden/print');
    return result.map(mapWalledGarden);
}

export async function addWalledGarden(api: any, input: WalledGardenInput): Promise<string> {
    if (!input.dstHost && !input.serverName && !input.path) {
        throw new Error('Minimal isi salah satu: dst-host, server, atau path');
    }
    const result = await safeWrite(api, ['/ip/hotspot/walled-garden/add', ...walledGardenToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function removeWalledGarden(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/walled-garden/remove', `=.id=${id}`]);
}

/**
 * Walled garden has add/remove only in MikHMON UI (no edit). RouterOS does
 * support `set` but operators usually delete + re-add to change a rule;
 * we still expose this in case the operator wants to toggle disabled flag.
 */
export async function setWalledGarden(api: any, id: string, input: Partial<WalledGardenInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/walled-garden/set', `=.id=${id}`, ...walledGardenToArgs(input)]);
}

// ─────────────────────────────────────────────────────────────────────────
// Active Sessions — Phase A5
//
// /ip/hotspot/active is the live login table. Read-only from operator's
// POV — sessions are kicked, not edited. We expose .id so the kick
// handler can target a single row even if the same user has multiple
// concurrent logins (shared-users > 1).
// ─────────────────────────────────────────────────────────────────────────

export interface HotspotActiveSession {
    id: string;
    user?: string;
    address?: string;          // IP address
    macAddress?: string;
    server?: string;
    uptime?: string;
    idleTime?: string;
    sessionTimeoutLeft?: string;
    keepaliveTimeout?: string;
    loginBy?: string;
    bytesIn?: string;
    bytesOut?: string;
    packetsIn?: string;
    packetsOut?: string;
    comment?: string;
}

export async function listHotspotActive(api: any): Promise<HotspotActiveSession[]> {
    const result = await safeWrite(api, '/ip/hotspot/active/print');
    return result.map((s: any) => ({
        id: s['.id'],
        user: s.user,
        address: s.address,
        macAddress: s['mac-address'],
        server: s.server,
        uptime: s.uptime,
        idleTime: s['idle-time'],
        sessionTimeoutLeft: s['session-time-left'],
        keepaliveTimeout: s['keepalive-timeout'],
        loginBy: s['login-by'],
        bytesIn: s['bytes-in'],
        bytesOut: s['bytes-out'],
        packetsIn: s['packets-in'],
        packetsOut: s['packets-out'],
        comment: s.comment,
    }));
}

/**
 * Kick a session by its .id. Differs from billing.ts's kickHotspotSession()
 * which kicks ALL sessions for a username — this targets a specific row,
 * matching the per-row trash icon UX on the Active page.
 */
export async function removeHotspotActive(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/active/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Hosts — Phase A5
//
// /ip/hotspot/host is RouterOS's running discovery table for every device
// that has been seen on the hotspot interface, regardless of login state.
// Purely informational — operators look here to chase MAC↔IP↔hostname
// trails when troubleshooting "kenapa device ini tidak konek".
// ─────────────────────────────────────────────────────────────────────────

export interface HotspotHost {
    id: string;
    macAddress?: string;
    address?: string;
    toAddress?: string;
    server?: string;
    hostname?: string;
    uptime?: string;
    idleTime?: string;
    bytesIn?: string;
    bytesOut?: string;
    authorized?: boolean;
    bypassed?: boolean;
    dhcp?: boolean;
    comment?: string;
}

export async function listHotspotHosts(api: any): Promise<HotspotHost[]> {
    const result = await safeWrite(api, '/ip/hotspot/host/print');
    return result.map((h: any) => ({
        id: h['.id'],
        macAddress: h['mac-address'],
        address: h.address,
        toAddress: h['to-address'],
        server: h.server,
        hostname: h['host-name'],
        uptime: h.uptime,
        idleTime: h['idle-time'],
        bytesIn: h['bytes-in'],
        bytesOut: h['bytes-out'],
        authorized: toBool(h.authorized),
        bypassed: toBool(h.bypassed),
        dhcp: toBool(h.dhcp),
        comment: h.comment,
    }));
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Cookies — Phase A5
//
// RouterOS persists a cookie per (MAC, user) pair after a successful
// login so the user is auto-recognized on next connect. Operators delete
// cookies when forcing a user back through the login portal.
// Read-only + remove only (no edit semantics on RouterOS side either).
// ─────────────────────────────────────────────────────────────────────────

export interface HotspotCookie {
    id: string;
    user?: string;
    macAddress?: string;
    domain?: string;
    expiresIn?: string;
}

export async function listHotspotCookies(api: any): Promise<HotspotCookie[]> {
    const result = await safeWrite(api, '/ip/hotspot/cookie/print');
    return result.map((c: any) => ({
        id: c['.id'],
        user: c.user,
        macAddress: c['mac-address'],
        domain: c.domain,
        expiresIn: c['expires-in'],
    }));
}

export async function removeHotspotCookie(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/cookie/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Server Profile — Phase A6
//
// `/ip/hotspot/profile` configures the captive-portal behavior of a
// hotspot server (login methods, HTML directory, RADIUS, MAC-format,
// HTTPS, etc.). One profile is referenced by N hotspot servers.
// ─────────────────────────────────────────────────────────────────────────

export interface HotspotServerProfileFull {
    id: string;
    name: string;
    hotspotAddress?: string;
    dnsName?: string;
    htmlDirectory?: string;
    rateLimit?: string;
    httpProxy?: string;
    smtpServer?: string;
    loginBy?: string;            // "cookie,http-chap,http-pap" csv
    macAuthMode?: string;
    useRadius?: boolean;
    splitUserDomain?: boolean;
    default?: boolean;
}

export interface HotspotServerProfileInput {
    name: string;
    hotspotAddress?: string;
    dnsName?: string;
    htmlDirectory?: string;
    rateLimit?: string;
    httpProxy?: string;
    smtpServer?: string;
    loginBy?: string;
    macAuthMode?: string;
    useRadius?: boolean;
    splitUserDomain?: boolean;
}

function mapServerProfile(p: any): HotspotServerProfileFull {
    return {
        id: p['.id'],
        name: p.name,
        hotspotAddress: p['hotspot-address'],
        dnsName: p['dns-name'],
        htmlDirectory: p['html-directory'],
        rateLimit: p['rate-limit'],
        httpProxy: p['http-proxy'],
        smtpServer: p['smtp-server'],
        loginBy: p['login-by'],
        macAuthMode: p['mac-auth-mode'],
        useRadius: toBool(p['use-radius']),
        splitUserDomain: toBool(p['split-user-domain']),
        default: toBool(p['default']),
    };
}

function serverProfileToArgs(input: Partial<HotspotServerProfileInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('name', input.name);
    push('hotspot-address', input.hotspotAddress);
    push('dns-name', input.dnsName);
    push('html-directory', input.htmlDirectory);
    push('rate-limit', input.rateLimit);
    push('http-proxy', input.httpProxy);
    push('smtp-server', input.smtpServer);
    push('login-by', input.loginBy);
    push('mac-auth-mode', input.macAuthMode);
    push('use-radius', input.useRadius);
    push('split-user-domain', input.splitUserDomain);
    return args;
}

export async function listHotspotServerProfiles(api: any): Promise<HotspotServerProfileFull[]> {
    const result = await safeWrite(api, '/ip/hotspot/profile/print');
    return result.map(mapServerProfile);
}

export async function addHotspotServerProfile(api: any, input: HotspotServerProfileInput): Promise<string> {
    if (!input.name?.trim()) throw new Error('name wajib');
    const result = await safeWrite(api, ['/ip/hotspot/profile/add', ...serverProfileToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setHotspotServerProfile(api: any, id: string, input: Partial<HotspotServerProfileInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/profile/set', `=.id=${id}`, ...serverProfileToArgs(input)]);
}

export async function removeHotspotServerProfile(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/hotspot/profile/remove', `=.id=${id}`]);
}
