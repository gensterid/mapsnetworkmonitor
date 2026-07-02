import { Router } from 'express';
import { z } from 'zod';
import { topologyService } from '../services/topology.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireOperator } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { logger } from '../lib/logger.js';

// Merge params to access :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/routers/:id/topology
 * Get topology tree for a specific router
 */
router.get(
    '/',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const topology = await topologyService.getRouterTopology(id, getEffectiveTenantId(req));
        res.json({ data: topology });
    })
);

/**
 * PATCH /api/routers/topology/coords
 * Update node schematic coordinates
 * NOTE: This is mounted at /api/routers/topology/coords in the main index,
 * so this sub-router might not be the best place if it doesn't have :id.
 * However, the original router.routes.ts had it as /topology/coords.
 */
router.patch(
    '/coords',
    requireOperator,
    asyncHandler(async (req, res) => {
        const schema = z.object({
            routerId: z.string().uuid(),
            nodeId: z.string().uuid(),
            x: z.number(),
            y: z.number(),
        });
        const { routerId, nodeId, x, y } = schema.parse(req.body);
        await topologyService.updateCoords(routerId, nodeId, x, y, getEffectiveTenantId(req));
        res.json({ data: { success: true } });
    })
);

/**
 * POST /api/routers/:id/topology/nodes
 * Add a node to the schematic
 */
router.post(
    '/nodes',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const schema = z.object({
            nodeId: z.string().uuid().nullable().optional(),
            nodeType: z.string(),
            name: z.string().optional(),
            host: z.string().optional(),
        });
        const { nodeId, nodeType, name, host } = schema.parse(req.body);
        const node = await topologyService.addNode(
            id,
            nodeId || null,
            nodeType,
            getEffectiveTenantId(req),
            name || host ? { name, host } : undefined
        );
        res.json({ data: node });
    })
);

/**
 * DELETE /api/routers/:id/topology/nodes/:nodeId
 * Remove a node from the schematic
 */
router.delete(
    '/nodes/:nodeId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const nodeId = req.params.nodeId as string;
        await topologyService.removeNode(id, nodeId, getEffectiveTenantId(req));
        res.json({ data: { success: true } });
    })
);

/**
 * PATCH /api/routers/topology/nodes/:nodeId
 */
router.patch(
    '/nodes/:nodeId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const nodeId = req.params.nodeId as string;
        const schema = z.object({
            customName: z.string().optional().nullable(),
            customHost: z.string().optional().nullable(),
            nodeType: z.string().optional(),
            notes: z.string().optional().nullable(),
            routerId: z.string().uuid().optional(),
        });
        const data = schema.parse(req.body);
        const result = await topologyService.updateNode(nodeId, data as any, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * POST /api/routers/topology/links
 */
router.post(
    '/links',
    requireOperator,
    asyncHandler(async (req, res) => {
        const schema = z.object({
            routerId: z.string().uuid(),
            sourceNodeId: z.string(),
            targetNodeId: z.string(),
            sourceInterface: z.string().optional().nullable(),
            targetInterface: z.string().optional().nullable(),
            pathOffset: z.string().or(z.number()).optional().nullable(),
            sourceHandle: z.string().optional().nullable(),
            targetHandle: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
        });
        const { routerId, sourceNodeId, targetNodeId, sourceInterface, targetInterface, pathOffset, sourceHandle, targetHandle, notes } = schema.parse(req.body);
        const link = await topologyService.addLink(
            routerId,
            sourceNodeId,
            targetNodeId,
            sourceInterface || '',
            targetInterface || '',
            getEffectiveTenantId(req),
            pathOffset ? String(pathOffset) : undefined,
            sourceHandle || undefined,
            targetHandle || undefined,
            notes || undefined
        );
        res.json({ data: link });
    })
);

/**
 * DELETE /api/routers/topology/links/:linkId
 */
router.delete(
    '/links/:linkId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const linkId = req.params.linkId as string;
        await topologyService.removeLink(linkId, getEffectiveTenantId(req));
        res.json({ data: { success: true } });
    })
);

/**
 * PATCH /api/routers/topology/links/:linkId
 */
router.patch(
    '/links/:linkId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const linkId = req.params.linkId as string;
        const schema = z.object({
            sourceInterface: z.string().optional().nullable(),
            targetInterface: z.string().optional().nullable(),
            pathOffset: z.string().or(z.number()).optional().nullable(),
            animationType: z.string().optional(),
            sourceHandle: z.string().optional().nullable(),
            targetHandle: z.string().optional().nullable(),
            notes: z.string().optional().nullable(),
        });
        const data = schema.parse(req.body);
        const result = await topologyService.updateLink(linkId, data as any, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

export default router;
