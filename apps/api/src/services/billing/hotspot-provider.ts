import { db } from '../../db/index.js';
import { vouchers, subscriptions, billingRouterSettings } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { routerActionService } from '../router-action.service.js';
import {
    getHotspotUsers,
    addHotspotUser,
    deleteHotspotUser,
    kickHotspotSession,
} from '../../lib/mikrotik/billing.js';
import { parseMikhmonComment, buildMikhmonComment } from './mikhmon-parser.js';
import { logger } from '../../lib/logger.js';

/**
 * Open a RouterOS connection for the given router and run `fn`. We do not
 * close the connection explicitly because the connection pool inside
 * routerActionService manages its own lifecycle.
 */
async function withConn<T>(routerId: string, fn: (api: any) => Promise<T>): Promise<T> {
    const api = await routerActionService.getRouterConnection(routerId);
    return fn(api);
}

/**
 * Hotspot data abstraction.
 *
 * Two implementations:
 *   • NativeHotspotProvider     — voucher/subscription state lives in our DB
 *   • MikhmonBridgeProvider     — state lives only in MikroTik comments
 *                                 (compatible with existing Mikhmon installs)
 *
 * The active provider per router is selected by
 * billing_router_settings.hotspot_mode. UI never picks a provider — it
 * calls resolveHotspotProvider(routerId) and gets the right one.
 */

export interface HotspotEntry {
    /** Unique within router. PPPoE username equivalent. */
    name: string;
    profile: string | null;
    expiresAt: Date | null;
    firstLoginAt: Date | null;
    bytesIn: number;
    bytesOut: number;
    /** "queued for redemption", "currently active", "expired", etc. */
    status: 'unused' | 'active' | 'expired' | 'cancelled' | 'unknown';
    /** Where this entry came from: voucher row id, subscription id, or null for bridge-only. */
    source: { kind: 'voucher'; id: string } | { kind: 'subscription'; id: string } | { kind: 'mikrotik_only'; mikrotikId: string };
    voucherCode: string | null;
    billingPeriod: string | null;
    raw: any;
}

export interface HotspotProvider {
    listEntries(): Promise<HotspotEntry[]>;
    /** Provision a brand-new entry on MikroTik AND record it locally if native. */
    createEntry(input: CreateHotspotEntryInput): Promise<HotspotEntry>;
    /** Disable / remove from MikroTik. The local row is updated to status=cancelled. */
    cancelEntry(name: string): Promise<void>;
    /** Force kick any active session (e.g. on profile change). */
    kickSession(name: string): Promise<void>;
}

export interface CreateHotspotEntryInput {
    name: string;
    password: string;
    profile: string;
    /** if set, MikroTik will auto-disconnect after this elapsed login time (e.g. "1d", "12h") */
    limitUptime?: string;
    expiresAt?: Date | null;
    voucherCode?: string | null;
    billingPeriod?: string | null;
}

class NativeHotspotProvider implements HotspotProvider {
    constructor(private routerId: string, private tenantId: string) {}

    async listEntries(): Promise<HotspotEntry[]> {
        // Pull both vouchers and subscriptions tagged for this router. They
        // both project into HotspotEntry.
        const vRows = await db
            .select()
            .from(vouchers)
            .where(and(eq(vouchers.routerId, this.routerId), eq(vouchers.tenantId, this.tenantId)));

        const sRows = await db
            .select()
            .from(subscriptions)
            .where(and(
                eq(subscriptions.routerId, this.routerId),
                eq(subscriptions.tenantId, this.tenantId),
                eq(subscriptions.type, 'hotspot'),
            ));

        const out: HotspotEntry[] = [];
        for (const v of vRows) {
            out.push({
                name: v.code,
                profile: v.profile,
                expiresAt: v.expiresAt,
                firstLoginAt: v.redeemedAt,
                bytesIn: 0,
                bytesOut: 0,
                status: v.status as HotspotEntry['status'],
                source: { kind: 'voucher', id: v.id },
                voucherCode: v.code,
                billingPeriod: null,
                raw: v,
            });
        }
        for (const s of sRows) {
            out.push({
                name: s.mikrotikIdentity,
                profile: null, // package profile is resolved at higher layer
                expiresAt: s.expiresAt,
                firstLoginAt: s.activatedAt,
                bytesIn: 0,
                bytesOut: 0,
                status: mapSubStatus(s.status),
                source: { kind: 'subscription', id: s.id },
                voucherCode: null,
                billingPeriod: null,
                raw: s,
            });
        }
        return out;
    }

