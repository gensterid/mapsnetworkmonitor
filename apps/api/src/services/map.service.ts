import { db } from '../db/index.js';
import { routerNetwatch } from '../db/schema/routers.js';
import { olts } from '../db/schema/olts.js';
import { onus } from '../db/schema/onus.js';
import { eq, inArray, and } from 'drizzle-orm';

/**
 * MapService \xe2\x80\x94 query layer untuk /api/map/layout (heaviest endpoint,
 * polled by frontend every ~30s, returns 300-500 nodes).
 *
 * Performance contract:
 *   - Hanya SELECT field yang dipakai frontend NetworkMap (no SELECT *).
 *   - Tenant isolation enforced di query level via .where().
 *   - Indexes prerequisite: tenantId di olts + onus (lihat migration
 *     0055_map_tenant_indexes.sql).
 *
 * Per backend refactor brief: "Query untuk map view harus ringan: hanya
 * ambil field yang diperlukan, bukan SELECT *".
 */

// Field subset for map rendering \xe2\x80\x94 match dengan frontend
// NetworkMap.jsx consumer. Column names verified ke schema (routers.ts,
// olts.ts, onus.ts) per audit.

const NETWATCH_COLS = {
    id: routerNetwatch.id,
    routerId: routerNetwatch.routerId,
    tenantId: routerNetwatch.tenantId,
    host: routerNetwatch.host,
    name: routerNetwatch.name,
    status: routerNetwatch.status,
    latency: routerNetwatch.latency,
    packetLoss: routerNetwatch.packetLoss,
    latitude: routerNetwatch.latitude,
    longitude: routerNetwatch.longitude,
    waypoints: routerNetwatch.waypoints,
    distanceMarkers: routerNetwatch.distanceMarkers,
    fiberCores: routerNetwatch.fiberCores,
    deviceType: routerNetwatch.deviceType,
    targetInterface: routerNetwatch.targetInterface,
    linkedOnuId: routerNetwatch.linkedOnuId,
    connectionType: routerNetwatch.connectionType,
    connectedToId: routerNetwatch.connectedToId,
};

const OLT_COLS = {
    id: olts.id,
    parentId: olts.parentId,
    tenantId: olts.tenantId,
    name: olts.name,
    host: olts.host,
    status: olts.status,
    latitude: olts.latitude,
    longitude: olts.longitude,
};

const ONU_COLS = {
    id: onus.id,
    oltId: onus.oltId,
    routerId: onus.routerId,
    tenantId: onus.tenantId,
    sn: onus.sn,
    host: onus.host,
    name: onus.name,
    model: onus.model,
    ssid: onus.ssid,
    description: onus.description,
    status: onus.status,
    latitude: onus.latitude,
    longitude: onus.longitude,
    lastRxPower: onus.lastRxPower,
    waypoints: onus.waypoints,
    distanceMarkers: onus.distanceMarkers,
    fiberCores: onus.fiberCores,
    connectionType: onus.connectionType,
    connectedToId: onus.connectedToId,
};

export interface MapAccessContext {
    tenantId: string | null;
    isSuperAdminGlobal: boolean;
    isAdminOrSuper: boolean;
    routerIds: string[];
}

/**
 * Fetch netwatch entries scoped per access context.
 * - Superadmin global (no tenantId) \xe2\x86\x92 all
 * - Admin/Superadmin with tenant \xe2\x86\x92 by tenant
 * - Operator/User \xe2\x86\x92 by tenant + assigned routerIds only
 */
export async function fetchNetwatchForMap(ctx: MapAccessContext) {
    if (ctx.isSuperAdminGlobal) {
        return db.select(NETWATCH_COLS).from(routerNetwatch);
    }
    if (!ctx.tenantId) return [];

    if (ctx.isAdminOrSuper) {
        return db
            .select(NETWATCH_COLS)
            .from(routerNetwatch)
            .where(eq(routerNetwatch.tenantId, ctx.tenantId));
    }
    if (ctx.routerIds.length === 0) return [];

    return db
        .select(NETWATCH_COLS)
        .from(routerNetwatch)
        .where(
            and(
                eq(routerNetwatch.tenantId, ctx.tenantId),
                inArray(routerNetwatch.routerId, ctx.routerIds),
            ),
        );
}

/**
 * Fetch OLTs scoped per access context.
 * Same isolation rules as netwatch.
 */
export async function fetchOltsForMap(ctx: MapAccessContext) {
    if (ctx.isSuperAdminGlobal) {
        return db.select(OLT_COLS).from(olts);
    }
    if (!ctx.tenantId) return [];

    if (ctx.isAdminOrSuper) {
        return db.select(OLT_COLS).from(olts).where(eq(olts.tenantId, ctx.tenantId));
    }
    if (ctx.routerIds.length === 0) return [];

    return db
        .select(OLT_COLS)
        .from(olts)
        .where(
            and(eq(olts.tenantId, ctx.tenantId), inArray(olts.parentId, ctx.routerIds)),
        );
}

/**
 * Fetch ONUs scoped per access context.
 * Same isolation rules as netwatch.
 */
export async function fetchOnusForMap(ctx: MapAccessContext) {
    if (ctx.isSuperAdminGlobal) {
        return db.select(ONU_COLS).from(onus);
    }
    if (!ctx.tenantId) return [];

    if (ctx.isAdminOrSuper) {
        return db.select(ONU_COLS).from(onus).where(eq(onus.tenantId, ctx.tenantId));
    }
    if (ctx.routerIds.length === 0) return [];

    return db
        .select(ONU_COLS)
        .from(onus)
        .where(
            and(eq(onus.tenantId, ctx.tenantId), inArray(onus.routerId, ctx.routerIds)),
        );
}

export const mapService = {
    fetchNetwatchForMap,
    fetchOltsForMap,
    fetchOnusForMap,
};
