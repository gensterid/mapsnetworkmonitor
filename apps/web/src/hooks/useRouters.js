import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routerService } from '@/lib/api';

// Query Keys
export const routerKeys = {
    all: ['routers'],
    lists: () => [...routerKeys.all, 'list'],
    detail: (id) => [...routerKeys.all, 'detail', id],
    interfaces: (id) => [...routerKeys.detail(id), 'interfaces'],
    metrics: (id) => [...routerKeys.detail(id), 'metrics'],
    metricsHistory: (id) => [...routerKeys.detail(id), 'metrics', 'history'],
    netwatch: (id) => [...routerKeys.detail(id), 'netwatch'],
    hotspot: (id) => [...routerKeys.detail(id), 'hotspot'],
    ppp: (id) => [...routerKeys.detail(id), 'ppp'],
};

// ==================== Queries ====================

/**
 * Hook to fetch all routers
 */
export function useRouters(options = {}) {
    return useQuery({
        queryKey: routerKeys.lists(),
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
    return useQuery({
        queryKey: routerKeys.detail(id),
        queryFn: () => routerService.getById(id),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!id,
        ...options,
    });
}

/**
 * Hook to fetch router interfaces
 */
export function useRouterInterfaces(routerId, options = {}) {
    return useQuery({
        queryKey: routerKeys.interfaces(routerId),
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
    return useQuery({
        queryKey: routerKeys.metrics(routerId),
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
    return useQuery({
        queryKey: routerKeys.metricsHistory(routerId),
        queryFn: () => routerService.getMetricsHistory(routerId, limit),
        staleTime: 60 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

/**
 * Hook to fetch router netwatch entries
 */
export function useRouterNetwatch(routerId, options = {}) {
    return useQuery({
        queryKey: routerKeys.netwatch(routerId),
        queryFn: () => routerService.getNetwatch(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to fetch active hotspot users
 */
export function useRouterHotspotActive(routerId, options = {}) {
    return useQuery({
        queryKey: routerKeys.hotspot(routerId),
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
    return useQuery({
        queryKey: routerKeys.ppp(routerId),
        queryFn: () => routerService.getPppActive(routerId),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        enabled: !!routerId,
        ...options,
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

