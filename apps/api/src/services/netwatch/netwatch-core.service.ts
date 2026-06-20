import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    routers,
    routerNetwatch,
    onus,
    netwatchIpHistory,
} from '../../db/schema/index.js';
import { decrypt } from '../../lib/encryption.js';
import { alertService } from '../alert.service.js';
import { settingsService } from '../settings.service.js';
import { netwatchRepository } from '../../repositories/netwatch.repository.js';
import { alertRepository } from '../../repositories/alert.repository.js';
import { logger } from '../../lib/logger.js';

export interface UpdateEntryAuditOpts {
    reason?: 'manual_edit' | 'auto_heal_pppoe' | 'auto_heal_acs' | 'sync_correction';
    changedBy?: string; // 'system' or user.id
    pppoeUser?: string | null;
    onuId?: string | null;
}

/**
 * Internal helper to find a router and decrypt its password.
 */
export async function findRouterWithPassword(id: string, tenantId?: string, tx: any = db): Promise<any> {
    const filters = [eq(routers.id, id)];
    if (tenantId) filters.push(eq(routers.tenantId, tenantId));
    const [router] = await tx.select().from(routers).where(and(...filters));
    if (!router) return null;
    return {
        ...router,
        password: router.passwordEncrypted ? decrypt(router.passwordEncrypted) : '',
    };
}

/**
 * Get all netwatch entries for a router with detailed info (ONUs/Alerts)
 */
export async function getNetwatch(routerId: string, tx: any = db): Promise<any[]> {
    const entries = await netwatchRepository.findWithDetails(routerId, tx);
    if (!entries || !Array.isArray(entries)) return [];
 
    const downAlertsResponse = await alertRepository.findAll({
        routerId,
        type: 'netwatch_down',
        limit: 500
    }, tx);
    const downAlerts = downAlertsResponse.data;

    return entries.map((entry: any) => {
        if (entry.status === 'down' && entry.host) {
            const matchingAlert = downAlerts.find((a: any) => a.message && a.message.includes(entry.host));
            if (matchingAlert) return { ...entry, lastDown: matchingAlert.createdAt };
        }
        return entry;
    });
}

/**
 * Batch query for all netwatch entries for multiple routers
 */
export async function getNetwatchAll(routerIds: string[]): Promise<any[]> {
    return netwatchRepository.findByRouterIdsWithDetails(routerIds);
}

/**
 * Create a new manual netwatch entry
 */
export async function create(routerId: string, data: any, tenantId?: string, tx: any = db): Promise<any> {
    // 0. Ensure tenantId is available (inherit from router if missing)
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
        const [router] = await tx
            .select({ tenantId: routers.tenantId })
            .from(routers)
            .where(eq(routers.id, routerId))
            .limit(1);
        if (router) {
            effectiveTenantId = router.tenantId || undefined;
        }
    }

    const sanitizedHost = (data.host === '' || data.host === undefined) ? null : data.host;

    return netwatchRepository.create({
        routerId,
        tenantId: effectiveTenantId,
        host: sanitizedHost,
        name: data.name,
        deviceType: data.deviceType || 'client',
        interval: data.interval || 30,
        timeout: data.timeout || 1000,
        status: data.deviceType === 'odp' ? 'up' : 'unknown',
        isAppOnly: true,
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location,
        connectionType: data.connectionType || 'router',
        connectedToId: data.connectedToId,
        targetInterface: data.targetInterface,
        linkedOnuId: data.linkedOnuId,
        portCapacity: data.portCapacity,
        waypoints: data.waypoints,
    } as any, tx);
}

/**
 * Update an existing netwatch entry
 */
