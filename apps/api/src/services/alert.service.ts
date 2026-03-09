import { eq, desc, asc, and, or, ilike, isNull, getTableColumns, gte, lte, sql, notInArray, inArray, not } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    alerts,
    appSettings,
    userRouters,
    users,
    routers,
    type Alert,
    type NewAlert,
} from '../db/schema/index.js';
import { aiService } from './ai.service.js';
import { notificationService } from './notification.service.js';
import { eventEmitter } from './event-emitter.service.js';
import { logger } from '../lib/logger.js';

// Default threshold values
const DEFAULT_THRESHOLDS = {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarning: 80,
    memoryCritical: 95,
};

// Cooldown period in minutes - don't create duplicate alerts within this period
const ALERT_COOLDOWN_MINUTES = 30;

/**
 * Alert Service - handles alert operations
 */
export class AlertService {
    /**
     * Get tenant ID from router
     */
    private async getTenantIdFromRouter(routerId: string): Promise<string | null> {
        const [router] = await db
            .select({ tenantId: routers.tenantId })
            .from(routers)
            .where(eq(routers.id, routerId));
        return router?.tenantId || null;
    }

    /**
     * Find recent unresolved alert of the same type for deduplication
     * Returns the existing alert if found within cooldown period
     */
    private async findRecentUnresolvedAlert(
        routerId: string,
        type: 'status_change' | 'high_cpu' | 'high_memory' | 'high_disk' | 'interface_down' | 'netwatch_down' | 'threshold' | 'reboot' | 'pppoe_connect' | 'pppoe_disconnect' | 'system' | 'high_latency' | 'packet_loss'
    ): Promise<Alert | null> {
        const cooldownTime = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60 * 1000);

