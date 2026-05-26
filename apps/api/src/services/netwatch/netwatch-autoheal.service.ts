import { eq, and, isNotNull, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routerNetwatch, onus, pppoeSessions, netwatchIpHistory } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';

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
 * Phase 25 — DETECT-ONLY auto-heal.
 *
 * Walks every netwatch entry that has linkedOnuId set and compares the
 * MikroTik-side host with the ACS/PPPoE-detected IP. Instead of pushing
 * the change to MikroTik (which previously caused mass-update storms),
 * this function ONLY flags the row in DB so the operator gets a banner
 * notification via Phase 23's conflict UI.
 *
 * Safeguards:
 *  - link_locked rows are skipped entirely.
 *  - app_only rows are skipped (no MikroTik counterpart).
 *  - Two-cycle stability gate: first detection → 'pending', second cycle
 *    confirms → 'conflict'. Prevents transient PPPoE re-auth from firing
 *    a conflict banner.
 *  - 30-min cooldown after marking 'conflict' so the same row isn't
 *    re-stamped on every cycle.
 *  - Flap detection: if a row gets flagged 3× in 1 hour, auto-lock it
 *    so it stops generating noise until operator intervenes.
 *  - If detected IP becomes equal to MikroTik host again, the conflict
 *    auto-clears back to 'synced'.
 *
 * Operator then resolves via the conflict dialog (Phase 23). Choosing
 * "Pakai App" pushes the new IP to MikroTik (manual, allowed); choosing
 * "Pakai MikroTik" clears the conflict without changing anything.
 *
 * Bounded to one router at a time when routerId is given.
 */
