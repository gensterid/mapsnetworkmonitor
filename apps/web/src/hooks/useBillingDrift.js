import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

const API = '/billing/drift';

const handle = (err) => {
    const data = err?.response?.data;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    return err?.message || 'Operasi gagal';
};

/**
 * Drift summary polling — ringan, baca cache di server.
 * Refresh tiap 60 detik untuk badge sidebar.
 */
export function useDriftSummary(opts = {}) {
    return useQuery({
        queryKey: ['billing-drift-summary'],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/summary`);
            return res.data?.data;
        },
        refetchInterval: opts.refetchInterval ?? 60_000,
        staleTime: 30_000,
        enabled: opts.enabled !== false,
    });
}

/**
 * Trigger scan baru (mahal — hit MikroTik per router). Manual button only.
 */
export function useDriftScan() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await apiClient.post(`${API}/scan`, {});
            return res.data?.data;
        },
        onSuccess: (data) => {
            qc.setQueryData(['billing-drift-report'], data);
            qc.setQueryData(['billing-drift-summary'], {
                count: data?.items?.length ?? 0,
                scannedAt: data?.scannedAt ?? null,
                routersFailed: data?.routersFailed?.length ?? 0,
            });
            toast.success(`Scan selesai — ${data?.items?.length ?? 0} drift ditemukan`);
        },
        onError: (e) => toast.error(handle(e)),
    });
}

/**
 * Cached drift report — kalau belum ada di QueryClient, return null.
 * Operator harus klik tombol Scan dulu untuk populate.
 */
export function useDriftReport() {
    return useQuery({
        queryKey: ['billing-drift-report'],
        queryFn: () => null,
        enabled: false,
        staleTime: Infinity,
    });
}

export function useDriftResync() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ subscriptionId, kickSession }) => {
            const res = await apiClient.post(`${API}/resync/${subscriptionId}`, { kickSession });
            return res.data?.data;
        },
        onSuccess: (data, vars) => {
            const fields = (data?.applied || []).join(', ');
            if (data?.applied?.length) {
                toast.success(`Resync sukses — ${fields}`);
            } else {
                toast.success(data?.message || 'Sudah sinkron');
            }
            // Hapus row dari report cache
            qc.setQueryData(['billing-drift-report'], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    items: old.items.filter(i => i.subscriptionId !== vars.subscriptionId),
                };
            });
            qc.setQueryData(['billing-drift-summary'], (old) => {
                if (!old) return old;
                return { ...old, count: Math.max(0, (old.count || 0) - 1) };
            });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
