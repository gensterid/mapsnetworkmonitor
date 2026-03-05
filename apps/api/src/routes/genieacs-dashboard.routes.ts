import { Router } from 'express';
import { genieacsService } from '../services/genieacs.service.js';
import { logger } from '../lib/logger.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
const getEffectiveTenantId = (req: any) => req.user?.role === 'superadmin' ? undefined : req.user?.tenantId!;

const router = Router();

/**
 * Get ACS Dashboard Statistics
 */
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const routerId = req.query.routerId as string | undefined;
        // @ts-ignore
        const devices = await genieacsService.getDevices(routerId, getEffectiveTenantId(req));

        const stats = {
            total: devices.length,
            online: 0,
            offline: 0,
            avgUptimeSeconds: 0,
            signalDistribution: {
                excellent: 0, // > -20
                good: 0,      // -20 to -24
                fair: 0,      // -25 to -27
                poor: 0,      // < -27
                noSignal: 0
            },
            vendorDistribution: {} as Record<string, number>,
            modelDistribution: {} as Record<string, number>,
            recentActivity: devices
                .filter(d => d._lastInform)
                .sort((a, b) => new Date(b._lastInform).getTime() - new Date(a._lastInform).getTime())
                .slice(0, 10)
        };

        let totalUptime = 0;
        let uptimeCount = 0;

        devices.forEach(dev => {
            // Online/Offline (based on 5 min window)
            const lastInform = dev._lastInform ? new Date(dev._lastInform).getTime() : 0;
            const isOnline = lastInform > Date.now() - 5 * 60 * 1000;

            if (isOnline) stats.online++;
            else stats.offline++;

            // Signal distribution
            const rxPower = parseFloat(dev._rxPower || '0');
            if (!dev._rxPower || rxPower === 0) stats.signalDistribution.noSignal++;
            else if (rxPower >= -20) stats.signalDistribution.excellent++;
            else if (rxPower >= -24) stats.signalDistribution.good++;
            else if (rxPower >= -27) stats.signalDistribution.fair++;
            else stats.signalDistribution.poor++;

            // Vendor & Model
            const vendor = dev._manufacturer || 'Unknown';
            stats.vendorDistribution[vendor] = (stats.vendorDistribution[vendor] || 0) + 1;

            const model = dev._productClass || 'Unknown';
            stats.modelDistribution[model] = (stats.modelDistribution[model] || 0) + 1;

            // Uptime (if available from TR-069)
            // Uptime is usually InternetGatewayDevice.DeviceInfo.UpTime
            // In our service we already extract it into _uptime formatted string, 
            // but for average we might want raw value.
            // For now, let's just use the count of online devices as a proxy for the simple AVG.
        });

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error({ err: error }, 'ACS Stats Error');
        res.status(500).json({ success: false, message: 'Failed to fetch ACS statistics' });
    }
});

export default router;
