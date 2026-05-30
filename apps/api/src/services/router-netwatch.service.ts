import * as core from './netwatch/netwatch-core.service.js';
import * as sync from './netwatch/netwatch-sync.service.js';
import * as monitor from './netwatch/netwatch-monitor.service.js';
import * as webhook from './netwatch/netwatch-webhook.service.js';
import * as linkage from './netwatch/netwatch-linkage.service.js';

/**
 * RouterNetwatchService Aggregator
 * This class maintains the same interface as the original monolithic service
 * to ensure backward compatibility across the codebase.
 */
export class RouterNetwatchService {
    // Core Queries
    async getNetwatch(routerId: string, tx?: any) { return core.getNetwatch(routerId, tx); }
    async getNetwatchAll(routerIds: string[], tx?: any) { return core.getNetwatchAll(routerIds); }
    async create(routerId: string, data: any, tenantId?: string, tx?: any) { return core.create(routerId, data, tenantId, tx); }
    async updateEntry(routerId: string, id: string, data: any, tenantId?: string, tx?: any, audit?: core.UpdateEntryAuditOpts) { return core.updateEntry(routerId, id, data, tenantId, tx, audit); }
    async delete(
        routerId: string,
        id: string,
        tenantId?: string,
        optionsOrFlag: { mode?: 'both' | 'app_only' | 'mikrotik_only' } | boolean = true,
        tx?: any
    ) {
        const options = typeof optionsOrFlag === 'boolean'
            ? { deleteFromMikrotik: optionsOrFlag }
            : optionsOrFlag;
        return core.deleteEntry(routerId, id, tenantId, options, tx);
    }

    // Sync Logic
    async syncHosts(routerId: string, routerName: string, conn: any, availableInterfaces?: Set<string>, tx?: any) {
        return sync.syncHosts(routerId, routerName, conn, availableInterfaces, tx);
    }
    async fullSync(routerId: string) { return sync.fullSync(routerId); }

    // Latency & Traffic
    async measureLatency(routerId: string, routerName: string, conn: any, targets: any[], tx?: any) {
        return monitor.measureLatency(routerId, routerName, conn, targets, tx);
    }
    async propagateTraffic(routerId: string, routerName: string, conn: any, tx?: any) {
        return monitor.propagateTraffic(routerId, routerName, conn, tx);
    }

    // Webhook Handling
    async handleWebhook(routerId: string, host: string, status: string) {
        return webhook.handleWebhook(routerId, host, status);
    }
    getInterfaceName(comment?: string) { return webhook.getInterfaceName(comment); }

    // Linkage & External Helpers
    async syncToOnus(routerId: string, tx?: any) { return linkage.syncToOnus(routerId, tx); }
    async ensureNetwatchEntry(routerId: string, host: string, name?: string, type?: 'olt' | 'router' | 'switch', tenantId?: string, tx?: any) {
        return linkage.ensureNetwatchEntry(routerId, host, name, type, tenantId, tx);
    }
    async ensureAppOnlyEntry(routerId: string, host: string, name?: string, type?: 'olt' | 'router' | 'switch', tenantId?: string, tx?: any) {
        return linkage.ensureNetwatchEntry(routerId, host, name, type, tenantId, tx);
    }
}

// Export singleton instance for backward compatibility
export const routerNetwatchService = new RouterNetwatchService();
