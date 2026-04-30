import { routerActionService } from '../router-action.service.js';
import {
    getPppProfiles, addPppProfile,
    inspectIsolirFirewall, setupIsolirFirewall,
    type PppProfile, type IsolirFirewallStatus,
} from '../../lib/mikrotik/billing.js';
import { logger } from '../../lib/logger.js';

/**
 * Auto-detect + auto-setup helpers for the billing module.
 *
 * - listPppProfiles: probe MikroTik for existing PPP profiles so the UI can
 *   render a dropdown instead of asking the operator to type a profile name
 *   that may not exist.
 *
 * - getIsolirReadiness: combine profile check + firewall check in one call.
 *
 * - autoCreateIsolir: create a missing isolir profile + firewall redirect
 *   in one go. Idempotent, safe to re-run.
 */

export interface IsolirReadiness {
    profileExists: boolean;
    profileName: string;
    rateLimit?: string | null;
    profiles: PppProfile[];
    firewall: IsolirFirewallStatus;
}

// In-memory cache so repeated settings-tab opens don't hammer slow routers.
// PPP profile + firewall list rarely change, 60s TTL is acceptable. Stale
// entries are KEPT (just flagged) so we can fall back to them when MikroTik
// is currently timing out — better serve slightly-old data than 502.
interface CacheEntry<T> { value: T; expiresAt: number; }
const profileCache = new Map<string, CacheEntry<PppProfile[]>>();
const firewallCache = new Map<string, CacheEntry<IsolirFirewallStatus>>();
const TTL_MS = 60_000;

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) return null; // expired but DON'T delete — keep for stale fallback
    return entry.value;
}
function cacheGetStale<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
    return map.get(key)?.value ?? null;
}
function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
    map.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/**
 * Run fn(api), retry once on MikroTik timeout with a FRESH connection.
 * The first connection may be a stale entry from the pool — re-acquiring
 * forces routerActionService to reconnect.
 */
async function withRetryFresh<T>(routerId: string, tenantId: string | undefined, fn: (api: any) => Promise<T>): Promise<T> {
    try {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);
        return await fn(api);
    } catch (e: any) {
        const msg = String(e?.message || '');
        if (!msg.includes('timed out')) throw e;
        logger.warn({ err: msg, routerId }, 'mikrotik command timed out, retrying with fresh connection');
        // Wait a beat to let pool drop the dead connection
        await new Promise(r => setTimeout(r, 500));
        const api2 = await routerActionService.getRouterConnection(routerId, tenantId);
        return await fn(api2);
    }
}

