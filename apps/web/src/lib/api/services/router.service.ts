import { get, post, put, del } from '../client';
import type {
    Router,
    CreateRouterInput,
    UpdateRouterInput,
    RouterInterface,
    RouterMetric,
    Netwatch,
    CreateNetwatchInput,
    UpdateNetwatchInput,
    TestConnectionInput,
    TestConnectionResult,
} from '../types';

export interface PingLatency {
    ip: string;
    label: string;
    latency: number | null;
}

/**
 * Router Service
 * Handles all router-related API calls
 */
export const routerService = {
    /**
     * Get all routers
     */
    getAll: () => get<Router[]>('/routers'),

    /**
     * Get router by ID
     */
    getById: (id: string) => get<Router>(`/routers/${id}`),

    /**
     * Create a new router
     */
    create: (data: CreateRouterInput) => post<Router>('/routers', data),

    /**
     * Update a router
     */
    update: (id: string, data: UpdateRouterInput) => put<Router>(`/routers/${id}`, data),

    /**
     * Delete a router
     */
    delete: (id: string) => del(`/routers/${id}`),

    /**
     * Test connection to a router by ID
     */
    testConnection: (id: string) => post<TestConnectionResult>(`/routers/${id}/test`),

    /**
     * Test connection with credentials (before saving)
     */
    testConnectionWithCredentials: (data: TestConnectionInput) =>
        post<TestConnectionResult>('/routers/test-connection', data),

    /**
     * Refresh router status
     */
    refresh: (id: string) => post<Router>(`/routers/${id}/refresh`),

    /**
     * Reboot a router
     */
    reboot: (id: string) => post<{ success: boolean; message: string }>(`/routers/${id}/reboot`),

    /**
     * Get router interfaces
     */
    getInterfaces: (routerId: string) => get<RouterInterface[]>(`/routers/${routerId}/interfaces`),

    /**
     * Get latest router metrics
     */
    getMetrics: (routerId: string) => get<RouterMetric>(`/routers/${routerId}/metrics`),

    /**
     * Get router metrics history
     */
    getMetricsHistory: (routerId: string, limit = 100) =>
        get<RouterMetric[]>(`/routers/${routerId}/metrics/history?limit=${limit}`),

    // ================== Netwatch ==================

    /**
     * Get all netwatch entries for a router
     */
    getNetwatch: (routerId: string) => get<Netwatch[]>(`/routers/${routerId}/netwatch`),

    /**
     * Create a netwatch entry
     */
    createNetwatch: (routerId: string, data: CreateNetwatchInput) =>
        post<Netwatch>(`/routers/${routerId}/netwatch`, data),

    /**
     * Update a netwatch entry
     */
    updateNetwatch: (routerId: string, netwatchId: string, data: UpdateNetwatchInput) =>
        put<Netwatch>(`/routers/${routerId}/netwatch/${netwatchId}`, data),

    /**
     * Delete a netwatch entry
     */
    deleteNetwatch: (routerId: string, netwatchId: string) =>
        del(`/routers/${routerId}/netwatch/${netwatchId}`),

    /**
     * Sync netwatch entries from MikroTik router
     */
    syncNetwatch: (routerId: string) =>
        post<{ success: boolean; synced: number; errors: string[] }>(`/routers/${routerId}/netwatch/sync`),

    // ================== Ping Latencies ==================

    /**
     * Get ping latencies to configured targets via router
     */
    fetchPingLatencies: (routerId: string) =>
        get<PingLatency[]>(`/routers/${routerId}/ping-latencies`),

    /**
     * Get active hotspot users count
     */
    getHotspotActive: (routerId: string) =>
        get<{ count: number }>(`/routers/${routerId}/hotspot/active`),

    /**
     * Get active PPP connections count
     */
    getPppActive: (routerId: string) =>
        get<{ count: number }>(`/routers/${routerId}/ppp/active`),
};

export default routerService;
