/**
 * MikroTik /ip/* helpers for the MikHMON Console:
 *   - /ip/pool                       (CRUD)
 *   - /ip/dhcp-server/lease          (list + make-static + remove)
 *   - /ip/firewall/address-list      (CRUD)
 *
 * IP Pool feeds the PPP-profile + hotspot-profile dropdowns elsewhere.
 * DHCP Lease is a live view with the convert-to-static action that
 * MikHMON/Winbox both expose. Address List is the firewall building
 * block for isolir, walled garden, and other policy work.
 */
import { safeWrite } from './connection.js';

const toBool = (v: any): boolean | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no') return false;
    return undefined;
};

// ─────────────────────────────────────────────────────────────────────────
// IP Pool — /ip/pool
// ─────────────────────────────────────────────────────────────────────────

export interface IpPoolFull {
    id: string;
    name: string;
    ranges?: string;        // "10.0.0.10-10.0.0.250" (comma-separated for multi)
    nextPool?: string;      // chain to another pool when exhausted
    comment?: string;
}

export interface IpPoolInput {
    name: string;
    ranges: string;
    nextPool?: string;
    comment?: string;
}

function mapPool(p: any): IpPoolFull {
    return {
        id: p['.id'],
        name: p.name,
        ranges: p.ranges,
        nextPool: p['next-pool'],
        comment: p.comment,
    };
}

function poolToArgs(input: Partial<IpPoolInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        args.push(`=${key}=${val}`);
    };
    push('name', input.name);
    push('ranges', input.ranges);
    push('next-pool', input.nextPool);
    push('comment', input.comment);
    return args;
}

export async function listIpPools(api: any): Promise<IpPoolFull[]> {
    const result = await safeWrite(api, '/ip/pool/print');
    return result.map(mapPool);
}

export async function addIpPool(api: any, input: IpPoolInput): Promise<string> {
    if (!input.name?.trim()) throw new Error('name wajib');
    if (!input.ranges?.trim()) throw new Error('ranges wajib (mis. 10.0.0.10-10.0.0.250)');
    const result = await safeWrite(api, ['/ip/pool/add', ...poolToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setIpPool(api: any, id: string, input: Partial<IpPoolInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/pool/set', `=.id=${id}`, ...poolToArgs(input)]);
}

export async function removeIpPool(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/pool/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// DHCP Lease — /ip/dhcp-server/lease
//
// Lease list mixes static (operator-managed) and dynamic (assigned at
// runtime). Operators frequently "make-static" a dynamic lease to pin
// an IP to a known device; we expose that as a separate action.
// ─────────────────────────────────────────────────────────────────────────

export interface DhcpLeaseFull {
    id: string;
    address?: string;
    macAddress?: string;
    clientId?: string;
    hostname?: string;
    server?: string;
    status?: string;          // waiting / offered / bound / busy
    expiresAfter?: string;
    activeAddress?: string;
    activeMacAddress?: string;
    activeServer?: string;
    blocked?: boolean;
    dynamic?: boolean;
    disabled?: boolean;
    radius?: boolean;
    comment?: string;
}

export interface DhcpLeaseInput {
    address: string;
    macAddress?: string;
    clientId?: string;
    server?: string;
    comment?: string;
    blocked?: boolean;
    disabled?: boolean;
}

function mapLease(l: any): DhcpLeaseFull {
    return {
        id: l['.id'],
        address: l.address,
        macAddress: l['mac-address'],
        clientId: l['client-id'],
        hostname: l['host-name'],
        server: l.server,
        status: l.status,
        expiresAfter: l['expires-after'],
        activeAddress: l['active-address'],
        activeMacAddress: l['active-mac-address'],
        activeServer: l['active-server'],
        blocked: toBool(l.blocked),
        dynamic: toBool(l.dynamic),
        disabled: toBool(l.disabled),
        radius: toBool(l.radius),
        comment: l.comment,
    };
}

function leaseToArgs(input: Partial<DhcpLeaseInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('address', input.address);
    push('mac-address', input.macAddress);
    push('client-id', input.clientId);
    push('server', input.server);
    push('comment', input.comment);
    push('blocked', input.blocked);
    push('disabled', input.disabled);
    return args;
}

export async function listDhcpLeases(api: any): Promise<DhcpLeaseFull[]> {
    const result = await safeWrite(api, '/ip/dhcp-server/lease/print');
    return result.map(mapLease);
}

export async function addDhcpLease(api: any, input: DhcpLeaseInput): Promise<string> {
    if (!input.address?.trim()) throw new Error('address wajib');
    const result = await safeWrite(api, ['/ip/dhcp-server/lease/add', ...leaseToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setDhcpLease(api: any, id: string, input: Partial<DhcpLeaseInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/dhcp-server/lease/set', `=.id=${id}`, ...leaseToArgs(input)]);
}

/**
 * Convert a dynamic lease to static. RouterOS exposes this as the
 * make-static command. The lease's address+mac stays, but it's no
 * longer reassigned by the DHCP server.
 */
export async function makeDhcpLeaseStatic(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/dhcp-server/lease/make-static', `=.id=${id}`]);
}

export async function removeDhcpLease(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/dhcp-server/lease/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// Address List — /ip/firewall/address-list
// ─────────────────────────────────────────────────────────────────────────

export interface AddressListFull {
    id: string;
    list?: string;            // group name (e.g. "isolir", "whitelist")
    address?: string;         // IP, CIDR, or range
    comment?: string;
    timeout?: string;
    dynamic?: boolean;
    disabled?: boolean;
    creationTime?: string;
}

export interface AddressListInput {
    list: string;
    address: string;
    comment?: string;
    timeout?: string;
    disabled?: boolean;
}

function mapAddressList(a: any): AddressListFull {
    return {
        id: a['.id'],
        list: a.list,
        address: a.address,
        comment: a.comment,
        timeout: a.timeout,
        dynamic: toBool(a.dynamic),
        disabled: toBool(a.disabled),
        creationTime: a['creation-time'],
    };
}

function addressListToArgs(input: Partial<AddressListInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (typeof val === 'boolean') args.push(`=${key}=${val ? 'yes' : 'no'}`);
        else args.push(`=${key}=${val}`);
    };
    push('list', input.list);
    push('address', input.address);
    push('comment', input.comment);
    push('timeout', input.timeout);
    push('disabled', input.disabled);
    return args;
}

export async function listAddressList(api: any): Promise<AddressListFull[]> {
    const result = await safeWrite(api, '/ip/firewall/address-list/print');
    return result.map(mapAddressList);
}

export async function addAddressList(api: any, input: AddressListInput): Promise<string> {
    if (!input.list?.trim()) throw new Error('list wajib');
    if (!input.address?.trim()) throw new Error('address wajib');
    const result = await safeWrite(api, ['/ip/firewall/address-list/add', ...addressListToArgs(input)]);
    return result?.[0]?.ret || '';
}

export async function setAddressList(api: any, id: string, input: Partial<AddressListInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/firewall/address-list/set', `=.id=${id}`, ...addressListToArgs(input)]);
}

export async function removeAddressList(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${id}`]);
}
