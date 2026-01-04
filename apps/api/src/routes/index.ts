import { Router } from 'express';
import authRoutes from './auth.routes';
import routerRoutes from './router.routes';
import alertRoutes from './alert.routes';
import groupRoutes from './group.routes';
import userRoutes from './user.routes';
import userRouterRoutes from './user-router.routes';
import dashboardRoutes from './dashboard.routes';
import settingsRoutes from './settings.routes';
import { notificationRoutes } from './notification.routes';
import { eventsRoutes } from './events.routes';

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
router.use('/notification-groups', notificationRoutes);
router.use('/events', eventsRoutes);

export default router;
