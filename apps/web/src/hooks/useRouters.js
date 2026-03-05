import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routerService, pppoeService } from '@/lib/api';

// Query Keys
export const routerKeys = {
    all: (tenantId) => ['routers', tenantId || 'default'],
    lists: (tenantId) => [...routerKeys.all(tenantId), 'list'],
    detail: (tenantId, id) => [...routerKeys.all(tenantId), 'detail', id],
    interfaces: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'interfaces'],
    metrics: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'metrics'],
    metricsHistory: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'metrics', 'history'],
    netwatch: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'netwatch'],
    hotspot: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'hotspot'],
    ppp: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'ppp'],
    pingLatencies: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'pingLatencies'],
    neighbors: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'neighbors'],
    romonNeighbors: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'romonNeighbors'],
    topology: (tenantId, id) => [...routerKeys.detail(tenantId, id), 'topology'],
};

// ==================== Helpers ====================
const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

// ==================== Queries ====================

/**
 * Hook to fetch all routers
 */
export function useRouters(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.lists(tenantId),
        queryFn: () => routerService.getAll(),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a single router by ID
 */
export function useRouter(id, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.detail(tenantId, id),
        queryFn: () => routerService.getById(id),
        staleTime: 30 * 1000,
        enabled: !!id,
        retry: (failureCount, error) => {
            // Don't retry 404s - the router doesn't exist
            if (error?.status === 404) return false;
            return failureCount < 3;
        },
        ...options,
    });
}

/**
 * Hook to fetch router interfaces
 */
export function useRouterInterfaces(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.interfaces(tenantId, routerId),
        queryFn: () => routerService.getInterfaces(routerId),
        staleTime: 10 * 1000,
        refetchInterval: 10 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router metrics
 */
export function useRouterMetrics(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.metrics(tenantId, routerId),
        queryFn: () => routerService.getMetrics(routerId),
        staleTime: 10 * 1000,
        refetchInterval: 10 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router metrics history
 */
export function useRouterMetricsHistory(routerId, limit = 100, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.metricsHistory(tenantId, routerId),
        queryFn: () => routerService.getMetricsHistory(routerId, limit),
        staleTime: 60 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

export function useRouterNeighbors(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.neighbors(tenantId, routerId),
        queryFn: () => routerService.getNeighbors(routerId),
        staleTime: 60 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router RoMON neighbors
 */
export function useRouterRomonNeighbors(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.romonNeighbors(tenantId, routerId),
        queryFn: () => routerService.getRomonNeighbors(routerId),
        staleTime: 60 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router netwatch entries
 */
export function useRouterNetwatch(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.netwatch(tenantId, routerId),
        queryFn: () => routerService.getNetwatch(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router topology
 */
export function useRouterTopology(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.topology(tenantId, routerId),
        queryFn: () => routerService.getTopology(routerId),
        staleTime: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to fetch active hotspot users
 */
export function useRouterHotspotActive(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.hotspot(tenantId, routerId),
        queryFn: () => routerService.getHotspotActive(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch active PPP connections
 */
export function useRouterPppActive(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.ppp(tenantId, routerId),
        queryFn: () => routerService.getPppActive(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch active PPP sessions with details
 */
export function useRouterPppSessions(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: [...routerKeys.ppp(tenantId, routerId), 'sessions'],
        queryFn: () => routerService.getPppSessions(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch synced PPPoE sessions from DB (with coordinates)
 */
export function usePppoeSessions(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: ['pppoe', tenantId, routerId],
        queryFn: () => pppoeService.getAll(routerId),
        staleTime: 30 * 1000,
        enabled: !!routerId, // Or true if routerId is optional
        ...options,
    });
}

/**
 * Hook to update PPPoE coordinates
 */
export function useUpdatePppoeCoordinates() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => pppoeService.updateCoordinates(id, data),
        onSuccess: (_, { routerId }) => {
            queryClient.invalidateQueries({ queryKey: ['pppoe'] });
            if (routerId) {
                queryClient.invalidateQueries({ queryKey: [...routerKeys.ppp(getActiveTenantId(), routerId), 'sessions'] });
            }
        },
    });
}



import routerServiceDirect from '@/lib/api/services/router.service';

/**
 * Hook to fetch ping latencies from a router
 */
export function usePingLatencies(routerId, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: routerKeys.pingLatencies(tenantId, routerId),
        queryFn: () => {
            console.log(`[usePingLatencies] Fetching latencies for router ${routerId}`);

            // Debugging the service object
            if (!routerServiceDirect) {
                console.error('[usePingLatencies] routerService is undefined!');
                throw new Error('Router Service not loaded');
            }

            // Try the direct import first
            if (typeof routerServiceDirect.fetchPingLatencies === 'function') {
                return routerServiceDirect.fetchPingLatencies(routerId);
            }
            if (typeof routerServiceDirect.getPingLatencies === 'function') {
                return routerServiceDirect.getPingLatencies(routerId);
            }

            // Try the global/barrel import if direct fails (fallback)
            if (typeof routerService.fetchPingLatencies === 'function') {
                return routerService.fetchPingLatencies(routerId);
            }
            if (typeof routerService.getPingLatencies === 'function') {
                return routerService.getPingLatencies(routerId);
            }

            console.error('[usePingLatencies] Method not found on service object. Keys:', Object.keys(routerServiceDirect));
            throw new Error('getPingLatencies method missing from service');
        },
        staleTime: 60 * 1000,
        refetchInterval: 60 * 1000, // Refresh every 60 seconds
        enabled: !!routerId,
        retry: 1,
        onError: (err) => {
            console.error(`[usePingLatencies] Error fetching latencies for router ${routerId}:`, err);
        },
        ...options,
    });
}

/**
 * Hook to ping an arbitrary host via a router
 */
export function usePingHost() {
    return useMutation({
        mutationFn: ({ routerId, ip }) => routerServiceDirect.pingHost(routerId, ip),
        onSuccess: (response) => {
            console.log('[usePingHost] Ping successful', response);
        },
        onError: (err) => {
            console.error('[usePingHost] Error pinging host', err);
        },
    });
}

/**
 * Hook to create a new router
 */
export function useCreateRouter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => routerService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: routerKeys.lists() });
        },
    });
}

/**
 * Hook to update a router
 */
export function useUpdateRouter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => routerService.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: routerKeys.lists() });
        },
    });
}

