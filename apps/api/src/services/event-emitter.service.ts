import { Response } from 'express';
import { isMainThread, parentPort } from 'worker_threads';
import { logger } from '../lib/logger.js';

interface SSEClient {
    id: string;
    res: Response;
    user?: {
        id: string;
        role: string;
    };
}

class EventEmitterService {
    private clients: SSEClient[] = [];

    /**
     * Add a new SSE client connection
     */
    addClient(clientId: string, res: Response, user?: { id: string; role: string }): void {
        const client: SSEClient = { id: clientId, res, user };
        this.clients.push(client);
        logger.info({ clientId, userId: user?.id }, 'SSE client connected');
    }

    /**
     * Remove a client connection
     */
    removeClient(clientId: string): void {
        this.clients = this.clients.filter(c => c.id !== clientId);
        logger.info({ clientId }, 'SSE client disconnected');
    }

    /**
     * Broadcast event to all connected clients
     */
    broadcast(eventType: string, data: any): void {
        if (!isMainThread && parentPort) {
            parentPort.postMessage({ type: 'sse_broadcast', eventType, data });
            return;
        }

        const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

        this.clients.forEach(client => {
            try {
                client.res.write(message);
                if ((client.res as any).flush) (client.res as any).flush();
            } catch (err) {
                logger.error({ err, clientId: client.id }, 'Failed to send SSE to client');
                this.removeClient(client.id);
            }
        });
    }

    /**
     * Broadcast event to specific users (and admins/operators)
     */
    broadcastToUsers(eventType: string, data: any, allowedUserIds: string[]): void {
        if (!isMainThread && parentPort) {
            parentPort.postMessage({ type: 'sse_broadcast_users', eventType, data, allowedUserIds });
            return;
        }

        const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

        this.clients.forEach(client => {
            // Check access
            const isAdminOrOperator = client.user?.role === 'admin' || client.user?.role === 'operator';
            const hasAccess = isAdminOrOperator || (client.user?.id && allowedUserIds.includes(client.user.id));

            if (!hasAccess && client.user) {
                // Skip if user is logged in but doesn't have access
                return;
            }

            if (!client.user) {
                // Skip anonymous users for targeted alerts to be safe.
                return;
            }

            try {
                client.res.write(message);
                if ((client.res as any).flush) (client.res as any).flush();
            } catch (err) {
                logger.error({ err, clientId: client.id }, 'Failed to send SSE to client');
                this.removeClient(client.id);
            }
        });
    }

    /**
     * Send heartbeat to keep connections alive
     */
    sendHeartbeat(): void {
        const message = `: heartbeat\n\n`;
        this.clients.forEach(client => {
            try {
                client.res.write(message);
                if ((client.res as any).flush) (client.res as any).flush();
            } catch {
                this.removeClient(client.id);
            }
        });
    }

    /**
     * Get number of connected clients
     */
    getClientCount(): number {
        return this.clients.length;
    }
}

// Singleton instance
export const eventEmitter = new EventEmitterService();

// Send heartbeat every 15 seconds to keep connections alive (prevent proxy timeouts)
setInterval(() => {
    eventEmitter.sendHeartbeat();
}, 15000);

export default eventEmitter;
