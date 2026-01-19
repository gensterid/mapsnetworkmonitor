import { eq, and, notInArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    pppoeSessions,
    type PppoeSession,
    type NewPppoeSession,
} from '../db/schema/index.js';
import { alertService } from './alert.service.js';
import type { PppSession } from '../lib/mikrotik-api.js';

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

            // Detect new connections (in current but not in previous)
            for (const session of currentSessions) {
                if (!previousSessionNames.has(session.name)) {
                    // New connection detected
                    connected.push(session.name);
                    console.log(`[PPPoE] New connection detected: ${session.name} (IP: ${session.address})`);

                    // Create new session record
                    await this.createSession({
                        routerId,
                        name: session.name,
                        sessionId: session.sessionId,
                        callerId: session.callerId,
                        address: session.address,
                        service: session.service,
                        uptime: session.uptime,
                    });

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
                        });
                    }
                }
            }

            // Detect disconnections (in previous but not in current)
            for (const session of previousSessions) {
                if (!currentSessionNames.has(session.name)) {
                    // Disconnection detected
                    disconnected.push(session.name);
                    console.log(`[PPPoE] Disconnection detected: ${session.name}`);

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
                    await this.deleteSession(session.id);
                }
            }

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
        data: Partial<Pick<PppoeSession, 'lastSeen' | 'uptime' | 'address'>>
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
     * Update coordinates and waypoints for a PPPoE session
     */
    async updateCoordinates(
        id: string,
        latitude: string | null,
        longitude: string | null,
        waypoints: string | null = null
    ): Promise<PppoeSession | undefined> {
        const updateData: any = { latitude, longitude };
        if (waypoints !== undefined) {
            updateData.waypoints = waypoints;
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
    async findAll(routerId?: string): Promise<PppoeSession[]> {
        if (routerId) {
            return db
                .select()
                .from(pppoeSessions)
                .where(eq(pppoeSessions.routerId, routerId))
                .orderBy(pppoeSessions.name);
        }
        return db
            .select()
            .from(pppoeSessions)
            .orderBy(pppoeSessions.name);
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
    async findAllWithCoordinates(routerId?: string): Promise<PppoeSession[]> {
        const query = db
            .select()
            .from(pppoeSessions)
            .where(
                routerId
                    ? eq(pppoeSessions.routerId, routerId)
                    : undefined as any
            )
            .orderBy(pppoeSessions.name);

        const sessions = await query;
        return sessions.filter(s => s.latitude && s.longitude);
    }
}

// Export singleton instance
export const pppoeService = new PppoeService();

