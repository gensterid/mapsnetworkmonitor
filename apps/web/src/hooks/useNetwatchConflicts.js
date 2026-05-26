import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

/**
 * List netwatch entries currently in sync_state='conflict' for a router.
 * Used by the conflict banner and the resolve dialog.
 */
export function useNetwatchConflicts(routerId, options = {}) {
    return useQuery({
        queryKey: ['netwatch-conflicts', routerId],
        queryFn: async () => {
            const res = await apiClient.get(`/routers/${routerId}/netwatch/conflicts`);
            return res.data?.data ?? [];
        },
        enabled: !!routerId && (options.enabled ?? true),
        refetchInterval: options.refetchInterval ?? 60_000,
        staleTime: 15_000,
    });
}

/**
 * Resolve one or more sync conflicts.
 * Body: { entryIds: string[], source: 'mikrotik' | 'app' }
 *
 * source='mikrotik' → trust MikroTik snapshot (delete diverged app copies)
 * source='app'      → push app host to MikroTik (overwriting)
 */
export function useResolveConflicts(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ entryIds, source }) => {
            const res = await apiClient.post(
                `/routers/${routerId}/netwatch/conflicts/resolve`,
                { entryIds, source },
            );
            return res.data?.data;
        },
        onSuccess: (result, vars) => {
            const sourceLabel = vars.source === 'mikrotik' ? 'MikroTik' : 'aplikasi';
            if (result?.resolved > 0) {
                toast.success(`${result.resolved} konflik diselesaikan menggunakan data ${sourceLabel}`);
            }
            if (result?.failed > 0) {
                toast.error(`${result.failed} konflik gagal diselesaikan — lihat log`);
            }
            qc.invalidateQueries({ queryKey: ['netwatch-conflicts', routerId] });
            qc.invalidateQueries({ queryKey: ['router-netwatch', routerId] });
            qc.invalidateQueries({ queryKey: ['netwatch-history', routerId] });
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message || err?.message || 'Resolve gagal');
        },
    });
}
