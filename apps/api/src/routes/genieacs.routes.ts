import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error.middleware.js';
import { requireOperator, requireAdmin } from '../middleware/rbac.middleware.js';
import { genieacsService } from '../services/genieacs.service.js';
import { routerService } from '../services/router.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEffectiveTenantId } from '../lib/tenant-utils.js';
import { db } from '../db/index.js';
import { onus } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

const router = Router();

// Validation schemas
const getDevicesSchema = z.object({
    query: z.string().optional().transform(val => val ? JSON.parse(val) : {}),
    routerId: z.string().optional(),
});

const setParameterSchema = z.object({
    parameterName: z.string().min(1),
    value: z.any(),
    type: z.string().optional(),
});

const wanConfigSchema = z.object({
    wanType: z.enum(['pppoe', 'ip']),
    connectionMode: z.enum(['route', 'bridge']).optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    ipAddress: z.string().optional(),
    subnetMask: z.string().optional(),
    defaultGateway: z.string().optional(),
    dnsServers: z.string().optional(),
    vlanId: z.number().optional(),
    enable: z.boolean().optional(),
    connectionIndex: z.number().optional(),
    addressingType: z.enum(['Static', 'DHCP']).optional(),
    bindPorts: z.string().optional(),
    connectionPath: z.string().optional(),
    dhcpServerEnable: z.boolean().optional(),
    remoteAccessEnable: z.boolean().optional(),
});

const wifiConfigSchema = z.object({
    ssidIndex: z.number().default(1),
    enable: z.boolean().optional(),
    ssid: z.string().optional(),
    password: z.string().optional(),
    securityMode: z.enum(['Open', 'WPA2-PSK', 'WPA-WPA2-Mixed']).optional(),
    encryption: z.enum(['AES', 'TKIP+AES']).optional(),
    hidden: z.boolean().optional(),
    channel: z.union([z.number(), z.literal('Auto')]).optional(),
});

const acsSettingsSchema = z.object({
    url: z.string().url(),
    username: z.string().optional(),
    password: z.string().optional(),
});

const bulkActionSchema = z.object({
    deviceIds: z.array(z.string()).min(1),
});

const bulkConfigSchema = bulkActionSchema.extend({
    type: z.enum(['wan', 'wifi']),
    config: z.any(),
});

// Require auth for all routes
router.use(authMiddleware);

/**
 * GET /api/genieacs/devices
 * List all devices
 */
router.get(
    '/devices',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { query, routerId } = getDevicesSchema.parse(req.query);

        // Access Control
        if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
            if (!routerId) {
                throw ApiError.forbidden('Router ID is required for non-admins');
            }
            const hasAccess = await routerService.hasAccess(req.user!.id, req.user!.role, routerId);
            if (!hasAccess) {
                throw ApiError.forbidden('Access denied to this router');
            }
        }

        const devices = await genieacsService.getDevices(routerId, getEffectiveTenantId(req), query);
        res.json({ data: devices });
    })
);

/**
 * GET /api/genieacs/devices/:id
 * Get device details
 */
router.get(
    '/devices/:id',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;

        // Access Control
        if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
            if (!routerId) throw ApiError.forbidden('Router ID is required for non-admins');
            const hasAccess = await routerService.hasAccess(req.user!.id, req.user!.role, routerId);
            if (!hasAccess) throw ApiError.forbidden('Access denied');
        }

        const device = await genieacsService.getDevice(id, routerId, getEffectiveTenantId(req));
        if (!device) {
            throw ApiError.notFound('Device not found');
        }
        res.json({ data: device });
    })
);

/**
 * POST /api/genieacs/devices/:id/reboot
 * Reboot device
 */
router.post(
    '/devices/:id/reboot',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.rebootDevice(id, routerId, getEffectiveTenantId(req));
        
        if (result.success) {
            res.json({ data: result });
        } else {
            res.status(400).json({ message: result.error });
        }
    })
);

/**
 * PATCH /api/genieacs/devices/:id/parameters
 * Update device parameters
 */
router.patch(
    '/devices/:id/parameters',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const { parameterName, value, type } = setParameterSchema.parse(req.body);

        const result = await genieacsService.setParameter(id, parameterName, value, type, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * PATCH /api/genieacs/devices/:id/wan-config
 * Update device WAN configuration
 */
router.patch(
    '/devices/:id/wan-config',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const config = wanConfigSchema.parse(req.body);

        const result = await genieacsService.updateWanConfig(id, config, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * DELETE /api/genieacs/devices/:id/wan-config
 * Delete a WAN connection instance
 */
router.delete(
    '/devices/:id/wan-config',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const { connectionPath } = z.object({ connectionPath: z.string().min(1) }).parse(req.body);

        const result = await genieacsService.deleteWanConnection(id, connectionPath, routerId, getEffectiveTenantId(req));
        if (result.success) {
            res.json({ data: { success: true, taskId: result.taskId } });
        } else {
            res.status(400).json({ error: result.error });
        }
    })
);

/**
 * PATCH /api/genieacs/devices/:id/wifi-config
 * Update device WiFi configuration
 */
router.patch(
    '/devices/:id/wifi-config',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const config = wifiConfigSchema.parse(req.body);

        const result = await genieacsService.updateWifiConfig(id, config, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * PATCH /api/genieacs/devices/:id/acs-settings
 * Update Management Server (ACS) settings
 */
router.patch(
    '/devices/:id/acs-settings',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const settings = acsSettingsSchema.parse(req.body);

        const result = await genieacsService.updateAcsSettings(id, settings, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * POST /api/genieacs/devices/:id/refresh
 * Refresh device (Summon)
 */
router.post(
    '/devices/:id/refresh',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.refreshDevice(id, routerId, getEffectiveTenantId(req));
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    })
);

/**
 * POST /api/genieacs/devices/:id/factory-reset
 * Factory Reset device
 */
router.post(
    '/devices/:id/factory-reset',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.factoryReset(id, routerId, getEffectiveTenantId(req));
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: result.error });
        }
    })
);

