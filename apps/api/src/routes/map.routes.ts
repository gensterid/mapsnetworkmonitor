import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus } from '../db/schema/index.js';
import { eq, inArray, and } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { routerService } from '../services/index.js'; // Use existing services where possible
import { cacheService } from '../lib/cache.js'; // New: Inject cache service

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

        // 1. Fetch Routers (Correct parameter order: tenantId, userId, userRole)
        const allRouters = await routerService.findAll(
            req.user?.tenantId as string,
            req.user?.id as string,
            req.user?.role as string
        );

        const routerIds = allRouters.map(r => r.id);

        // 2. Fetch Netwatch Entries (Isolation)
        let netwatchEntries: any[] = [];
        const tenantId = req.user?.tenantId as string;

        if (req.user?.role === 'superadmin' && !tenantId) {
            // Global superadmin sees everything across all ISPs
            netwatchEntries = await db.select().from(routerNetwatch);
        } else if (tenantId) {
            // Admins and Superadmins with tenant context see devices within that tenant
            // If they are Operator/User, they should also be restricted by routerIds
            if (req.user?.role === 'superadmin' || req.user?.role === 'admin') {
                netwatchEntries = await db
                    .select()
                    .from(routerNetwatch)
                    .where(eq(routerNetwatch.tenantId, tenantId));
            } else if (routerIds.length > 0) {
                netwatchEntries = await db
                    .select()
                    .from(routerNetwatch)
                    .where(and(
                        eq(routerNetwatch.tenantId, tenantId),
                        inArray(routerNetwatch.routerId, routerIds)
                    ));
            }
        }

        // 3. Fetch OLTs (Isolation)
        let allOlts: any[] = [];
        if (req.user?.role === 'superadmin' && !tenantId) {
            allOlts = await db.select().from(olts);
        } else if (tenantId) {
            if (req.user?.role === 'superadmin' || req.user?.role === 'admin') {
                allOlts = await db
                    .select()
                    .from(olts)
                    .where(eq(olts.tenantId, tenantId));
            } else if (routerIds.length > 0) {
                allOlts = await db
                    .select()
                    .from(olts)
                    .where(and(
                        eq(olts.tenantId, tenantId),
                        inArray(olts.parentId, routerIds)
                    ));
            }
        }

        // 4. Fetch ONUs (Inventory Isolation)
        let allOnus: any[] = [];
        if (req.user?.role === 'superadmin' && !tenantId) {
            allOnus = await db.select().from(onus);
        } else if (tenantId) {
            if (req.user?.role === 'superadmin' || req.user?.role === 'admin') {
                allOnus = await db
                    .select()
                    .from(onus)
                    .where(eq(onus.tenantId, tenantId));
            } else if (routerIds.length > 0) {
                allOnus = await db
                    .select()
                    .from(onus)
                    .where(and(
                        eq(onus.tenantId, tenantId),
                        inArray(onus.routerId, routerIds)
                    ));
            }
        }

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
        const [updatedRouter] = await db
            .update(routers)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(
                eq(routers.id, id),
                eq(routers.tenantId, req.user?.tenantId as string)
            ))
            .returning();

        if (updatedRouter) {
            return res.json({ success: true, type: 'router' });
        }

        // Try update Netwatch
        const [updatedNetwatch] = await db
            .update(routerNetwatch)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(
                eq(routerNetwatch.id, id),
                eq(routerNetwatch.tenantId, req.user?.tenantId as string)
            ))
            .returning();

        if (updatedNetwatch) {
            return res.json({ success: true, type: 'netwatch' });
        }

        // Try update OLT
        const [updatedOlt] = await db
            .update(olts)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(
                eq(olts.id, id),
                eq(olts.tenantId, req.user?.tenantId as string)
            ))
            .returning();

        if (updatedOlt) {
            return res.json({ success: true, type: 'olt' });
        }

        // Try update ONU
        const [updatedOnu] = await db
            .update(onus)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(and(
                eq(onus.id, id),
                eq(onus.tenantId, req.user?.tenantId as string)
            ))
            .returning();

        if (updatedOnu) {
            return res.json({ success: true, type: 'onu' });
        }

        res.status(404).json({ error: 'Node not found' });
    })
);

export default router;
