import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '@/lib/api';

// Query Keys
export const settingsKeys = {
    all: ['settings'],
    lists: () => [...settingsKeys.all, 'list'],
    map: () => [...settingsKeys.all, 'map'],
    detail: (key) => [...settingsKeys.all, key],
    auditLogs: () => [...settingsKeys.all, 'audit-logs'],
};

// ==================== Queries ====================

/**
 * Hook to fetch all settings as an array
 */
export function useSettingsList(options = {}) {
    return useQuery({
        queryKey: settingsKeys.lists(),
        queryFn: () => settingsService.getAll(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch all settings as a key-value map
 */
export function useSettings(options = {}) {
    return useQuery({
        queryKey: settingsKeys.map(),
        queryFn: () => settingsService.getAllAsMap(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a single setting by key
 */
export function useSetting(key, options = {}) {
    return useQuery({
        queryKey: settingsKeys.detail(key),
        queryFn: () => settingsService.getByKey(key),
        enabled: !!key,
        ...options,
    });
}

/**
 * Hook to fetch audit logs
 */
export function useAuditLogs(limit = 100, options = {}) {
    return useQuery({
        queryKey: settingsKeys.auditLogs(),
        queryFn: () => settingsService.getAuditLogs(limit),
        staleTime: 60 * 1000,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to update or create a setting
 */
export function useUpdateSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ key, value, description }) => settingsService.set(key, value, description),
        onSuccess: (_, { key }) => {
            queryClient.invalidateQueries({ queryKey: settingsKeys.detail(key) });
            queryClient.invalidateQueries({ queryKey: settingsKeys.lists() });
            queryClient.invalidateQueries({ queryKey: settingsKeys.map() });
        },
    });
}

/**
 * Hook to delete a setting
 */
export function useDeleteSetting() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (key) => settingsService.delete(key),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: settingsKeys.lists() });
            queryClient.invalidateQueries({ queryKey: settingsKeys.map() });
        },
    });
}
