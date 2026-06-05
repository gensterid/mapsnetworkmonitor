/**
 * MikHMON Console data hooks.
 * Phase A1: router info (mode badge) + system resource (top-bar widget).
 * Later phases add hotspot/queue/ip/system hooks here.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { mikhmonApi } from '@/services/mikhmon.service';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';

export const mikhmonKeys = {
    all: (routerId) => ['mikhmon', routerId],
    info: (routerId) => [...mikhmonKeys.all(routerId), 'info'],
    resource: (routerId) => [...mikhmonKeys.all(routerId), 'resource'],
    hotspotProfiles: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'profiles'],
};

/**
 * Router meta + hotspot_mode. Cached longer than live data — mode rarely
 * changes mid-session.
 */
export function useMikhmonInfo(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.info(routerId),
        queryFn: () => mikhmonApi.info.get(routerId),
        enabled: !!routerId,
        staleTime: 60 * 1000,
        ...options,
    });
}

/**
 * Live /system/resource snapshot. Defaults to the context's
 * effectiveRefetchInterval so it auto-pauses when the tab is hidden.
 */
export function useMikhmonResource(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.resource(routerId),
        queryFn: () => mikhmonApi.system.resource(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot User Profiles — Phase A2
// ─────────────────────────────────────────────────────────────────────────

export function useHotspotUserProfiles(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.hotspotProfiles(routerId),
        queryFn: () => mikhmonApi.hotspotProfiles.list(routerId),
        enabled: !!routerId,
        staleTime: 30 * 1000,
        ...options,
    });
}

function useInvalidateProfiles(routerId) {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: mikhmonKeys.hotspotProfiles(routerId) });
}

export function useAddHotspotUserProfile(routerId) {
    const invalidate = useInvalidateProfiles(routerId);
    return useMutation({
        mutationFn: (input) => mikhmonApi.hotspotProfiles.add(routerId, input),
        onSuccess: () => {
            toast.success('Profile berhasil ditambahkan');
            invalidate();
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error || err?.message || 'Gagal tambah profile');
        },
    });
}

export function useUpdateHotspotUserProfile(routerId) {
    const invalidate = useInvalidateProfiles(routerId);
    return useMutation({
        mutationFn: ({ id, input }) => mikhmonApi.hotspotProfiles.update(routerId, id, input),
        onSuccess: () => {
            toast.success('Profile berhasil diupdate');
            invalidate();
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error || err?.message || 'Gagal update profile');
        },
    });
}

export function useDeleteHotspotUserProfile(routerId) {
    const invalidate = useInvalidateProfiles(routerId);
    return useMutation({
        mutationFn: (id) => mikhmonApi.hotspotProfiles.remove(routerId, id),
        onSuccess: () => {
            toast.success('Profile berhasil dihapus');
            invalidate();
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error || err?.message || 'Gagal hapus profile');
        },
    });
}
