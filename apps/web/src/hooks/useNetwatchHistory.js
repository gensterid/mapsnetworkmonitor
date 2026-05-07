import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

/**
 * Fetch IP change history for a single netwatch entry.
 */
export function useNetwatchHistory(routerId, netwatchId, options = {}) {
    return useQuery({
        queryKey: ['netwatch-history', routerId, netwatchId],
        queryFn: async () => {
            const res = await apiClient.get(`/routers/${routerId}/netwatch/${netwatchId}/history`);
            return res.data?.data ?? [];
        },
        enabled: !!routerId && !!netwatchId && (options.enabled ?? true),
        staleTime: 30_000,
    });
}

/**
 * Manually trigger auto-heal for a single netwatch entry — useful for
 * verifying the resolver wired up correctly without waiting for the
 * 5-minute scheduler tick.
 */
export function useHealNetwatchNow(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (netwatchId) => {
            const res = await apiClient.post(`/routers/${routerId}/netwatch/${netwatchId}/heal-now`);
            return res.data?.data;
        },
        onSuccess: (result) => {
            if (result?.healed) {
                toast.success(`IP diperbarui: ${result.oldHost || '∅'} → ${result.newHost} (${result.source})`);
                qc.invalidateQueries({ queryKey: ['router-netwatch', routerId] });
                qc.invalidateQueries({ queryKey: ['netwatch-history', routerId] });
            } else {
                const reasonMsg = {
                    no_active_session: 'Customer offline (tidak ada PPPoE active)',
                    already_in_sync: 'IP sudah sesuai, tidak perlu update',
                }[result?.reason] || 'Tidak ada perubahan';
                toast(reasonMsg, { icon: 'ℹ️' });
            }
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message || err?.message || 'Heal gagal');
        },
    });
}