export const mikrotikSetupService = {
    async listPppProfiles(routerId: string, tenantId?: string, force = false): Promise<PppProfile[]> {
        const cacheKey = `${routerId}:${tenantId || ''}`;
        if (!force) {
            const cached = cacheGet(profileCache, cacheKey);
            if (cached) return cached;
        }
        try {
            const profiles = await withRetryFresh(routerId, tenantId, (api) => getPppProfiles(api));
            cacheSet(profileCache, cacheKey, profiles);
            return profiles;
        } catch (e: any) {
            // If router is timing out, prefer stale cache over 502 so the
            // operator settings UI keeps working with slightly old data.
            const stale = cacheGetStale(profileCache, cacheKey);
            if (stale) {
                logger.warn({ routerId, err: e?.message }, 'mikrotik ppp-profiles failed, returning stale cache');
                return stale;
            }
            throw e;
        }
    },

    /**
     * Check whether the configured isolir profile + firewall walled-garden
     * is already in place on the router. Profile + firewall fetched in
     * parallel to halve the latency.
     */
    async getIsolirReadiness(routerId: string, profileName: string = 'pppoe-isolir', listName: string = 'isolir', tenantId?: string): Promise<IsolirReadiness> {
        const cacheKeyP = `${routerId}:${tenantId || ''}`;
        const cacheKeyF = `${routerId}:${tenantId || ''}:${listName}`;

        const cachedProfiles = cacheGet(profileCache, cacheKeyP);
        const cachedFirewall = cacheGet(firewallCache, cacheKeyF);

        const [profiles, firewall] = await Promise.all([
            cachedProfiles ? Promise.resolve(cachedProfiles) :
                withRetryFresh(routerId, tenantId, (api) => getPppProfiles(api))
                    .then(p => { cacheSet(profileCache, cacheKeyP, p); return p; }),
            cachedFirewall ? Promise.resolve(cachedFirewall) :
                withRetryFresh(routerId, tenantId, (api) => inspectIsolirFirewall(api, listName))
                    .then(f => { cacheSet(firewallCache, cacheKeyF, f); return f; }),
        ]);

        const found = profiles.find(p => p.name === profileName);
        return {
            profileExists: !!found,
            profileName,
            rateLimit: found?.rateLimit || null,
            profiles,
            firewall,
        };
    },

    /** Invalidate caches — called after auto-create so next read is fresh. */
    invalidateCache(routerId: string, tenantId?: string): void {
        const prefix = `${routerId}:${tenantId || ''}`;
        for (const k of profileCache.keys()) if (k.startsWith(prefix)) profileCache.delete(k);
        for (const k of firewallCache.keys()) if (k.startsWith(prefix)) firewallCache.delete(k);
    },

    /**
     * Create the isolir profile (if missing) + firewall pieces (if missing).
     * Operator can pass:
     *   - profileName: name of profile to ensure (default 'pppoe-isolir')
     *   - rateLimit:   throttle, default '256k/256k'
     *   - addressListName: firewall address-list name (default 'isolir')
     *   - redirectIp:  billing host IP for HTTP redirect
     *   - redirectPort:default 80
     *   - addWalledGarden: also drop non-HTTP traffic from isolir users
     */
    async autoCreateIsolir(routerId: string, opts: {
        profileName?: string;
        rateLimit?: string;
        remoteAddress?: string;          // pool name or static range
        addressListName?: string;
        redirectIp?: string;
        redirectPort?: number;
        addWalledGarden?: boolean;
    } = {}, tenantId?: string): Promise<{
        profile: { created: boolean; name: string; id?: string | null };
        firewall: { addressListId: string | null; natRedirectId: string | null; filterAllowId: string | null; filterDropId: string | null };
    }> {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);
        const profileName = opts.profileName || 'pppoe-isolir';
        const listName = opts.addressListName || 'isolir';

        // 1. Ensure profile exists
        const profiles = await getPppProfiles(api);
        const existing = profiles.find(p => p.name === profileName);
        let profileId: string | null | undefined = existing?.id;
        let createdProfile = false;
        if (!existing) {
            try {
                profileId = await addPppProfile(api, {
                    name: profileName,
                    rateLimit: opts.rateLimit || '256k/256k',
                    remoteAddress: opts.remoteAddress,
                    addressList: listName,
                    onlyOne: 'yes',
                    comment: 'auto-created by billing system',
                });
                createdProfile = true;
                logger.info({ routerId, profileName }, 'auto-created isolir PPP profile');
            } catch (e: any) {
                throw new Error(`Gagal buat profile ${profileName}: ${e?.message || e}`);
            }
        }

        // 2. Firewall pieces (only if redirectIp provided)
        let firewallResult: {
            addressListId: string | null;
            natRedirectId: string | null;
            filterAllowId: string | null;
            filterDropId: string | null;
        } = { addressListId: null, natRedirectId: null, filterAllowId: null, filterDropId: null };
        if (opts.redirectIp) {
            try {
                firewallResult = await setupIsolirFirewall(api, {
                    listName,
                    redirectIp: opts.redirectIp,
                    redirectPort: opts.redirectPort,
                    addWalledGarden: opts.addWalledGarden,
                });
            } catch (e: any) {
                logger.warn({ err: e?.message, routerId }, 'firewall setup failed (non-fatal — profile already created)');
            }
        }

        // Invalidate cache so next read sees the freshly created profile/rules
        mikrotikSetupService.invalidateCache(routerId, tenantId);

        return {
            profile: { created: createdProfile, name: profileName, id: profileId },
            firewall: firewallResult,
        };
    },
};
