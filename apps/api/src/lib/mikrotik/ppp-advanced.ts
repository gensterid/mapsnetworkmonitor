/**
 * MikroTik /ppp/* helpers that complete the surface billing.ts left
 * read-only or name-keyed:
 *
 *   - /ppp/profile/set + /remove                  (full CRUD)
 *   - /ppp/active/print + /remove by .id          (granular kick)
 *
 * Add/list for secrets and profiles already live in billing.ts and are
 * reused by the MikHMON routes — this file only adds what's missing.
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
// PPP Profile — extends billing.ts (add + list already there)
// ─────────────────────────────────────────────────────────────────────────

export interface PppProfileInput {
    name: string;
    rateLimit?: string;
    localAddress?: string;
    remoteAddress?: string;
    parentQueue?: string;
    addressList?: string;
    dnsServer?: string;
    onlyOne?: 'yes' | 'no' | 'default';
    comment?: string;
}

function profileToArgs(input: Partial<PppProfileInput>): string[] {
    const args: string[] = [];
    const push = (key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        args.push(`=${key}=${val}`);
    };
    push('name', input.name);
    push('rate-limit', input.rateLimit);
    push('local-address', input.localAddress);
    push('remote-address', input.remoteAddress);
    push('parent-queue', input.parentQueue);
    push('address-list', input.addressList);
    push('dns-server', input.dnsServer);
    push('only-one', input.onlyOne);
    push('comment', input.comment);
    return args;
}

export async function setPppProfile(api: any, id: string, input: Partial<PppProfileInput>): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ppp/profile/set', `=.id=${id}`, ...profileToArgs(input)]);
}

export async function removePppProfile(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ppp/profile/remove', `=.id=${id}`]);
}

// ─────────────────────────────────────────────────────────────────────────
// PPP Active sessions
// billing.ts has kickPppSession(name) which kicks ALL sessions of a user.
// We expose .id-targeted kick for the per-row UX in the Active page.
// ─────────────────────────────────────────────────────────────────────────

export interface PppActiveSession {
    id: string;
    name?: string;
    service?: string;
    callerId?: string;
    address?: string;
    uptime?: string;
    encoding?: string;
    sessionId?: string;
    limitBytesIn?: string;
    limitBytesOut?: string;
    radius?: boolean;
    comment?: string;
}

export async function listPppActive(api: any): Promise<PppActiveSession[]> {
    const result = await safeWrite(api, '/ppp/active/print');
    return result.map((s: any) => ({
        id: s['.id'],
        name: s.name,
        service: s.service,
        callerId: s['caller-id'],
        address: s.address,
        uptime: s.uptime,
        encoding: s.encoding,
        sessionId: s['session-id'],
        limitBytesIn: s['limit-bytes-in'],
        limitBytesOut: s['limit-bytes-out'],
        radius: toBool(s.radius),
        comment: s.comment,
    }));
}

export async function removePppActive(api: any, id: string): Promise<void> {
    if (!id) throw new Error('id wajib');
    await safeWrite(api, ['/ppp/active/remove', `=.id=${id}`]);
}
