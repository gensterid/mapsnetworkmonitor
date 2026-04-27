import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

const PERIODS = ['1h', '6h', '24h', '7d', '30d'];

export function useBandwidthTop(routerId, { period = '24h', limit = 20, type = null, refetchInterval = 60_000 } = {}) {
    return useQuery({
        queryKey: ['bandwidth-top', routerId, period, limit, type],
        enabled: !!routerId && PERIODS.includes(period),
        refetchInterval,
        queryFn: async () => {
            const params = new URLSearchParams({ period, limit: String(limit) });
            if (type) params.set('type', type);
            const res = await apiClient.get(`/bandwidth/router/${routerId}/top?${params}`);
            return res.data?.data ?? [];
        },
    });
}

export function useBandwidthClientHistory(routerId, identifier, { period = '24h', type = null, enabled = true } = {}) {
    return useQuery({
        queryKey: ['bandwidth-client-history', routerId, identifier, period, type],
        enabled: !!routerId && !!identifier && enabled,
        refetchInterval: 60_000,
        queryFn: async () => {
            const params = new URLSearchParams({ period });
            if (type) params.set('type', type);
            const res = await apiClient.get(
                `/bandwidth/router/${routerId}/client/${encodeURIComponent(identifier)}/history?${params}`
            );
            return res.data?.data ?? [];
        },
    });
}

export function useBandwidthSummary(routerId, { refetchInterval = 60_000 } = {}) {
    return useQuery({
        queryKey: ['bandwidth-summary', routerId],
        enabled: !!routerId,
        refetchInterval,
        queryFn: async () => {
            const res = await apiClient.get(`/bandwidth/router/${routerId}/summary`);
            return res.data?.data ?? null;
        },
    });
}
