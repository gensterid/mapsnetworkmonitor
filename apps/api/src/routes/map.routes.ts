import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { routerService } from '../services/index.js';
import { mapService, type MapAccessContext } from '../services/map.service.js';
import { cacheService } from '../lib/cache.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';

const router = Router();

// Validation
const updatePositionSchema = z.object({
    lat: z.number(),
    lng: z.number(),
});

router.use(authMiddleware);

/**
 * GET /api/map/layout
 * Get all map nodes and connections
 */
router.get(
    '/layout',
    asyncHandler(async (req, res) => {
        // Simple optimization: Check cache first based on user role and id
        const role = req.user?.role || 'anonymous';
        const userId = req.user?.id || 'none';
        const cacheKey = `map_layout_${role}_${userId}`;

        const cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
            return res.json({ data: cachedData, _source: 'cache' });
        }

        const allRouters = await routerService.findAll(
            getEffectiveTenantId(req),
            req.user?.id as string,
            req.user?.role as string
        );

        const routerIds = allRouters.map(r => r.id);
        const tenantId = getEffectiveTenantId(req);
        const isSuperAdminGlobal = role === 'superadmin' && !tenantId;

        // Access context dipakai oleh mapService untuk scope filtering.
        // Refactor sebelumnya: 60+ baris if/else duplicate per entity
        // (netwatch/olt/onu) inline di route. Sekarang centralized di
        // map.service.ts dengan column subset (no SELECT *).
        const ctx: MapAccessContext = {
            tenantId: tenantId ?? null,
            isSuperAdminGlobal,
            isAdminOrSuper: role === 'superadmin' || role === 'admin',
            routerIds,
        };

        // Parallel fetch \xe2\x80\x94 3 query independent, save round-trip time.
        const [netwatchEntries, allOlts, allOnus] = await Promise.all([
            mapService.fetchNetwatchForMap(ctx),
            mapService.fetchOltsForMap(ctx),
            mapService.fetchOnusForMap(ctx),
        ]);

        // Create a map for fast lookup: key = routerId:host
        const onuLookup = new Map();
        allOnus.forEach(o => {
            if (o.host && o.routerId) {
                onuLookup.set(`${o.routerId}:${o.host}`, o);
            }
        });

        // 5. Construct Nodes
        const nodes: any[] = [];

        // Add Routers
        allRouters.forEach(r => {
            nodes.push({
                id: r.id,
                type: 'router',
                name: r.name,
                host: r.host,
                status: r.status,
                lat: parseFloat(r.latitude || '0'),
                lng: parseFloat(r.longitude || '0'),
                latency: r.latency,
                data: r
            });
        });

        // Add OLTs
        allOlts.forEach(o => {
            nodes.push({
                id: o.id,
                type: 'olt',
                name: o.name,
                host: o.host,
                status: o.status, // snmp/web/online
                lat: parseFloat(o.latitude || '0'),
                lng: parseFloat(o.longitude || '0'),
                data: o
            });
        });

        // Track which ONUs are already linked to Netwatch
        const linkedOnuIds = new Set<string>();

        // Add Netwatch (Clients/ODPs)
        netwatchEntries.forEach(n => {
            // Find linked ONU metadata (Unified Linkage)
            const linkedOnu = onuLookup.get(`${n.routerId}:${n.host}`);
            if (linkedOnu) {
                linkedOnuIds.add(linkedOnu.id);
            }

            nodes.push({
                id: n.id,
                type: n.deviceType || 'client',
                name: n.name || n.host,
                host: n.host,
                status: n.status === 'up' ? 'online' : (n.status === 'down' ? 'offline' : 'unknown'),
                lat: parseFloat(n.latitude || '0'),
                lng: parseFloat(n.longitude || '0'),
                latency: n.latency,
                packetLoss: n.packetLoss,
                // Enrich data with ONU info if available
                sn: linkedOnu?.sn,
                model: linkedOnu?.model,
                ssid: linkedOnu?.ssid,
                description: linkedOnu?.description,
                lastRxPower: linkedOnu?.lastRxPower,
                physicalStatus: linkedOnu?.status,
                data: {
                    ...n,
                    onu: linkedOnu // Keep original object too
                }
            });
        });

        // Add Standalone ONUs (Scenario 5-6)
        allOnus.forEach(o => {
            if (linkedOnuIds.has(o.id)) return; // Already linked via Netwatch

            // Only show if it has coordinates
            const lat = parseFloat(o.latitude || '0');
            const lng = parseFloat(o.longitude || '0');

            if (lat !== 0 && lng !== 0) {
                nodes.push({
                    id: o.id,
                    type: 'onu',
                    name: o.name || o.sn,
                    host: o.host,
                    sn: o.sn,
                    model: o.model,
                    ssid: o.ssid,
                    description: o.description,
                    status: o.status === 'online' ? 'online' : 'offline',
                    physicalStatus: o.status,
                    lastRxPower: o.lastRxPower,
                    lat,
                    lng,
                    data: o
                });
            }
        });

        // 5. Construct Lines (Connections)
        const lines: any[] = [];
        const nodeMap = new Map(nodes.map(node => [node.id, node]));

        // Connect Netwatch entries to their parents
        netwatchEntries.forEach(n => {
            const selfNode = nodeMap.get(n.id);
            if (!selfNode) return;

            if (n.connectionType === 'router' && n.routerId) {
                // Connect to Router
                const routerNode = nodeMap.get(n.routerId);

                if (routerNode) {
                    lines.push({
                        id: `line-${n.id}`,
                        from: [routerNode.lat, routerNode.lng],
                        to: [selfNode.lat, selfNode.lng],
                        fromId: routerNode.id,
                        toId: selfNode.id,
                        status: selfNode.status === 'offline' ? 'down' : 'up',
                        type: 'ethernet', // Default
                        data: n
                    });
                }
            } else if (n.connectionType === 'client' && n.connectedToId) {
                // Connect to another device (ODP/Client)
                const parentNode = nodeMap.get(n.connectedToId);

                if (parentNode) {
                    lines.push({
                        id: `line-${n.id}`,
                        from: [parentNode.lat, parentNode.lng],
                        to: [selfNode.lat, selfNode.lng],
                        fromId: parentNode.id,
                        toId: selfNode.id,
                        status: selfNode.status === 'offline' ? 'down' : 'up',
                        type: 'ethernet',
                        data: n
                    });
                }
            }
        });

        // Connect OLTs to Routers (if we have that link, currently OLT table doesn't have routerId, assuming manual or standalone)
        // For now, OLTs might just sit there or need manual linking logic. 
        // If OLTs have coordinates, they show up.

        const responseData = {
            nodes: nodes.filter(n => n.lat !== 0 && n.lng !== 0), // Only return nodes with coordinates? Or return all and let frontend handle? Frontend filters [0,0] usually.
            lines
        };

        // Cache the heavy response for 10 seconds to protect DB against refresh spam
        await cacheService.set(cacheKey, responseData, 10);

        res.json({
            data: responseData
        });
    })
);

