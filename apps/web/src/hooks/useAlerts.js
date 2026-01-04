import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertService } from '@/lib/api';

// Query Keys
export const alertKeys = {
    all: ['alerts'],
    lists: () => [...alertKeys.all, 'list'],
    detail: (id) => [...alertKeys.all, 'detail', id],
    unread: () => [...alertKeys.all, 'unread'],
    unacknowledged: () => [...alertKeys.all, 'unacknowledged'],
};

// ==================== Queries ====================

/**
 * Hook to fetch all alerts
 */
export function useAlerts(limit = 100, options = {}) {
    return useQuery({
        queryKey: [...alertKeys.lists(), { limit }],
        queryFn: () => alertService.getAll(limit),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch an alert by ID
 */
export function useAlert(id, options = {}) {
    return useQuery({
        queryKey: alertKeys.detail(id),
        queryFn: () => alertService.getById(id),
        enabled: !!id,
        ...options,
    });
}

/**
 * Hook to fetch unread alert count
 */
export function useUnreadAlertCount(options = {}) {
    return useQuery({
        queryKey: alertKeys.unread(),
        queryFn: () => alertService.getUnreadCount(),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch unacknowledged alerts
 */
export function useUnacknowledgedAlerts(limit = 100, options = {}) {
    return useQuery({
        queryKey: alertKeys.unacknowledged(),
        queryFn: () => alertService.getUnacknowledged(limit),
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
        mutationFn: () => alertService.acknowledgeAll(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: alertKeys.lists() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unread() });
            queryClient.invalidateQueries({ queryKey: alertKeys.unacknowledged() });
        },
    });
}
