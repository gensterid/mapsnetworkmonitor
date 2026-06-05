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
    ipBindings: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'ip-bindings'],
    walledGarden: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'walled-garden'],
    queues: (routerId) => [...mikhmonKeys.all(routerId), 'queues'],
    queueStats: (routerId) => [...mikhmonKeys.all(routerId), 'queues', 'stats'],
};

/** Generic CRUD hook factory — keeps add/update/remove patterns identical
 *  across every MikHMON section. Each mutation invalidates the matching
 *  list query on success. Returned hooks are real React hooks — call
 *  them only from component bodies, never inside loops/conditionals.
 */
function makeCrudHooks(api, keyFn) {
    function useList(routerId, options = {}) {
        return useQuery({
            queryKey: keyFn(routerId),
            queryFn: () => api.list(routerId),
            enabled: !!routerId,
            staleTime: 10 * 1000,
            ...options,
        });
    }
    function useAdd(routerId) {
        const qc = useQueryClient();
        return useMutation({
            mutationFn: (input) => api.add(routerId, input),
            onSuccess: () => {
                toast.success('Berhasil ditambahkan');
                qc.invalidateQueries({ queryKey: keyFn(routerId) });
            },
            onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal tambah'),
        });
    }
    function useUpdate(routerId) {
        const qc = useQueryClient();
        return useMutation({
            mutationFn: ({ id, input }) => api.update(routerId, id, input),
            onSuccess: () => {
                toast.success('Berhasil diupdate');
                qc.invalidateQueries({ queryKey: keyFn(routerId) });
            },
            onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal update'),
        });
    }
    function useRemove(routerId) {
        const qc = useQueryClient();
        return useMutation({
            mutationFn: (id) => api.remove(routerId, id),
            onSuccess: () => {
                toast.success('Berhasil dihapus');
                qc.invalidateQueries({ queryKey: keyFn(routerId) });
            },
            onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal hapus'),
        });
    }
    return { useList, useAdd, useUpdate, useRemove };
}

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

// ─────────────────────────────────────────────────────────────────────────
// IP Binding — Phase A3
// ─────────────────────────────────────────────────────────────────────────

const ipBindingCrud = makeCrudHooks(mikhmonApi.ipBindings, mikhmonKeys.ipBindings);
export const useIpBindings = ipBindingCrud.useList;
export const useAddIpBinding = ipBindingCrud.useAdd;
export const useUpdateIpBinding = ipBindingCrud.useUpdate;
export const useDeleteIpBinding = ipBindingCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// Walled Garden — Phase A3
// ─────────────────────────────────────────────────────────────────────────

const walledGardenCrud = makeCrudHooks(mikhmonApi.walledGarden, mikhmonKeys.walledGarden);
export const useWalledGarden = walledGardenCrud.useList;
export const useAddWalledGarden = walledGardenCrud.useAdd;
export const useUpdateWalledGarden = walledGardenCrud.useUpdate;
export const useDeleteWalledGarden = walledGardenCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// Simple Queues — Phase A4
// ─────────────────────────────────────────────────────────────────────────

const queueCrud = makeCrudHooks(mikhmonApi.queues, mikhmonKeys.queues);
export const useSimpleQueues = queueCrud.useList;
export const useAddSimpleQueue = queueCrud.useAdd;
export const useUpdateSimpleQueue = queueCrud.useUpdate;
export const useDeleteSimpleQueue = queueCrud.useRemove;

/**
 * Live per-queue traffic snapshot. Polled at the global refresh cadence
 * — auto-pauses when the tab is hidden. Uncached on the server side so
 * each tick gets fresh RouterOS data.
 */
export function useSimpleQueueStats(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.queueStats(routerId),
        queryFn: () => mikhmonApi.queues.stats(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}
