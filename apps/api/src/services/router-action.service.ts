import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, type Router } from '../db/schema/index.js';
import { decrypt } from '../lib/encryption.js';
import { ApiError } from '../middleware/error.middleware.js';
import { logger } from '../lib/logger.js';
import {
    connectToRouter,
    rebootRouter,
    measurePing,
    getNeighbors,
    getRomonNeighbors,
    getHotspotActive,
    getPppActive,
    getPppSessions,
    getInterfaceTraffic,
    testConnection,
    getRouterInfo,
    type RouterConnection,
    type PppSession,
    type RouterNeighbor,
    type RomonNeighbor,
} from '../lib/mikrotik-api.js';
import { settingsService } from './settings.service.js';

export class RouterActionService {
    /**
     * Internal helper to find a router and decrypt its password.
     * Prevents circular dependency with RouterService.
     */
    private async findRouterWithPassword(id: string, tenantId?: string): Promise<Router & { password: string }> {
        const filters = [eq(routers.id, id)];
        if (tenantId) filters.push(eq(routers.tenantId, tenantId));

        const [router] = await db.select().from(routers).where(and(...filters));
        if (!router) throw new ApiError(404, 'Router not found');

        return {
            ...router,
            password: router.passwordEncrypted ? decrypt(router.passwordEncrypted, router.name) : '',
        };
    }

    /**
     * Get a connection to a router, handling RoMON if configured
     */
    async getRouterConnection(routerId: string, tenantId?: string): Promise<any> {
        const router = await this.findRouterWithPassword(routerId, tenantId);

        let config: RouterConnection = {
            host: router.host,
            port: router.port,
            username: router.username,
            password: router.password || '',
        };

        // DIAGNOSTIC: Log password state before connecting
        if (!router.password || router.password.length === 0) {
            logger.error({
                routerId,
                name: router.name,
                host: router.host,
                username: router.username,
                passwordEncryptedPresent: !!router.passwordEncrypted,
                passwordEncryptedPrefix: router.passwordEncrypted?.substring(0, 10),
            }, '🚨 [DIAG] Router password is EMPTY after decryption! This will cause "Salah Password" error.');
        }

        if (router.gatewayId && router.romonMac) {
            const gateway = await this.findRouterWithPassword(router.gatewayId, tenantId);
            config = {
                host: gateway.host,
                port: gateway.port,
                username: gateway.username,
                password: gateway.password || '',
                romon: router.romonMac,
            };
        }

        return await connectToRouter(config);
    }

