import { eq, or, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerNetwatch, olts, onus, topologyNodes, topologyLinks } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

export class TopologyService {
    /**
     * Get topology tree for a specific router
     */
    async getRouterTopology(routerId: string) {
        // 1. Get the current router (The owner of the schematic)
        const [targetRouter] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!targetRouter) return null;

        // 2. Fetch manual nodes and links
        const manualNodes = await db.select().from(topologyNodes).where(eq(topologyNodes.routerId, routerId));
        const manualLinks = await db.select().from(topologyLinks).where(eq(topologyLinks.routerId, routerId));

        const nodes: any[] = [];
        const edges: any[] = [];

        // 3. Resolve Node Details (Status, Name, Host)
        // We need to fetch details from routers, olts, or netwatch tables
        const nodeIds = manualNodes.map(n => n.nodeId).filter(Boolean) as string[];

        // Fetch all potential routers
        const routersInSchematic = nodeIds.length > 0
            ? await db.select().from(routers).where(inArray(routers.id, nodeIds))
            : [];

        const oltsInSchematic = nodeIds.length > 0
            ? await db.select().from(olts).where(inArray(olts.id, nodeIds))
            : [];

        const netwatchInSchematic = nodeIds.length > 0
            ? await db.select().from(routerNetwatch).where(inArray(routerNetwatch.id, nodeIds))
            : [];

        // Build a map for quick access
        const deviceMap: Record<string, any> = {};
        routersInSchematic.forEach(r => deviceMap[r.id] = { ...r, type: 'router' });
        oltsInSchematic.forEach(o => deviceMap[o.id] = { ...o, type: 'olt' });
        netwatchInSchematic.forEach(n => {
            let type = 'netwatch';
            if (n.deviceType === 'olt') type = 'olt';
            else if (n.deviceType === 'router') type = 'router';
            else if (n.deviceType === 'switch') type = 'switch';
            else if (n.deviceType === 'odp') type = 'odp';

            deviceMap[n.id] = {
                ...n,
                type,
                status: n.status === 'up' ? 'online' : 'offline'
            };
        });

        // Populate Nodes and build a Schematic ID map for Edge resolution
        const schematicNodeMap: Record<string, any> = {};
        let rootRouterInSchematic = false;

        for (const mNode of manualNodes) {
            const device = mNode.nodeId ? deviceMap[mNode.nodeId] : null;
            if (mNode.nodeId === routerId) rootRouterInSchematic = true;

            const nodeData = {
                id: mNode.id,
                systemId: mNode.nodeId,
                type: device?.type || mNode.customType || 'router',
                // Prioritize custom name/host if set in schematic
                name: mNode.customName || device?.name || 'Unmapped Device',
                host: mNode.customHost || device?.host || '0.0.0.0',
                status: device?.status || 'unknown',
                x: mNode.x,
                y: mNode.y,
                model: device?.model || mNode.customType || 'custom',
                latency: device?.latency,
                uptime: device?.uptime,
                packetLoss: device?.packetLoss,
                boardName: device?.boardName,
            };

            nodes.push(nodeData);
            schematicNodeMap[mNode.id] = nodeData;
        }

        // Always ensure root router is present if not in manualNodes
        if (!rootRouterInSchematic) {
            nodes.push({
                id: targetRouter.id, // For the root if not saved yet, we use system ID as its schematic ID temporarily
                systemId: targetRouter.id,
                type: 'router',
                name: targetRouter.name,
                host: targetRouter.host,
                status: targetRouter.status,
                x: String(0),
                y: String(0),
                model: targetRouter.model,
                latency: targetRouter.latency,
                boardName: targetRouter.boardName,
            });
            // Also map it for edge resolution in case something links to it
            schematicNodeMap[targetRouter.id] = nodes[nodes.length - 1];
        }

        // 4. Resolve Edges (Using Schematic IDs)
        for (const link of manualLinks) {
            const fromNode = schematicNodeMap[link.sourceNodeId];
            const toNode = schematicNodeMap[link.targetNodeId];

            if (fromNode && toNode) {
                edges.push({
                    id: link.id,
                    from: link.sourceNodeId,
                    to: link.targetNodeId,
                    fromInterface: link.sourceInterface,
                    toInterface: link.targetInterface,
                    status: fromNode.status !== 'offline' && toNode.status !== 'offline' ? 'up' : 'down',
                    pathOffset: link.pathOffset || '0',
                    animationType: link.animationType || 'pulse',
                });
            }
        }

