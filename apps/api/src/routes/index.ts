import { Router } from 'express';
import authRoutes from './auth.routes.js';
import routerRoutes from './router.routes.js';
import alertRoutes from './alert.routes.js';
import groupRoutes from './group.routes.js';
import userRoutes from './user.routes.js';
import userRouterRoutes from './user-router.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import settingsRoutes from './settings.routes.js';
import analyticsRoutes from './analytics.routes.js';
import pppoeRoutes from './pppoe.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { eventsRoutes } from './events.routes.js';
import oltRoutes from './olt.routes.js';
import genieacsRoutes from './genieacs.routes.js';
import presetRoutes from './preset.routes.js';
import mapRoutes from './map.routes.js';
import webhookRoutes from './webhook.routes.js';
import aiRoutes from './ai.routes.js';
import tenantRoutes from './tenant.routes.js';
import genieacsDashboardRoutes from './genieacs-dashboard.routes.js';
import bandwidthRoutes from './bandwidth.routes.js';
import billingRoutes from './billing.routes.js';
import portalRoutes from './portal.routes.js';
import diagnosticsRoutes from './diagnostics.routes.js';
import mikhmonRoutes from './mikhmon.routes.js';
import vpnServerRoutes from './vpn-server.routes.js';
import searchRoutes from './search.routes.js';
import customer360Routes from './customer-360.routes.js';
import backupRoutes from './backup.routes.js';

const router = Router();

// Health check endpoint
router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/routers', routerRoutes);
router.use('/alerts', alertRoutes);
router.use('/groups', groupRoutes);
router.use('/users', userRoutes);
router.use('/users', userRouterRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/pppoe', pppoeRoutes);
router.use('/notification-groups', notificationRoutes);
router.use('/events', eventsRoutes);
router.use('/olts', oltRoutes);
router.use('/genieacs', genieacsRoutes);
router.use('/presets', presetRoutes);
router.use('/map', mapRoutes);
router.use('/webhook', webhookRoutes);
router.use('/ai', aiRoutes);
router.use('/tenants', tenantRoutes);
router.use('/genieacs-dashboard', genieacsDashboardRoutes);
router.use('/bandwidth', bandwidthRoutes);
router.use('/billing', billingRoutes);
router.use('/portal', portalRoutes);
router.use('/diagnostics', diagnosticsRoutes);
router.use('/mikhmon', mikhmonRoutes);
router.use('/superadmin/vpn-servers', vpnServerRoutes);
router.use('/search', searchRoutes);
router.use('/customers', customer360Routes);
router.use('/backup', backupRoutes);

export default router;


