import { and, eq, inArray, or, notInArray, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { alerts } from '../db/schema/index.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { getThresholds, ISSUE_TYPES, CONNECTIVITY_TYPES, isIssue } from './alert-core.service.js';

export class AlertQueryService {
    /**
     * Check if alerts are enabled
     */
    async areAlertsEnabled(): Promise<boolean> {
        const thresholds = await getThresholds();
        return thresholds.alertsEnabled;
    }

    /**
     * Get all alerts (filtered by user access)
     */
    async findAll(options: {
        page?: number;
        limit?: number;
        sortOrder?: 'asc' | 'desc';
        startDate?: Date;
        endDate?: Date;
        userId?: string;
        userRole?: string;
        search?: string;
        routerId?: string;
        category?: 'issues' | 'alerts';
        resolved?: boolean;
        acknowledged?: boolean;
        tenantId?: string;
        type?: string | string[];
    } = {}): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        const page = options.page || 1;
        const limit = options.limit || 100;
        
        const categoryFilters: SQL[] = [];

        // RBAC filtering
        if (options.userId && options.userRole === 'user') {
            const { userRouters } = await import('../db/schema/index.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, options.userId));

            const routerIds = assigned.map((a) => a.routerId);
            if (routerIds.length === 0) {
                return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
            }
            categoryFilters.push(inArray(alerts.routerId, routerIds));
        }

        // Category filtering logic
        if (options.category) {
            if (options.category === 'issues') {
                categoryFilters.push(or(
                    inArray(alerts.type, ISSUE_TYPES as any),
                    and(
                        eq(alerts.severity, 'warning'),
                        notInArray(alerts.type, CONNECTIVITY_TYPES as any)
                    )
                ) as any);
            } else if (options.category === 'alerts') {
                categoryFilters.push(inArray(alerts.type, CONNECTIVITY_TYPES as any));
            }
        }

        const { data, total } = await alertRepository.findAll({
            ...options,
            categoryFilters
        });

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get unacknowledged alerts (filtered by user access)
     */
    async findUnacknowledged(options: any = {}) {
        return this.findAll({ ...options, acknowledged: false });
    }

    /**
     * Get alerts by router ID
     */
    async findByRouterId(routerId: string, limit = 50, tenantId?: string): Promise<any[]> {
        const { data } = await alertRepository.findAll({ routerId, limit, tenantId });
        return data;
    }

    /**
     * Get alert by ID
     */
    async findById(id: string, tenantId?: string) {
        return alertRepository.findById(id, { tenantId });
    }

    /**
     * Count unacknowledged alerts (filtered by user access)
     */
    async countUnacknowledged(userId?: string, userRole?: string, tenantId?: string): Promise<number> {
        let routerIds: string[] | undefined;

        if (userId && userRole === 'user') {
            const { userRouters } = await import('../db/schema/index.js');
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            routerIds = assigned.map((a) => a.routerId);
            if (routerIds.length === 0) return 0;
        }

        return alertRepository.countUnacknowledged({ tenantId, routerIds });
    }

    /**
     * Count alerts by severity (filtered by user access)
     */
    async countBySeverity(userId?: string, userRole?: string, tenantId?: string) {
        // For simplicity and to avoid too many repository methods, we can use findUnacknowledged or 
        // specialized repository methods. Let's keep this bit more direct but via repository if possible.
        const { data } = await this.findAll({ userId, userRole, tenantId, resolved: false });
        
        return {
            info: data.filter((a) => a.severity === 'info').length,
            warning: data.filter((a) => a.severity === 'warning').length,
            critical: data.filter((a) => a.severity === 'critical').length,
        };
    }

    /**
     * Get unread stats with breakdown by category
     */
    async getUnreadStats(userId?: string, userRole?: string, tenantId?: string) {
        const { data } = await this.findAll({ userId, userRole, tenantId, acknowledged: false });

        const issuesCount = data.filter(a => isIssue(a.type, a.severity)).length;
        const connectivityCount = data.length - issuesCount;

        return {
            total: data.length,
            issues: issuesCount,
            connectivity: connectivityCount,
            bySeverity: {
                info: data.filter((a) => a.severity === 'info').length,
                warning: data.filter((a) => a.severity === 'warning').length,
                critical: data.filter((a) => a.severity === 'critical').length,
            },
        };
    }
}

export const alertQueryService = new AlertQueryService();
