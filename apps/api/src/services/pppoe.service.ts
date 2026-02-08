import { eq, and, notInArray, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    pppoeSessions,
    userRouters,
    type PppoeSession,
    type NewPppoeSession,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import type { PppSession, SimpleQueueData } from '../lib/mikrotik-api.js';

/**
 * PPPoE Service - handles PPPoE session tracking and alerts
 */
class PppoeService {
    /**
     * Track PPPoE sessions and create alerts for connect/disconnect events
     * @param routerId Router ID
     * @param routerName Router name (for alert messages)
     * @param currentSessions Current active PPPoE sessions from MikroTik
     */
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

    async trackSessions(
        routerId: string,
        routerName: string,
        currentSessions: PppSession[]
    ): Promise<{
        connected: string[];
        disconnected: string[];
    }> {
        const connected: string[] = [];
        const disconnected: string[] = [];

        console.log(`[PPPoE] Tracking sessions for ${routerName}: ${currentSessions.length} active sessions`);

        try {
            // Get previously tracked sessions for this router
            const previousSessions = await this.findSessionsByRouter(routerId);
            const previousSessionNames = new Set(previousSessions.map(s => s.name));
            const currentSessionNames = new Set(currentSessions.map(s => s.name));

            console.log(`[PPPoE] Previous tracked: ${previousSessions.length}, Current active: ${currentSessions.length}`);

            // Detect disconnections FIRST (so we can cache coordinates before creating new sessions)
            for (const session of previousSessions) {
                // Skip if already disconnected
                if (session.status === 'disconnected') continue;

                if (!currentSessionNames.has(session.name)) {
                    // Disconnection detected
                    disconnected.push(session.name);
                    console.log(`[PPPoE] Disconnection detected: ${session.name}`);

                    // Cache coordinates before deleting (to preserve for reconnection)
                    if (session.latitude || session.longitude || session.waypoints) {
                        const cacheKey = `${routerId}:${session.name}`;
                        this.coordinatesCache.set(cacheKey, {
                            latitude: session.latitude,
                            longitude: session.longitude,
                            waypoints: session.waypoints,
                            connectionType: session.connectionType,
                            connectedToId: session.connectedToId,
                        });
                        console.log(`[PPPoE] Cached coordinates for ${session.name}`);
                    }

                    // Calculate session duration
                    const duration = Math.floor(
                        (Date.now() - new Date(session.connectedAt).getTime()) / 1000
                    );

                    // Create disconnect alert
                    try {
                        const alert = await alertService.createPppoeDisconnectAlert(
                            routerId,
                            routerName,
                            session.name,
                            session.address || 'N/A',
                            duration
                        );
                        console.log(`[PPPoE] Disconnect alert created: ${alert ? alert.id : 'null (alerts disabled?)'}`);
                    } catch (alertErr) {
                        console.error(`[PPPoE] Failed to create disconnect alert:`, alertErr);
                    }

                    // Remove session from tracking
                    // Update session status to disconnected instead of deleting
                    await this.updateSession(session.id, {
                        lastSeen: new Date(),
                        lastDown: new Date(),
                        status: 'disconnected'
                    });
                }
            }

            // Detect new connections (in current but not in previous)
            for (const session of currentSessions) {
                if (!previousSessionNames.has(session.name)) {
                    // New connection detected
                    connected.push(session.name);
                    console.log(`[PPPoE] New connection detected: ${session.name} (IP: ${session.address})`);

                    // Check if we have cached coordinates for this user
                    const cacheKey = `${routerId}:${session.name}`;
                    const cachedCoords = this.coordinatesCache.get(cacheKey);

                    // Create new session record (with cached coordinates if available)
                    const newSessionData: NewPppoeSession = {
                        routerId,
                        name: session.name,
                        sessionId: session.sessionId,
                        callerId: session.callerId,
                        address: session.address,
                        service: session.service,
                        uptime: session.uptime,
                        status: 'active', // Explicitly set status to active
                    };

                    // Transfer cached coordinates to new session
                    if (cachedCoords) {
                        if (cachedCoords.latitude) newSessionData.latitude = cachedCoords.latitude;
                        if (cachedCoords.longitude) newSessionData.longitude = cachedCoords.longitude;
                        if (cachedCoords.waypoints) newSessionData.waypoints = cachedCoords.waypoints;
                        if (cachedCoords.connectionType) newSessionData.connectionType = cachedCoords.connectionType;
                        if (cachedCoords.connectedToId) newSessionData.connectedToId = cachedCoords.connectedToId;
                        console.log(`[PPPoE] Restored coordinates for ${session.name} from cache`);
                        // Remove from cache after use
                        this.coordinatesCache.delete(cacheKey);
                    }

                    await this.createSession(newSessionData);

                    // Create connect alert
                    try {
                        const alert = await alertService.createPppoeConnectAlert(
                            routerId,
                            routerName,
                            session.name,
                            session.address || 'N/A'
                        );
                        console.log(`[PPPoE] Connect alert created: ${alert ? alert.id : 'null (alerts disabled?)'}`);
                    } catch (alertErr) {
                        console.error(`[PPPoE] Failed to create connect alert:`, alertErr);
                    }
                } else {
                    // Session exists, update last seen and uptime
                    const existingSession = previousSessions.find(s => s.name === session.name);
                    if (existingSession) {
                        await this.updateSession(existingSession.id, {
                            lastSeen: new Date(),
                            uptime: session.uptime,
                            address: session.address,
                            status: 'active'
                        });
                    }
                }
            } // End of currentSessions loop

            if (connected.length > 0 || disconnected.length > 0) {
                console.log(`[PPPoE] Summary for ${routerName}: +${connected.length} connected, -${disconnected.length} disconnected`);
            }

            return { connected, disconnected };
        } catch (error) {
            console.error(`[PPPoE] Failed to track sessions for router ${routerId}:`, error);
            return { connected, disconnected };
        }
    }

    /**
     * Get all tracked sessions for a router
     */
    async findSessionsByRouter(routerId: string): Promise<PppoeSession[]> {
        return db
            .select()
            .from(pppoeSessions)
            .where(eq(pppoeSessions.routerId, routerId));
    }

    /**
     * Create a new session record
     */
    async createSession(data: NewPppoeSession): Promise<PppoeSession> {
        const [session] = await db
            .insert(pppoeSessions)
            .values(data)
            .returning();
        return session;
    }

    /**
     * Update session
     */
    async updateSession(
        id: string,
        data: Partial<Pick<PppoeSession, 'lastSeen' | 'uptime' | 'address' | 'status' | 'lastDown'>>
    ): Promise<void> {
        await db
            .update(pppoeSessions)
            .set(data)
            .where(eq(pppoeSessions.id, id));
    }

    /**
     * Delete a session
     */
    async deleteSession(id: string): Promise<void> {
        await db.delete(pppoeSessions).where(eq(pppoeSessions.id, id));
    }

    /**
     * Clean up all sessions for a router (used when router goes offline)
     */
    async cleanupRouterSessions(routerId: string): Promise<void> {
        await db.delete(pppoeSessions).where(eq(pppoeSessions.routerId, routerId));
    }

    /**
     * Update coordinates, waypoints and connection info for a PPPoE session
     */
    async updateCoordinates(
        id: string,
        latitude: string | null,
        longitude: string | null,
        waypoints: string | null = null,
        connectionType: string | null = null,
        connectedToId: string | null = null
    ): Promise<PppoeSession | undefined> {
        const updateData: any = {};

        // Only update latitude/longitude if explicitly provided (not null)
        if (latitude !== undefined && latitude !== null) {
            updateData.latitude = latitude;
        }
        if (longitude !== undefined && longitude !== null) {
            updateData.longitude = longitude;
        }
        if (waypoints !== undefined && waypoints !== null) {
            updateData.waypoints = waypoints;
        }
        if (connectionType !== undefined && connectionType !== null) {
            updateData.connectionType = connectionType;
        }
        if (connectedToId !== undefined) {
            updateData.connectedToId = connectedToId;
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length === 0) {
            return this.findById(id);
        }

        const [session] = await db
            .update(pppoeSessions)
            .set(updateData)
            .where(eq(pppoeSessions.id, id))
            .returning();
        return session;
    }

    /**
     * Find all PPPoE sessions (with optional router filter)
     */
    /**
     * Find all PPPoE sessions (with optional router filter)
     */
    async findAll(
        routerId?: string,
        userId?: string,
        userRole?: string
    ): Promise<PppoeSession[]> {
        console.log('[PPPoE] findAll called');

        if (!pppoeSessions || !userRouters) {
            console.error('[PPPoE] CRITICAL: pppoeSessions or userRouters schema is UNDEFINED. Circular dependency suspected.', {
                pppoeSessions: !!pppoeSessions,
                userRouters: !!userRouters
            });
            return [];
        }

        try {
            const filters = [];

            if (routerId) {
                filters.push(eq(pppoeSessions.routerId, routerId));
            }

            // If user is not admin, filter by assigned routers
            if (userId && userRole && userRole !== 'admin') {
                const assigned = await db
                    .select({ routerId: userRouters.routerId })
                    .from(userRouters)
                    .where(eq(userRouters.userId, userId));

                const assignedIds = assigned.map((a) => a.routerId);

                if (assignedIds.length === 0) {
                    return []; // No routers assigned
                }

                filters.push(inArray(pppoeSessions.routerId, assignedIds));
            }

            if (filters.length > 0) {
                return await db
                    .select()
                    .from(pppoeSessions)
                    .where(and(...filters))
                    .orderBy(pppoeSessions.name);
            }

            return await db
                .select()
                .from(pppoeSessions)
                .orderBy(pppoeSessions.name);
        } catch (error) {
            console.error('[PPPoE] findAll failed:', error);
            return []; // Return empty array instead of throwing to prevent 500
        }
    }

    /**
     * Find PPPoE session by ID
     */
    async findById(id: string): Promise<PppoeSession | undefined> {
        const [session] = await db
            .select()
            .from(pppoeSessions)
            .where(eq(pppoeSessions.id, id));
        return session;
    }

    /**
     * Find all sessions with coordinates for map display
     */
    /**
     * Find all sessions with coordinates for map display
     */
    async findAllWithCoordinates(
        routerId?: string,
        userId?: string,
        userRole?: string
    ): Promise<PppoeSession[]> {
        console.log(`[PPPoE] findAllWithCoordinates called with routerId=${routerId}, userId=${userId}`);

        // Get all sessions using the robust findAll method
        const sessions = await this.findAll(routerId, userId, userRole);

        // Filter in memory for valid coordinates
        // This avoids Drizzle operator issues (isNotNull, ne, sql) causing 500 errors
        return sessions.filter(session =>
            session.latitude &&
            session.latitude !== '' &&
            session.longitude &&
            session.longitude !== ''
        );
    }
    /**
     * Update traffic stats for PPPoE sessions from Simple Queues
     */
    async updateTraffic(routerId: string, queues: SimpleQueueData[]): Promise<void> {
        // Get active sessions
        const sessions = await db
            .select()
            .from(pppoeSessions)
            .where(and(
                eq(pppoeSessions.routerId, routerId),
                eq(pppoeSessions.status, 'active')
            ));

        if (sessions.length === 0) return;

        // Map queues by name for O(1) lookup
        // Note: Simple Queue name usually matches PPPoE username
        const queueMap = new Map<string, SimpleQueueData>();
        queues.forEach(q => queueMap.set(q.name, q));

        const now = new Date();

        for (const session of sessions) {
            const queue = queueMap.get(session.name);
            if (queue) {
                // simple queue 'bytes' is "upload/download" (e.g. "1234/5678")
                // In MikroTik Simple Queue: 
                // 1st component = Target Upload (From Client to Router) = RX
                // 2nd component = Target Download (From Router to Client) = TX

                const parts = queue.bytes.split('/');
                const rxBytes = parseInt(parts[0] || '0', 10);
                const txBytes = parseInt(parts[1] || '0', 10);

                // Calculate rates
                let txRate = 0;
                let rxRate = 0;

                if (session.lastTrafficUpdate) {
                    const seconds = (now.getTime() - new Date(session.lastTrafficUpdate).getTime()) / 1000;
                    if (seconds > 0) {
                        const prevTx = Number(session.txBytes) || 0;
                        const prevRx = Number(session.rxBytes) || 0;

                        const txDiff = txBytes - prevTx;
                        const rxDiff = rxBytes - prevRx;

                        // Handle counter reset or wrap (if new bytes < old bytes)
                        // If diff is negative, strictly speaking we should ignore or assume reset to 0
                        // For simplicity, if diff >= 0 we calculate rate.
                        if (txDiff >= 0) txRate = Math.round((txDiff * 8) / seconds);
                        if (rxDiff >= 0) rxRate = Math.round((rxDiff * 8) / seconds);
                    }
                }

                // Update DB
                await db
                    .update(pppoeSessions)
                    .set({
                        txBytes: txBytes,
                        rxBytes: rxBytes,
                        txRate: txRate,
                        rxRate: rxRate,
                        lastTrafficUpdate: now
                    })
                    .where(eq(pppoeSessions.id, session.id));
            }
        }
    }

}


// Export singleton instance
export const pppoeService = new PppoeService();

