import { eq, and, desc, inArray, sql, or, getTableColumns, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { 
    routerNetwatch, 
    onus, 
    olts, 
    alerts, 
    type RouterNetwatch, 
    type NewRouterNetwatch 
} from '../db/schema/index.js';

/**
 * Netwatch Repository - handles IP monitoring and connectivity status
 * Centralizes host tracking and latency metrics.
 */
export class NetwatchRepository {
    private static instance: NetwatchRepository;

    private constructor() {}

    public static getInstance(): NetwatchRepository {
        if (!NetwatchRepository.instance) {
            NetwatchRepository.instance = new NetwatchRepository();
        }
        return NetwatchRepository.instance;
    }

    /**
     * Find entries for a router with full details (ONUs, OLTs, Alerts)
     */
    async findWithDetails(routerId: string, tx: any = db): Promise<any[]> {
        const directOlts = alias(olts, 'directOlts');

        try {
            return await tx
                .select({
                    ...getTableColumns(routerNetwatch),
                    // Prefer the netwatch row's own latitude/longitude when set —
                    // that is what the user edits when dragging the marker via
                    // PUT /api/routers/:id/netwatch/:netwatchId. The ONU coord
                    // is only used as a fallback for entries that don't yet
                    // have their own placement (e.g. freshly discovered).
                    latitude: sql<string>`COALESCE(${routerNetwatch.latitude}, ${onus.latitude})`.as('latitude'),
                    longitude: sql<string>`COALESCE(${routerNetwatch.longitude}, ${onus.longitude})`.as('longitude'),
                    model: onus.model,
                    ssid: onus.ssid,
                    firmwareVersion: onus.firmwareVersion,
                    sn: onus.sn,
                    lastRxPower: onus.lastRxPower,
                    physicalStatus: onus.status,
                    discoverySources: onus.discoverySources,
                    ponPort: onus.ponPort,
                    onuIndex: onus.onuIndex,
                    linkedOnuId: routerNetwatch.linkedOnuId,
                    linkLocked: routerNetwatch.linkLocked,
                    linkSource: routerNetwatch.linkSource,
                    splitterRatio: routerNetwatch.splitterRatio,
                    oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
                    oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
                    hasWebhook: routerNetwatch.hasWebhook,
                })
                .from(routerNetwatch)
                .leftJoin(onus, eq(onus.id, sql`(
                    SELECT id FROM onus o
                    WHERE
                        ${routerNetwatch.deviceType} IS DISTINCT FROM 'odp' AND (
                            o.id = ${routerNetwatch.linkedOnuId} OR
                            (
                                o.router_id = ${routerNetwatch.routerId} AND
                                o.device_class = 'onu' AND
                                o.archived_at IS NULL AND
                                (
                                    (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                                    (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                                    (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                                )
                            )
                        )
                    ORDER BY (
                        CASE
                            WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                            WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                            WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                            ELSE 4
                        END
                    ) ASC,
                    o.last_seen_olt DESC NULLS LAST,
                    o.created_at DESC
                    LIMIT 1
                )`))
                .leftJoin(olts, eq(onus.oltId, olts.id))
                .leftJoin(directOlts, and(
                    sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
                    eq(directOlts.parentId, routerNetwatch.routerId)
                ))
                .where(eq(routerNetwatch.routerId, routerId))
                .orderBy(routerNetwatch.host);
        } catch (err) {
            logger.error({ routerId, err }, 'Degraded Mode: Failed to fetch netwatch with complex details, falling back to basic list');
            // Fallback: return basic netwatch data without complex joins
            return tx
                .select()
                .from(routerNetwatch)
                .where(eq(routerNetwatch.routerId, routerId))
                .orderBy(routerNetwatch.host);
        }
    }

    /**
     * Find entries for multiple routers with full details
     */
    async findByRouterIdsWithDetails(routerIds: string[], tx: any = db): Promise<any[]> {
        if (routerIds.length === 0) return [];
        const directOlts = alias(olts, 'directOlts');

        try {
            return await tx
                .select({
                    ...getTableColumns(routerNetwatch),
                    // Prefer the netwatch row's own latitude/longitude when set —
                    // that is what the user edits when dragging the marker via
                    // PUT /api/routers/:id/netwatch/:netwatchId. The ONU coord
                    // is only used as a fallback for entries that don't yet
                    // have their own placement (e.g. freshly discovered).
                    latitude: sql<string>`COALESCE(${routerNetwatch.latitude}, ${onus.latitude})`.as('latitude'),
                    longitude: sql<string>`COALESCE(${routerNetwatch.longitude}, ${onus.longitude})`.as('longitude'),
                    model: onus.model,
                    ssid: onus.ssid,
                    firmwareVersion: onus.firmwareVersion,
                    sn: onus.sn,
                    lastRxPower: onus.lastRxPower,
                    lastDownReason: onus.lastDownReason,
                    lastSeen: onus.lastSeen,
                    physicalStatus: onus.status,
                    discoverySources: onus.discoverySources,
                    activeClients: onus.activeClients,
                    lastSeenOlt: onus.lastSeenOlt,
                    lastSeenAcs: onus.lastSeenAcs,
                    ponPort: onus.ponPort,
                    onuIndex: onus.onuIndex,
                    linkedOnuId: routerNetwatch.linkedOnuId,
                    linkLocked: routerNetwatch.linkLocked,
                    linkSource: routerNetwatch.linkSource,
                    splitterRatio: routerNetwatch.splitterRatio,
                    oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
                    oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
                    hasWebhook: routerNetwatch.hasWebhook,
                })
                .from(routerNetwatch)
                .leftJoin(onus, eq(onus.id, sql`(
                    SELECT id FROM onus o
                    WHERE
                        ${routerNetwatch.deviceType} IS DISTINCT FROM 'odp' AND (
                            o.id = ${routerNetwatch.linkedOnuId} OR
                            (
                                o.router_id = ${routerNetwatch.routerId} AND
                                o.device_class = 'onu' AND
                                o.archived_at IS NULL AND
                                (
                                    (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                                    (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                                    (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                                )
                            )
                        )
                    ORDER BY (
                        CASE
                            WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                            WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                            WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                            ELSE 4
                        END
                    ) ASC,
                    o.last_seen_olt DESC NULLS LAST,
                    o.created_at DESC
                    LIMIT 1
                )`))
                .leftJoin(olts, eq(onus.oltId, olts.id))
                .leftJoin(directOlts, and(
                    sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
                    eq(directOlts.parentId, routerNetwatch.routerId)
                ))
                .where(inArray(routerNetwatch.routerId, routerIds))
                .orderBy(routerNetwatch.host);
        } catch (err) {
            logger.error({ routerIds, err }, 'Degraded Mode: Failed to fetch netwatch batch with details, falling back to basic list');
            return tx
                .select()
                .from(routerNetwatch)
                .where(inArray(routerNetwatch.routerId, routerIds))
                .orderBy(routerNetwatch.host);
        }
    }


    /**
     * Find specific entry by host on a router
     */
    async findByHost(routerId: string, host: string, tx: any = db): Promise<RouterNetwatch | undefined> {
        const [entry] = await tx
            .select()
            .from(routerNetwatch)
            .where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));
        return entry;
    }

    /**
     * Find by ID
     */
    async findById(id: string, tx: any = db): Promise<RouterNetwatch | undefined> {
        const [entry] = await tx
            .select()
            .from(routerNetwatch)
            .where(eq(routerNetwatch.id, id));
        return entry;
    }

    /**
     * Create a new entry (Safe Upsert)
     */
    async create(data: NewRouterNetwatch, tx: any = db): Promise<RouterNetwatch> {
        const [inserted] = await tx
            .insert(routerNetwatch)
            .values(data)
            .onConflictDoUpdate({
                target: [routerNetwatch.routerId, routerNetwatch.host],
                set: {
                    name: data.name,
                    deviceType: data.deviceType,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    location: data.location,
                    connectionType: data.connectionType,
                    connectedToId: data.connectedToId,
                    targetInterface: data.targetInterface,
                    linkedOnuId: data.linkedOnuId,
                    portCapacity: data.portCapacity,
                    splitterRatio: data.splitterRatio,
                    waypoints: data.waypoints,
                    isAppOnly: data.isAppOnly,
                    updatedAt: new Date(),
                }
            })
            .returning();
        return inserted;
    }

    /**
     * Update an entry
     */
    async update(id: string, data: Partial<RouterNetwatch>, tx: any = db): Promise<RouterNetwatch | undefined> {
        const [updated] = await tx
            .update(routerNetwatch)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(routerNetwatch.id, id))
            .returning();
        return updated;
    }

    /**
     * Delete an entry
     */
    async delete(id: string, tx: any = db): Promise<boolean> {
        const result = await tx.delete(routerNetwatch).where(eq(routerNetwatch.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Get summary stats for a router
     */
    async getStatsSummary(routerId: string, tx: any = db): Promise<Record<string, number>> {
        const result = await tx
            .select({ 
                status: routerNetwatch.status,
                count: sql<number>`count(*)`
            })
            .from(routerNetwatch)
            .where(eq(routerNetwatch.routerId, routerId))
            .groupBy(routerNetwatch.status);

        const stats: Record<string, number> = { up: 0, down: 0, unknown: 0 };
        result.forEach((r: any) => {
            if (r.status) stats[r.status] = Number(r.count);
        });
        return stats;
    }
    /**
     * Batch upsert netwatch entries
     */
    async upsertBatch(data: NewRouterNetwatch[], tx: any = db): Promise<number> {
        if (data.length === 0) return 0;

        const result = await tx
            .insert(routerNetwatch)
            .values(data)
            .onConflictDoUpdate({
                target: [routerNetwatch.routerId, routerNetwatch.host],
                set: {
                    status: sql`EXCLUDED.status`,
                    latency: sql`EXCLUDED.latency`,
                    disabled: sql`EXCLUDED.disabled`,
                    lastCheck: sql`EXCLUDED.last_check`,
                    // Preserve last_up / last_down history when RouterOS doesn't expose
                    // it. RouterOS netwatch only fills `sinceUp` while the host is UP and
                    // `sinceDown` while the host is DOWN — the other becomes empty. Without
                    // COALESCE we'd overwrite the prior outage timestamp with NULL on every
                    // sync, so the popup would lose the "last down" history.
                    lastUp: sql`COALESCE(EXCLUDED.last_up, ${routerNetwatch.lastUp})`,
                    lastDown: sql`COALESCE(EXCLUDED.last_down, ${routerNetwatch.lastDown})`,
                    updatedAt: new Date(),
                    hasWebhook: sql`EXCLUDED.has_webhook`,
                    name: sql`EXCLUDED.name`,
                    interval: sql`EXCLUDED.interval`,
                    // Smart Sync: row matched on (router_id, host) → host is in sync.
                    // mikrotikHost snapshot equals the incoming host. Clear any
                    // previous conflict state — operator's earlier resolution stuck.
                    mikrotikHost: sql`EXCLUDED.host`,
                    mikrotikSyncedAt: new Date(),
                    syncState: sql`'synced'`,
                    conflictReason: sql`NULL`,
                    // Phase 26 — preserve webhook signature/timestamp from incoming
                    // batch. Sync layer computes these and decides when to refresh.
                    webhookSignature: sql`EXCLUDED.webhook_signature`,
                    webhookLastSyncedAt: sql`COALESCE(EXCLUDED.webhook_last_synced_at, ${routerNetwatch.webhookLastSyncedAt})`,
                }
            })
            .returning();

        return result.length;
    }

    /**
     * After fullSync upsert, detect rows in the same router with duplicate
     * names but different hosts — those indicate MikroTik diverged from app
     * (e.g. auto-heal pushed a new host to MikroTik but the push failed, so
     * the old host remained as a separate row). Flag all such rows so the UI
     * can surface them to the operator.
     */
    async markDuplicateNameConflicts(routerId: string, tx: any = db): Promise<number> {
        const result: any = await tx.execute(sql`
            UPDATE router_netwatch
            SET sync_state = 'conflict',
                conflict_reason = 'Multiple entries share this name on the same router — likely IP changed but the old MikroTik entry was not removed'
            WHERE router_id = ${routerId}
              AND name IS NOT NULL
              AND name IN (
                  SELECT name FROM router_netwatch
                  WHERE router_id = ${routerId} AND name IS NOT NULL
                  GROUP BY name
                  HAVING count(*) > 1
              )
              AND link_locked = false
              AND sync_state != 'app_only'
        `);
        return result?.rowCount ?? 0;
    }
}

export const netwatchRepository = NetwatchRepository.getInstance();
