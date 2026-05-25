import { eq, and, isNotNull, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routerNetwatch, onus, pppoeSessions, netwatchIpHistory } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import * as core from './netwatch-core.service.js';

/**
 * For a given netwatch entry, return the IP its linked customer should
 * currently have. Resolution priority:
 *   1. Live PPPoE session (most authoritative for active customers)
 *   2. Last-known ACS-reported IP (onus.host) — fallback when offline
 * Returns null if no source agrees, the entry has no linkage, or the
 * resolved IP equals the current entry host (no change needed).
 */
export async function resolveCurrentIp(netwatchId: string): Promise<{
    currentIp: string | null;
    sourceIp: string | null;
    source: 'pppoe' | 'acs' | null;
    pppoeUser: string | null;
    onuId: string | null;
} | null> {
    const [entry] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, netwatchId)).limit(1);
    if (!entry || !entry.linkedOnuId) return null;

    const [onu] = await db.select().from(onus).where(eq(onus.id, entry.linkedOnuId)).limit(1);
    if (!onu) return null;

    // Multi-tenant safety: refuse to resolve if the linked ONU belongs to a
    // different tenant than the netwatch entry. This guards against bad
    // historical links (e.g. before the genieacs auto-link was tenant-aware)
    // where a private IP collision could have created a cross-tenant link.
    if (entry.tenantId && onu.tenantId && entry.tenantId !== onu.tenantId) {
        logger.warn({
            netwatchId, netwatchTenant: entry.tenantId, onuTenant: onu.tenantId,
        }, 'Auto-heal: refused — linkedOnuId points to a different tenant. Manual cleanup required.');
        return null;
    }

    let sourceIp: string | null = null;
    let source: 'pppoe' | 'acs' | null = null;

    // 1. PPPoE active session — by username, scoped to same router
    if (onu.pppoeUser) {
        const [session] = await db
            .select()
            .from(pppoeSessions)
            .where(and(eq(pppoeSessions.name, onu.pppoeUser), eq(pppoeSessions.routerId, entry.routerId)))
            .orderBy(desc(pppoeSessions.lastSeen))
            .limit(1);
        if (session?.address) {
            sourceIp = session.address;
            source = 'pppoe';
        }
    }

    // 2. ACS fallback — onus.host populated by GenieACS sync
    if (!sourceIp && onu.host) {
        sourceIp = onu.host;
        source = 'acs';
    }

    return {
        currentIp: entry.host,
        sourceIp,
        source,
        pppoeUser: onu.pppoeUser,
        onuId: onu.id,
    };
}

/**
 * Walk every netwatch entry that has linkedOnuId set and apply auto-heal:
 * if the resolved IP differs from the stored host, push the new IP to
 * MikroTik via the existing updateEntry() flow and append a history row.
 *
 * Bounded to one router at a time when routerId is given (used by the
 * "heal now" debug endpoint). Otherwise sweeps all tenants/routers.
 */
export async function healStaleEntries(opts: { routerId?: string } = {}): Promise<{
    scanned: number;
    healed: number;
    skipped: number;
    failed: number;
}> {
    const filters = [isNotNull(routerNetwatch.linkedOnuId)];
    if (opts.routerId) filters.push(eq(routerNetwatch.routerId, opts.routerId));

    const candidates = await db.select().from(routerNetwatch).where(and(...filters));
    let healed = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of candidates) {
        try {
            const resolved = await resolveCurrentIp(entry.id);
            if (!resolved || !resolved.sourceIp) { skipped++; continue; }
            if (resolved.sourceIp === entry.host) { skipped++; continue; }

            // Pre-check uniqueness — (router_id, host) has a UNIQUE constraint,
            // so if another entry in this router already owns the target IP,
            // the update would fail. Skip and log instead of failing repeatedly.
            const [conflict] = await db.select({ id: routerNetwatch.id, name: routerNetwatch.name })
                .from(routerNetwatch)
                .where(and(
                    eq(routerNetwatch.routerId, entry.routerId),
                    eq(routerNetwatch.host, resolved.sourceIp),
                    sql`${routerNetwatch.id} != ${entry.id}`
                ))
                .limit(1);
            if (conflict) {
                skipped++;
                logger.warn({
                    netwatchId: entry.id,
                    netwatchName: entry.name,
                    targetHost: resolved.sourceIp,
                    conflictWithId: conflict.id,
                    conflictWithName: conflict.name,
                }, 'Auto-heal: target IP already owned by another entry in same router, skipping');
                continue;
            }

            const reason = resolved.source === 'pppoe' ? 'auto_heal_pppoe' : 'auto_heal_acs';
            const updated = await core.updateEntry(
                entry.routerId,
                entry.id,
                { host: resolved.sourceIp },
                entry.tenantId || undefined,
                db,
                { reason, changedBy: 'system', pppoeUser: resolved.pppoeUser, onuId: resolved.onuId }
            );

            if (updated) {
                healed++;
                logger.info({
                    netwatchId: entry.id,
                    routerId: entry.routerId,
                    pppoeUser: resolved.pppoeUser,
                    oldHost: entry.host,
                    newHost: resolved.sourceIp,
                    source: resolved.source,
                }, 'Netwatch auto-heal: IP updated');
            } else {
                failed++;
            }
        } catch (err: any) {
            failed++;
            logger.warn({ err: err?.message, netwatchId: entry.id }, 'Netwatch auto-heal: entry failed');
        }
    }

    return { scanned: candidates.length, healed, skipped, failed };
}

/**
 * Read the most recent IP changes for a single netwatch entry. Used by
 * the History dialog in the UI.
 */
export async function getHistory(netwatchId: string, limit: number = 50): Promise<any[]> {
    return db
        .select()
        .from(netwatchIpHistory)
        .where(eq(netwatchIpHistory.netwatchId, netwatchId))
        .orderBy(desc(netwatchIpHistory.changedAt))
        .limit(limit);
}
