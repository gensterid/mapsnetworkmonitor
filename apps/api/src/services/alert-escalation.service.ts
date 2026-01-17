import { db } from '../db/index.js';
import { alerts, routers, routerNetwatch } from '../db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { notificationService } from './notification.service.js';

// Escalation thresholds in milliseconds
const ESCALATION_THRESHOLDS = [
    { level: 1, after: 1 * 60 * 60 * 1000, label: '1 jam' },      // 1 hour
    { level: 2, after: 3 * 60 * 60 * 1000, label: '3 jam' },      // 3 hours
    { level: 3, after: 12 * 60 * 60 * 1000, label: '12 jam' },    // 12 hours
    { level: 4, after: 24 * 60 * 60 * 1000, label: '1 hari' },    // 1 day
    { level: 5, after: 3 * 24 * 60 * 60 * 1000, label: '3 hari' }, // 3 days
];

/**
 * Format duration to human readable Indonesian string
 */
function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        const remainingHours = hours % 24;
        if (remainingHours > 0) {
            return `${days} hari ${remainingHours} jam`;
        }
        return `${days} hari`;
    }

    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        if (remainingMinutes > 0) {
            return `${hours} jam ${remainingMinutes} menit`;
        }
        return `${hours} jam`;
    }

    if (minutes > 0) {
        return `${minutes} menit`;
    }

    return `${seconds} detik`;
}

export class AlertEscalationService {
    /**
     * Check all unresolved down alerts and escalate if needed
     */
    async checkAndEscalateAlerts(): Promise<void> {
        try {
            const now = Date.now();

            // Get all unresolved down alerts (netwatch_down and status_change with offline)
            const unresolvedAlerts = await db
                .select()
                .from(alerts)
                .where(and(
                    eq(alerts.resolved, false),
                    inArray(alerts.type, ['netwatch_down', 'status_change'])
                ));

            for (const alert of unresolvedAlerts) {
                // For status_change alerts, check if router is actually online now
                if (alert.type === 'status_change') {
                    const [router] = await db
                        .select()
                        .from(routers)
                        .where(eq(routers.id, alert.routerId));

                    // If router is online, resolve the alert instead of escalating
                    if (router && router.status === 'online') {
                        await db
                            .update(alerts)
                            .set({
                                resolved: true,
                                resolvedAt: new Date(),
                            })
                            .where(eq(alerts.id, alert.id));
                        console.log(`[ESCALATION] Auto-resolved alert ${alert.id} for router ${router.name} (router is now ONLINE)`);
                        continue; // Skip escalation
                    }
                }

                // For netwatch_down alerts, check if device is actually UP now
                if (alert.type === 'netwatch_down') {
                    const ipMatch = alert.message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                    if (ipMatch) {
                        const [netwatch] = await db
                            .select()
                            .from(routerNetwatch)
                            .where(and(
                                eq(routerNetwatch.routerId, alert.routerId),
                                eq(routerNetwatch.host, ipMatch[1])
                            ));

                        // If device is UP, resolve the alert instead of escalating
                        if (netwatch && netwatch.status === 'up') {
                            await db
                                .update(alerts)
                                .set({
                                    resolved: true,
                                    resolvedAt: new Date(),
                                })
                                .where(eq(alerts.id, alert.id));
                            console.log(`[ESCALATION] Auto-resolved alert ${alert.id} for ${ipMatch[1]} (device is now UP)`);
                            continue; // Skip escalation
                        }
                    }
                }

                // Skip if already at max escalation level
                if (alert.escalationLevel >= ESCALATION_THRESHOLDS.length) {
                    continue;
                }

                const timeSinceCreation = now - new Date(alert.createdAt).getTime();
                const currentLevel = alert.escalationLevel;
                const nextThreshold = ESCALATION_THRESHOLDS[currentLevel];

                if (!nextThreshold) continue;

                // Check if we've passed the threshold for the next level
                if (timeSinceCreation >= nextThreshold.after) {
                    // Check if we haven't already escalated recently
                    // (prevent duplicate escalation within 5 minutes)
                    if (alert.lastEscalatedAt) {
                        const timeSinceLastEscalation = now - new Date(alert.lastEscalatedAt).getTime();
                        if (timeSinceLastEscalation < 5 * 60 * 1000) {
                            continue;
                        }
                    }

                    // Time to escalate!
                    await this.escalateAlert(alert, nextThreshold.level, timeSinceCreation);
                }
            }
        } catch (error) {
            console.error('[ESCALATION] Error checking alerts:', error);
        }
    }

    /**
     * Escalate an alert to the next level
     */
    private async escalateAlert(
        alert: typeof alerts.$inferSelect,
        newLevel: number,
        downtime: number
    ): Promise<void> {
        try {
            console.log(`[ESCALATION] Escalating alert ${alert.id} to level ${newLevel}`);

            // Update alert with new escalation level
            await db
                .update(alerts)
                .set({
                    escalationLevel: newLevel,
                    lastEscalatedAt: new Date(),
                })
                .where(eq(alerts.id, alert.id));

            // Get router data for notification
            const [router] = await db
                .select()
                .from(routers)
                .where(eq(routers.id, alert.routerId));

            if (!router) {
                console.error(`[ESCALATION] Router not found for alert ${alert.id}`);
                return;
            }

            // Try to get netwatch data for netwatch alerts
            let netwatchData: {
                name: string;
                host: string;
                latitude: string | null;
                longitude: string | null;
                location: string | null;
            } | null = null;

            if (alert.type === 'netwatch_down') {
                // Extract IP from alert message
                const ipMatch = alert.message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                if (ipMatch) {
                    const [netwatch] = await db
                        .select()
                        .from(routerNetwatch)
                        .where(and(
                            eq(routerNetwatch.routerId, alert.routerId),
                            eq(routerNetwatch.host, ipMatch[1])
                        ));

                    if (netwatch) {
                        netwatchData = {
                            name: netwatch.name || ipMatch[1],
                            host: netwatch.host,
                            latitude: netwatch.latitude,
                            longitude: netwatch.longitude,
                            location: netwatch.location,
                        };
                    }
                }
            }

            // Send escalation notification
            await notificationService.sendEscalationNotification(
                alert,
                router,
                newLevel,
                formatDuration(downtime),
                netwatchData
            );

            console.log(`[ESCALATION] Alert ${alert.id} escalated to level ${newLevel} successfully`);
        } catch (error) {
            console.error(`[ESCALATION] Failed to escalate alert ${alert.id}:`, error);
        }
    }
}

export const alertEscalationService = new AlertEscalationService();