    async createEntry(input: CreateHotspotEntryInput): Promise<HotspotEntry> {
        const comment = buildMikhmonComment({
            expiresAt: input.expiresAt ?? null,
            voucherCode: input.voucherCode ?? null,
            billingPeriod: input.billingPeriod ?? null,
        });

        await withConn(this.routerId, async (api) => {
            await addHotspotUser(api, {
                name: input.name,
                password: input.password,
                profile: input.profile,
                limitUptime: input.limitUptime,
                comment,
            });
        });

        return {
            name: input.name,
            profile: input.profile,
            expiresAt: input.expiresAt ?? null,
            firstLoginAt: null,
            bytesIn: 0,
            bytesOut: 0,
            status: 'unused',
            source: { kind: 'mikrotik_only', mikrotikId: '' },
            voucherCode: input.voucherCode ?? null,
            billingPeriod: input.billingPeriod ?? null,
            raw: null,
        };
    }

    async cancelEntry(name: string): Promise<void> {
        await withConn(this.routerId, async (api) => {
            const users = await getHotspotUsers(api);
            const u = users.find((x) => x.name === name);
            if (u) await deleteHotspotUser(api, u.id);
        });
    }

    async kickSession(name: string): Promise<void> {
        await withConn(this.routerId, async (api) => {
            await kickHotspotSession(api, name);
        });
    }
}

class MikhmonBridgeProvider implements HotspotProvider {
    constructor(private routerId: string) {}

    async listEntries(): Promise<HotspotEntry[]> {
        const users = await withConn(this.routerId, async (api) => getHotspotUsers(api));
        const now = Date.now();
        return users.map((u) => {
            const parsed = parseMikhmonComment(u.comment);
            const expiresAt = parsed?.expiresAt ?? null;
            const firstLoginAt = parsed?.firstLoginAt ?? null;
            let status: HotspotEntry['status'] = 'unknown';
            if (u.disabled) status = 'cancelled';
            else if (expiresAt && expiresAt.getTime() < now) status = 'expired';
            else if (firstLoginAt) status = 'active';
            else status = 'unused';

            return {
                name: u.name,
                profile: u.profile ?? null,
                expiresAt,
                firstLoginAt,
                bytesIn: parseInt(String(u.bytesIn ?? '0'), 10) || 0,
                bytesOut: parseInt(String(u.bytesOut ?? '0'), 10) || 0,
                status,
                source: { kind: 'mikrotik_only', mikrotikId: u.id },
                voucherCode: parsed?.voucherCode ?? null,
                billingPeriod: parsed?.billingPeriod ?? null,
                raw: u,
            };
        });
    }

    async createEntry(input: CreateHotspotEntryInput): Promise<HotspotEntry> {
        const comment = buildMikhmonComment({
            expiresAt: input.expiresAt ?? null,
            voucherCode: input.voucherCode ?? null,
            billingPeriod: input.billingPeriod ?? null,
        });
        await withConn(this.routerId, async (api) => {
            await addHotspotUser(api, {
                name: input.name,
                password: input.password,
                profile: input.profile,
                limitUptime: input.limitUptime,
                comment,
            });
        });
        return {
            name: input.name,
            profile: input.profile,
            expiresAt: input.expiresAt ?? null,
            firstLoginAt: null,
            bytesIn: 0,
            bytesOut: 0,
            status: 'unused',
            source: { kind: 'mikrotik_only', mikrotikId: '' },
            voucherCode: input.voucherCode ?? null,
            billingPeriod: input.billingPeriod ?? null,
            raw: null,
        };
    }

    async cancelEntry(name: string): Promise<void> {
        await withConn(this.routerId, async (api) => {
            const users = await getHotspotUsers(api);
            const u = users.find((x) => x.name === name);
            if (u) await deleteHotspotUser(api, u.id);
        });
    }

    async kickSession(name: string): Promise<void> {
        await withConn(this.routerId, async (api) => {
            await kickHotspotSession(api, name);
        });
    }
}

function mapSubStatus(s: string): HotspotEntry['status'] {
    if (s === 'active') return 'active';
    if (s === 'expired') return 'expired';
    if (s === 'cancelled' || s === 'suspended') return 'cancelled';
    return 'unknown';
}

/**
 * Look up the per-router billing settings and return the right provider.
 * Returns null when hotspot billing is disabled for this router.
 */
export async function resolveHotspotProvider(routerId: string, tenantId: string): Promise<HotspotProvider | null> {
    const [settings] = await db
        .select()
        .from(billingRouterSettings)
        .where(eq(billingRouterSettings.routerId, routerId))
        .limit(1);

    const mode = settings?.hotspotMode || 'disabled';
    if (mode === 'disabled') return null;
    if (mode === 'mikhmon_bridge') return new MikhmonBridgeProvider(routerId);
    if (mode === 'native') return new NativeHotspotProvider(routerId, tenantId);

    logger.warn({ routerId, mode }, 'Unknown hotspot mode — defaulting to disabled');
    return null;
}

export { NativeHotspotProvider, MikhmonBridgeProvider };