/**
 * PUT /api/map/nodes/:id/position
 * Update node position
 */
router.put(
    '/nodes/:id/position',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const { lat, lng } = updatePositionSchema.parse(req.body);

        // Try update Router
        const routerTenantId = getEffectiveTenantId(req);
        const conditions: any[] = [eq(routers.id, id)];
        if (routerTenantId) conditions.push(eq(routers.tenantId, routerTenantId));

        const [updatedRouter] = await db
            .update(routers)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(...conditions))
            .returning();

        if (updatedRouter) {
            return res.json({ data: { success: true, type: 'router' } });
        }

        // Try update Netwatch
        const netwatchConditions: any[] = [eq(routerNetwatch.id, id)];
        if (routerTenantId) netwatchConditions.push(eq(routerNetwatch.tenantId, routerTenantId));

        const [updatedNetwatch] = await db
            .update(routerNetwatch)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(...netwatchConditions))
            .returning();

        if (updatedNetwatch) {
            return res.json({ data: { success: true, type: 'netwatch' } });
        }

        // Try update OLT
        const oltConditions: any[] = [eq(olts.id, id)];
        if (routerTenantId) oltConditions.push(eq(olts.tenantId, routerTenantId));

        const [updatedOlt] = await db
            .update(olts)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(...oltConditions))
            .returning();

        if (updatedOlt) {
            return res.json({ data: { success: true, type: 'olt' } });
        }

        // Try update ONU
        const onuConditions: any[] = [eq(onus.id, id)];
        if (routerTenantId) onuConditions.push(eq(onus.tenantId, routerTenantId));

        const [updatedOnu] = await db
            .update(onus)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(...onuConditions))
            .returning();

        if (updatedOnu) {
            return res.json({ data: { success: true, type: 'onu' } });
        }

        res.status(404).json({ error: 'Node not found' });
    })
);

export default router;
