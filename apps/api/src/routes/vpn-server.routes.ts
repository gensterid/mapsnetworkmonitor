import { Router } from 'express';
import { z } from 'zod';
import { vpnServerService } from '../services/vpn-server.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';

const router = Router();

// Semua endpoint VPN server hanya untuk SuperAdmin.
// Auth dulu, baru role gate.
router.use(authMiddleware);
router.use(requireRole('superadmin'));

/**
 * Schemas validation
 */
const createSchema = z.object({
    name: z.string().min(1).max(100),
    region: z.string().max(50).nullable().optional(),
    type: z.enum(['openvpn']),                           // future: 'l2tp', 'sstp'
    enabled: z.boolean().optional(),
    priority: z.number().int().min(1).max(9).optional(),
    notes: z.string().max(1000).nullable().optional(),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535),
    proto: z.enum(['tcp', 'udp']).optional(),
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(255),
    mode: z.enum(['tap', 'tun']).optional(),
    cipher: z.string().max(50).optional(),
    auth: z.string().max(50).optional(),
    caCertPem: z.string().nullable().optional(),
    verifyServerCert: z.boolean().optional(),
    extraConfig: z.string().nullable().optional(),
    clientSubnet: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, 'Format CIDR salah'),
});

const updateSchema = createSchema.partial().extend({
    password: z.string().min(1).max(255).nullable().optional(),  // null = jangan ubah
});

/**
 * GET /api/superadmin/vpn-servers/summary
 * Aggregate untuk dashboard cards.
 */
router.get(
    '/summary',
    asyncHandler(async (_req, res) => {
        const summary = await vpnServerService.getSummary();
        res.json({ data: summary });
    })
);

/**
 * GET /api/superadmin/vpn-servers
 * List semua VPN server.
 */
router.get(
    '/',
    asyncHandler(async (_req, res) => {
        const list = await vpnServerService.findAll();
        res.json({ data: list });
    })
);

/**
 * GET /api/superadmin/vpn-servers/:id
 * Detail 1 VPN server.
 */
router.get(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const item = await vpnServerService.findById(id);
        if (!item) throw ApiError.notFound('VPN server tidak ditemukan');
        res.json({ data: item });
    })
);

/**
 * GET /api/superadmin/vpn-servers/:id/status
 * Realtime status (dipanggil polling 10s dari UI).
 */
router.get(
    '/:id/status',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const item = await vpnServerService.findById(id);
        if (!item) throw ApiError.notFound('VPN server tidak ditemukan');

        res.json({
            data: {
                id: item.id,
                status: item.status,
                tunnelIp: item.tunnelIp,
                lastConnectedAt: item.lastConnectedAt,
                lastDisconnectedAt: item.lastDisconnectedAt,
                lastError: item.lastError,
                lastCheckedAt: item.lastCheckedAt,
                connectionAttempts: item.connectionAttempts,
            }
        });
    })
);

/**
 * GET /api/superadmin/vpn-servers/:id/clients
 * List router yang link ke VPN ini.
 */
router.get(
    '/:id/clients',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const item = await vpnServerService.findById(id);
        if (!item) throw ApiError.notFound('VPN server tidak ditemukan');

        const clients = await vpnServerService.listClients(id);
        res.json({ data: clients, total: clients.length });
    })
);

/**
 * POST /api/superadmin/vpn-servers
 * Create VPN server baru.
 */
router.post(
    '/',
    asyncHandler(async (req, res) => {
        const userId = req.user!.id;
        const data = createSchema.parse(req.body);
        const created = await vpnServerService.create(data, userId);
        res.status(201).json({ data: created });
    })
);

/**
 * PATCH /api/superadmin/vpn-servers/:id
 * Update VPN server. Password optional — kalau dikirim, akan re-encrypt.
 */
router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userId = req.user!.id;
        const data = updateSchema.parse(req.body);
        const updated = await vpnServerService.update(id, data, userId);
        res.json({ data: updated });
    })
);

/**
 * DELETE /api/superadmin/vpn-servers/:id
 * Block delete kalau ada router linked. Response 409 dengan
 * details.linkedRouters supaya UI bisa tampilkan ke operator.
 */
router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userId = req.user!.id;
        await vpnServerService.delete(id, userId);
        res.status(204).end();
    })
);

/**
 * POST /api/superadmin/vpn-servers/:id/connect
 * Trigger connect — async. UI poll status untuk lihat hasil.
 * Phase 3.3 akan wire ke connection-manager service yang spawn systemd unit.
 */
router.post(
    '/:id/connect',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userId = req.user!.id;
        await vpnServerService.requestConnect(id, userId);
        res.status(202).json({ data: { status: 'connecting' } });
    })
);

/**
 * POST /api/superadmin/vpn-servers/:id/disconnect
 */
router.post(
    '/:id/disconnect',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userId = req.user!.id;
        await vpnServerService.requestDisconnect(id, userId);
        res.status(202).json({ data: { status: 'disconnected' } });
    })
);

/**
 * POST /api/superadmin/vpn-servers/:id/reconnect
 * Restart unit via connection-manager — 1 systemctl restart call.
 */
router.post(
    '/:id/reconnect',
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const userId = req.user!.id;
        await vpnServerService.requestReconnect(id, userId);
        res.status(202).json({ data: { status: 'connecting' } });
    })
);

export default router;