/**
 * Hook to delete a router
 */
export function useDeleteRouter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => routerService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: routerKeys.lists() });
        },
    });
}

/**
 * Hook to test router connection
 */
export function useTestConnection() {
    return useMutation({
        mutationFn: (id) => routerService.testConnection(id),
    });
}

/**
 * Hook to test connection with credentials
 */
export function useTestConnectionWithCredentials() {
    return useMutation({
        mutationFn: (data) => routerService.testConnectionWithCredentials(data),
    });
}

/**
 * Hook to refresh router status
 */
export function useRefreshRouter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => routerService.refresh(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: routerKeys.lists() });
        },
    });
}

/**
 * Hook to reboot a router
 */
export function useRebootRouter() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => routerService.reboot(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.detail(id) });
        },
    });
}

// ==================== Netwatch Mutations ====================

/**
 * Hook to create a netwatch entry
 */
export function useCreateNetwatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, data }) => routerService.createNetwatch(routerId, data),
        onSuccess: (_, { routerId }) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.netwatch(routerId) });
        },
    });
}

/**
 * Hook to update a netwatch entry
 */
export function useUpdateNetwatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, netwatchId, data }) =>
            routerService.updateNetwatch(routerId, netwatchId, data),
        onSuccess: (_, { routerId }) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.netwatch(routerId) });
        },
    });
}

/**
 * Hook to delete a netwatch entry
 */
export function useDeleteNetwatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, netwatchId }) =>
            routerService.deleteNetwatch(routerId, netwatchId),
        onSuccess: (_, { routerId }) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.netwatch(routerId) });
        },
    });
}

/**
 * Hook to sync netwatch from MikroTik router
 */
export function useSyncNetwatch() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (routerId) => routerService.syncNetwatch(routerId),
        onSuccess: (_, routerId) => {
            queryClient.invalidateQueries({ queryKey: routerKeys.netwatch(routerId) });
        },
    });
}

/**
 * Hook to fetch real-time SNMP traffic
 */
export function useSnmpTraffic(routerId, enabled = false) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: [...routerKeys.detail(tenantId, routerId), 'snmp-traffic'],
        queryFn: () => routerService.getSnmpTraffic(routerId),
        enabled: !!routerId && enabled,
        refetchInterval: 2000, // Poll every 2 seconds
        staleTime: 1000,
        retry: false,
    });
}

/**
 * Hook to update topology coordinates
 */
export function useUpdateTopologyCoords() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => routerService.updateTopologyCoords(data),
        onSuccess: (_, variables) => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, variables.routerId)
            });
        },
    });
}

export function useAddTopologyNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, data }) => routerService.addTopologyNode(routerId, data),
        onSuccess: (_, { routerId }) => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, routerId)
            });
        },
    });
}

/**
 * Hook to update an existing schematic node (e.g. mapping)
 */
export function useUpdateTopologyNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ nodeIdInTopology, data }) => routerService.updateTopologyNode(nodeIdInTopology, data),
        onSuccess: (_, { routerId }) => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, routerId)
            });
        },
    });
}

/**
 * Hook to remove a node from the schematic
 */
export function useRemoveTopologyNode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, nodeId }) => routerService.removeTopologyNode(routerId, nodeId),
        onSuccess: (_, { routerId }) => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, routerId)
            });
        },
    });
}

/**
 * Hook to add a link between schematic nodes
 */
export function useAddTopologyLink() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ routerId, data }) => routerService.addTopologyLink(routerId, data),
        onSuccess: (_, variables) => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, variables.routerId)
            });
        },
    });
}

/**
 * Hook to remove a link
 */
export function useRemoveTopologyLink(routerId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (linkId) => routerService.removeTopologyLink(linkId),
        onSuccess: () => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, routerId)
            });
        },
    });
}

/**
 * Hook to update a link's configuration
 */
export function useUpdateTopologyLink(routerId) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ linkId, data }) => routerService.updateTopologyLink(linkId, data),
        onSuccess: () => {
            const tenantId = getActiveTenantId();
            queryClient.invalidateQueries({
                queryKey: routerKeys.topology(tenantId, routerId)
            });
        },
    });
}
