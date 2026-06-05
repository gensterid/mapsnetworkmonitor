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
    hotspotUsers: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'users'],
    hotspotActive: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'active'],
    hotspotHosts: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'hosts'],
    hotspotCookies: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'cookies'],
    hotspotServerProfiles: (routerId) => [...mikhmonKeys.all(routerId), 'hotspot', 'server-profiles'],
    pppSecrets: (routerId) => [...mikhmonKeys.all(routerId), 'ppp', 'secrets'],
    pppProfiles: (routerId) => [...mikhmonKeys.all(routerId), 'ppp', 'profiles'],
    pppActive: (routerId) => [...mikhmonKeys.all(routerId), 'ppp', 'active'],
    ipPools: (routerId) => [...mikhmonKeys.all(routerId), 'ip', 'pool'],
    dhcpLeases: (routerId) => [...mikhmonKeys.all(routerId), 'ip', 'dhcp-lease'],
    addressList: (routerId) => [...mikhmonKeys.all(routerId), 'ip', 'address-list'],
    systemLog: (routerId, q) => [...mikhmonKeys.all(routerId), 'system', 'log', q || {}],
    systemPackages: (routerId) => [...mikhmonKeys.all(routerId), 'system', 'packages'],
    systemScheduler: (routerId) => [...mikhmonKeys.all(routerId), 'system', 'scheduler'],
    backup: (routerId) => [...mikhmonKeys.all(routerId), 'system', 'backup'],
    vouchers: (routerId) => [...mikhmonKeys.all(routerId), 'vouchers'],
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

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Users — Phase A5
// ─────────────────────────────────────────────────────────────────────────

const hotspotUserCrud = makeCrudHooks(mikhmonApi.hotspotUsers, mikhmonKeys.hotspotUsers);
export const useHotspotUsers = hotspotUserCrud.useList;
export const useAddHotspotUser = hotspotUserCrud.useAdd;
export const useUpdateHotspotUser = hotspotUserCrud.useUpdate;
export const useDeleteHotspotUser = hotspotUserCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Active sessions — live, kick-only
// ─────────────────────────────────────────────────────────────────────────