export async function updateEntry(routerId: string, id: string, data: any, tenantId?: string, tx: any = db, audit: UpdateEntryAuditOpts = {}): Promise<any> {
    // 1. Fetch current entry to check for IP changes
    const entry = await netwatchRepository.findById(id, tx);
    if (!entry || entry.routerId !== routerId) return null;

    const oldHost = entry.host;
    const newHost = data.host;
    const ipChanged = newHost && oldHost && newHost !== oldHost;
    const historyShouldRecord = newHost !== undefined && newHost !== oldHost;

    // Smart Sync: track whether the MikroTik push succeeded so we can mark
    // the row 'synced' (push OK) or 'pending' (push failed, retry needed).
    // App-only entries don't have a MikroTik counterpart, so they stay 'app_only'.
    let mikrotikPushAttempted = false;
    let mikrotikPushSucceeded = false;
    let mikrotikPushError: string | null = null;

    // 2. If IP changed, perform system-wide alignment (Alerts/MikroTik/Webhooks)
    if (ipChanged) {
        // A. Resolve any existing alerts for the old host (system-wide alignment)
        try {
            await alertService.resolveAlertsByHost(routerId, oldHost, entry.tenantId || tenantId, tx);
        } catch (err: any) {
            logger.error({ err: err.message }, '[Netwatch Update] Failed to resolve old alerts');
        }

        // B. Update on MikroTik (if not app-only)
        if (!entry.isAppOnly) {
            mikrotikPushAttempted = true;
            try {
                const router = await findRouterWithPassword(routerId, tenantId, tx);
                if (router) {
                    const { connectToRouter, updateNetwatchEntry, configureNetwatchWebhook } = await import('../../lib/mikrotik-api.js');
                    const conn = await connectToRouter(router);

                    // Update host in /tool netwatch
                    await updateNetwatchEntry(conn, oldHost, { host: newHost });

                    // Re-configure webhook to update hardcoded host in up/down scripts
                    if (router.useWebhook && router.webhookSecret && router.tenantId) {
                        const webhookUrl = await settingsService.getWebhookUrl(router.webhookSecret, router.tenantId);
                        await configureNetwatchWebhook(conn, newHost, webhookUrl, router.webhookSecret);
                    }

                    if (conn.release) conn.release();
                    else await conn.close();
                    mikrotikPushSucceeded = true;
                }
            } catch (err: any) {
                mikrotikPushError = err.message || String(err);
                logger.error({ err: err.message }, '[Netwatch Update] Failed to update MikroTik/Webhook');
            }
        }
    }

    // 3. If IP changed, cascade change to ONUs to preserve Map coordinates link
    if (ipChanged) {
        try {
            // Find ONUs linked to this host or SN
            await tx
                .update(onus)
                .set({ host: newHost, updatedAt: new Date() })
                .where(and(
                    eq(onus.routerId, routerId),
                    or(
                        eq(onus.host, oldHost),
                        eq(onus.id, entry.linkedOnuId || '')
                    )
                ));
        } catch (err: any) {
            logger.error({ err: err.message }, '[Netwatch Update] Failed to cascade IP change to ONUs');
        }
    }

    // 4. Update the Netwatch record
    try {
        const sanitizedData: any = { ...data };
        if (sanitizedData.host === '') sanitizedData.host = null;

        // Smart Sync state derivation based on whether MikroTik push succeeded.
        if (entry.isAppOnly) {
            // App-only entries don't sync to MikroTik
            sanitizedData.syncState = 'app_only';
            sanitizedData.conflictReason = null;
        } else if (ipChanged) {
            if (mikrotikPushSucceeded) {
                // Both sides now agree on the new host
                sanitizedData.syncState = 'synced';
                sanitizedData.mikrotikHost = newHost;
                sanitizedData.mikrotikSyncedAt = new Date();
                sanitizedData.conflictReason = null;
            } else if (mikrotikPushAttempted) {
                // Push attempted but failed — operator will see this in UI
                sanitizedData.syncState = 'conflict';
                sanitizedData.conflictReason = mikrotikPushError
                    ? `MikroTik push failed: ${mikrotikPushError}`
                    : 'MikroTik push attempted but did not confirm';
            } else {
                // No push attempted (shouldn't reach here for non-app-only with ipChanged)
                sanitizedData.syncState = 'pending';
                sanitizedData.conflictReason = 'Awaiting MikroTik confirmation';
            }
        }

        const updated = await netwatchRepository.update(id, {
            ...sanitizedData,
            updatedAt: new Date(),
        }, tx);

        // 5. Audit trail — record IP change so operators can review history later
        if (historyShouldRecord) {
            try {
                await tx.insert(netwatchIpHistory).values({
                    netwatchId: id,
                    routerId,
                    tenantId: entry.tenantId || tenantId || null,
                    oldHost: oldHost,
                    newHost: sanitizedData.host || newHost,
                    reason: audit.reason || 'manual_edit',
                    pppoeUser: audit.pppoeUser ?? null,
                    onuId: audit.onuId ?? entry.linkedOnuId ?? null,
                    changedBy: audit.changedBy || null,
                });
            } catch (err: any) {
                logger.error({ err: err.message }, '[Netwatch Update] Failed to record IP history');
            }
        }

        return updated;
    } catch (err: any) {
        logger.error({ err: err.message, id }, '[Netwatch Core] Failed to update entry');
        throw err;
    }
}

