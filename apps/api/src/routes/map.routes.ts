import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus } from '../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { routerService } from '../services/index.js'; // Use existing services where possible

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
        // 1. Fetch Routers
        const allRouters = await routerService.findAll(req.user?.id, req.user?.role);

        // 2. Fetch Netwatch Entries (Clients, ODPs)
        // Check if user is admin, if not, filter by assigned routers
        let netwatchEntries: any[] = [];
        if (req.user?.role !== 'admin' && req.user?.id) {
            // Get netwatch for assigned routers
            const routerIds = allRouters.map(r => r.id);
            if (routerIds.length > 0) {
                netwatchEntries = await db
                    .select()
                    .from(routerNetwatch)
                    .where(inArray(routerNetwatch.routerId, routerIds));
            }
        } else {
            netwatchEntries = await db.select().from(routerNetwatch);
        }

        // 3. Fetch OLTs
        // TODO: Filter OLTs by permissions if needed
        const allOlts = await db.select().from(olts);

        // 4. Construct Nodes
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

        // Add Netwatch (Clients/ODPs)
        netwatchEntries.forEach(n => {
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
                data: n
            });
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

        res.json({
            data: {
                nodes: nodes.filter(n => n.lat !== 0 && n.lng !== 0), // Only return nodes with coordinates? Or return all and let frontend handle? Frontend filters [0,0] usually.
                lines
            }
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
        const { id } = req.params;
        const { lat, lng } = updatePositionSchema.parse(req.body);

        // Try update Router
        const [updatedRouter] = await db
            .update(routers)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(eq(routers.id, id))
            .returning();

        if (updatedRouter) {
            return res.json({ success: true, type: 'router' });
        }

        // Try update Netwatch
        const [updatedNetwatch] = await db
            .update(routerNetwatch)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(eq(routerNetwatch.id, id))
            .returning();

        if (updatedNetwatch) {
            return res.json({ success: true, type: 'netwatch' });
        }

        // Try update OLT
        const [updatedOlt] = await db
            .update(olts)
            .set({ latitude: lat.toString(), longitude: lng.toString() })
            .where(eq(olts.id, id))
            .returning();

        if (updatedOlt) {
            return res.json({ success: true, type: 'olt' });
        }

        // Try update ONU
        // TODO: ONUs table

        res.status(404).json({ error: 'Node not found' });
    })
);

export default router;
