import { Response } from 'express';

interface SSEClient {
    id: string;
    res: Response;
}

class EventEmitterService {
    private clients: SSEClient[] = [];

    /**
     * Add a new SSE client connection
     */
    addClient(clientId: string, res: Response): void {
        const client: SSEClient = { id: clientId, res };
        this.clients.push(client);
        console.log(`SSE client connected: ${clientId}. Total clients: ${this.clients.length}`);
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
