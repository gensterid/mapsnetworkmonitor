import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    type PppoeSession,
    type NewPppoeSession,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import { dashboardService } from './dashboard.service.js';
import type { PppSession, SimpleQueueData } from '../lib/mikrotik-api.js';
import { logger } from '../lib/logger.js';
import { pppoeRepository } from '../repositories/pppoe.repository.js';
import { routerRepository } from '../repositories/router.repository.js';
import { type Result, ok, err } from '../lib/result.js';

/**
 * PPPoE Service - handles PPPoE session tracking and alerts.
 * Optimized with Repository pattern and Result objects for reliability.
 */
class PppoeService {
    /**
     * Store coordinates for users who disconnect (to preserve when they reconnect)
     * Key: "routerId:username", Value: { latitude, longitude, waypoints, connectionType, connectedToId }
     */
    private coordinatesCache: Map<string, {
        latitude: string | null;
        longitude: string | null;
        waypoints: string | null;
        connectionType: string | null;
        connectedToId: string | null;
    }> = new Map();

    /**
     * Track PPPoE sessions and create alerts for connect/disconnect events
     */
    async trackSessions(
        router: any,
        currentSessions: PppSession[],
        tx?: any
    ): Promise<Result<{
        connected: string[];
        disconnected: string[];
    }>> {
        const routerId = router.id;
        const routerName = router.name;
        const connected: string[] = [];
        const disconnected: string[] = [];

        logger.debug({ routerName, sessionCount: currentSessions.length }, '[PPPoE] Tracking sessions');

        try {
            const tenantId = router?.tenantId;
            if (!tenantId) {
                logger.error({ routerId }, '[PPPoE] Skipping sync: Router tenant not found');
                return err(new Error('Router tenant not found'));
            }

            const previousSessions = await this.findSessionsByRouter(routerId, tx);
            const previousSessionNames = new Set(previousSessions.map(s => s.name));
            const currentSessionNames = new Set(currentSessions.map(s => s.name));

            logger.debug({ previous: previousSessions.length, current: currentSessions.length }, '[PPPoE] Session sync counts');

            const executeTracking = async (transaction: any) => {
                // Detect disconnections FIRST
                for (const session of previousSessions) {
                    if (session.status === 'disconnected') continue;

                    if (!currentSessionNames.has(session.name)) {
                        disconnected.push(session.name);
                        logger.info({ routerName, session: session.name }, '[PPPoE] Disconnection detected');

                        if (session.latitude || session.longitude || session.waypoints) {
                            const cacheKey = `${routerId}:${session.name}`;
                            this.coordinatesCache.set(cacheKey, {
                                latitude: session.latitude,
                                longitude: session.longitude,
                                waypoints: session.waypoints,
                                connectionType: session.connectionType,
                                connectedToId: session.connectedToId,
                            });
                        }

                        const duration = Math.floor((Date.now() - new Date(session.connectedAt).getTime()) / 1000);

                        try {
                            await alertService.createPppoeDisconnectAlert(
                                routerId,
                                routerName,
                                session.name,
                                session.address || 'N/A',
                                duration,
                                transaction
                            );
                        } catch (alertErr) {
                            logger.error({ err: alertErr, session: session.name }, '[PPPoE] Failed to create disconnect alert');
                        }

                        await this.updateSession(session.id, {
                            lastSeen: new Date(),
                            lastDown: new Date(),
                            status: 'disconnected'
                        }, transaction);
                    }
                }

                // Detect new connections
                for (const session of currentSessions) {
                    if (!previousSessionNames.has(session.name)) {
                        connected.push(session.name);
                        logger.info({ routerName, session: session.name, ip: session.address }, '[PPPoE] New connection detected');

                        const cacheKey = `${routerId}:${session.name}`;
                        const cachedCoords = this.coordinatesCache.get(cacheKey);

                        const newSessionData: NewPppoeSession = {
                            routerId,
                            name: session.name,
                            sessionId: session.sessionId,
                            callerId: session.callerId,
                            address: session.address,
                            service: session.service,
                            uptime: session.uptime,
                            status: 'active',
                            tenantId: tenantId,
                        };

                        if (cachedCoords) {
                            if (cachedCoords.latitude) newSessionData.latitude = cachedCoords.latitude;
                            if (cachedCoords.longitude) newSessionData.longitude = cachedCoords.longitude;
                            if (cachedCoords.waypoints) newSessionData.waypoints = cachedCoords.waypoints;
                            if (cachedCoords.connectionType) newSessionData.connectionType = cachedCoords.connectionType;
                            if (cachedCoords.connectedToId) newSessionData.connectedToId = cachedCoords.connectedToId;
                            this.coordinatesCache.delete(cacheKey);
                        }

                        await this.createSession(newSessionData, transaction);

                        try {
                            await alertService.createPppoeConnectAlert(
                                routerId,
                                routerName,
                                session.name,
                                session.address || 'N/A',
                                transaction
                            );
                        } catch (alertErr) {
                            logger.error({ err: alertErr, session: session.name }, '[PPPoE] Failed to create connect alert');
                        }

                        if (session.address) {
                            await this.linkSessionToOnu(session.name, session.address, transaction).catch(err =>
                                logger.error({ err, session: session.name }, '[PPPoE] Link to ONU failed')
                            );
                        }
                    } else {
                        const existingSession = previousSessions.find(s => s.name === session.name);
                        if (existingSession) {
                            if (existingSession.address !== session.address && session.address) {
                                await this.linkSessionToOnu(session.name, session.address, transaction).catch(err =>
                                    logger.error({ err, session: session.name }, '[PPPoE] Link to ONU failed (IP Change)')
                                );
                            }

                            await this.updateSession(existingSession.id, {
                                lastSeen: new Date(),
                                uptime: session.uptime,
                                address: session.address,
                                status: 'active'
                            }, transaction);
                        }
                    }
                }
            };

            if (tx) {
                await executeTracking(tx);
            } else {
                await db.transaction(async (innerTx) => {
                    await executeTracking(innerTx);
                });
            }

            if (connected.length > 0 || disconnected.length > 0) {
                logger.info({ routerName, connected: connected.length, disconnected: disconnected.length }, '[PPPoE] Session sync summary');
                dashboardService.invalidateCache();
            }

            return ok({ connected, disconnected });
        } catch (error) {
            logger.error({ routerId, err: error }, '[PPPoE] Failed to track sessions');
            return err(error as Error);
        }
    }