/**
 * Delete a netwatch entry
 */
/**
 * Delete a netwatch entry. Three modes supported:
 *
 *   'both' (default)  — Delete from BOTH app DB and MikroTik /tool netwatch.
 *                       Marker hilang total. Cocok untuk full removal.
 *
 *   'app_only'        — Delete only from app DB. MikroTik tetap monitor.
 *                       Next sync akan re-create app row dari MikroTik
 *                       (essentially a "reset" — useful kalau ingin app
 *                       discover ulang dengan data fresh).
 *
 *   'mikrotik_only'   — Stop monitor di MikroTik (remove /tool netwatch
 *                       entry). App row TETAP, tapi di-mark is_app_only=true
 *                       agar next sync tidak otomatis re-create di MikroTik.
 *                       Marker di map TETAP dengan last-known status.
 */
export async function deleteEntry(
    routerId: string,
    id: string,
    tenantId?: string,
    options: { mode?: 'both' | 'app_only' | 'mikrotik_only'; deleteFromMikrotik?: boolean } = {},
    tx: any = db
): Promise<boolean> {
    // Backward compat: legacy boolean deleteFromMikrotik flag maps to modes.
    const mode = options.mode
        ?? (options.deleteFromMikrotik === false ? 'app_only' : 'both');

    const entry = await netwatchRepository.findById(id, tx);
    if (!entry || entry.routerId !== routerId) return false;

    const doRemoveMikrotik = (mode === 'both' || mode === 'mikrotik_only') && !entry.isAppOnly;

    if (doRemoveMikrotik) {
        try {
            const router = await findRouterWithPassword(routerId, tenantId, tx);
            if (router) {
                const { connectToRouter, removeNetwatchEntry } = await import('../../lib/mikrotik-api.js');
                const conn = await connectToRouter(router);
                if (entry.host) {
                    await removeNetwatchEntry(conn, entry.host);
                }
                if (conn.release) conn.release();
                else await conn.close();
            }
        } catch (err) {
            // Silently log and continue - it might already be deleted on MikroTik
        }
    }

    if (mode === 'mikrotik_only') {
        // Keep app row but mark it app-only so next netwatch sync won't try
        // to re-create the MikroTik side. Also clear webhook cache so the
        // marker doesn't claim a webhook it no longer has.
        await tx.update(routerNetwatch).set({
            isAppOnly: true,
            hasWebhook: false,
            webhookSignature: null,
            webhookLastSyncedAt: null,
            updatedAt: new Date(),
        }).where(eq(routerNetwatch.id, id));
        return true;
    }

    // mode === 'both' or 'app_only' → drop the DB row.
    return netwatchRepository.delete(id, tx);
}

/**
 * List netwatch entries currently in sync_state='conflict' for a router.
 * Used by the UI banner + Conflicts panel to surface rows that need
 * operator attention.
 */
