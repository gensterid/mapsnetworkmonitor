import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '@/lib/api';

// ==================== Helpers ====================
const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

// Query Keys
export const settingsKeys = {
    all: (tenantId) => ['settings', tenantId || 'default'],
    lists: (tenantId) => [...settingsKeys.all(tenantId), 'list'],
    map: (tenantId) => [...settingsKeys.all(tenantId), 'map'],
    detail: (tenantId, key) => [...settingsKeys.all(tenantId), key],
    auditLogs: (tenantId) => [...settingsKeys.all(tenantId), 'audit-logs'],
};

// ==================== Queries ====================

/**
 * Hook to fetch all settings as an array
 */
export function useSettingsList(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: settingsKeys.lists(tenantId),
        queryFn: () => settingsService.getAll(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch all settings as a key-value map
 */
export function useSettings(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: settingsKeys.map(tenantId),
        queryFn: () => settingsService.getAllAsMap(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a single setting by key
 */
export function useSetting(key, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: settingsKeys.detail(tenantId, key),
        queryFn: () => settingsService.getByKey(key),
        enabled: !!key,
        ...options,
    });
}

/**
 * Hook to fetch audit logs
 */
export function useAuditLogs(limit = 100, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: settingsKeys.auditLogs(tenantId),
        queryFn: () => settingsService.getAuditLogs(limit),
        staleTime: 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch database usage stats
 */
export function useDatabaseStats(options = {}) {
    return useQuery({
        queryKey: ['settings', 'maintenance', 'db-stats'],
        queryFn: () => settingsService.getDatabaseStats(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to update or create a setting
 */
export function useUpdateSetting() {
    const queryClient = useQueryClient();
    const tenantId = getActiveTenantId();

    return useMutation({
        mutationFn: ({ key, value, description }) => settingsService.set(key, value, description),
        onSuccess: (_, { key }) => {
            queryClient.invalidateQueries({ queryKey: settingsKeys.detail(tenantId, key) });
            queryClient.invalidateQueries({ queryKey: settingsKeys.lists(tenantId) });
            queryClient.invalidateQueries({ queryKey: settingsKeys.map(tenantId) });
        },
    });
}

/**
 * Hook to delete a setting
 */
export function useDeleteSetting() {
    const queryClient = useQueryClient();
    const tenantId = getActiveTenantId();

    return useMutation({
        mutationFn: (key) => settingsService.delete(key),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: settingsKeys.lists(tenantId) });
            queryClient.invalidateQueries({ queryKey: settingsKeys.map(tenantId) });
        },
    });
}

// ==================== Feature Flags (global, superadmin-controlled) ====================

/** Query key — global (tidak per-tenant; feature flags berlaku semua tenant). */
export const featureFlagsKey = ['feature-flags', 'global'];

/**
 * Fetch global feature flags. Semua role authenticated boleh baca.
 * staleTime panjang (5 menit) — flags jarang berubah, hindari refetch tiap nav.
 */
export function useFeatureFlags(options = {}) {
    return useQuery({
        queryKey: featureFlagsKey,
        queryFn: () => settingsService.getFeatureFlags(),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        ...options,
    });
}

/**
 * Update feature flags (superadmin only). Optimistic: langsung patch cache
 * supaya toggle terasa instan, rollback kalau gagal.
 */
export function useUpdateFeatureFlags() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (partial) => settingsService.setFeatureFlags(partial),
        onMutate: async (partial) => {
            await queryClient.cancelQueries({ queryKey: featureFlagsKey });
            const previous = queryClient.getQueryData(featureFlagsKey);
            queryClient.setQueryData(featureFlagsKey, (old) => ({ ...(old || {}), ...partial }));
            return { previous };
        },
        onError: (_err, _partial, ctx) => {
            if (ctx?.previous) queryClient.setQueryData(featureFlagsKey, ctx.previous);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: featureFlagsKey });
        },
    });
}