        return { nodes, edges };
    }

    /**
     * Add a device to the router's schematic
     */
    async addNode(routerId: string, nodeId: string | null, nodeType: string, tenantId?: string, customData?: { name?: string, host?: string }) {
        // If nodeId is provided, check if already exists
        if (nodeId) {
            const [existing] = await db.select()
                .from(topologyNodes)
                .where(and(eq(topologyNodes.routerId, routerId), eq(topologyNodes.nodeId, nodeId)));

            if (existing) return existing;
        }

        const [newNode] = await db.insert(topologyNodes).values({
            routerId,
            nodeId,
            nodeType,
            tenantId,
            x: '0',
            y: '0',
            customName: customData?.name,
            customHost: customData?.host,
            customType: nodeType
        } as any).returning();

        return newNode;
    }

    /**
     * Remove a device from the router's schematic
     */
    async removeNode(routerId: string, nodeId: string) {
        // Here nodeId is the SCHEMATIC ID (topology_nodes.id)

        // Remove links associated with this node first
        await db.delete(topologyLinks).where(
            and(
                eq(topologyLinks.routerId, routerId),
                or(
                    eq(topologyLinks.sourceNodeId, nodeId),
                    eq(topologyLinks.targetNodeId, nodeId)
                )
            )
        );

        return await db.delete(topologyNodes).where(
            and(
                eq(topologyNodes.routerId, routerId),
                eq(topologyNodes.id, nodeId) // Match by schematic ID
            )
        );
    }

    /**
     * Update a schematic node (e.g. mapping to system ID)
     */
    async updateNode(nodeIdInTopology: string, data: { nodeId?: string | null, nodeType?: string, customName?: string, customHost?: string, routerId?: string }) {
        // Try to update by primary key first
        const [existing] = await db.select().from(topologyNodes).where(eq(topologyNodes.id, nodeIdInTopology as any));

        if (existing) {
            return await db.update(topologyNodes)
                .set({
                    ...data,
                    updatedAt: new Date()
                })
                .where(eq(topologyNodes.id, existing.id));
        }

        // If not found by primary key, it might be a fallback node (system ID)
        if (data.routerId) {
            const [fallback] = await db.select()
                .from(topologyNodes)
                .where(and(
                    eq(topologyNodes.routerId, data.routerId),
                    eq(topologyNodes.nodeId, nodeIdInTopology as any)
                ));

            if (fallback) {
                return await db.update(topologyNodes)
                    .set({
                        ...data,
                        updatedAt: new Date()
                    })
                    .where(eq(topologyNodes.id, fallback.id));
            }

            // Still not found? Insert it (Promotion)
            const nodeToInsert = {
                routerId: data.routerId,
                nodeId: data.nodeId || (nodeIdInTopology.includes('.') || nodeIdInTopology.includes(':') ? nodeIdInTopology : null),
                nodeType: data.nodeType || 'router',
                customName: data.customName,
                customHost: data.customHost,
                x: '0',
                y: '0'
            };

            return await db.insert(topologyNodes).values(nodeToInsert as any);
        }

        return null;
    }

    /**
     * Add a link between two schematic nodes
     */
    async addLink(routerId: string, sourceId: string, targetId: string, sourceInterface: string, targetInterface: string, tenantId?: string, pathOffset?: string) {
        const [newLink] = await db.insert(topologyLinks).values({
            routerId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            sourceInterface,
            targetInterface,
            pathOffset: pathOffset || '0',
            animationType: 'pulse', // Default for new links
            tenantId
        }).returning();

        return newLink;
    }

    /**
     * Remove a link
     */
    async removeLink(linkId: string) {
        return await db.delete(topologyLinks).where(eq(topologyLinks.id, linkId));
    }

    /**
     * Update a link's configuration
     */
    async updateLink(linkId: string, data: { sourceInterface?: string, targetInterface?: string, pathOffset?: string | number, animationType?: string }) {
        const updateData: any = {
            ...data,
            updatedAt: new Date()
        };

        if (data.pathOffset !== undefined) {
            updateData.pathOffset = String(data.pathOffset);
        }

        if (data.animationType !== undefined) {
            updateData.animationType = data.animationType;
        }

        return await db.update(topologyLinks)
            .set(updateData)
            .where(eq(topologyLinks.id, linkId));
    }

    /**
     * Update schematic coordinates (Upsert style to handle fallback nodes)
     */
    async updateCoords(routerId: string, nodeId: string, x: number, y: number, tenantId?: string) {
        // nodeId here is the SCHEMATIC ID (or systemId for fallback nodes)
        const [existing] = await db.select().from(topologyNodes).where(
            or(
                eq(topologyNodes.id, nodeId as any), // Try matching by schematic ID first
                and(
                    eq(topologyNodes.routerId, routerId),
                    eq(topologyNodes.nodeId, nodeId as any) // Match by system ID for fallback
                )
            )
        );

        if (existing) {
            return await db.update(topologyNodes)
                .set({
                    x: String(x),
                    y: String(y),
                    updatedAt: new Date()
                })
                .where(eq(topologyNodes.id, existing.id));
        } else {
            // If it doesn't exist (fallback node), create it
            // For fallback, nodeId is the targetRouter.id (system ID)
            return await db.insert(topologyNodes).values({
                routerId,
                nodeId, // Store system ID
                nodeType: 'router',
                x: String(x),
                y: String(y),
                tenantId
            });
        }
    }
}

export const topologyService = new TopologyService();