    async findSessionsByRouter(routerId: string, tx: any = db): Promise<PppoeSession[]> {
        return pppoeRepository.findByRouter(routerId, tx);
    }

    async createSession(data: NewPppoeSession, tx: any = db): Promise<PppoeSession> {
        return pppoeRepository.create(data, tx);
    }

    async updateSession(id: string, data: Partial<PppoeSession>, tx: any = db): Promise<PppoeSession | undefined> {
        return pppoeRepository.update(id, data, tx);
    }
    
    /**
     * Specialized method to update session coordinates and return the session
     * Used by HTTP routes.
     */
    async updateCoordinates(
        id: string,
        latitude?: string | null,
        longitude?: string | null,
        waypoints?: string | null,
        connectionType?: string,
        connectedToId?: string,
        tenantId?: string
    ): Promise<PppoeSession | undefined> {
        // Verify tenant access if provided
        if (tenantId) {
            const session = await this.findById(id, tenantId);
            if (!session) return undefined;
        }

        return this.updateSession(id, {
            latitude,
            longitude,
            waypoints,
            connectionType,
            connectedToId
        });
    }

    async deleteSession(id: string, tx: any = db): Promise<void> {
        await pppoeRepository.delete(id, tx);
    }

    async cleanupRouterSessions(routerId: string): Promise<void> {
        await pppoeRepository.deleteByRouter(routerId);
    }

    async findById(id: string, tenantId?: string): Promise<PppoeSession | undefined> {
        return pppoeRepository.findById(id, tenantId);
    }

    async findAll(routerId?: string, userId?: string, userRole?: string, tenantId?: string, tx: any = db): Promise<PppoeSession[]> {
        return pppoeRepository.findAll({ routerId, userId, userRole, tenantId }, tx);
    }

    async findAllWithCoordinates(routerId?: string, userId?: string, userRole?: string, tenantId?: string): Promise<PppoeSession[]> {
        return pppoeRepository.findAll({ routerId, userId, userRole, tenantId, onlyWithCoordinates: true });
    }

    async updateTraffic(routerId: string, queues: SimpleQueueData[], tx: any = db): Promise<void> {
        const sessions = await pppoeRepository.findAll({ routerId }, tx);
        const activeSessions = sessions.filter(s => s.status === 'active');
        if (activeSessions.length === 0) return;

        const queueMap = new Map<string, SimpleQueueData>();
        queues.forEach(q => queueMap.set(q.name, q));

        const now = new Date();
        const batchUpdates: any[] = [];

        for (const session of activeSessions) {
            const possibleNames = [`<${session.name}>`, session.name, `pppoe-${session.name}`, `<pppoe-${session.name}>`];
            let queue: SimpleQueueData | undefined;
            for (const name of possibleNames) {
                queue = queueMap.get(name);
                if (queue) break;
            }

            if (queue) {
                const parts = queue.bytes.split('/');
                const rxBytes = parseInt(parts[0] || '0', 10);
                const txBytes = parseInt(parts[1] || '0', 10);

                let txRate = 0, rxRate = 0;
                if (session.lastTrafficUpdate) {
                    const seconds = (now.getTime() - new Date(session.lastTrafficUpdate).getTime()) / 1000;
                    if (seconds > 0) {
                        const prevTx = Number(session.txBytes) || 0;
                        const prevRx = Number(session.rxBytes) || 0;
                        const txDiff = txBytes - prevTx;
                        const rxDiff = rxBytes - prevRx;
                        if (txDiff >= 0) txRate = Math.round((txDiff * 8) / seconds);
                        if (rxDiff >= 0) rxRate = Math.round((rxDiff * 8) / seconds);
                    }
                }

                batchUpdates.push({ id: session.id, txBytes, rxBytes, txRate, rxRate, lastTrafficUpdate: now });
            }
        }

        if (batchUpdates.length > 0) await pppoeRepository.updateTrafficBatch(batchUpdates, tx);
    }

    private async linkSessionToOnu(username: string, ip: string, tx: any = db): Promise<void> {
        try {
            const { onus } = await import('../db/schema/index.js');
            const sn = username.trim();
            const host = ip.trim();
            if (!sn || !host) return;

            const [onu] = await tx.select().from(onus).where(eq(onus.sn, sn));
            if (onu) {
                const sources = (onu.discoverySources as string[]) || [];
                if (!sources.includes('netwatch')) sources.push('netwatch');

                await tx.update(onus)
                    .set({ host, status: 'online', lastSeen: new Date(), discoverySources: sources, updatedAt: new Date() })
                    .where(eq(onus.id, onu.id));

                logger.debug({ username, ip, onuId: onu.id }, '[PPPoE] Linked session to ONU');
            }
        } catch (e) {
            logger.error({ err: e, username }, '[PPPoE] Failed to link session to ONU');
        }
    }
}

export const pppoeService = new PppoeService();
