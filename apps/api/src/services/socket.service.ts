import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { db } from '../db/index.js';
import { routerInterfaces, routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../lib/encryption.js';
import {
    connectToRouter,
    getInterfaceTraffic,
    getRouterInterfaces,
    type RouterConnection
} from '../lib/mikrotik-api.js';

interface TrafficStats {
    tx: number;
    rx: number;
}

interface RouterPollState {
    intervalId: NodeJS.Timeout | null;
    subscribers: number;
    lastBytes: Map<string, { tx: number; rx: number; time: number }>;
    api: any | null; // RouterOS API connection
    config: RouterConnection | null;
    interfaceNames: string[];
    lastInterfaceSync: number;
}

export class SocketService {
    private static instance: SocketService;
    private io: SocketIOServer | null = null;
    private pollStates: Map<string, RouterPollState> = new Map();

    private constructor() { }

    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    public initialize(httpServer: HttpServer, corsOrigins: string[]) {
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: corsOrigins,
                methods: ['GET', 'POST'],
                credentials: true
            },
            path: '/socket.io'
        });

        console.log('🔌 Socket.io initialized');

        this.io.on('connection', (socket: Socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);

            socket.on('subscribe_traffic', async (routerId: string) => {
                await this.handleSubscribe(socket, routerId);
            });

            socket.on('unsubscribe_traffic', (routerId: string) => {
                this.handleUnsubscribe(socket, routerId);
            });

            socket.on('disconnect', () => {
                console.log(`🔌 Client disconnected: ${socket.id}`);
                this.handleDisconnect(socket);
            });
        });
    }

    private async handleSubscribe(socket: Socket, routerId: string) {
        const room = `router_${routerId}`;
        socket.join(room);
        console.log(`🔌 Socket ${socket.id} joined ${room} (Router: ${routerId})`);

        let state = this.pollStates.get(routerId);
        if (!state) {
            // Initialize state for this router
            state = {
                intervalId: null,
                subscribers: 0,
                lastBytes: new Map(),
                api: null,
                config: null,
                interfaceNames: [],
                lastInterfaceSync: 0
            };
            this.pollStates.set(routerId, state);
        }

        state.subscribers++;

        // If this is the first subscriber, start polling
        if (state.subscribers === 1 && !state.intervalId) {
            await this.startPolling(routerId);
        }
    }

    private handleUnsubscribe(socket: Socket, routerId: string) {
        const room = `router_${routerId}`;
        socket.leave(room);
        console.log(`🔌 Socket ${socket.id} left ${room}`);

        const state = this.pollStates.get(routerId);
        if (state) {
            state.subscribers--;
            if (state.subscribers <= 0) {
                this.stopPolling(routerId);
            }
        }
    }

    private handleDisconnect(socket: Socket) {
        // Find which rooms this socket was in is hard in v4 if actively disconnected, 
        // but socket.rooms is auto-cleared.
        // We need to cleanup subscriber counts. 
        // Iterate all pollStates to check actual room size is safer.

        this.pollStates.forEach((state, routerId) => {
            const room = `router_${routerId}`;
            const roomSize = this.io?.sockets.adapter.rooms.get(room)?.size || 0;

            if (roomSize === 0 && state.intervalId) {
                console.log(`🔌 No more subscribers for ${routerId}, stopping polling`);
                this.stopPolling(routerId);
                state.subscribers = 0;
            } else {
                state.subscribers = roomSize;
            }
        });
    }

    private async startPolling(routerId: string) {
        console.log(`🚀 Starting REST API polling for router ${routerId}`);
        const state = this.pollStates.get(routerId);
        if (!state) {
            console.error(`❌ No poll state found for ${routerId}`);
            return;
        }

        try {
            // Fetch Router Config
            const router = await db.query.routers.findFirst({
                where: eq(routers.id, routerId)
            });

            if (!router) {
                console.error(`❌ Router ${routerId} not found in DB`);
                return;
            }

            // Decrypt password
            const password = decrypt(router.passwordEncrypted);

            state.config = {
                host: router.host,
                username: router.username,
                password: password,
                port: router.port || 8728,
                timeout: 10
            };

            console.log(`📋 Loaded API config for ${router.host}:${state.config.port}`);

            // Start simple interval
            state.intervalId = setInterval(() => this.pollRouter(routerId), 1000); // 1s interval for smoothness

        } catch (err) {
            console.error(`❌ Failed to start polling for ${routerId}:`, err);
        }
    }

    private async stopPolling(routerId: string) {
        const state = this.pollStates.get(routerId);
        if (state) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
            }
            if (state.api) {
                try {
                    await state.api.close();
                } catch (e) {
                    // Ignore close error
                }
                state.api = null;
            }
            state.lastBytes.clear();
            state.interfaceNames = [];
            console.log(`🛑 Stopped polling for router ${routerId}`);
        }
    }

    private async pollRouter(routerId: string) {
        const state = this.pollStates.get(routerId);
        if (!state || !state.config) return;

        try {
            // 1. Maintain Connection
            if (!state.api || !state.api.connected) {
                console.log(`🔌 Connecting to router ${state.config.host}...`);
                state.api = await connectToRouter(state.config);
                // Also reset interface list on reconnect
                state.lastInterfaceSync = 0;
            }

            // 2. Sync Interface List (every 30s or if empty)
            const now = Date.now();
            if (state.interfaceNames.length === 0 || (now - state.lastInterfaceSync) > 30000) {
                const ifaces = await getRouterInterfaces(state.api);
                state.interfaceNames = ifaces.map(i => i.name);
                state.lastInterfaceSync = now;
            }

            if (state.interfaceNames.length === 0) return;

            // 3. Monitor Traffic
            const trafficMap = await getInterfaceTraffic(state.api, state.interfaceNames);
            const currentRates: Record<string, TrafficStats> = {};
            const timestamp = Date.now();

            trafficMap.forEach((stats, name) => {
                currentRates[name] = stats;
            });

            // 4. Broadcast
            if (Object.keys(currentRates).length > 0) {
                this.io?.to(`router_${routerId}`).emit('traffic_update', {
                    routerId,
                    timestamp,
                    data: currentRates
                });
            }

        } catch (error) {
            console.error(`❌ Polling error for ${routerId}:`, error);
            // If connection error, nullify api to retry next tick
            if (state.api) {
                try { await state.api.close(); } catch (e) { }
                state.api = null;
            }
        }
    }
}

export const socketService = SocketService.getInstance();