export async function listConflicts(routerId: string, tenantId?: string, tx: any = db) {
    const filters = [
        eq(routerNetwatch.routerId, routerId),
        eq(routerNetwatch.syncState, 'conflict'),
    ];
    if (tenantId) filters.push(eq(routerNetwatch.tenantId, tenantId));

    return tx
        .select({
            id: routerNetwatch.id,
            name: routerNetwatch.name,
            host: routerNetwatch.host,
            mikrotikHost: routerNetwatch.mikrotikHost,
            mikrotikSyncedAt: routerNetwatch.mikrotikSyncedAt,
            conflictReason: routerNetwatch.conflictReason,
            status: routerNetwatch.status,
            linkedOnuId: routerNetwatch.linkedOnuId,
            updatedAt: routerNetwatch.updatedAt,
        })
        .from(routerNetwatch)
        .where(and(...filters))
        .orderBy(routerNetwatch.name);
}

/**
 * Resolve sync conflicts in bulk. Operator picks which side wins per call:
 *  - 'mikrotik' → trust MikroTik snapshot; delete the app row that diverged
 *    (since the canonical entry is the one with host = mikrotik_host).
 *    The duplicate sibling row (same name, mikrotik_host) already exists
 *    after fullSync, so removing the diverged row is enough.
 *  - 'app' → trust app; push current host to MikroTik via updateEntry()
 *    which already handles MikroTik update + cascade + audit history.
 *
 * Every resolution writes a netwatch_ip_history row with reason
 * 'conflict_resolved_app' or 'conflict_resolved_mikrotik' so the History
 * dialog shows who chose what and when.
 */
export async function resolveConflicts(
    routerId: string,
    entryIds: string[],
    source: 'mikrotik' | 'app',
    tenantId?: string,
    changedBy?: string,
    tx: any = db
): Promise<{ resolved: number; failed: number; details: any[] }> {
    if (entryIds.length === 0) return { resolved: 0, failed: 0, details: [] };

    // Fetch target rows first so we can audit + decide per row
    const rows = await tx
        .select()
        .from(routerNetwatch)
        .where(and(
            eq(routerNetwatch.routerId, routerId),
            inArray(routerNetwatch.id, entryIds),
        ));

    const details: any[] = [];
    let resolved = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            if (source === 'mikrotik') {
                // Trust MikroTik: this row's host diverged from MikroTik's view.
                // The proper MikroTik snapshot lives in another row (the one
                // fullSync inserted at mikrotik_host). Remove this diverged copy.
                await tx.insert(netwatchIpHistory).values({
                    netwatchId: row.id,
                    routerId,
                    tenantId: row.tenantId || tenantId || null,
                    oldHost: row.host,
                    newHost: row.mikrotikHost || row.host,
                    reason: 'conflict_resolved_mikrotik',
                    onuId: row.linkedOnuId,
                    changedBy: changedBy || null,
                });
                await tx.delete(routerNetwatch).where(eq(routerNetwatch.id, row.id));
                details.push({ id: row.id, name: row.name, action: 'deleted_diverged_copy' });
            } else {
                // Trust app: push our host to MikroTik via the existing updateEntry
                // flow (which handles MikroTik API + webhook + cascade + history).
                await updateEntry(
                    routerId,
                    row.id,
                    { host: row.host },
                    tenantId,
                    tx,
                    { reason: 'manual_edit', changedBy: changedBy || 'system' },
                );
                // Force-mark as synced; updateEntry already does this when push OK,
                // but if it returned conflict (push failed again) we want operator
                // to see the new conflict_reason from this attempt.
                await tx.insert(netwatchIpHistory).values({
                    netwatchId: row.id,
                    routerId,
                    tenantId: row.tenantId || tenantId || null,
                    oldHost: row.mikrotikHost || row.host,
                    newHost: row.host,
                    reason: 'conflict_resolved_app',
                    onuId: row.linkedOnuId,
                    changedBy: changedBy || null,
                });
                details.push({ id: row.id, name: row.name, action: 'pushed_app_to_mikrotik' });
            }
            resolved++;
        } catch (err: any) {
            failed++;
            details.push({ id: row.id, name: row.name, error: err?.message || String(err) });
        }
    }

    return { resolved, failed, details };
}
