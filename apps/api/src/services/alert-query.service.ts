import { eq, desc, asc, and, or, ilike, isNull, getTableColumns, gte, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    alerts,
    userRouters,
    users,
    routers,
    type Alert,
} from '../db/schema/index.js';
import { getThresholds, ISSUE_TYPES, CONNECTIVITY_TYPES } from './alert-core.service.js';

export class AlertQueryService {
    /**
     * Check if alerts are enabled
     */
    async areAlertsEnabled(): Promise<boolean> {
        const thresholds = await getThresholds();
        return thresholds.alertsEnabled;
    }

    /**
     * Check if alert is an "issue" (System/Performance) vs "alert" (Connectivity/Status)
     */
    isIssue(alert: Alert): boolean {
        const issueTypes = ISSUE_TYPES;

        if (issueTypes.includes(alert.type)) return true;
        if (alert.type === 'threshold') return true;

        // Warnings that are NOT connectivity related are issues
        if (alert.severity === 'warning' &&
            !alert.type?.includes('status_change') &&
            !alert.type?.includes('down') &&
            !alert.type?.includes('offline') &&
            !alert.type?.includes('pppoe') &&
            !alert.type?.includes('interface') &&
            !alert.type?.includes('netwatch')) {
            return true;
        }

        return false;
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
        tenantId?: string;
        type?: string | string[];
    } = {}): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        const page = options.page || 1;
        const limit = options.limit || 100;
        const offset = (page - 1) * limit;
        const sortOrder = options.sortOrder || 'desc';

        // Base query
        let query = db
            .select({
                ...getTableColumns(alerts),
                acknowledgedByName: users.name,
                routerName: routers.name,
            })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .$dynamic();

        // Count query
        let countQuery = db
            .select({ count: alerts.id })
            .from(alerts)
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .$dynamic();

        const filters = [];

        if (options.tenantId) {
            filters.push(eq(alerts.tenantId, options.tenantId));
        }

        // Resolved/Unresolved filter
        if (options.resolved !== undefined) {
            filters.push(eq(alerts.resolved, options.resolved));
        }

        // Date filtering
        if (options.startDate) {
            filters.push(gte(alerts.createdAt, options.startDate));
        }
        if (options.endDate) {
            filters.push(lte(alerts.createdAt, options.endDate));
        }

        // Router ID filtering
        if (options.routerId) {
            filters.push(eq(alerts.routerId, options.routerId));
        }

        // Alert Type filtering
        if (options.type) {
            if (Array.isArray(options.type)) {
                filters.push(inArray(alerts.type, options.type as any));
            } else {
                filters.push(eq(alerts.type, options.type as any));
            }
        }

        // Search filtering
        if (options.search) {
            const searchTerm = `%${options.search}%`;
            filters.push(or(
                ilike(alerts.title, searchTerm),
                ilike(alerts.message, searchTerm),
                ilike(sql`${alerts.type}::text`, searchTerm),
                ilike(routers.name, searchTerm)
            ));
        }

        // Filter for non-superadmins
        if (options.userId && options.userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, options.userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return {
                    data: [],
                    meta: { total: 0, page, limit, totalPages: 0 }
                };
            }

            filters.push(inArray(alerts.routerId, routerIds));
        }

        // Category filtering
        if (options.category) {
            if (options.category === 'issues') {
                filters.push(inArray(alerts.type, ISSUE_TYPES as any));
            } else if (options.category === 'alerts') {
                filters.push(inArray(alerts.type, CONNECTIVITY_TYPES as any));
            }
        }

        if (filters.length > 0) {
            query = query.where(and(...filters)) as any;
            countQuery = countQuery.where(and(...filters)) as any;
        }

        // Get total count
        const totalResult = await countQuery;
        const total = totalResult.length;
        const totalPages = Math.ceil(total / limit);

        // Apply sorting and pagination
        const validSort = sortOrder === 'asc' ? asc(alerts.createdAt) : desc(alerts.createdAt);

        const data = await query
            .orderBy(validSort)
            .limit(limit)
            .offset(offset);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages
            }
        };
    }

    /**
     * Get unacknowledged alerts (filtered by user access)
     */
    async findUnacknowledged(options: {
        page?: number;
        limit?: number;
        sortOrder?: 'asc' | 'desc';
        startDate?: Date;
        endDate?: Date;
        userId?: string;
        userRole?: string;
        tenantId?: string;
    } = {}): Promise<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
        const page = options.page || 1;
        const limit = options.limit || 100;
        const offset = (page - 1) * limit;
        const sortOrder = options.sortOrder || 'desc';

        // Base query - start with acknowledged=false filter
        let query = db
            .select({
                ...getTableColumns(alerts),
                routerName: routers.name,
            })
            .from(alerts)
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .$dynamic();

        // Count query
        let countQuery = db
            .select({ count: alerts.id })
            .from(alerts)
            .$dynamic();

        const filters = [eq(alerts.acknowledged, false)];

        if (options.tenantId) {
            filters.push(eq(alerts.tenantId, options.tenantId));
        }

        // Date filtering
        if (options.startDate) {
            filters.push(gte(alerts.createdAt, options.startDate));
        }
        if (options.endDate) {
            filters.push(lte(alerts.createdAt, options.endDate));
        }

        // Filter for non-superadmins
        if (options.userId && options.userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, options.userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return {
                    data: [],
                    meta: { total: 0, page, limit, totalPages: 0 }
                };
            }

            filters.push(inArray(alerts.routerId, routerIds));
        }

        query = query.where(and(...filters)) as any;
        countQuery = countQuery.where(and(...filters)) as any;

        // Get total count
        const totalResult = await countQuery;
        const total = totalResult.length;
        const totalPages = Math.ceil(total / limit);

        // Apply sorting and pagination
        const validSort = sortOrder === 'asc' ? asc(alerts.createdAt) : desc(alerts.createdAt);

        const data = await query
            .orderBy(validSort)
            .limit(limit)
            .offset(offset);

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages
            }
        };
    }

    /**
     * Get alerts by router ID
     */
    async findByRouterId(routerId: string, limit = 50, tenantId?: string): Promise<any[]> {
        const filters = [eq(alerts.routerId, routerId)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        return db
            .select({
                ...getTableColumns(alerts),
                acknowledgedByName: users.name,
                routerName: routers.name,
            })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .leftJoin(routers, eq(alerts.routerId, routers.id))
            .where(and(...filters))
            .orderBy(desc(alerts.createdAt))
            .limit(limit);
    }

    /**
     * Get alert by ID
     */
    async findById(id: string, tenantId?: string): Promise<Alert | undefined> {
        const filters = [eq(alerts.id, id)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }
        const [alert] = await db.select().from(alerts).where(and(...filters));
        return alert;
    }

    /**
     * Count unacknowledged alerts (filtered by user access)
     */
    async countUnacknowledged(userId?: string, userRole?: string, tenantId?: string): Promise<number> {
        const filters = [eq(alerts.acknowledged, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // Filter for standard user roles
        if (userId && userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return 0;
            }

            filters.push(inArray(alerts.routerId, routerIds));
        }

        const result = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(and(...filters));
        return result.length;
    }

    /**
     * Count alerts by severity (filtered by user access)
     */
    async countBySeverity(userId?: string, userRole?: string, tenantId?: string): Promise<{
        info: number;
        warning: number;
        critical: number;
    }> {
        const filters = [eq(alerts.acknowledged, false), eq(alerts.resolved, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // Filter for standard user role
        if (userId && userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return { info: 0, warning: 0, critical: 0 };
            }

            filters.push(inArray(alerts.routerId, routerIds));
        }

        const allAlerts = await db
            .select({ severity: alerts.severity })
            .from(alerts)
            .where(and(...filters));

        return {
            info: allAlerts.filter((a) => a.severity === 'info').length,
            warning: allAlerts.filter((a) => a.severity === 'warning').length,
            critical: allAlerts.filter((a) => a.severity === 'critical').length,
        };
    }

    /**
     * Get unread stats with breakdown by category
     */
    async getUnreadStats(userId?: string, userRole?: string, tenantId?: string): Promise<{
        total: number;
        issues: number;
        connectivity: number;
        bySeverity: { info: number; warning: number; critical: number };
    }> {
        const filters = [eq(alerts.acknowledged, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // Filter for standard user role
        if (userId && userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return {
                    total: 0,
                    issues: 0,
                    connectivity: 0,
                    bySeverity: { info: 0, warning: 0, critical: 0 },
                };
            }

            filters.push(inArray(alerts.routerId, routerIds));
        }

        const allAlerts = await db
            .select()
            .from(alerts)
            .where(and(...filters));

        // Categorize
        const issuesCount = allAlerts.filter(a => this.isIssue(a as Alert)).length;
        const connectivityCount = allAlerts.length - issuesCount;

        return {
            total: allAlerts.length,
            issues: issuesCount,
            connectivity: connectivityCount,
            bySeverity: {
                info: allAlerts.filter((a) => a.severity === 'info').length,
                warning: allAlerts.filter((a) => a.severity === 'warning').length,
                critical: allAlerts.filter((a) => a.severity === 'critical').length,
            },
        };
    }
}

export const alertQueryService = new AlertQueryService();