/**
 * POST /api/genieacs/devices/bulk/reboot
 * Bulk Reboot
 */
router.post(
    '/devices/bulk/reboot',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { deviceIds } = bulkActionSchema.parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.bulkReboot(deviceIds, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * POST /api/genieacs/devices/bulk/config
 * Bulk Push Config
 */
router.post(
    '/devices/bulk/config',
    requireOperator,
    asyncHandler(async (req, res) => {
        const { deviceIds, type, config } = bulkConfigSchema.parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.bulkPushConfig(deviceIds, type, config, routerId, getEffectiveTenantId(req));
        res.json({ data: result });
    })
);

/**
 * GET /api/genieacs/devices/:id/backups
 * Get all backups for a device
 */
router.get(
    '/devices/:id/backups',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        // First get the ONU to get its UUID
        const device = await genieacsService.getDevice(id, req.query.routerId as string, getEffectiveTenantId(req));
        if (!device) throw ApiError.notFound('Device not found');

        const sn = device._deviceId._SerialNumber;
        let [onu] = await db.select().from(onus).where(eq(onus.sn, sn)).limit(1);
        
        // Suffix fallback for vendors with varying OUI prefixes (e.g. FiberHome)
        if (!onu && sn.length > 8) {
            const suffix = sn.substring(sn.length - 8);
            [onu] = await db.select().from(onus).where(sql`${onus.sn} LIKE ${'%' + suffix}`).limit(1);
        }

        if (!onu) throw ApiError.notFound(`ONU record with SN ${sn} not found in inventory.`);

        const backups = await genieacsService.getBackups(onu.id, device._deviceId?._ProductClass);
        res.json({ data: backups });
    })
);

/**
 * POST /api/genieacs/devices/:id/backup
 * Create a new backup
 */
router.post(
    '/devices/:id/backup',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.backupDevice(id, name, routerId, getEffectiveTenantId(req));
        res.json(result);
    })
);

/**
 * POST /api/genieacs/devices/:id/restore-auto
 * Restore configuration automatically
 */
router.post(
    '/devices/:id/restore-auto',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const { backupId, selectedWanIndices } = z.object({ 
            backupId: z.string().uuid(),
            selectedWanIndices: z.array(z.number()).optional()
        }).parse(req.body);
        const routerId = req.query.routerId as string | undefined;

        const result = await genieacsService.restoreDeviceAuto(id, backupId, routerId, getEffectiveTenantId(req), selectedWanIndices);
        res.json(result);
    })
);

/**
 * DELETE /api/genieacs/devices/:id/backups/:backupId
 * Delete a backup
 */
router.delete(
    '/devices/:id/backups/:backupId',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const backupId = req.params.backupId as string;
        const routerId = req.query.routerId as string | undefined;

        // Verify device access First (Generic for all routes)
        const device = await genieacsService.getDevice(id, routerId, getEffectiveTenantId(req));
        if (!device) throw ApiError.notFound('Device not found or access denied');

        const result = await genieacsService.deleteBackup(backupId, getEffectiveTenantId(req));
        if (result.success) {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: result.error });
        }
    })
);

/**
 * POST /api/genieacs/devices/:id/restore-manual
 * Restore configuration manually
 */
router.post(
    '/devices/:id/restore-manual',
    requireOperator,
    asyncHandler(async (req, res) => {
        const id = req.params.id as string;
        const routerId = req.query.routerId as string | undefined;
        // Basic validation for manual config
        const config = req.body;
        if (!config.vlanId && !config.ssid && !config.ssidIndex) {
            throw ApiError.badRequest('Either WAN (VLAN ID) or WiFi configuration is required');
        }

        const result = await genieacsService.restoreDeviceManual(id, config, routerId, getEffectiveTenantId(req));
        res.json(result);
    })
);

/**
 * GET /api/genieacs/test-connection
 * Test connection to GenieACS
 */
router.get(
    '/test-connection',
    requireOperator,
    asyncHandler(async (req, res) => {
        const routerId = req.query.routerId as string | undefined;
        const result = await genieacsService.testConnection(routerId);
        res.json(result);
    })
);

export default router;
