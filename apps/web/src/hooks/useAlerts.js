import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertService } from '@/lib/api';

// Query Keys
export const alertKeys = {
    all: (tenantId) => ['alerts', tenantId || 'default'],
    lists: (tenantId) => [...alertKeys.all(tenantId), 'list'],
    detail: (tenantId, id) => [...alertKeys.all(tenantId), 'detail', id],
    unread: (tenantId) => [...alertKeys.all(tenantId), 'unread'],
    unacknowledged: (tenantId) => [...alertKeys.all(tenantId), 'unacknowledged'],
};

// ==================== Helpers ====================
const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

// ==================== Queries ====================

/**
 * Hook to fetch all alerts
 * params: { page, limit, sortOrder, search, routerId, etc } or separate arguments
 */
export function useAlerts(params = {}, options = {}) {
    const tenantId = getActiveTenantId();
    // Handle legacy limit argument
    const finalParams = typeof params === 'number' ? { limit: params } : params;
    const { page = 1, limit = 100, sortOrder = 'desc' } = finalParams;

    return useQuery({
        // Include ALL finalParams in the queryKey so any filter change triggers a refetch
        queryKey: [...alertKeys.lists(tenantId), finalParams],
        // If meta is returned, we might want to keep previous data while fetching new page
        placeholderData: (previousData) => previousData,
        queryFn: () => alertService.getAll(finalParams),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch an alert by ID
 */
export function useAlert(id, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: alertKeys.detail(tenantId, id),
        queryFn: () => alertService.getById(id),
        enabled: !!id,
        ...options,
    });
}

/**
 * Hook to fetch unread alert count
 */
export function useUnreadAlertCount(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: alertKeys.unread(tenantId),
        queryFn: () => alertService.getUnreadCount(),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch unacknowledged alerts
 */
export function useUnacknowledgedAlerts(params = {}, options = {}) {
    const tenantId = getActiveTenantId();
    // Handle legacy limit argument
    const finalParams = typeof params === 'number' ? { limit: params } : params;

    return useQuery({
        // Include ALL finalParams in the queryKey
        queryKey: [...alertKeys.unacknowledged(tenantId), finalParams],
        placeholderData: (previousData) => previousData,
        queryFn: () => alertService.getUnacknowledged(finalParams),
        staleTime: 10 * 1000,
        refetchInterval: 10 * 1000,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to acknowledge an alert
 */
export function useAcknowledgeAlert() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => alertService.acknowledge(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: alertKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unacknowledged() });
        },
    });
}

/**
 * Hook to resolve an alert
 */
export function useResolveAlert() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => alertService.resolve(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: alertKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
        },
    });
}

/**
 * Hook to delete an alert
 */
export function useDeleteAlert() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => alertService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
        },
    });
}

/**
 * Hook to acknowledge all alerts
 */
export function useAcknowledgeAllAlerts() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (category) => alertService.acknowledgeAll(category),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unacknowledged() });
        },
    });
}

/**
 * Hook to resolve all alerts
 */
export function useResolveAllAlerts() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (category) => alertService.resolveAll(category),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unacknowledged() });
        },
    });
}
