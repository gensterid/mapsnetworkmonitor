import { eq, or, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerInterfaces, routerNetwatch, olts, onus, topologyNodes, topologyLinks } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';
import { routerNetwatchService } from './router-netwatch.service.js';
import { metricRepository } from '../repositories/metric.repository.js';

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

        // Latest metrics (CPU/RAM/suhu) per router — untuk gauge live di node.
        // Ambil untuk semua router di skema + router root. routerMetrics pakai
        // snake_case (raw SQL SELECT *).
        const metricRouterIds = [
            ...routersInSchematic.map(r => r.id),
            targetRouter.id,
        ];
        const latestMetricsRows = await metricRepository.findLatestForRouters(metricRouterIds);
        const metricsMap: Record<string, any> = {};
        for (const m of latestMetricsRows) {
            metricsMap[m.router_id] = m;
        }
        const nodeMetrics = (routerId: string) => {
            const m = metricsMap[routerId];
            if (!m) return { cpuLoad: null, memoryPct: null, temperature: null };
            const cpuLoad = typeof m.cpu_load === 'number' ? m.cpu_load : null;
            const memoryPct = (m.total_memory && m.used_memory)
                ? Math.round((Number(m.used_memory) / Number(m.total_memory)) * 100)
                : null;
            const temperature = typeof m.temperature === 'number' ? m.temperature : null;
            return { cpuLoad, memoryPct, temperature };
        };

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
                notes: mNode.notes,
                model: device?.model || mNode.customType || 'custom',
                latency: device?.latency,
                uptime: device?.uptime,
                packetLoss: device?.packetLoss,
                boardName: device?.boardName,
                // Live metrics untuk gauge di badan node (router). Ambil dari
                // routerMetrics terbaru via metricsMap (bukan kolom routers).
                ...nodeMetrics(mNode.nodeId || ''),
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
                ...nodeMetrics(targetRouter.id),
            });
            // Also map it for edge resolution in case something links to it
            schematicNodeMap[targetRouter.id] = nodes[nodes.length - 1];
        }

        // 4. Fetch interface rates for all mapped devices
        const interfaceRates = nodeIds.length > 0
            ? await db.select({
                routerId: routerInterfaces.routerId,
                name: routerInterfaces.name,
                txRate: routerInterfaces.txRate,
                rxRate: routerInterfaces.rxRate
            })
            .from(routerInterfaces)
            .where(inArray(routerInterfaces.routerId, nodeIds))
            : [];

        const interfaceRateMap: Record<string, { tx: number, rx: number }> = {};
        interfaceRates.forEach(rate => {
            interfaceRateMap[`${rate.routerId}:${rate.name}`] = { 
                tx: rate.txRate || 0, 
                rx: rate.rxRate || 0 
            };
        });

        // Add netwatch rates to the map (netwatch has direct txRate/rxRate)
        netwatchInSchematic.forEach(n => {
            interfaceRateMap[`${n.id}:netwatch`] = { 
                tx: n.txRate || 0, 
                rx: n.rxRate || 0 
            };
        });

        // 5. Resolve Edges (Using Schematic IDs)
        for (const link of manualLinks) {
            const fromNode = schematicNodeMap[link.sourceNodeId];
            const toNode = schematicNodeMap[link.targetNodeId];
 
            if (fromNode && toNode) {
                // Determine base rates from DB polling
                let txRate = 0;
                let rxRate = 0;

                // Helper for fuzzy match on static data (best effort)
                const getStaticStats = (deviceId: string, iface: string | null) => {
                    if (!iface || !deviceId) return null;
                    const exact = interfaceRateMap[`${deviceId}:${iface}`];
                    if (exact) return exact;
                    
                    // Netwatch fallback (if the interface name is 'netwatch' or matches the netwatch entry)
                    if (iface.toLowerCase() === 'netwatch' || iface === deviceId) {
                        return interfaceRateMap[`${deviceId}:netwatch`];
                    }

                    // Basic prefix search for things like 'ether1-WAN' vs 'ether1'
                    const partialMatchKey = Object.keys(interfaceRateMap).find(k => 
                        k.startsWith(`${deviceId}:`) && 
                        (k.toLowerCase().includes(iface.toLowerCase()) || iface.toLowerCase().includes(k.split(':')[1].toLowerCase()))
                    );
                    return partialMatchKey ? interfaceRateMap[partialMatchKey] : null;
                };

                // Try source side
                if (link.sourceInterface && fromNode.systemId) {
                    const stats = getStaticStats(fromNode.systemId, link.sourceInterface);
                    if (stats) {
                        txRate = stats.tx;
                        rxRate = stats.rx;
                    }
                }

                // Fallback to target side (Swap TX/RX)
                if (txRate === 0 && rxRate === 0 && link.targetInterface && toNode.systemId) {
                    const stats = getStaticStats(toNode.systemId, link.targetInterface);
                    if (stats) {
                        txRate = stats.rx; // Perspective flip
                        rxRate = stats.tx;
                    }
                }

                edges.push({
                    id: link.id,
                    from: link.sourceNodeId,
                    to: link.targetNodeId,
                    fromInterface: link.sourceInterface,
                    toInterface: link.targetInterface,
                    sourceHandle: link.sourceHandle,
                    targetHandle: link.targetHandle,
                    status: fromNode.status !== 'offline' && toNode.status !== 'offline' ? 'up' : 'down',
                    pathOffset: link.pathOffset || '0',
                    animationType: link.animationType || 'pulse',
                    notes: link.notes,
                    txRate,
                    rxRate
                });
            }
        }

        return { nodes, edges };
    }

    /**
     * Add a device to the router's schematic
     */
    async addNode(routerId: string, nodeId: string | null, nodeType: string, tenantId?: string, customData?: { name?: string, host?: string }) {
        let finalNodeId = nodeId;

        // NEW: If no nodeId but host is provided, auto-create/link an app-only netwatch entry
        if (!finalNodeId && customData?.host && customData.host !== '0.0.0.0' && customData.host !== '') {
            try {
                finalNodeId = await routerNetwatchService.ensureAppOnlyEntry(
                    routerId,
                    customData.host,
                    customData.name || 'Unmapped Node',
                    nodeType as any,
                    tenantId,
                    null // No existing ID yet
                );
            } catch (err) {
                // Ignore validation errors (like partial IPs during creation)
                if (err instanceof Error && !err.message.includes('Invalid or partial host')) {
                    logger.error({ err: err.message, host: customData.host }, 'Failed to auto-create netwatch for topology node');
                }
            }
        }

        // If nodeId is provided (or was just created), check if already exists in this schematic
        if (finalNodeId) {
            const [existing] = await db.select()
                .from(topologyNodes)
                .where(and(eq(topologyNodes.routerId, routerId), eq(topologyNodes.nodeId, finalNodeId)));

            if (existing) return existing;
        }

        const [newNode] = await db.insert(topologyNodes).values({
            routerId,
            nodeId: finalNodeId,
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

        // Get the node before deleting to check for linked netwatch
        const [node] = await db.select().from(topologyNodes)
            .where(and(eq(topologyNodes.routerId, routerId), eq(topologyNodes.id, nodeId)));

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

        const result = await db.delete(topologyNodes).where(
            and(
                eq(topologyNodes.routerId, routerId),
                eq(topologyNodes.id, nodeId) // Match by schematic ID
            )
        );

        // Sync: If linked to an app-only netwatch entry, delete it too
        // Safety: MikroTik-synced entries (isAppOnly=false) are NOT deleted
        if (node?.nodeId) {
            try {
                const [nw] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, node.nodeId));
                if (nw?.isAppOnly) {
                    await db.delete(routerNetwatch).where(eq(routerNetwatch.id, nw.id));
                    logger.info({ netwatchId: nw.id, host: nw.host, routerId }, 'Topology: Deleted linked app-only netwatch entry');
                }
            } catch (err) {
                logger.error({ err, nodeId: node.nodeId, routerId }, 'Topology: Failed to cleanup linked netwatch entry');
            }
        }

        return result;
    }

    /**
     * Update a schematic node (e.g. mapping to system ID)
     */
    async updateNode(nodeIdInTopology: string, data: { nodeId?: string | null, nodeType?: string, customName?: string, customHost?: string, routerId?: string, notes?: string }) {
        // Try to update by primary key first
        const [existing] = await db.select().from(topologyNodes).where(eq(topologyNodes.id, nodeIdInTopology as any));

        if (existing) {
            const updateData: any = {
                ...data,
                updatedAt: new Date()
            };

            // NEW: If customHost is being updated and there's no system nodeId,
            // or if we want to refresh the app-only link
            const hostToUse = data.customHost || existing.customHost;
            if (hostToUse && hostToUse !== '0.0.0.0' && hostToUse !== '') {
                // Only auto-link if it's currently unmapped or a device that should be monitored
                const isUnmapped = !existing.nodeId;
                const isMonitorable = ['netwatch', 'router', 'olt', 'switch', 'client'].includes(existing.nodeType || '');

                if (isUnmapped || isMonitorable) {
                    try {
                        const targetRouterId = data.routerId || existing.routerId;
                        const netwatchId = await routerNetwatchService.ensureAppOnlyEntry(
                            targetRouterId,
                            hostToUse,
                            data.customName || existing.customName || 'Updated Node',
                            (data.nodeType || existing.nodeType) as any,
                            existing.tenantId || undefined,
                            existing.nodeId // Pass existing ID to update in-place!
                        );

                        // If the nodeId changed (promotion or host change) and the old one was AppOnly, 
                        // we should consider cleaning up the old one if it's no longer used.
                        if (existing.nodeId && existing.nodeId !== netwatchId) {
                            const [oldNw] = await db.select().from(routerNetwatch).where(eq(routerNetwatch.id, existing.nodeId));
                            if (oldNw?.isAppOnly) {
                                await db.delete(routerNetwatch).where(eq(routerNetwatch.id, existing.nodeId));
                                logger.info({ oldId: existing.nodeId, newId: netwatchId }, 'Topology: Cleaned up orphaned app-only netwatch entry');
                            }
                        }

                        updateData.nodeId = netwatchId;
                    } catch (err) {
                        // If it fails (e.g. invalid IP), we just don't update the nodeId mapping
                        logger.error({ err: err instanceof Error ? err.message : String(err), host: hostToUse }, 'Failed to update netwatch link for topology node');
                    }
                }
            }

            return await db.update(topologyNodes)
                .set(updateData)
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
    async addLink(routerId: string, sourceId: string, targetId: string, sourceInterface: string, targetInterface: string, tenantId?: string, pathOffset?: string, sourceHandle?: string, targetHandle?: string, notes?: string) {
        const [newLink] = await db.insert(topologyLinks).values({
            routerId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            sourceInterface,
            targetInterface,
            sourceHandle,
            targetHandle,
            notes,
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
    async updateLink(linkId: string, data: { sourceInterface?: string, targetInterface?: string, pathOffset?: string | number, animationType?: string, sourceHandle?: string, targetHandle?: string, notes?: string }) {
        const updateData: any = {
            ...data,
            updatedAt: new Date()
        };

        if (data.pathOffset !== undefined) {
            updateData.pathOffset = String(data.pathOffset);
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
