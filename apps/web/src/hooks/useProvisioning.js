import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { provisioningService } from '../services/provisioning.service';
import toast from 'react-hot-toast';

const KEY = ['provisioning-presets'];

/** Backend 400 mengembalikan array error zod — ringkas jadi pesan tunggal. */
function errMsg(e, fallback) {
    const err = e?.response?.data?.error;
    if (Array.isArray(err)) return 'Validasi gagal — periksa kembali isian.';
    return err || e?.message || fallback;
}

export function usePresets() {
    return useQuery({
        queryKey: KEY,
        queryFn: provisioningService.getPresets,
        staleTime: 60000,
    });
}

export function useCreatePreset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: provisioningService.createPreset,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            toast.success('Preset provisioning disimpan');
        },
        onError: (e) => toast.error(errMsg(e, 'Gagal simpan preset')),
    });
}

export function useUpdatePreset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => provisioningService.updatePreset(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            toast.success('Preset diperbarui');
        },
        onError: (e) => toast.error(errMsg(e, 'Gagal perbarui preset')),
    });
}

export function useDeletePreset() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => provisioningService.deletePreset(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            toast.success('Preset dihapus');
        },
        onError: (e) => toast.error(errMsg(e, 'Gagal hapus preset')),
    });
}

// ---- Authorize flow ----

/** Scan ONU belum ter-authorize di OLT (buka sesi telnet — on-demand). */
export function useScanUnconfigured() {
    return useMutation({
        mutationFn: (oltId) => provisioningService.getUnconfigured(oltId),
        onError: (e) => toast.error(errMsg(e, 'Gagal scan ONU')),
    });
}

/** Preview perintah authorize (murni — tak menyentuh OLT). */
export function usePlanAuthorize() {
    return useMutation({
        mutationFn: (data) => provisioningService.plan(data),
        onError: (e) => toast.error(errMsg(e, 'Gagal membuat preview')),
    });
}

/** TULIS-LIVE authorize (confirm otomatis di service). */
export function useAuthorizeOnu() {
    return useMutation({
        mutationFn: ({ oltId, data }) => provisioningService.authorize(oltId, data),
        onError: (e) => toast.error(errMsg(e, 'Gagal authorize')),
    });
}

// ---- Modify flow (mode auto-auth) ----

/** Scan ONT yang SUDAH teregister di OLT (on-demand — buka sesi telnet). */
export function useScanRegistered() {
    return useMutation({
        mutationFn: (oltId) => provisioningService.getRegistered(oltId),
        onError: (e) => toast.error(errMsg(e, 'Gagal scan ONT teregister')),
    });
}

/** Preview perintah modify (murni — tak menyentuh OLT). */
export function usePlanModify() {
    return useMutation({
        mutationFn: ({ oltId, data }) => provisioningService.planModify(oltId, data),
        onError: (e) => toast.error(errMsg(e, 'Gagal membuat preview')),
    });
}

/** TULIS-LIVE modify (confirm otomatis di service). */
export function useModifyOnu() {
    return useMutation({
        mutationFn: ({ oltId, data }) => provisioningService.modify(oltId, data),
        onError: (e) => toast.error(errMsg(e, 'Gagal modify')),
    });
}
