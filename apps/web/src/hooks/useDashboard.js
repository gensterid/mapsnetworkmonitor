import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/lib/api';

export const dashboardKeys = {
    all: ['dashboard'],
    stats: (tenantId) => [...dashboardKeys.all, 'stats', tenantId || 'default'],
    downItems: (type, tenantId) => [...dashboardKeys.all, 'downItems', type, tenantId || 'default'],
};

const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

/**
 * Hook to fetch dashboard statistics
 */
export function useDashboardStats(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: dashboardKeys.stats(tenantId),
        queryFn: () => dashboardService.getStats(),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch down items by type (netwatch or pppoe)
 */
export function useDownItems(type, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: dashboardKeys.downItems(type, tenantId),
        queryFn: () => dashboardService.getDownItems(type),
        enabled: !!type,
        staleTime: 30 * 1000,
        ...options,
    });
}