export function useHotspotActive(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.hotspotActive(routerId),
        queryFn: () => mikhmonApi.hotspotActive.list(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}

export function useKickHotspotActive(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => mikhmonApi.hotspotActive.kick(routerId, id),
        onSuccess: () => {
            toast.success('Session di-kick');
            qc.invalidateQueries({ queryKey: mikhmonKeys.hotspotActive(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal kick session'),
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Hosts — live, read-only
// ─────────────────────────────────────────────────────────────────────────

export function useHotspotHosts(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.hotspotHosts(routerId),
        queryFn: () => mikhmonApi.hotspotHosts.list(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 5_000,
        ...options,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Cookies — list + remove
// ─────────────────────────────────────────────────────────────────────────

export function useHotspotCookies(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.hotspotCookies(routerId),
        queryFn: () => mikhmonApi.hotspotCookies.list(routerId),
        enabled: !!routerId,
        staleTime: 10 * 1000,
        ...options,
    });
}

export function useRemoveHotspotCookie(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => mikhmonApi.hotspotCookies.remove(routerId, id),
        onSuccess: () => {
            toast.success('Cookie dihapus — user akan login ulang next connect');
            qc.invalidateQueries({ queryKey: mikhmonKeys.hotspotCookies(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal hapus cookie'),
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Hotspot Server Profiles — Phase A6
// ─────────────────────────────────────────────────────────────────────────

const hotspotServerProfileCrud = makeCrudHooks(mikhmonApi.hotspotServerProfiles, mikhmonKeys.hotspotServerProfiles);
export const useHotspotServerProfiles = hotspotServerProfileCrud.useList;
export const useAddHotspotServerProfile = hotspotServerProfileCrud.useAdd;
export const useUpdateHotspotServerProfile = hotspotServerProfileCrud.useUpdate;
export const useDeleteHotspotServerProfile = hotspotServerProfileCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// PPP Secrets — Phase A6
// ─────────────────────────────────────────────────────────────────────────

const pppSecretCrud = makeCrudHooks(mikhmonApi.pppSecrets, mikhmonKeys.pppSecrets);
export const usePppSecrets = pppSecretCrud.useList;
export const useAddPppSecret = pppSecretCrud.useAdd;
export const useUpdatePppSecret = pppSecretCrud.useUpdate;
export const useDeletePppSecret = pppSecretCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// PPP Profiles — Phase A6
// ─────────────────────────────────────────────────────────────────────────

const pppProfileCrud = makeCrudHooks(mikhmonApi.pppProfiles, mikhmonKeys.pppProfiles);
export const usePppProfiles = pppProfileCrud.useList;
export const useAddPppProfile = pppProfileCrud.useAdd;
export const useUpdatePppProfile = pppProfileCrud.useUpdate;
export const useDeletePppProfile = pppProfileCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// PPP Active — live, kick-only
// ─────────────────────────────────────────────────────────────────────────

export function usePppActive(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.pppActive(routerId),
        queryFn: () => mikhmonApi.pppActive.list(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}

export function useKickPppActive(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => mikhmonApi.pppActive.kick(routerId, id),
        onSuccess: () => {
            toast.success('PPP session di-kick');
            qc.invalidateQueries({ queryKey: mikhmonKeys.pppActive(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal kick PPP session'),
    });
}

// ─────────────────────────────────────────────────────────────────────────
// IP Pool — Phase A7
// ─────────────────────────────────────────────────────────────────────────

const ipPoolCrud = makeCrudHooks(mikhmonApi.ipPools, mikhmonKeys.ipPools);
export const useIpPools = ipPoolCrud.useList;
export const useAddIpPool = ipPoolCrud.useAdd;
export const useUpdateIpPool = ipPoolCrud.useUpdate;
export const useDeleteIpPool = ipPoolCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// DHCP Lease — Phase A7
// ─────────────────────────────────────────────────────────────────────────

const dhcpLeaseCrud = makeCrudHooks(mikhmonApi.dhcpLeases, mikhmonKeys.dhcpLeases);
export const useDhcpLeases = dhcpLeaseCrud.useList;
export const useAddDhcpLease = dhcpLeaseCrud.useAdd;
export const useUpdateDhcpLease = dhcpLeaseCrud.useUpdate;
export const useDeleteDhcpLease = dhcpLeaseCrud.useRemove;

export function useMakeDhcpLeaseStatic(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => mikhmonApi.dhcpLeases.makeStatic(routerId, id),
        onSuccess: () => {
            toast.success('Lease di-convert ke static');
            qc.invalidateQueries({ queryKey: mikhmonKeys.dhcpLeases(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal make-static'),
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Address List — Phase A7
// ─────────────────────────────────────────────────────────────────────────

const addressListCrud = makeCrudHooks(mikhmonApi.addressList, mikhmonKeys.addressList);
export const useAddressList = addressListCrud.useList;
export const useAddAddressList = addressListCrud.useAdd;
export const useUpdateAddressList = addressListCrud.useUpdate;
export const useDeleteAddressList = addressListCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// System Log — Phase A8 (live read, no mutation)
// ─────────────────────────────────────────────────────────────────────────

export function useSystemLog(routerId, { topics, limit } = {}, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.systemLog(routerId, { topics, limit }),
        queryFn: () => mikhmonApi.systemLog.list(routerId, { topics, limit }),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// System Packages — Phase A8 (read-only)
// ─────────────────────────────────────────────────────────────────────────

export function useSystemPackages(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.systemPackages(routerId),
        queryFn: () => mikhmonApi.systemPackages.list(routerId),
        enabled: !!routerId,
        staleTime: 60 * 1000,
        ...options,
    });
}

// ─────────────────────────────────────────────────────────────────────────
// System Scheduler — Phase A8
// ─────────────────────────────────────────────────────────────────────────

const schedulerCrud = makeCrudHooks(mikhmonApi.systemScheduler, mikhmonKeys.systemScheduler);
export const useSystemScheduler = schedulerCrud.useList;
export const useAddSystemScheduler = schedulerCrud.useAdd;
export const useUpdateSystemScheduler = schedulerCrud.useUpdate;
export const useDeleteSystemScheduler = schedulerCrud.useRemove;

// ─────────────────────────────────────────────────────────────────────────
// Backup — Phase A8, delegates to /api/router-backups/* existing
// ─────────────────────────────────────────────────────────────────────────

export function useBackupList(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.backup(routerId),
        queryFn: () => mikhmonApi.backup.list(routerId),
        enabled: !!routerId,
        staleTime: 10 * 1000,
        ...options,
    });
}

export function useCreateBackup(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload) => mikhmonApi.backup.create(routerId, payload),
        onSuccess: () => {
            toast.success('Backup berhasil dibuat');
            qc.invalidateQueries({ queryKey: mikhmonKeys.backup(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal create backup'),
    });
}

export function useDeleteBackup(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (backupId) => mikhmonApi.backup.remove(backupId),
        onSuccess: () => {
            toast.success('Backup dihapus');
            qc.invalidateQueries({ queryKey: mikhmonKeys.backup(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal hapus backup'),
    });
}

// ─────────────────────────────────────────────────────────────────────────
// MikHMON Vouchers — Phase A9
// ─────────────────────────────────────────────────────────────────────────

export function useMikhmonVouchers(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.vouchers(routerId),
        queryFn: () => mikhmonApi.vouchers.list(routerId),
        enabled: !!routerId,
        staleTime: 10 * 1000,
        ...options,
    });
}

export function useGenerateMikhmonVouchers(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => mikhmonApi.vouchers.generate(routerId, input),
        onSuccess: (resp) => {
            const created = resp?.data?.count ?? 0;
            const modeHint = resp?.data?.modeHint;
            if (modeHint === 'native') {
                toast.success(
                    `${created} voucher dibuat. ⚠ Mode router = native — voucher ini TERPISAH dari Billing tracking.`,
                    { duration: 6000 },
                );
            } else if (modeHint === 'mikhmon_bridge') {
                toast.success(`${created} voucher dibuat. Akan auto-track di Billing via parser.`);
            } else {
                toast.success(`${created} voucher dibuat di MikroTik.`);
            }
            qc.invalidateQueries({ queryKey: mikhmonKeys.vouchers(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal generate voucher'),
    });
}

export function useDeleteMikhmonVoucher(routerId) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => mikhmonApi.vouchers.remove(routerId, id),
        onSuccess: () => {
            toast.success('Voucher dihapus');
            qc.invalidateQueries({ queryKey: mikhmonKeys.vouchers(routerId) });
        },
        onError: (err) => toast.error(err?.response?.data?.error || err?.message || 'Gagal hapus voucher'),
    });
}
