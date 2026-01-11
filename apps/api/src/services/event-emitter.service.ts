import { Response } from 'express';

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
        console.log(`SSE client connected: ${clientId} (User: ${user?.id || 'anon'}). Total clients: ${this.clients.length}`);
    }

    /**
     * Remove a client connection
     */
    removeClient(clientId: string): void {
        this.clients = this.clients.filter(c => c.id !== clientId);
        console.log(`SSE client disconnected: ${clientId}. Total clients: ${this.clients.length}`);
    }

    /**
     * Broadcast event to all connected clients
     */
    broadcast(eventType: string, data: any): void {
        const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

        this.clients.forEach(client => {
            try {
                client.res.write(message);
            } catch (err) {
                console.error(`Failed to send SSE to client ${client.id}:`, err);
                this.removeClient(client.id);
            }
        });
    }

    /**
     * Broadcast event to specific users (and admins/operators)
     */
    broadcastToUsers(eventType: string, data: any, allowedUserIds: string[]): void {
        const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

        this.clients.forEach(client => {
            // Check access
            const isAdminOrOperator = client.user?.role === 'admin' || client.user?.role === 'operator';
            const hasAccess = isAdminOrOperator || (client.user?.id && allowedUserIds.includes(client.user.id));

            if (!hasAccess && client.user) {
                // Skip if user is logged in but doesn't have access
                // If user is NOT logged in (anon), we currently skip or send? 
                // Let's skip anonymous users for targeted alerts to be safe.
                return;
            }

            // If client has no user info attached (anonymous), maybe we shouldn't send sensitive alerts?
            // Assuming targeted alerts are sensitive.
            if (!client.user) {
                // For now, let's not send to anonymous if targeting is used
                return;
            }

            try {
                client.res.write(message);
            } catch (err) {
                console.error(`Failed to send SSE to client ${client.id}:`, err);
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

// Send heartbeat every 30 seconds to keep connections alive
setInterval(() => {
    eventEmitter.sendHeartbeat();
}, 30000);

export default eventEmitter;
