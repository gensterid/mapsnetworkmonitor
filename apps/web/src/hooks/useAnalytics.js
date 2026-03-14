import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/api/services/analytics.service';

export const analyticsKeys = {
    all: ['analytics'],
    trends: (params) => [...analyticsKeys.all, 'trends', params],
    performance: (params) => [...analyticsKeys.all, 'performance', params],
    uptime: (params) => [...analyticsKeys.all, 'uptime', params],
    auditLogs: (params) => [...analyticsKeys.all, 'auditLogs', params],
};

/**
 * Hook to fetch alert trends
 */
export function useAlertTrends(params, options = {}) {
    return useQuery({
        queryKey: analyticsKeys.trends(params),
        queryFn: () => analyticsService.getAlertTrends(params),
        staleTime: 5 * 60 * 1000,
        enabled: !!params,
        ...options,
    });
}

/**
 * Hook to fetch performance trends
 */
export function usePerformanceTrends(params, options = {}) {
    return useQuery({
        queryKey: analyticsKeys.performance(params),
        queryFn: () => analyticsService.getPerformanceTrends(params),
        staleTime: 5 * 60 * 1000,
        enabled: !!params,
        ...options,
    });
}

/**
 * Hook to fetch uptime stats
 */
export function useUptimeStats(params, options = {}) {
    return useQuery({
        queryKey: analyticsKeys.uptime(params),
        queryFn: () => analyticsService.getUptimeStats(params),
        staleTime: 5 * 60 * 1000,
        enabled: !!params,
        ...options,
    });
}

/**
 * Hook to fetch audit logs
 */
export function useAuditLogsAnalytics(params, options = {}) {
    return useQuery({
        queryKey: analyticsKeys.auditLogs(params),
        queryFn: () => analyticsService.getAuditLogs(params),
        staleTime: 60 * 1000,
        enabled: !!params,
        ...options,
    });
}

/**
 * Hook to fetch overall network health score
 */
export function useNetworkHealth(options = {}) {
    return useQuery({
        queryKey: [...analyticsKeys.all, 'health-score'],
        queryFn: () => analyticsService.getNetworkHealth(),
        staleTime: 60 * 1000, // 1 minute stale
        refetchInterval: 5 * 60 * 1000, // Auto refresh every 5 mins
        ...options,
    });
}

/**
 * Hook to fetch predictive analytics
 */
export function usePredictions(options = {}) {
    return useQuery({
        queryKey: [...analyticsKeys.all, 'predictions'],
        queryFn: () => analyticsService.getPredictions(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}
