import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { db } from '../db/index.js';
import { routerInterfaces, routers, olts } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { decrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { oltService } from './olt.service.js';
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
    deviceType: 'router' | 'olt';
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

        logger.info('🔌 Socket.io initialized');

        this.io.on('connection', (socket: Socket) => {
            logger.info({ socketId: socket.id }, '🔌 Client connected');

            socket.on('subscribe_traffic', async (routerId: string) => {
                await this.handleSubscribe(socket, routerId);
            });

            socket.on('unsubscribe_traffic', (routerId: string) => {
                this.handleUnsubscribe(socket, routerId);
            });

            socket.on('disconnect', () => {
                logger.info({ socketId: socket.id }, '🔌 Client disconnected');
                this.handleDisconnect(socket);
            });
        });
    }

    private async handleSubscribe(socket: Socket, routerId: string) {
        const room = `router_${routerId}`;
        socket.join(room);
        logger.debug({ socketId: socket.id, room, routerId }, '🔌 Socket joined room');

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
                lastInterfaceSync: 0,
                deviceType: 'router' // Default, will be updated in startPolling
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
        logger.debug({ socketId: socket.id, room }, '🔌 Socket left room');

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
                logger.debug({ routerId }, '🔌 No more subscribers, stopping polling');
                this.stopPolling(routerId);
                state.subscribers = 0;
            } else {
                state.subscribers = roomSize;
            }
        });
    }

    private async startPolling(routerId: string) {
        logger.info({ routerId }, '🚀 Starting polling');
        const state = this.pollStates.get(routerId);
        if (!state) {
            logger.error({ routerId }, 'No poll state found');
            return;
        }

        try {
            // 1. Try to find as Router
            const router = await db.query.routers.findFirst({
                where: eq(routers.id, routerId)
            });

            if (router) {
                state.deviceType = 'router';
                const password = decrypt(router.passwordEncrypted);

                state.config = {
                    host: router.host,
                    username: router.username,
                    password: password,
                    port: router.port || 8728,
                    timeout: 10
                };
                logger.debug({ host: router.host, device: 'router' }, '📋 Loaded Router API config');
            } else {
                // 2. Try to find as OLT
                const olt = await db.query.olts.findFirst({
                    where: eq(olts.id, routerId)
                });

                if (olt) {
                    state.deviceType = 'olt';
                    // OLTs don't use the same config object for pollRouter yet, 
                    // but we mark the state
                    logger.debug({ host: olt.host, device: 'olt' }, '📋 Loaded OLT config');
                } else {
                    logger.error({ routerId }, 'Device not found in DB (Router or OLT)');
                    return;
                }
            }

            // Start simple interval
            state.intervalId = setInterval(() => this.pollDevice(routerId), 1000); // 1s interval for smoothness

        } catch (err: any) {
            logger.error({ err, routerId }, 'Failed to start polling');
        }
    }
 
    private async pollDevice(routerId: string) {
        const state = this.pollStates.get(routerId);
        if (!state) return;
 
        if (state.deviceType === 'router') {
            await this.pollRouter(routerId);
        } else if (state.deviceType === 'olt') {
            await this.pollOlt(routerId);
        }
    }
 
    private async pollOlt(routerId: string) {
        const state = this.pollStates.get(routerId);
        if (!state) return;
 
        try {
            // OLT polling is usually slower than 1s, but we can call it.
            // oltService.getOnus already fetches live data from the device if useWeb is true.
            // For general OLT interface traffic, we might need a dedicated method.
            // However, most OLT links in the topology are OLT -> Router or OLT -> Client.
            
            // For now, let's try to get aggregate traffic or just ONUs.
            // If the user wants interface-level traffic for the OLT (e.g. Uplink), 
            // we need an oltService method for that.
            
            // [TEMPORARY] Since OLT traffic is complex and diverse, 
            // we'll at least broadcast an update to trigger the frontend to show "Online" status
            const now = Date.now();
            this.io?.to(`router_${routerId}`).emit('traffic_update', {
                routerId,
                timestamp: now,
                data: {} // Empty data for now, just a heartbeat
            });
        } catch (err) {
            // Log error
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
            logger.info({ routerId }, '🛑 Stopped polling');
        }
    }

    private async pollRouter(routerId: string) {
        const state = this.pollStates.get(routerId);
        if (!state || !state.config) return;

        try {
            // 1. Maintain Connection
            if (!state.api || !state.api.connected) {
                logger.debug({ host: state.config.host }, '🔌 Connecting to router');
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
            const MAX_EXPECTED_BPS = 100_000_000_000; // 100 Gbps

            trafficMap.forEach((stats, name) => {
                // Spike Guard: Cap to 0 if rate is impossibly high (MikroTik API sometimes spikes)
                if (stats.tx > MAX_EXPECTED_BPS || stats.rx > MAX_EXPECTED_BPS) {
                    currentRates[name] = {
                        tx: stats.tx > MAX_EXPECTED_BPS ? 0 : stats.tx,
                        rx: stats.rx > MAX_EXPECTED_BPS ? 0 : stats.rx
                    };
                } else {
                    currentRates[name] = stats;
                }
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
            logger.error({ err: error, routerId }, 'Polling error');
            // If connection error, nullify api to retry next tick
            if (state.api) {
                try { await state.api.close(); } catch (e) { }
                state.api = null;
            }
        }
    }

    public async stopAll() {
        logger.info('🛑 Stopping all socket polling intervals...');
        const stopPromises = Array.from(this.pollStates.keys()).map(routerId => this.stopPolling(routerId));
        await Promise.all(stopPromises);
        this.io?.close();
        logger.info('✅ Socket server stopped');
    }
}

export const socketService = SocketService.getInstance();
