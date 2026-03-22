import { eq, and, ilike, isNull, gte, sql, inArray, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    alerts,
    userRouters,
    type Alert,
    type NewAlert,
} from '../db/schema/index.js';
import { aiService } from './ai.service.js';
import { notificationService } from './notification.service.js';
import { eventEmitter } from './event-emitter.service.js';
import { logger } from '../lib/logger.js';
import { 
    getThresholds, 
    getTenantIdFromRouter, 
    ALERT_COOLDOWN_MINUTES,
    ISSUE_TYPES,
    CONNECTIVITY_TYPES
} from './alert-core.service.js';
import { alertQueryService } from './alert-query.service.js';

export class AlertActionService {
    /**
     * Find recent unresolved alert of the same type for deduplication
     */
    async findRecentUnresolvedAlert(
        routerId: string,
        type: any,
        tx: any = db
    ): Promise<Alert | null> {
        const cooldownTime = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60 * 1000);

        const [existing] = await tx
            .select()
            .from(alerts)
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, type),
                isNull(alerts.resolvedAt)
            ))
            .orderBy(desc(alerts.createdAt))
            .limit(1);

        if (existing && existing.createdAt > cooldownTime) {
            return existing as Alert;
        }
        return null;
    }

    /**
     * Create a new alert
     */
    async create(data: NewAlert, tx: any = db): Promise<Alert> {
        const [alert] = await tx.insert(alerts).values(data).returning();

        // Trigger notification
        if (data.routerId) {
            notificationService.notifyAlert(alert as Alert, data.routerId).catch(err =>
                logger.error({ err: err?.message || String(err) }, 'Failed to trigger notification')
            );

            const assignedUsers = await db
                .select({ userId: userRouters.userId })
                .from(userRouters)
                .where(eq(userRouters.routerId, data.routerId));

            const userIds = assignedUsers.map(u => u.userId);

            eventEmitter.broadcastToUsers('new_alert', {
                alert,
                message: `New alert: ${alert.title}`,
                timestamp: new Date().toISOString(),
            }, userIds);
        } else {
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

        return alert as Alert;
    }

    /**
     * Acknowledge an alert
     */
    async acknowledge(id: string, userId: string, userRole?: string, tenantId?: string): Promise<Alert | undefined> {
        const filters = [eq(alerts.id, id)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        if (userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);
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

        if (alert) {
            eventEmitter.broadcast('alerts_updated', {
                type: 'acknowledge',
                alertId: id,
                userId,
                timestamp: new Date().toISOString()
            });
        }

        return alert as Alert;
    }

    /**
     * Acknowledge all alerts
     */
    async acknowledgeAll(userId: string, userRole?: string, category?: 'issues' | 'alerts', tenantId?: string): Promise<boolean> {
        const filters = [eq(alerts.acknowledged, false)];
        if (tenantId) {
            filters.push(eq(alerts.tenantId, tenantId));
        }

        if (userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);
            if (routerIds.length === 0) return true;
            filters.push(inArray(alerts.routerId, routerIds));
        }

        if (category) {
            if (category === 'issues') {
                filters.push(inArray(alerts.type, ISSUE_TYPES as any));
            } else if (category === 'alerts') {
                filters.push(inArray(alerts.type, CONNECTIVITY_TYPES as any));
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

        eventEmitter.broadcast('alerts_updated', {
            type: 'acknowledge_all',
            category,
            userId,
            timestamp: new Date().toISOString()
        });

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

        if (userRole === 'user') {
            const assigned = await db
                .select({ routerId: userRouters.routerId })
                .from(userRouters)
                .where(eq(userRouters.userId, userId));

            const routerIds = assigned.map(a => a.routerId);
            if (routerIds.length === 0) return true;
            filters.push(inArray(alerts.routerId, routerIds));
        }

        if (category) {
            if (category === 'issues') {
                filters.push(inArray(alerts.type, ISSUE_TYPES as any));
            } else if (category === 'alerts') {
                filters.push(inArray(alerts.type, CONNECTIVITY_TYPES as any));
            }
        }

        await db
            .update(alerts)
            .set({
                resolved: true,
                resolvedAt: new Date(),
                acknowledged: true,
                acknowledgedBy: userId,
                acknowledgedAt: new Date(),
            })
            .where(and(...filters as any[]));

        eventEmitter.broadcast('alerts_updated', {
            type: 'resolve_all',
            category,
            userId,
            timestamp: new Date().toISOString()
        });

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

        if (alert) {
            eventEmitter.broadcast('alerts_updated', {
                type: 'resolve',
                alertId: id,
                timestamp: new Date().toISOString()
            });
        }

        return alert as Alert;
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
     * Create netwatch alert
     */
    async createNetwatchAlert(
        routerId: string,
        deviceName: string,
        host: string,
        status: 'up' | 'down',
        tx: any = db
    ): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled || !thresholds.statusChangeAlerts) return null;
        if (deviceName?.includes('[DISABLED]')) return null;

        if (status === 'up') {
            const unresolvedAlerts = await tx
                .select()
                .from(alerts)
                .where(and(
                    eq(alerts.routerId, routerId),
                    eq(alerts.type, 'netwatch_down'),
                    eq(alerts.resolved, false)
                ));

            let resolvedCount = 0;
            for (const alert of unresolvedAlerts) {
                if (alert.message.includes(host)) {
                    await tx.update(alerts).set({ resolved: true, resolvedAt: new Date() }).where(eq(alerts.id, alert.id));
                    resolvedCount++;
                }
            }

            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const recentUp = await tx.select().from(alerts).where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, 'status_change'),
                ilike(alerts.title, `%${deviceName || host}%UP%`),
                gte(alerts.createdAt, fiveMinutesAgo)
            )).limit(1);

            if (recentUp.length > 0) return null;

            const tenantId = await getTenantIdFromRouter(routerId, tx);
            return this.create({
                routerId,
                tenantId: tenantId!,
                type: 'status_change',
                severity: 'info',
                title: `Device ${deviceName || host} is back UP`,
                message: `Netwatch host ${host} (${deviceName}) is now reachable.${resolvedCount > 0 ? ` Resolved ${resolvedCount} downtime alert(s).` : ''}`,
            }, tx);
        }

        const existingUnresolved = await this.findRecentUnresolvedAlert(routerId, 'netwatch_down', tx);
        if (existingUnresolved && existingUnresolved.message.includes(host)) return null;

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentAlert = await tx.select().from(alerts).where(and(
            eq(alerts.routerId, routerId),
            eq(alerts.type, 'netwatch_down'),
            ilike(alerts.message, `%${host}%`),
            gte(alerts.createdAt, fiveMinutesAgo)
        )).limit(1);

        if (recentAlert.length > 0) return null;

        const tenantId = await getTenantIdFromRouter(routerId, tx);
        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'netwatch_down',
            severity: 'warning',
            title: `Device ${deviceName || host} is down`,
            message: `Netwatch host ${host} (${deviceName}) is now down`,
        }, tx);
    }

    /**
     * Create status change alert
     */
    async createStatusChangeAlert(
        routerId: string,
        routerName: string,
        oldStatus: string,
        newStatus: string,
        reason?: string,
        tx: any = db
    ): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled || !thresholds.statusChangeAlerts) return null;

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentStatusChange = await tx.select().from(alerts).where(and(
            eq(alerts.routerId, routerId),
            eq(alerts.type, 'status_change'),
            ilike(alerts.title, `%${routerName}%${newStatus}%`),
            gte(alerts.createdAt, fiveMinutesAgo)
        )).limit(1);

        if (recentStatusChange.length > 0) return null;

        const severity = newStatus === 'offline' ? 'critical' : newStatus === 'online' ? 'info' : 'warning';
        const tenantId = await getTenantIdFromRouter(routerId, tx);

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'status_change',
            severity,
            title: `Router ${routerName} is now ${newStatus}`,
            message: `Status changed from ${oldStatus} to ${newStatus}${reason ? ` (Alasan: ${reason})` : ''}`,
            resolved: true,
            resolvedAt: new Date(),
        }, tx);
    }

    /**
     * Create high CPU alert
     */
    async createHighCpuAlert(routerId: string, routerName: string, cpuLoad: number, tx: any = db): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled || !thresholds.highCpuAlerts || cpuLoad < thresholds.cpuWarning) return null;

        const existingAlert = await this.findRecentUnresolvedAlert(routerId, 'high_cpu', tx);
        if (existingAlert) return null;

        const tenantId = await getTenantIdFromRouter(routerId, tx);
        const severity = cpuLoad >= thresholds.cpuCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'high_cpu',
            severity,
            title: `High CPU usage on ${routerName}`,
            message: `CPU load is at ${cpuLoad}% (threshold: ${severity === 'critical' ? thresholds.cpuCritical : thresholds.cpuWarning}%)`,
        }, tx);
    }

    /**
     * Create high memory alert
     */
    async createHighMemoryAlert(routerId: string, routerName: string, memoryPercent: number, tx: any = db): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled || !thresholds.highMemoryAlerts || memoryPercent < thresholds.memoryWarning) return null;

        const existingAlert = await this.findRecentUnresolvedAlert(routerId, 'high_memory', tx);
        if (existingAlert) return null;

        const tenantId = await getTenantIdFromRouter(routerId, tx);
        const severity = memoryPercent >= thresholds.memoryCritical ? 'critical' : 'warning';

        return this.create({
            routerId,
            tenantId: tenantId!,
            type: 'high_memory',
            severity,
            title: `High memory usage on ${routerName}`,
            message: `Memory usage is at ${memoryPercent}% (threshold: ${severity === 'critical' ? thresholds.memoryCritical : thresholds.memoryWarning}%)`,
        }, tx);
    }

    /**
     * Check metrics and create alerts
     */
    async checkAndCreateMetricAlerts(
        routerId: string,
        routerName: string,
        cpuLoad?: number,
        totalMemory?: number,
        usedMemory?: number,
        tx: any = db
    ): Promise<{ cpuAlert: Alert | null; memoryAlert: Alert | null }> {
        let cpuAlert: Alert | null = null;
        let memoryAlert: Alert | null = null;
        const thresholds = await getThresholds(tx);

        if (cpuLoad !== undefined && cpuLoad !== null) {
            if (cpuLoad >= thresholds.cpuWarning) cpuAlert = await this.createHighCpuAlert(routerId, routerName, cpuLoad, tx);
            else await this.resolveActiveMetricAlerts(routerId, 'high_cpu', undefined, tx);
        }

        if (totalMemory && usedMemory) {
            const memoryPercent = Math.round((usedMemory / totalMemory) * 100);
            if (memoryPercent >= thresholds.memoryWarning) memoryAlert = await this.createHighMemoryAlert(routerId, routerName, memoryPercent, tx);
            else await this.resolveActiveMetricAlerts(routerId, 'high_memory', undefined, tx);
        }

        return { cpuAlert, memoryAlert };
    }

    /**
     * Resolve active metric alerts
     */
    async resolveActiveMetricAlerts(routerId: string, type: 'high_cpu' | 'high_memory', tenantId?: string, tx: any = db): Promise<void> {
        const filters = [eq(alerts.routerId, routerId), eq(alerts.type, type), eq(alerts.resolved, false)];
        if (tenantId) filters.push(eq(alerts.tenantId, tenantId));
        await tx.update(alerts).set({ resolved: true, resolvedAt: new Date() }).where(and(...filters));
    }

    private formatDuration(seconds: number): string {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ${minutes % 60}m`;
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }

    /**
     * Create PPPoE alerts
     */
    async createPppoeConnectAlert(routerId: string, routerName: string, username: string, ipAddress: string, tx: any = db): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled) return null;
        const tenantId = await getTenantIdFromRouter(routerId, tx);
        return this.create({
            routerId, tenantId: tenantId!, type: 'pppoe_connect', severity: 'info', title: `PPPoE: ${username} connected`,
            message: `User ${username} connected to ${routerName}. IP: ${ipAddress}`, resolved: true, resolvedAt: new Date(),
        }, tx);
    }

    async createPppoeDisconnectAlert(routerId: string, routerName: string, username: string, ipAddress: string, sessionDurationSeconds: number, tx: any = db): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled) return null;
        const tenantId = await getTenantIdFromRouter(routerId, tx);
        return this.create({
            routerId, tenantId: tenantId!, type: 'pppoe_disconnect', severity: 'warning', title: `PPPoE: ${username} disconnected`,
            message: `User ${username} disconnected from ${routerName}. IP: ${ipAddress}. Session duration: ${this.formatDuration(sessionDurationSeconds)}`,
            resolved: true, resolvedAt: new Date(),
        }, tx);
    }

    /**
     * Performance alerts
     */
    async createPerformanceAlert(routerId: string, routerName: string, host: string, deviceName: string, latency: number, packetLoss: number, status?: string, tx: any = db): Promise<Alert | null> {
        const thresholds = await getThresholds(tx);
        if (!thresholds.alertsEnabled || deviceName?.includes('[DISABLED]')) return null;
        const isHighLatency = latency > 100;
        const isPacketLoss = packetLoss > 0;
        if (!isHighLatency && !isPacketLoss) return null;
        if (packetLoss === 100 && status === 'down') return null;

        const type = isHighLatency ? 'high_latency' : 'packet_loss';
        const existing = await this.findRecentUnresolvedAlert(routerId, type, tx);
        if (existing && existing.message.includes(host)) return null;

        const tenantId = await getTenantIdFromRouter(routerId, tx);
        return this.create({
            routerId, tenantId: tenantId!, type, severity: 'warning',
            title: isHighLatency && isPacketLoss ? `Performance Issue: ${deviceName}` : isHighLatency ? `High Latency: ${deviceName}` : `Packet Loss: ${deviceName}`,
            message: `Host ${host} (${deviceName}) has issues:${isHighLatency ? ` High Latency (${latency}ms > 100ms).` : ` Latency: ${latency}ms.`}${isPacketLoss ? ` Packet Loss (${packetLoss}%).` : ''}`,
        }, tx);
    }

    async resolvePerformanceAlert(routerId: string, host: string, tenantId?: string, tx: any = db): Promise<number> {
        const filters = [eq(alerts.routerId, routerId), inArray(alerts.type, ['threshold', 'high_latency', 'packet_loss']), eq(alerts.resolved, false)];
        if (tenantId) filters.push(eq(alerts.tenantId, tenantId));
        const existingAlerts = await tx.select().from(alerts).where(and(...filters));
        const alertsToResolve = existingAlerts.filter((a: any) => a.message.includes(host));
        if (alertsToResolve.length === 0) return 0;
        const idsToResolve = alertsToResolve.map((a: any) => a.id);
        await tx.update(alerts).set({ resolved: true, resolvedAt: new Date() }).where(inArray(alerts.id, idsToResolve));
        eventEmitter.broadcast('alerts_updated', { type: 'resolve_batch', ids: idsToResolve, timestamp: new Date().toISOString() });
        return idsToResolve.length;
    }

    /**
     * Create/Update SNMP error alert
     */
    async createSnmpErrorAlert(routerId: string, routerName: string, error: string, tx: any = db) {
        // Find existing unresolved SNMP alert
        const existing = await this.findRecentUnresolvedAlert(routerId, 'snmp_error' as any, tx);
        
        if (existing) {
            // Update message if error changed
            if (existing.message !== `SNMP Error: ${error}`) {
                await tx.update(alerts).set({
                    message: `SNMP Error: ${error}`,
                    updatedAt: new Date(),
                }).where(eq(alerts.id, existing.id));
            }
            return existing;
        }

        const tenantId = await getTenantIdFromRouter(routerId);
        if (!tenantId) {
             logger.error({ routerId }, 'Could not find tenantId for router, skipping SNMP alert');
             return;
        }
        
        return this.create({
            routerId,
            tenantId,
            type: 'snmp_error' as any,
            severity: 'warning',
            title: `SNMP Failure: ${routerName}`,
            message: `SNMP Error: ${error}`,
            acknowledged: false,
            createdAt: new Date(),
        }, tx);
    }

    /**
     * Resolve SNMP error alert
     */
    async resolveSnmpErrorAlert(routerId: string, tx: any = db) {
        await tx.update(alerts)
            .set({ 
                resolvedAt: new Date(),
                updatedAt: new Date(),
                resolved: true
            })
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, 'snmp_error' as any),
                isNull(alerts.resolvedAt)
            ));
    }
}

export const alertActionService = new AlertActionService();
