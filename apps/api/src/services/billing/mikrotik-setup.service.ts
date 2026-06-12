import { routerActionService } from '../router-action.service.js';
import {
    getPppProfiles, addPppProfile,
    inspectIsolirFirewall, setupIsolirFirewall,
    getPppSecrets, getHotspotUsers,
    type PppProfile, type IsolirFirewallStatus,
} from '../../lib/mikrotik/billing.js';
import { db } from '../../db/index.js';
import { subscriptions, vouchers, routers } from '../../db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { decrypt } from '../../lib/encryption.js';
import * as nodeRouterosModule from 'node-routeros';
const nodeRouteros: any = (nodeRouterosModule as any).default || nodeRouterosModule;
const RouterOSAPI = nodeRouteros.RouterOSAPI || nodeRouteros;

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

// Local helpers — duplicated here to avoid circular imports with billing-helpers
function computeIsolirDateLocal(nextDueAt: Date | null | undefined, graceDays: number = 0): Date | null {
    if (!nextDueAt) return null;
    const d = new Date(nextDueAt);
    d.setDate(d.getDate() + Math.max(0, graceDays));
    return d;
}
function formatDateNumericLocal(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}
const MONTH_LOCAL = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseDueLocal(due: string): Date | null {
    const m = due.match(/^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i);
    if (!m) return null;
    const mIdx = MONTH_LOCAL.indexOf(m[1].toLowerCase());
    if (mIdx < 0) return null;
    return new Date(Number(m[3]), mIdx, Number(m[2]));
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
 * Run fn(api) on a DEDICATED short-lived MikroTik connection that bypasses
 * the shared pool. The pool is heavily reused by background pollers
 * (traffic-monitor streams, metrics scheduler, netwatch sync) — quick
 * config commands like /system/scheduler/print get queued behind those
 * streaming commands and time out. A one-shot connection avoids that.
 *
 * Closes the socket after fn finishes (or fails). Safe under load.
 */
async function withDedicatedConn<T>(routerId: string, tenantId: string | undefined, fn: (api: any) => Promise<T>, perAttemptMs: number = 20000): Promise<T> {
    const filters = [eq(routers.id, routerId)];
    if (tenantId) filters.push(eq(routers.tenantId, tenantId));
    const [router] = await db.select().from(routers).where(and(...filters));
    if (!router) throw new Error('Router not found');

    const password = router.passwordEncrypted ? decrypt(router.passwordEncrypted, router.name) : '';
    const api = new RouterOSAPI({
        host: router.host,
        port: router.port,
        user: router.username,
        password,
        timeout: 30,
        keepalive: false,
    });

    const race = <U>(p: Promise<U>) => Promise.race<U>([
        p,
        new Promise<U>((_, reject) => setTimeout(() => reject(new Error(`mikrotik dedicated attempt timed out after ${perAttemptMs}ms`)), perAttemptMs)),
    ]);

    try {
        await race(api.connect());
        return await race(fn(api));
    } finally {
        try { await api.close(); } catch { /* ignore */ }
    }
}

// Backward-compat alias for existing call sites in this file.
const withRetryFresh = withDedicatedConn;

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

    /**
     * Push a single master scheduler entry to the router that auto-isolirs
     * any PPP secret whose comment contains `dn:YYYYMMDD <= today`.
     *
     * Idempotent: replaces an existing entry with the same name. Safe to
     * re-run after operator changes interval or isolir profile name.
     */
    async setupBillingScheduler(routerId: string, tenantId: string, opts: {
        isolirProfile?: string;
        interval?: string;            // RouterOS interval string, default "1h"
        schedulerName?: string;       // default "billing-isolir-check"
    } = {}): Promise<{ created: boolean; replaced: boolean; name: string }> {
        const isolirProfile = opts.isolirProfile || 'pppoe-isolir';
        const interval = opts.interval || '1h';
        const name = opts.schedulerName || 'billing-isolir-check';

        // Build the on-event script. Uses SPACE-separated paths (/ppp secret find)
        // bukan slash (/ppp/secret/find) supaya kompat dengan RouterOS 6.x.
        // ROS 7 accept dua format, ROS 6 hanya space format. Pre-check profile
        // existence di awal supaya bail dengan error message yang jelas kalau
        // operator lupa bikin profile ISOLIR.
        //
        // Date format detection:
        //   ROS 6.x default: mmm/dd/yyyy (e.g. "jun/06/2026")
        //   ROS 7.x default: yyyy-mm-dd ISO (e.g. "2026-06-06")
        // Script handle keduanya.
        const script = `:local isolirProfile "${isolirProfile}"
:if ([:len [/ppp profile find name=\$isolirProfile]] = 0) do={
  :log error ("Profile " . \$isolirProfile . " tidak ada di router. Bikin dulu.")
  :error ("Profile " . \$isolirProfile . " not found")
}
:local now [/system clock get date]
:local todayNum 0
:if ([:pick \$now 4 5] = "-") do={
  :set todayNum [:tonum ([:pick \$now 0 4] . [:pick \$now 5 7] . [:pick \$now 8 10])]
} else={
  :local mm [:pick \$now 0 3]
  :local mn "00"
  :if (\$mm = "jan") do={ :set mn "01" }
  :if (\$mm = "feb") do={ :set mn "02" }
  :if (\$mm = "mar") do={ :set mn "03" }
  :if (\$mm = "apr") do={ :set mn "04" }
  :if (\$mm = "may") do={ :set mn "05" }
  :if (\$mm = "jun") do={ :set mn "06" }
  :if (\$mm = "jul") do={ :set mn "07" }
  :if (\$mm = "aug") do={ :set mn "08" }
  :if (\$mm = "sep") do={ :set mn "09" }
  :if (\$mm = "oct") do={ :set mn "10" }
  :if (\$mm = "nov") do={ :set mn "11" }
  :if (\$mm = "dec") do={ :set mn "12" }
  :set todayNum [:tonum ([:pick \$now 7 11] . \$mn . [:pick \$now 4 6])]
}
:foreach s in=[/ppp secret find disabled=no] do={
  :local cmt [/ppp secret get \$s comment]
  :local dnIdx [:find \$cmt "dn:"]
  :if ([:typeof \$dnIdx] = "num") do={
    :local dnStr [:pick \$cmt (\$dnIdx + 3) (\$dnIdx + 11)]
    :local dn [:tonum \$dnStr]
    :if ((\$dn != 0) and (\$dn <= \$todayNum)) do={
      :local cur [/ppp secret get \$s profile]
      :if (\$cur != \$isolirProfile) do={
        /ppp secret set \$s profile=\$isolirProfile
        :local uname [/ppp secret get \$s name]
        :foreach a in=[/ppp active find] do={
          :if ([/ppp active get \$a name] = \$uname) do={ /ppp active remove \$a }
        }
      }
    }
  }
}`;

        const { safeWrite } = await import('../../lib/mikrotik/connection.js');

        return await withRetryFresh(routerId, tenantId, async (api) => {
            const existing = await safeWrite(api, ['/system/scheduler/print', `?name=${name}`]) as any[];
            const replaced = existing.length > 0;
            if (replaced) {
                await safeWrite(api, ['/system/scheduler/remove', `=.id=${existing[0]['.id']}`]);
            }

            await safeWrite(api, [
                '/system/scheduler/add',
                `=name=${name}`,
                `=interval=${interval}`,
                `=on-event=${script}`,
                '=comment=auto-billing isolir master scheduler',
                '=disabled=no',
            ]);

            return { created: !replaced, replaced, name };
        });
    },

    /**
     * Check if the master billing scheduler is present on the router.
     */
    async getBillingSchedulerStatus(routerId: string, tenantId: string, name: string = 'billing-isolir-check') {
        const { safeWrite } = await import('../../lib/mikrotik/connection.js');
        return await withRetryFresh(routerId, tenantId, async (api) => {
            const result = await safeWrite(api, ['/system/scheduler/print', `?name=${name}`]) as any[];
            if (!result?.length) return { present: false };
            const entry = result[0];
            return {
                present: true,
                interval: entry.interval,
                disabled: entry.disabled === 'true' || entry.disabled === true,
                nextRun: entry['next-run'],
                runCount: entry['run-count'],
            };
        });
    },

    /**
     * Audit subscription comments on the router. Compares each PPP secret's
     * `dn:` field against our DB's expected isolir date (subscription.nextDueAt
     * + isolirGraceDays). Returns a list of mismatches the operator can
     * one-click resync.
     */
    async auditSubscriptionComments(routerId: string, tenantId: string) {
        const { getPppSecrets } = await import('../../lib/mikrotik/billing.js');
        const secrets = await withRetryFresh(routerId, tenantId, (api) => getPppSecrets(api));

        const subs = await db.select()
            .from(subscriptions)
            .where(and(
                eq(subscriptions.routerId, routerId),
                eq(subscriptions.tenantId, tenantId),
                eq(subscriptions.type, 'pppoe'),
            ));

        // Lookup grace days
        const { billingRouterSettings } = await import('../../db/schema/index.js');
        const [settings] = await db.select().from(billingRouterSettings)
            .where(eq(billingRouterSettings.routerId, routerId)).limit(1);
        const graceDays = settings?.isolirGraceDays ?? 0;

        const subByName = new Map(subs.map(s => [s.mikrotikIdentity, s]));
        const issues: Array<{
            name: string;
            kind: 'missing-dn' | 'mismatched-dn' | 'inconsistent-due-vs-dn' | 'orphan-mikrotik';
            comment: string | null;
            expected: string | null;
            current: string | null;
            subscriptionId?: string;
        }> = [];

        for (const sec of secrets) {
            const sub = subByName.get(sec.name);
            const cmt = sec.comment || '';

            // Skip secrets that aren't tagged as ours (no subscription:UUID)
            if (!cmt.includes('subscription:') && !sub) continue;

            // Find dn: and due: in the comment
            const dnMatch = cmt.match(/dn:(\d{8})/);
            const dueMatch = cmt.match(/due:([a-zA-Z]{3}\/\d{1,2}\/\d{4})/);

            // Compute expected dn from DB
            const expectedDn = sub
                ? (() => {
                    const isolirDate = computeIsolirDateLocal(sub.nextDueAt, graceDays);
                    return isolirDate ? formatDateNumericLocal(isolirDate) : null;
                })()
                : null;

            // Case A: tagged in comment but no matching subscription in DB
            if (cmt.includes('subscription:') && !sub) {
                issues.push({
                    name: sec.name, kind: 'orphan-mikrotik',
                    comment: cmt, expected: null, current: dnMatch?.[1] || null,
                });
                continue;
            }

            // Case B: subscription exists but no dn in comment
            if (sub && !dnMatch) {
                issues.push({
                    name: sec.name, kind: 'missing-dn', comment: cmt,
                    expected: expectedDn, current: null,
                    subscriptionId: sub.id,
                });
                continue;
            }

            // Case C: dn doesn't match expected (most common: operator manual edit)
            if (sub && dnMatch && expectedDn && dnMatch[1] !== expectedDn) {
                issues.push({
                    name: sec.name, kind: 'mismatched-dn', comment: cmt,
                    expected: expectedDn, current: dnMatch[1],
                    subscriptionId: sub.id,
                });
                continue;
            }

            // Case D: due and dn don't refer to the same date (typo)
            if (dnMatch && dueMatch) {
                const dnYmd = dnMatch[1];
                const dueParsed = parseDueLocal(dueMatch[1]);
                if (dueParsed && formatDateNumericLocal(dueParsed) !== dnYmd) {
                    issues.push({
                        name: sec.name, kind: 'inconsistent-due-vs-dn', comment: cmt,
                        expected: dnYmd, current: dueMatch[1],
                        subscriptionId: sub?.id,
                    });
                }
            }
        }

        return { totalSecrets: secrets.length, totalSubs: subs.length, issues };
    },

    /**
     * Resync — force-write the canonical comment for a single subscription
     * back to the router. Used by the audit UI's "fix" button.
     */
    async resyncSubscriptionComment(subscriptionId: string, tenantId: string): Promise<{ ok: boolean }> {
        const [sub] = await db.select().from(subscriptions)
            .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId))).limit(1);
        if (!sub) return { ok: false };

        const { packages, billingRouterSettings } = await import('../../db/schema/index.js');
        const [pkg] = await db.select().from(packages).where(eq(packages.id, sub.packageId)).limit(1);
        const [settings] = await db.select().from(billingRouterSettings).where(eq(billingRouterSettings.routerId, sub.routerId)).limit(1);
        const graceDays = settings?.isolirGraceDays ?? 0;
        const isolirDate = computeIsolirDateLocal(sub.nextDueAt, graceDays);

        const { buildSubscriptionComment } = await import('./billing-helpers.js');
        const comment = buildSubscriptionComment({
            subscriptionId: sub.id,
            isolirDate,
            packageName: pkg?.name,
        });

        const { getPppSecretByName, updatePppSecret } = await import('../../lib/mikrotik/billing.js');
        return await withRetryFresh(sub.routerId, tenantId, async (api) => {
            const sec = await getPppSecretByName(api, sub.mikrotikIdentity);
            if (!sec) return { ok: false };
            await updatePppSecret(api, sec.id, { comment });
            return { ok: true };
        });
    },

    /**
     * List import candidates: PPP secrets / hotspot users that exist on the
     * router but aren't yet linked to a subscription/voucher in our DB.
     * Used by the "Adopt existing user" flow when migrating an operator who
     * already has hundreds of customers in MikroTik.
     */
    async listImportCandidates(routerId: string, tenantId: string, type: 'pppoe' | 'hotspot') {
        const api = await routerActionService.getRouterConnection(routerId, tenantId);

        if (type === 'pppoe') {
            const secrets = await getPppSecrets(api);
            // Find which usernames are already taken in our DB for this router
            const existingSubs = await db.select({ name: subscriptions.mikrotikIdentity })
                .from(subscriptions)
                .where(and(
                    eq(subscriptions.routerId, routerId),
                    eq(subscriptions.type, 'pppoe'),
                ));
            const taken = new Set(existingSubs.map(s => s.name));
            return secrets
                .filter(s => !taken.has(s.name))
                .map(s => ({
                    name: s.name,
                    profile: s.profile || null,
                    service: s.service || 'pppoe',
                    hasPassword: !!s.password,
                    password: s.password || null,
                    comment: s.comment || null,
                    disabled: s.disabled,
                }));
        }

        // Hotspot
        const users = await getHotspotUsers(api);
        const existingV = await db.select({ code: vouchers.code })
            .from(vouchers)
            .where(eq(vouchers.routerId, routerId));
        const existingS = await db.select({ name: subscriptions.mikrotikIdentity })
            .from(subscriptions)
            .where(and(
                eq(subscriptions.routerId, routerId),
                eq(subscriptions.type, 'hotspot'),
            ));
        const taken = new Set([
            ...existingV.map(v => v.code),
            ...existingS.map(s => s.name),
        ]);
        return users
            .filter(u => !taken.has(u.name))
            .map(u => ({
                name: u.name,
                profile: u.profile || null,
                hasPassword: !!u.password,
                password: u.password || null,
                comment: u.comment || null,
                limitUptime: u.limitUptime || null,
                disabled: u.disabled,
            }));
    },
};