        const [existing] = await db
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, type),
                isNull(alerts.resolvedAt)
            ))
            .orderBy(desc(alerts.createdAt))
            .limit(1);

        // Return existing alert if created within cooldown period
        if (existing && existing.createdAt > cooldownTime) {
            return existing;
        }
        return null;
    }

    /**
     * Get alert thresholds from settings
     */
    private async getThresholds(): Promise<{
        cpuWarning: number;
        cpuCritical: number;
        memoryWarning: number;
        memoryCritical: number;
        alertsEnabled: boolean;
        statusChangeAlerts: boolean;
        highCpuAlerts: boolean;
        highMemoryAlerts: boolean;
    }> {
        const settings = await db.select().from(appSettings);
        const settingsMap: Record<string, unknown> = {};
        settings.forEach((s) => {
            settingsMap[s.key] = s.value;
        });

        return {
            cpuWarning: (settingsMap.alertThresholdCpuWarning as number) ?? DEFAULT_THRESHOLDS.cpuWarning,
            cpuCritical: (settingsMap.alertThresholdCpuCritical as number) ?? DEFAULT_THRESHOLDS.cpuCritical,
            memoryWarning: (settingsMap.alertThresholdMemoryWarning as number) ?? DEFAULT_THRESHOLDS.memoryWarning,
            memoryCritical: (settingsMap.alertThresholdMemoryCritical as number) ?? DEFAULT_THRESHOLDS.memoryCritical,
            alertsEnabled: settingsMap.alertsEnabled !== false,
            statusChangeAlerts: settingsMap.statusChangeAlerts !== false,
            highCpuAlerts: settingsMap.highCpuAlerts !== false,
            highMemoryAlerts: settingsMap.highMemoryAlerts !== false,
        };
    }

    /**
     * Check if alerts are enabled
     */
    async areAlertsEnabled(): Promise<boolean> {
        const thresholds = await this.getThresholds();
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
            // If filtering for unresolved, sort by creation date desc (newest problems first)
            // If filtering for resolved, maybe resolvedAt desc? Default to createdAt for now.
        }

        // Date filtering
        if (options.startDate) {
            filters.push(gte(alerts.createdAt, options.startDate));
        }
        if (options.endDate) {
            // Adjust end date to include the entire day if needed, but assuming precise date passed
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
        if (options.userId && options.userRole && options.userRole !== 'superadmin') {
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
            const issueTypesList = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system', 'high_latency', 'packet_loss'];
            const connectivityTypesList = ['status_change', 'netwatch_down', 'interface_down', 'pppoe_connect', 'pppoe_disconnect', 'reboot'];

            if (options.category === 'issues') {
                filters.push(inArray(alerts.type, issueTypesList as any));
            } else if (options.category === 'alerts') {
                filters.push(inArray(alerts.type, connectivityTypesList as any));
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
        if (options.userId && options.userRole && options.userRole !== 'superadmin') {
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
     * Create a new alert
     */
    async create(data: NewAlert): Promise<Alert> {
        const [alert] = await db.insert(alerts).values(data).returning();

        // Trigger notification
        if (data.routerId) {
            // Fire and forget notification to avoid blocking the alert creation
            notificationService.notifyAlert(alert, data.routerId).catch(err =>
                logger.error({ err: err?.message || String(err) }, 'Failed to trigger notification')
            );

            // Get users assigned to this router
            const assignedUsers = await db
                .select({ userId: userRouters.userId })
                .from(userRouters)
                .where(eq(userRouters.routerId, data.routerId));

            const userIds = assignedUsers.map(u => u.userId);

            // Broadcast real-time SSE event to all connected clients
            eventEmitter.broadcastToUsers('new_alert', {
                alert,
                message: `New alert: ${alert.title}`,
                timestamp: new Date().toISOString(),
            }, userIds);
        } else {
            // System-wide alert or no router ID? currently alerts always have routerId in schema, but types might say optional?
            // If no routerId context, maybe broadcast to all admins? or all users?
            // Schema says routerId is NotNull. So this block is always entered if valid data.

            // Fallback for safety if routerId matches nothing (shouldn't happen with FK)
            eventEmitter.broadcast('new_alert', {
                alert,
                message: `New alert: ${alert.title}`,
                timestamp: new Date().toISOString(),
            });
        }

        // High-priority AI Diagnosis (Async)
        if (alert.severity === 'critical') {
            aiService.analyzeAlert(alert.id, alert.tenantId).then(analysis => {
                if (analysis) {
                    db.update(alerts)
                        .set({ aiAnalysis: analysis })
                        .where(eq(alerts.id, alert.id))
                        .execute()
                        .catch(err => logger.error({ err, alertId: alert.id }, 'Failed to save AI analysis'));
                }
            }).catch(err => logger.error({ err, alertId: alert.id }, 'AI analysis background task failed'));
        }

        return alert;
    }

    /**
     * Acknowledge an alert
     */
    async acknowledge(id: string, userId: string, userRole?: string, tenantId?: string): Promise<Alert | undefined> {
        const filters = [eq(alerts.id, id)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // For non-superadmins, check router access
        if (userRole && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);

            // If no routers assigned, they can't acknowledge anything
            if (routerIds.length === 0) return undefined;

            filters.push(inArray(alerts.routerId, routerIds));
        }

        const [alert] = await db
            .update(alerts)
            .set({
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(and(...filters))
            .returning();
        return alert;
    }

    /**
     * Check if alert is an "issue" (System/Performance) vs "alert" (Connectivity/Status)
     */
    private isIssue(alert: Alert): boolean {
        const issueTypes = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system', 'high_latency', 'packet_loss'];

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
     * Acknowledge all alerts
     */
    async acknowledgeAll(userId: string, userRole?: string, category?: 'issues' | 'alerts', tenantId?: string): Promise<boolean> {
        const filters = [eq(alerts.acknowledged, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // For non-superadmins, check router access
        if (userRole && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);

            // If no routers assigned, nothing to acknowledge
            if (routerIds.length === 0) return true;

            filters.push(inArray(alerts.routerId, routerIds));
        }

        // Apply category filtering directly in SQL
        if (category) {
            const issueTypesList = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system', 'high_latency', 'packet_loss'];
            const connectivityTypesList = ['status_change', 'netwatch_down', 'interface_down', 'pppoe_connect', 'pppoe_disconnect', 'reboot'];

            if (category === 'issues') {
                filters.push(inArray(alerts.type, issueTypesList as any));
            } else if (category === 'alerts') {
                filters.push(inArray(alerts.type, connectivityTypesList as any));
            }
        }

        await db
            .update(alerts)
            .set({
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(and(...filters as any[]));

        return true;
    }

    /**
     * Resolve all alerts
     */
    async resolveAll(userId: string, userRole?: string, category?: 'issues' | 'alerts', tenantId?: string): Promise<boolean> {
        const filters = [eq(alerts.resolved, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // For non-superadmins, check router access
        if (userRole && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);
            if (routerIds.length === 0) return true;

            filters.push(inArray(alerts.routerId, routerIds));
        }

        if (category) {
            const issueTypesList = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system', 'high_latency', 'packet_loss'];
            const connectivityTypesList = ['status_change', 'netwatch_down', 'interface_down', 'pppoe_connect', 'pppoe_disconnect', 'reboot'];

            if (category === 'issues') {
                filters.push(inArray(alerts.type, issueTypesList as any));
            } else if (category === 'alerts') {
                filters.push(inArray(alerts.type, connectivityTypesList as any));
            }
        }

        await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
                acknowledged: true, // Resolving also acknowledges
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(and(...filters));

        return true;
    }

    /**
     * Resolve an alert
     */
    async resolve(id: string, tenantId?: string): Promise<Alert | undefined> {
        const filters = [eq(alerts.id, id)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }
        const [alert] = await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
            })
            .where(and(...filters))
            .returning();
        return alert;
    }

    /**
     * Delete an alert
     */
    async delete(id: string, tenantId?: string): Promise<boolean> {
        const filters = [eq(alerts.id, id)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }
        const result = await db.delete(alerts).where(and(...filters)).returning();
        return result.length > 0;
    }

    /**
     * Count unacknowledged alerts
     */
    /**
     * Count unacknowledged alerts (filtered by user access)
     */
    async countUnacknowledged(userId?: string, userRole?: string, tenantId?: string): Promise<number> {
        const filters = [eq(alerts.acknowledged, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        // Filter for non-superadmins
        if (userId && userRole && userRole !== 'superadmin') {
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
     * Count alerts by severity
     */
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

        // Filter for non-superadmins
        if (userId && userRole && userRole !== 'superadmin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return {
                    info: 0,
                    warning: 0,
                    critical: 0,
                };
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

        // Filter for non-superadmins
        if (userId && userRole && userRole !== 'superadmin') {
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
        const issuesCount = allAlerts.filter(a => this.isIssue(a)).length;

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

    /**
     * Create netwatch alert (respects settings)
     */
    async createNetwatchAlert(
        routerId: string,
        deviceName: string,
        host: string,
        status: 'up' | 'down'
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled) {
            return null;
        }

        // We can reuse statusChangeAlerts setting or add a new one?
        // For now let's reuse statusChangeAlerts as it fits "Status Change" category
        if (!thresholds.statusChangeAlerts) {
            return null;
        }

        // Suppress alerts for disabled devices
        if (deviceName?.includes('[DISABLED]')) {
            return null;
        }

        logger.debug({ host, status, routerId }, '[ALERT] createNetwatchAlert called');

        // If status is UP, resolve any existing DOWN alerts for this host
        if (status === 'up') {
            // Find all unresolved netwatch_down alerts for this router that contain this host
            const unresolvedAlerts = await db
                .select()
                .from(alerts)
                .where(and(
                    eq(alerts.routerId, routerId),
                    eq(alerts.type, 'netwatch_down'),
                    eq(alerts.resolved, false)
                ));

            let resolvedCount = 0;
            // Resolve alerts that match this host
            for (const alert of unresolvedAlerts) {
                if (alert.message.includes(host)) {
                    await db
                        .update(alerts)
                        .set({
                            resolved: true,
                            resolvedAt: new Date(),
                        })
                        .where(eq(alerts.id, alert.id));
                    logger.info({ alertId: alert.id, host }, '[ALERT] Auto-resolved alert (now UP)');
                    resolvedCount++;
                }
            }

            // Deduplicate: Don't send another "UP" notification if we sent one recently for this host
            // Status change alerts are auto-resolved so we check by creation time
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const recentUp = await db
                .select()
                .from(alerts)
                .where(and(
                    eq(alerts.routerId, routerId),
                    eq(alerts.type, 'status_change'),
                    ilike(alerts.title, `%${deviceName || host}%UP%`),
                    gte(alerts.createdAt, fiveMinutesAgo)
                ))
                .limit(1);

            if (recentUp.length > 0) {
                logger.debug({ host }, '[ALERT] Skipping duplicate UP notification (cooldown)');
                return null;
            }

            const tenantId = await this.getTenantIdFromRouter(routerId);

            if (resolvedCount > 0) {
                return this.create({
                    routerId,
                    tenantId: tenantId!,
                    type: 'status_change',
                    severity: 'info',
                    title: `Device ${deviceName || host} is back UP`,
                    message: `Netwatch host ${host} (${deviceName}) is now reachable. Resolved ${resolvedCount} downtime alert(s).`,
                });
            } else {
                // Only notify UP if it was previously DOWN (implied by resolvedCount == 0 and we want visibility)
                // However, to prevent flooding, if no DOWN was resolved, we should be even stricter.
                // For now, allow it but the 5-min deduplication above will stop the flood.
                return this.create({
                    routerId,
                    tenantId: tenantId!,
                    type: 'status_change',
                    severity: 'info',
                    title: `Device ${deviceName || host} is back UP`,
                    message: `Netwatch host ${host} (${deviceName}) is now reachable.`,
                });
            }
        }

        // Deduplicate DOWN alerts: 
        // 1. Check for unresolved (standard deduplication)
        const existingUnresolved = await this.findRecentUnresolvedAlert(routerId, 'netwatch_down');
        if (existingUnresolved && existingUnresolved.message.includes(host)) {
            return null;
        }

        // 2. Check for ANY recent DOWN alert for this host (flapping protection)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentAlert = await db
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, 'netwatch_down'),
                ilike(alerts.message, `%${host}%`),
                gte(alerts.createdAt, fiveMinutesAgo)
            ))
            .limit(1);

        if (recentAlert.length > 0) {
            logger.debug({ host }, '[ALERT] Skipping DOWN alert due to flapping/duplicate (cooldown)');
            return null;
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'netwatch_down', // distinct type for filtering
            severity: 'warning',
            title: `Device ${deviceName || host} is down`,
            message: `Netwatch host ${host} (${deviceName}) is now down`,
        });
    }

    /**
     * Create status change alert (respects settings)
     */
    async createStatusChangeAlert(
        routerId: string,
        routerName: string,
        oldStatus: string,
        newStatus: string,
        reason?: string
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts enabled
        if (!thresholds.alertsEnabled || !thresholds.statusChangeAlerts) {
            return null;
        }

        // Deduplicate: Don't send duplicate router status change alerts within 5 mins
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentStatusChange = await db
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, 'status_change'),
                ilike(alerts.title, `%${routerName}%${newStatus}%`),
                gte(alerts.createdAt, fiveMinutesAgo)
            ))
            .limit(1);

        if (recentStatusChange.length > 0) {
            logger.debug({ routerName, newStatus }, '[ALERT] Skipping duplicate Router status change notification');
            return null;
        }

        const severity =
            newStatus === 'offline'
                ? 'critical'
                : newStatus === 'online'
                    ? 'info'
                    : 'warning';

        let message = `Status changed from ${oldStatus} to ${newStatus}`;
        if (reason) {
            message += ` (Alasan: ${reason})`;
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'status_change',
            severity,
            title: `Router ${routerName} is now ${newStatus}`,
            message,
            resolved: true, // Event is a log, auto-resolve
            resolvedAt: new Date(),
        });
    }

    /**
     * Create high CPU alert with configurable thresholds
     */
    async createHighCpuAlert(
        routerId: string,
        routerName: string,
        cpuLoad: number
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled || !thresholds.highCpuAlerts) {
            return null;
        }

        // Don't create alert if CPU is below warning threshold
        if (cpuLoad < thresholds.cpuWarning) {
            return null;
        }

        // Check for existing unresolved alert (deduplication)
        const existingAlert = await this.findRecentUnresolvedAlert(routerId, 'high_cpu');
        if (existingAlert) {
            return null; // Skip duplicate alert
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        const severity = cpuLoad >= thresholds.cpuCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'high_cpu',
            severity,
            title: `High CPU usage on ${routerName}`,
            message: `CPU load is at ${cpuLoad}% (threshold: ${severity === 'critical' ? thresholds.cpuCritical : thresholds.cpuWarning}%)`,
        });
    }

    /**
     * Create high memory alert with configurable thresholds
     */
    async createHighMemoryAlert(
        routerId: string,
        routerName: string,
        memoryPercent: number
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled || !thresholds.highMemoryAlerts) {
            return null;
        }

        // Don't create alert if memory is below warning threshold
        if (memoryPercent < thresholds.memoryWarning) {
            return null;
        }

        // Check for existing unresolved alert (deduplication)
        const existingAlert = await this.findRecentUnresolvedAlert(routerId, 'high_memory');
        if (existingAlert) {
            return null; // Skip duplicate alert
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        const severity = memoryPercent >= thresholds.memoryCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'high_memory',
            severity,
            title: `High memory usage on ${routerName}`,
            message: `Memory usage is at ${memoryPercent}% (threshold: ${severity === 'critical' ? thresholds.memoryCritical : thresholds.memoryWarning}%)`,
        });
    }

    /**
     * Check router metrics and create alerts if thresholds are exceeded
     */
    async checkAndCreateMetricAlerts(
        routerId: string,
        routerName: string,
        cpuLoad?: number,
        totalMemory?: number,
        usedMemory?: number
    ): Promise<{ cpuAlert: Alert | null; memoryAlert: Alert | null }> {
        let cpuAlert: Alert | null = null;
        let memoryAlert: Alert | null = null;

        const thresholds = await this.getThresholds();

        // Check CPU
        if (cpuLoad !== undefined && cpuLoad !== null) {
            if (cpuLoad >= thresholds.cpuWarning) {
                cpuAlert = await this.createHighCpuAlert(routerId, routerName, cpuLoad);
            } else {
                // Auto-resolve if usage is back to normal
                await this.resolveActiveMetricAlerts(routerId, 'high_cpu');
            }
        }

        // Check Memory
        if (totalMemory && usedMemory) {
            const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
            if (memoryPercent >= thresholds.memoryWarning) {
                memoryAlert = await this.createHighMemoryAlert(routerId, routerName, memoryPercent);
            } else {
                // Auto-resolve if usage is back to normal
                await this.resolveActiveMetricAlerts(routerId, 'high_memory');
            }
        }

        return { cpuAlert, memoryAlert };
    }

    /**
     * Resolve active metric alerts (CPU/Memory)
     */
    async resolveActiveMetricAlerts(routerId: string, type: 'high_cpu' | 'high_memory', tenantId?: string): Promise<void> {
        const filters = [
            eq(alerts.routerId, routerId),
            eq(alerts.type, type),
            eq(alerts.resolved, false)
        ];

        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
            })
            .where(and(...filters));
    }

    /**
     * Format duration in seconds to human-readable string
     */
    private formatDuration(seconds: number): string {
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes}m ${seconds % 60}s`;
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours}h ${minutes % 60}m`;
        }
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }

    /**
     * Create PPPoE connect alert
     */
    async createPppoeConnectAlert(
        routerId: string,
        routerName: string,
        username: string,
        ipAddress: string
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled) {
            return null;
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'pppoe_connect',
            severity: 'info',
            title: `PPPoE: ${username} connected`,
            message: `User ${username} connected to ${routerName}. IP: ${ipAddress}`,
            resolved: true, // Event is a log
            resolvedAt: new Date(),
        });
    }

    /**
     * Create PPPoE disconnect alert
     */
    async createPppoeDisconnectAlert(
        routerId: string,
        routerName: string,
        username: string,
        ipAddress: string,
        sessionDurationSeconds: number
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled) {
            return null;
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        const duration = this.formatDuration(sessionDurationSeconds);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'pppoe_disconnect',
            severity: 'warning',
            title: `PPPoE: ${username} disconnected`,
            message: `User ${username} disconnected from ${routerName}. IP: ${ipAddress}. Session duration: ${duration}`,
            resolved: true, // Event is a log
            resolvedAt: new Date(),
        });
    }

    /**
     * Create performance alert (high latency or packet loss)
     */
    async createPerformanceAlert(
        routerId: string,
        routerName: string,
        host: string,
        deviceName: string,
        latency: number,
        packetLoss: number,
        status?: string
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        if (!thresholds.alertsEnabled) return null;

        // Suppress alerts for disabled devices
        if (deviceName?.includes('[DISABLED]')) {
            return null;
        }

        const isHighLatency = latency > 100;
        const isPacketLoss = packetLoss > 0;

        // Deduplicate: check if we already alerted about this host recently
        // Fix: Prioritize 'high_latency' so it appears in Issues list as High Latency
        // (Packet loss info will still be in the message)
        const type = isHighLatency ? 'high_latency' : 'packet_loss';
        const existing = await this.findRecentUnresolvedAlert(routerId, type);
        if (existing && existing.message.includes(host)) {
            return null;
        }

        // Don't alert if checks pass (should be handled by caller but safe to check)
        if (!isHighLatency && !isPacketLoss) return null;

        // User Request: Filter out 100% packet loss from "issues" list
        // 100% packet loss is already handled by "Device Down" (Netwatch) alerts which are more appropriate
        // FIX: Allow 100% loss alert ONLY if status is NOT 'down'. 
        // This covers the case where Mikrotik thinks it's UP but API pings fail 100%.
        if (packetLoss === 100 && status === 'down') return null;

        let title;
        if (isHighLatency && isPacketLoss) {
            title = `Performance Issue: ${deviceName}`;
        } else if (isHighLatency) {
            title = `High Latency: ${deviceName}`;
        } else {
            title = `Packet Loss: ${deviceName}`;
        }

        let message = `Host ${host} (${deviceName}) has issues:`;

        if (isHighLatency) message += ` High Latency detected (${latency}ms > 100ms).`;
        if (isPacketLoss) message += ` Packet Loss detected (${packetLoss}%).`;

        // Always show latency context if it wasn't already highlighted as "High Latency"
        if (!isHighLatency) {
            message += ` Latency: ${latency}ms.`;
        }

        const tenantId = await this.getTenantIdFromRouter(routerId);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type, // high_latency or packet_loss
            severity: 'warning',
            title,
            message,
        });
    }

    /**
     * Resolve performance alert (high latency or packet loss)
     * call when checks pass to auto-resolve previous issues
     */
    async resolvePerformanceAlert(
        routerId: string,
        host: string,
        tenantId?: string
    ): Promise<number> {
        // Find unresolved threshold alerts for this router that mention the host
        const filters = [
            eq(alerts.routerId, routerId),
            inArray(alerts.type, ['threshold', 'high_latency', 'packet_loss']),
            eq(alerts.resolved, false)
        ];

        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        const existingAlerts = await db
            .select()
            .from(alerts)
            .where(and(...filters));

        // Filter in memory for message (since we put host in message/title usually)
        // Ideally we should have a reliable way to link alert to host (maybe via title or new metadata column)
        // For now, check if message contains host IP
        const alertsToResolve = existingAlerts.filter(a => a.message.includes(host));

        if (alertsToResolve.length === 0) return 0;

        const idsToResolve = alertsToResolve.map(a => a.id);

        await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
                // message: 'Automatically resolved: Performance checks passed.' // strict append might be better but let's keep it simple
            })
            .where(inArray(alerts.id, idsToResolve));

        return idsToResolve.length;
    }
}

// Export singleton instance
export const alertService = new AlertService();

