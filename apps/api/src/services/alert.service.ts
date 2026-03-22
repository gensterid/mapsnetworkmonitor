import { alertQueryService } from './alert-query.service.js';
import { alertActionService } from './alert-action.service.js';
import { type Alert, type NewAlert } from '../db/schema/index.js';

/**
 * Alert Service - Facade for Query and Action services
 * Maintains backward compatibility while delegating logic to modular services.
 */
export class AlertService {
    // Queries
    async areAlertsEnabled(): Promise<boolean> {
        return alertQueryService.areAlertsEnabled();
    }

    async findAll(options: any = {}) {
        return alertQueryService.findAll(options);
    }

    async findUnacknowledged(options: any = {}) {
        return alertQueryService.findUnacknowledged(options);
    }

    async findByRouterId(routerId: string, limit?: number, tenantId?: string) {
        return alertQueryService.findByRouterId(routerId, limit, tenantId);
    }

    async findById(id: string, tenantId?: string) {
        return alertQueryService.findById(id, tenantId);
    }

    async countUnacknowledged(userId?: string, userRole?: string, tenantId?: string) {
        return alertQueryService.countUnacknowledged(userId, userRole, tenantId);
    }

    async countBySeverity(userId?: string, userRole?: string, tenantId?: string) {
        return alertQueryService.countBySeverity(userId, userRole, tenantId);
    }

    async getUnreadStats(userId?: string, userRole?: string, tenantId?: string) {
        return alertQueryService.getUnreadStats(userId, userRole, tenantId);
    }

    // Actions
    async create(data: NewAlert, tx?: any): Promise<Alert> {
        return alertActionService.create(data, tx);
    }

    async acknowledge(id: string, userId: string, userRole?: string, tenantId?: string) {
        return alertActionService.acknowledge(id, userId, userRole, tenantId);
    }

    async acknowledgeAll(userId: string, userRole?: string, category?: 'issues' | 'alerts', tenantId?: string) {
        return alertActionService.acknowledgeAll(userId, userRole, category, tenantId);
    }

    async resolve(id: string, tenantId?: string) {
        return alertActionService.resolve(id, tenantId);
    }

    async resolveAll(userId: string, userRole?: string, category?: 'issues' | 'alerts', tenantId?: string) {
        return alertActionService.resolveAll(userId, userRole, category, tenantId);
    }

    async delete(id: string, tenantId?: string) {
        return alertActionService.delete(id, tenantId);
    }

    async createNetwatchAlert(routerId: string, deviceName: string, host: string, status: 'up' | 'down', tx?: any) {
        return alertActionService.createNetwatchAlert(routerId, deviceName, host, status, tx);
    }

    async createStatusChangeAlert(routerId: string, routerName: string, oldStatus: string, newStatus: string, reason?: string, tx?: any) {
        return alertActionService.createStatusChangeAlert(routerId, routerName, oldStatus, newStatus, reason, tx);
    }

    async createHighCpuAlert(routerId: string, routerName: string, cpuLoad: number, tx?: any) {
        return alertActionService.createHighCpuAlert(routerId, routerName, cpuLoad, tx);
    }

    async createHighMemoryAlert(routerId: string, routerName: string, memoryPercent: number, tx?: any) {
        return alertActionService.createHighMemoryAlert(routerId, routerName, memoryPercent, tx);
    }

    async checkAndCreateMetricAlerts(routerId: string, routerName: string, cpuLoad?: number, totalMemory?: number, usedMemory?: number, tx?: any) {
        return alertActionService.checkAndCreateMetricAlerts(routerId, routerName, cpuLoad, totalMemory, usedMemory, tx);
    }

    async resolveActiveMetricAlerts(routerId: string, type: 'high_cpu' | 'high_memory', tenantId?: string, tx?: any) {
        return alertActionService.resolveActiveMetricAlerts(routerId, type, tenantId, tx);
    }

    async createPppoeConnectAlert(routerId: string, routerName: string, username: string, ipAddress: string, tx?: any) {
        return alertActionService.createPppoeConnectAlert(routerId, routerName, username, ipAddress, tx);
    }

    async createPppoeDisconnectAlert(routerId: string, routerName: string, username: string, ipAddress: string, sessionDurationSeconds: number, tx?: any) {
        return alertActionService.createPppoeDisconnectAlert(routerId, routerName, username, ipAddress, sessionDurationSeconds, tx);
    }

    async createPerformanceAlert(routerId: string, routerName: string, host: string, deviceName: string, latency: number, packetLoss: number, status?: string, tx?: any) {
        return alertActionService.createPerformanceAlert(routerId, routerName, host, deviceName, latency, packetLoss, status, tx);
    }

    async createSnmpErrorAlert(routerId: string, routerName: string, error: string, tx?: any) {
        return alertActionService.createSnmpErrorAlert(routerId, routerName, error, tx);
    }

    async resolveSnmpErrorAlert(routerId: string, tx?: any) {
        return alertActionService.resolveSnmpErrorAlert(routerId, tx);
    }

    async resolvePerformanceAlert(routerId: string, host: string, tenantId?: string, tx?: any) {
        return alertActionService.resolvePerformanceAlert(routerId, host, tenantId, tx);
    }
}

// Export singleton instance
export const alertService = new AlertService();