    /**
     * Test connection to a router
     */
    async testConnection(
        id: string,
        tenantId?: string
    ): Promise<{ success: boolean; info?: unknown; error?: string }> {
        try {
            const api = await this.getRouterConnection(id, tenantId);
            const info = await getRouterInfo(api);
            if (api) api.release();
            return { success: true, info };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Test connection with credentials (for testing before save)
     */
    async testConnectionWithCredentials(
        host: string,
        port: number,
        username: string,
        password: string
    ): Promise<{ success: boolean; info?: unknown; error?: string }> {
        return testConnection({ host, port, username, password });
    }

    /**
     * Reboot a router
     */
    async reboot(id: string, tenantId?: string): Promise<{ success: boolean; error?: string }> {
        const router = await this.findRouterWithPassword(id, tenantId);

        try {
            const conn = await this.getRouterConnection(id, tenantId);

            await rebootRouter(conn);
            if (conn) conn.release();

            // Update router status to offline immediately (will be online again after boot/refresh)
            await db
                .update(routers)
                .set({
                    status: 'offline',
                    updatedAt: new Date(),
                })
                .where(eq(routers.id, id));

            return { success: true };
        } catch (error: any) {
            const errMsg = error?.message || String(error);
            return {
                success: false,
                error: errMsg,
            };
        }
    }

    async getHotspotActive(routerId: string, tenantId?: string): Promise<number> {
        const router = await this.findRouterWithPassword(routerId, tenantId);

        try {
            const conn = await this.getRouterConnection(routerId, tenantId);
            const count = await getHotspotActive(conn);
            if (conn) conn.release();
            return count;
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), host: router.host }, 'Failed to get hotspot users');
            return 0;
        }
    }

    async getPppActive(routerId: string, tenantId?: string): Promise<number> {
        const router = await this.findRouterWithPassword(routerId, tenantId);

        try {
            const conn = await this.getRouterConnection(routerId, tenantId);
            const count = await getPppActive(conn);
            if (conn) conn.release();
            return count;
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), host: router.host }, 'Failed to get PPP users');
            return 0;
        }
    }

    async getPppSessions(routerId: string, tenantId?: string): Promise<PppSession[]> {
        const router = await this.findRouterWithPassword(routerId, tenantId);

        try {
            const conn = await this.getRouterConnection(routerId, tenantId);
            const sessions = await getPppSessions(conn);
            if (conn) conn.release();
            return sessions;
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), host: router.host }, 'Failed to get PPP sessions');
            return [];
        }
    }

    /**
     * Measure ping latency to configured targets via MikroTik router
     */
    async measurePingTargets(routerId: string, tenantId?: string): Promise<{ ip: string; label: string; latency: number | null; packetLoss: number | null }[]> {
        const router = await this.findRouterWithPassword(routerId, tenantId);
        if (router.status !== 'online') {
            return [];
        }

        const defaultTargets = [
            { ip: '8.8.8.8', label: 'Google DNS' },
            { ip: '1.1.1.1', label: 'Cloudflare' }
        ];

        // Safely fetch targets, fallback to defaults if router has no tenant
        let targets: Array<{ ip: string; label: string }> = defaultTargets;
        if (router.tenantId) {
            try {
                const targetsValue = await settingsService.getSettingValue<Array<{ ip: string; label: string }>>('pingTargets', router.tenantId, defaultTargets);
                targets = Array.isArray(targetsValue) ? targetsValue : defaultTargets;
            } catch (err) {
                logger.error({ err, routerId, tenantId: router.tenantId }, 'Error fetching pingTargets setting');
            }
        }

        if (targets.length === 0) {
            return [];
        }

        let conn: any;
        const results: { ip: string; label: string; latency: number | null; packetLoss: number | null }[] = [];

        try {
            conn = await this.getRouterConnection(routerId, tenantId);

            for (const target of targets.slice(0, 6)) {
                try {
                    const { latency, packetLoss } = await measurePing(conn, target.ip, 3, '500ms', '2000ms');
                    results.push({
                        ip: target.ip,
                        label: target.label || target.ip,
                        latency: latency >= 0 ? latency : null,
                        packetLoss: packetLoss
                    });

                    // Small delay between targets to reduce API stress
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (err) {
                    logger.error({ err, router: router.name, target: target.ip }, 'Error pinging target');
                    results.push({
                        ip: target.ip,
                        label: target.label || target.ip,
                        latency: null,
                        packetLoss: null
                    });
                }
            }
        } catch (error: any) {
            logger.error({ err: error?.message, router: router.name }, 'Failed to measure ping targets');
            if (results.length === 0) {
                return targets.slice(0, 6).map(t => ({
                    ip: t.ip,
                    label: t.label || t.ip,
                    latency: null,
                    packetLoss: null
                }));
            }
        } finally {
            if (conn) conn.release();
        }

        return results;
    }

    /**
     * Get discovered neighbors (MNDP)
     */
    async getNeighbors(routerId: string, tenantId?: string): Promise<RouterNeighbor[]> {
        let api;
        try {
            api = await this.getRouterConnection(routerId, tenantId);
            const neighbors = await getNeighbors(api);

            await db.update(routers)
                .set({ lastNeighborsSync: new Date() })
                .where(eq(routers.id, routerId));

            return neighbors;
        } catch (error: any) {
            logger.error({ err: error, routerId }, 'Failed to get neighbors');
            throw new ApiError(500, `MikroTik Error: ${error.message}`);
        } finally {
            if (api) api.release();
        }
    }

    /**
     * Get RoMON neighbors for a router
     */
    async getRomonNeighbors(routerId: string, tenantId?: string): Promise<RomonNeighbor[]> {
        let api: any;
        try {
            api = await this.getRouterConnection(routerId, tenantId);
            const neighbors = await getRomonNeighbors(api);
            return neighbors;
        } catch (error: any) {
            logger.warn({ err: error?.message || String(error), routerId }, 'Failed to get RoMON neighbors');
            return [];
        } finally {
            if (api) api.release();
        }
    }

    /**
     * Measure ping latency to a specific IP address via MikroTik router.
     */
    async pingHost(routerId: string, ip: string, tenantId?: string): Promise<{ latency: number | null; packetLoss: number | null }> {
        let api: any;
        try {
            api = await this.getRouterConnection(routerId, tenantId);
            return await measurePing(api, ip, 3, '500ms', '3000ms');
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), routerId, ip }, 'Failed to execute arbitrary ping');
            return { latency: null, packetLoss: 100 };
        } finally {
            if (api) api.release();
        }
    }

    /**
     * Get real-time traffic for specific interfaces
     */
    async getInterfaceTraffic(routerId: string, interfaces: string[], tenantId?: string): Promise<Map<string, { tx: number; rx: number }>> {
        let api: any;
        try {
            api = await this.getRouterConnection(routerId, tenantId);
            return await getInterfaceTraffic(api, interfaces);
        } catch (error: any) {
            logger.error({ err: error?.message || String(error), routerId }, 'Failed to get interface traffic');
            return new Map();
        } finally {
            if (api) api.release();
        }
    }
}

export const routerActionService = new RouterActionService();