export async function healStaleEntries(opts: { routerId?: string } = {}): Promise<{
    scanned: number;
    detected: number;   // first-time mismatch → marked 'pending'
    conflicts: number;  // second-time confirmed → marked 'conflict'
    cleared: number;    // mismatch resolved → marked 'synced'
    flapped: number;    // auto-locked after repeated flag
    skipped: number;
    failed: number;
}> {
    const filters = [isNotNull(routerNetwatch.linkedOnuId)];
    if (opts.routerId) filters.push(eq(routerNetwatch.routerId, opts.routerId));

    const candidates = await db.select().from(routerNetwatch).where(and(...filters));

    // Cooldown — after a row is marked 'conflict', skip re-detection for this
    // long. Prevents spam-flagging an operator who hasn't had time to resolve.
    const COOLDOWN_MS = Number(process.env.NETWATCH_AUTOHEAL_COOLDOWN_MS || String(30 * 60 * 1000));
    // Flap detection — if this row has been flagged this many times in the
    // last hour, auto-lock it so it stops generating noise until operator
    // intervenes.
    const FLAP_THRESHOLD = Number(process.env.NETWATCH_AUTOHEAL_FLAP_THRESHOLD || '3');

    let detected = 0;
    let conflicts = 0;
    let cleared = 0;
    let flapped = 0;
    let skipped = 0;
    let failed = 0;

    const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);

    for (const entry of candidates) {
        try {
            // link_locked = operator's explicit "do not touch" → skip entirely.
            if (entry.linkLocked) { skipped++; continue; }
            // app_only entries have no MikroTik counterpart → skip.
            if (entry.syncState === 'app_only') { skipped++; continue; }
            // Cooldown — entry already in conflict, don't re-flag for 30 min.
            if (entry.syncState === 'conflict' && entry.updatedAt && entry.updatedAt > cooldownCutoff) {
                skipped++;
                continue;
            }

            const resolved = await resolveCurrentIp(entry.id);
            if (!resolved || !resolved.sourceIp) {
                // No source IP to compare against. If row was previously flagged,
                // leave it; otherwise just skip.
                skipped++;
                continue;
            }

            // ✅ MATCH — IP yang dideteksi sama dengan host MikroTik.
            // Clear any prior 'pending' or 'conflict' marker since they agree now.
            if (resolved.sourceIp === entry.host) {
                if (entry.syncState === 'pending' || entry.syncState === 'conflict') {
                    await db.update(routerNetwatch).set({
                        syncState: 'synced',
                        conflictReason: null,
                        updatedAt: new Date(),
                    }).where(eq(routerNetwatch.id, entry.id));
                    cleared++;
                } else {
                    skipped++;
                }
                continue;
            }

            // ⚠️ MISMATCH detected. Use two-cycle stability gate to avoid
            // false positives during PPPoE re-auth transitions:
            //   - First detection: mark 'pending'.
            //   - Second detection (next cycle, ~5 min later): escalate to
            //     'conflict' so the operator banner fires.
            //
            // resolved.source is typed nullable; fall back to 'acs' when null
            // so the conflict reason is still readable (resolver guarantees
            // source is set when sourceIp is set, but TS doesn't infer this).
            const source = resolved.source || 'acs';
            const sourceLabel = source.toUpperCase();
            const pendingReason = `[PENDING_${sourceLabel}_MISMATCH] Detected ${resolved.sourceIp} (source: ${source}); MikroTik has ${entry.host}. Awaiting next cycle to confirm.`;
            const conflictReason = `[${sourceLabel}_IP_MISMATCH] ${source} reports ${resolved.sourceIp} but MikroTik shows ${entry.host}. Operator: review and resolve.`;

            if (entry.syncState === 'synced' || !entry.syncState) {
                // First-time detection → mark pending, don't escalate yet.
                await db.update(routerNetwatch).set({
                    syncState: 'pending',
                    conflictReason: pendingReason,
                    mikrotikHost: entry.host,
                    updatedAt: new Date(),
                }).where(eq(routerNetwatch.id, entry.id));
                detected++;
                continue;
            }

            if (entry.syncState === 'pending') {
                // Second-cycle confirmation — escalate to conflict, but first
                // check flap count to avoid spam-flagging the same entry.
                const [flapRow] = await db.select({ count: sql<number>`count(*)::int` })
                    .from(netwatchIpHistory)
                    .where(and(
                        eq(netwatchIpHistory.netwatchId, entry.id),
                        eq(netwatchIpHistory.reason, 'auto_detect_conflict'),
                        sql`${netwatchIpHistory.changedAt} > NOW() - INTERVAL '1 hour'`,
                    ));
                const flapCount = Number(flapRow?.count || 0);

                if (flapCount >= FLAP_THRESHOLD) {
                    // Too noisy — auto-lock so operator gets a clear signal
                    // that this entry needs manual investigation.
                    await db.update(routerNetwatch).set({
                        linkLocked: true,
                        syncState: 'conflict',
                        conflictReason: `[FLAP_DETECTED] Entry flagged ${flapCount}× in the last hour. Auto-locked for operator review.`,
                        mikrotikHost: entry.host,
                        updatedAt: new Date(),
                    }).where(eq(routerNetwatch.id, entry.id));
                    flapped++;
                    logger.warn({
                        netwatchId: entry.id,
                        netwatchName: entry.name,
                        flapCount,
                    }, 'Auto-heal detect: flap threshold exceeded, entry auto-locked');
                    continue;
                }

                await db.update(routerNetwatch).set({
                    syncState: 'conflict',
                    conflictReason,
                    mikrotikHost: entry.host,
                    updatedAt: new Date(),
                }).where(eq(routerNetwatch.id, entry.id));

                // Audit trail so flap detection can count over the hour.
                await db.insert(netwatchIpHistory).values({
                    netwatchId: entry.id,
                    routerId: entry.routerId,
                    tenantId: entry.tenantId,
                    oldHost: entry.host,
                    newHost: resolved.sourceIp,
                    reason: 'auto_detect_conflict',
                    pppoeUser: resolved.pppoeUser,
                    onuId: resolved.onuId,
                    changedBy: 'system',
                });
                conflicts++;
                continue;
            }

            // Any other syncState falls through to skip.
            skipped++;
        } catch (err: any) {
            failed++;
            logger.warn({ err: err?.message, netwatchId: entry.id }, 'Netwatch auto-detect: entry failed');
        }
    }

    return { scanned: candidates.length, detected, conflicts, cleared, flapped, skipped, failed };
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
