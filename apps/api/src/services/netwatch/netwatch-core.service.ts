import { eq, and, sql, desc, getTableColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/index.js';
import {
    routers,
    routerNetwatch,
    onus,
    olts,
    alerts,
} from '../../db/schema/index.js';
import { decrypt } from '../../lib/encryption.js';

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
    const directOlts = alias(olts, 'directOlts');
 
    const entries = await tx
        .select({
            ...getTableColumns(routerNetwatch),
            latitude: sql<string>`COALESCE(${onus.latitude}, ${routerNetwatch.latitude})`.as('latitude'),
            longitude: sql<string>`COALESCE(${onus.longitude}, ${routerNetwatch.longitude})`.as('longitude'),
            model: onus.model,
            ssid: onus.ssid,
            firmwareVersion: onus.firmwareVersion,
            sn: onus.sn,
            lastRxPower: onus.lastRxPower,
            physicalStatus: onus.status,
            discoverySources: onus.discoverySources,
            ponPort: onus.ponPort,
            onuIndex: onus.onuIndex,
            ponId: onus.ponPort,
            onuId: onus.onuIndex,
            linkedOnuId: routerNetwatch.linkedOnuId,
            oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
            oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
            hasWebhook: routerNetwatch.hasWebhook,
        })
        .from(routerNetwatch)
        .leftJoin(onus, eq(onus.id, sql`(
            SELECT id FROM onus o
            WHERE 
                o.id = ${routerNetwatch.linkedOnuId} OR
                (
                    o.router_id = ${routerNetwatch.routerId} AND 
                    (
                        (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                        (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                        (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                    )
                )
            ORDER BY (
                CASE 
                    WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                    WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                    WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                    ELSE 4
                END
            ) ASC
            LIMIT 1
        )`))
        .leftJoin(olts, eq(onus.oltId, olts.id))
        .leftJoin(directOlts, and(
            sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
            eq(directOlts.parentId, routerNetwatch.routerId)
        ))
        .where(eq(routerNetwatch.routerId, routerId))
        .orderBy(routerNetwatch.host) as any;
 
    const downAlerts = await tx
        .select({
            message: alerts.message,
            createdAt: alerts.createdAt,
        })
        .from(alerts)
        .where(and(eq(alerts.routerId, routerId), eq(alerts.type, 'netwatch_down')))
        .orderBy(desc(alerts.createdAt))
        .limit(500);

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
    if (!routerIds || routerIds.length === 0) return [];
    const directOlts = alias(olts, 'directOlts');

    return await db
        .select({
            ...getTableColumns(routerNetwatch),
            latitude: sql<string>`COALESCE(${onus.latitude}, ${routerNetwatch.latitude})`.as('latitude'),
            longitude: sql<string>`COALESCE(${onus.longitude}, ${routerNetwatch.longitude})`.as('longitude'),
            model: onus.model,
            ssid: onus.ssid,
            firmwareVersion: onus.firmwareVersion,
            sn: onus.sn,
            lastRxPower: onus.lastRxPower,
            lastDownReason: onus.lastDownReason,
            lastSeen: onus.lastSeen,
            physicalStatus: onus.status,
            discoverySources: onus.discoverySources,
            ponPort: onus.ponPort,
            onuIndex: onus.onuIndex,
            ponId: onus.ponPort,
            onuId: onus.onuIndex,
            linkedOnuId: routerNetwatch.linkedOnuId,
            oltName: sql<string>`COALESCE(${olts.name}, ${directOlts.name})`.as('oltName'),
            oltId: sql<string>`COALESCE(${onus.oltId}, ${directOlts.id})`.as('oltId'),
            hasWebhook: routerNetwatch.hasWebhook,
        })
        .from(routerNetwatch)
        .leftJoin(onus, eq(onus.id, sql`(
            SELECT id FROM onus o
            WHERE 
                o.id = ${routerNetwatch.linkedOnuId} OR
                (
                    o.router_id = ${routerNetwatch.routerId} AND 
                    (
                        (TRIM(o.host) = TRIM(${routerNetwatch.host}) AND o.host IS NOT NULL AND o.host != '') OR
                        (LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) AND o.name IS NOT NULL AND o.name != '') OR
                        (${routerNetwatch.name} LIKE '%' || o.name || '%' AND o.name IS NOT NULL AND LENGTH(o.name) > 3)
                    )
                )
            ORDER BY (
                CASE 
                    WHEN o.id = ${routerNetwatch.linkedOnuId} THEN 1
                    WHEN TRIM(o.host) = TRIM(${routerNetwatch.host}) THEN 2
                    WHEN LOWER(TRIM(o.name)) = LOWER(TRIM(${routerNetwatch.name})) THEN 3
                    ELSE 4
                END
            ) ASC
            LIMIT 1
        )`))
        .leftJoin(olts, eq(onus.oltId, olts.id))
        .leftJoin(directOlts, and(
            sql`TRIM(${routerNetwatch.name}) = TRIM(${directOlts.name})`,
            eq(directOlts.parentId, routerNetwatch.routerId)
        ))
        .where(inArray(routerNetwatch.routerId, routerIds))
        .orderBy(routerNetwatch.host) as any;
}

/**
 * Create a new manual netwatch entry
 */
export async function create(routerId: string, data: any, tenantId?: string, tx: any = db): Promise<any> {
    const [inserted] = await tx
        .insert(routerNetwatch)
        .values({
            routerId,
            tenantId,
            host: data.host,
            name: data.name,
            interval: data.interval || 30,
            timeout: data.timeout || 1000,
            status: 'unknown',
            isAppOnly: true,
        } as any)
        .returning();
    return inserted;
}

/**
 * Update an existing netwatch entry
 */
export async function updateEntry(routerId: string, id: string, data: any, tenantId?: string, tx: any = db): Promise<any> {
    const filters = [eq(routerNetwatch.id, id), eq(routerNetwatch.routerId, routerId)];
    if (tenantId) filters.push(eq(routerNetwatch.tenantId, tenantId));

    const [updated] = await tx
        .update(routerNetwatch)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(and(...filters))
        .returning();
    return updated;
}

/**
 * Delete a netwatch entry
 */
export async function deleteEntry(routerId: string, id: string, tenantId?: string, deleteFromMikrotik: boolean = true, tx: any = db): Promise<boolean> {
    const filters = [eq(routerNetwatch.id, id), eq(routerNetwatch.routerId, routerId)];
    if (tenantId) filters.push(eq(routerNetwatch.tenantId, tenantId));

    const [entry] = await tx.select().from(routerNetwatch).where(and(...filters));
    if (!entry) return false;

    if (deleteFromMikrotik && !entry.isAppOnly) {
        try {
            const router = await findRouterWithPassword(routerId, tenantId, tx);
            if (router) {
                const { connectToRouter, removeNetwatchEntry } = await import('../../lib/mikrotik-api.js');
                const conn = await connectToRouter(router);
                await removeNetwatchEntry(conn, entry.host);
                if (conn.release) conn.release();
                else await conn.close();
            }
        } catch (err) {
            // Silently log and continue - it might already be deleted on MikroTik
        }
    }

    const result = await tx.delete(routerNetwatch).where(eq(routerNetwatch.id, entry.id)).returning();
    return result.length > 0;
}
