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
}

// Export singleton instance
export const pppoeService = new PppoeService();
