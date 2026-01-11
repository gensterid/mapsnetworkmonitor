import { eq, desc, and, isNull, getTableColumns } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    alerts,
    appSettings,
    userRouters,
    users,
    type Alert,
    type NewAlert,
} from '../db/schema/index.js';
import { inArray } from 'drizzle-orm';
import { notificationService } from './notification.service.js';
import { eventEmitter } from './event-emitter.service.js';

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
     * Find recent unresolved alert of the same type for deduplication
     * Returns the existing alert if found within cooldown period
     */
    private async findRecentUnresolvedAlert(
        routerId: string,
        type: 'status_change' | 'high_cpu' | 'high_memory' | 'high_disk' | 'interface_down' | 'netwatch_down' | 'threshold' | 'reboot'
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
     * Get all alerts
     */
    /**
     * Get all alerts (filtered by user access)
     */
    async findAll(limit = 100, userId?: string, userRole?: string): Promise<any[]> {
        let query = db
            .select({
                ...getTableColumns(alerts),
                acknowledgedByName: users.name,
            })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .orderBy(desc(alerts.createdAt))
            .limit(limit)
            .$dynamic();

        // Filter for non-admins
        if (userId && userRole && userRole !== 'admin') {
            // Get assigned router IDs
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return []; // No routers assigned, so no alerts
            }

            query = db
                .select({
                    ...getTableColumns(alerts),
                    acknowledgedByName: users.name,
                })
                .from(alerts)
                .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
                .where(inArray(alerts.routerId, routerIds))
                .orderBy(desc(alerts.createdAt))
                .limit(limit)
                .$dynamic();
        }

        return query;
    }

    /**
     * Get unacknowledged alerts (filtered by user access)
     */
    async findUnacknowledged(limit = 100, userId?: string, userRole?: string): Promise<Alert[]> {
        let query = db
            .select()
            .from(alerts)
            .where(eq(alerts.acknowledged, false))
            .orderBy(desc(alerts.createdAt))
            .limit(limit)
            .$dynamic();

        // Filter for non-admins
        if (userId && userRole && userRole !== 'admin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return [];
            }

            query = db
                .select()
                .from(alerts)
                .where(and(eq(alerts.acknowledged, false), inArray(alerts.routerId, routerIds)))
                .orderBy(desc(alerts.createdAt))
                .limit(limit)
                .$dynamic();
        }

        return query;
    }

    /**
     * Get alerts by router ID
     */
    async findByRouterId(routerId: string, limit = 50): Promise<any[]> {
        return db
            .select({
                ...getTableColumns(alerts),
                acknowledgedByName: users.name,
            })
            .from(alerts)
            .leftJoin(users, eq(alerts.acknowledgedBy, users.id))
            .where(eq(alerts.routerId, routerId))
            .orderBy(desc(alerts.createdAt))
            .limit(limit);
    }

    /**
     * Get alert by ID
     */
    async findById(id: string): Promise<Alert | undefined> {
        const [alert] = await db.select().from(alerts).where(eq(alerts.id, id));
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
                console.error('Failed to trigger notification:', err)
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

        return alert;
    }

    /**
     * Acknowledge an alert
     */
    async acknowledge(id: string, userId: string, userRole?: string): Promise<Alert | undefined> {
        let whereClause = eq(alerts.id, id);

        // For non-admins/operators, check router access
        if (userRole && userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);

            // If no routers assigned, they can't acknowledge anything
            if (routerIds.length === 0) return undefined;

            whereClause = and(eq(alerts.id, id), inArray(alerts.routerId, routerIds)) as any;
        }

        const [alert] = await db
            .update(alerts)
            .set({
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(whereClause)
            .returning();
        return alert;
    }

    /**
     * Acknowledge all alerts
     */
    async acknowledgeAll(userId: string, userRole?: string): Promise<boolean> {
        let whereClause = eq(alerts.acknowledged, false);

        // For non-admins/operators, check router access
        if (userRole && userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);

            // If no routers assigned, nothing to acknowledge
            if (routerIds.length === 0) return true;

            whereClause = and(eq(alerts.acknowledged, false), inArray(alerts.routerId, routerIds)) as any;
        }

        await db
            .update(alerts)
            .set({
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(whereClause);
        return true;
    }

    /**
     * Resolve an alert
     */
    async resolve(id: string): Promise<Alert | undefined> {
        const [alert] = await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
            })
            .where(eq(alerts.id, id))
            .returning();
        return alert;
    }

    /**
     * Delete an alert
     */
    async delete(id: string): Promise<boolean> {
        const result = await db.delete(alerts).where(eq(alerts.id, id)).returning();
        return result.length > 0;
    }

    /**
     * Count unacknowledged alerts
     */
    /**
     * Count unacknowledged alerts (filtered by user access)
     */
    async countUnacknowledged(userId?: string, userRole?: string): Promise<number> {
        let query = db
            .select()
            .from(alerts)
            .where(eq(alerts.acknowledged, false))
            .$dynamic();

        // Filter for non-admins
        if (userId && userRole && userRole !== 'admin') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map((a) => a.routerId);

            if (routerIds.length === 0) {
                return 0;
            }

            query = db
                .select()
                .from(alerts)
                .where(and(eq(alerts.acknowledged, false), inArray(alerts.routerId, routerIds)))
                .$dynamic();
        }

        const result = await query;
        return result.length;
    }

    /**
     * Count alerts by severity
     */
    /**
     * Count alerts by severity (filtered by user access)
     */
    async countBySeverity(userId?: string, userRole?: string): Promise<{
        info: number;
        warning: number;
        critical: number;
    }> {
        let query = db
            .select()
            .from(alerts)
            .where(and(eq(alerts.acknowledged, false), eq(alerts.resolved, false)))
            .$dynamic();

        // Filter for non-admins
        if (userId && userRole && userRole !== 'admin') {
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

            query = db
                .select()
                .from(alerts)
                .where(
                    and(
                        eq(alerts.acknowledged, false),
                        eq(alerts.resolved, false),
                        inArray(alerts.routerId, routerIds)
                    )
                )
                .$dynamic();
        }

        const allAlerts = await query;

        return {
            info: allAlerts.filter((a) => a.severity === 'info').length,
            warning: allAlerts.filter((a) => a.severity === 'warning').length,
            critical: allAlerts.filter((a) => a.severity === 'critical').length,
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

        console.log(`[ALERT DEBUG] createNetwatchAlert called: host=${host}, status=${status}, routerId=${routerId}`);

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
                    console.log(`[ALERT] Auto-resolved alert ${alert.id} for ${host} (now UP)`);
                    resolvedCount++;
                }
            }

            // Create notification that device is UP if we resolved something or if we want to notify even if we missed the DOWN event (optional)
            // User requested: "is down tetapi setelah up tidak adad notifikasi" -> implies they want notification on UP.

            // Deduplicate UP alerts (don't spam if it's already UP)
            // But usually UP event comes once. 
            // Let's create an INFO alert.

            if (resolvedCount > 0) {
                await this.create({
                    routerId,
                    type: 'status_change', // using valid enum type
                    severity: 'info',
                    title: `Device ${deviceName || host} is back UP`,
                    message: `Netwatch host ${host} (${deviceName}) is now reachable`,
                });
            }

            return null;
        }

        // Deduplicate: check if we already alerted about this specific device being down recently
        const existing = await this.findRecentUnresolvedAlert(routerId, 'netwatch_down');
        if (existing && existing.message.includes(host)) {
            return null;
        }

        return this.create({
            routerId,
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
        newStatus: string
    ): Promise<Alert | null> {
        const thresholds = await this.getThresholds();

        // Check if alerts are enabled
        if (!thresholds.alertsEnabled || !thresholds.statusChangeAlerts) {
            return null;
        }

        const severity =
            newStatus === 'offline'
                ? 'critical'
                : newStatus === 'online'
                    ? 'info'
                    : 'warning';

        return this.create({
            routerId,
            type: 'status_change',
            severity,
            title: `Router ${routerName} is now ${newStatus}`,
            message: `Status changed from ${oldStatus} to ${newStatus}`,
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

        const severity = cpuLoad >= thresholds.cpuCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
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

        const severity = memoryPercent >= thresholds.memoryCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
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

        // Check CPU
        if (cpuLoad !== undefined && cpuLoad !== null) {
            cpuAlert = await this.createHighCpuAlert(routerId, routerName, cpuLoad);
        }

        // Check Memory
        if (totalMemory && usedMemory) {
            const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
            memoryAlert = await this.createHighMemoryAlert(routerId, routerName, memoryPercent);
        }

        return { cpuAlert, memoryAlert };
    }
}

// Export singleton instance
export const alertService = new AlertService();

