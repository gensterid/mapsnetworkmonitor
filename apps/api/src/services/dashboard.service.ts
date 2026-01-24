import { routerService } from './router.service.js';
import { alertService } from './alert.service.js';

interface DashboardStats {
    routers: {
        total: number;
        online: number;
        offline: number;
        maintenance: number;
    };
    alerts: {
        total: number;
        critical: number;
        warning: number;
        info: number;
    };
}

interface MapMarker {
    id: string;
    name: string;
    host: string;
    status: string;
    latitude: number | null;
    longitude: number | null;
    location: string | null;
    groupId: string | null;
    lastSeen: Date | null;
}

/**
 * Dashboard Service - aggregates data for dashboard display
 */
export class DashboardService {
    /**
     * Get dashboard statistics
     */
    async getStats(): Promise<DashboardStats> {
        const routerStats = await routerService.countByStatus();
        const alertStats = await alertService.countBySeverity();

        return {
            routers: {
                total: routerStats.total,
                online: routerStats.online,
                offline: routerStats.offline,
                maintenance: routerStats.maintenance,
            },
            alerts: {
                total: alertStats.info + alertStats.warning + alertStats.critical,
                critical: alertStats.critical,
                warning: alertStats.warning,
                info: alertStats.info,
            },
        };
    }

    /**
     * Get map markers for all routers
     */
    async getMapMarkers(): Promise<MapMarker[]> {
        const routers = await routerService.findAll();

        return routers.map((router) => ({
            id: router.id,
            name: router.name,
            host: router.host,
            status: router.status,
            latitude: router.latitude ? parseFloat(router.latitude) : null,
            longitude: router.longitude ? parseFloat(router.longitude) : null,
            location: router.location,
            groupId: router.groupId,
            lastSeen: router.lastSeen,
        }));
    }

    /**
     * Get recent alerts for dashboard
     */
    async getRecentAlerts(limit = 10) {
        const result = await alertService.findUnacknowledged({ limit });
        return result.data;
    }
}

// Export singleton instance
export const dashboardService = new DashboardService();
