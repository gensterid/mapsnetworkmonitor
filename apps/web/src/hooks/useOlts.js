import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { oltService } from '../services/olt.service';
import toast from 'react-hot-toast';

const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

export function useOlts() {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: ['olts', tenantId || 'default'],
        queryFn: oltService.getAll,
    });
}

export function useOlt(id) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: ['olts', tenantId || 'default', id],
        queryFn: () => oltService.getById(id),
        enabled: !!id,
    });
}

export function useCreateOlt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: oltService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] });
            toast.success('OLT created successfully');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to create OLT');
        },
    });
}

export function useUpdateOlt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => oltService.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] });
            toast.success('OLT updated successfully');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update OLT');
        },
    });
}

export function useDeleteOlt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: oltService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] });
            toast.success('OLT deleted successfully');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to delete OLT');
        },
    });
}

export function useRefreshOlt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: oltService.refresh,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] });
            toast.success('OLT status refreshed');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to refresh OLT status');
        },
    });
}

export function useOltOnus(id) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: ['olts', tenantId || 'default', id, 'onus'],
        queryFn: () => oltService.getOnus(id),
        enabled: !!id,
    });
}

export function useUpdateOnu() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, onuId, data }) => oltService.updateOnu(id, onuId, data),
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['olts', variables.id, 'onus'] });
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });
            toast.success('ONU updated successfully');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update ONU');
        },
    });
}

export function useRebootOnu() {
    return useMutation({
        mutationFn: ({ id, onuId, ponId }) => oltService.rebootOnu(id, onuId, ponId),
        onSuccess: () => {
            toast.success('Reboot command sent to ONU');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to reboot ONU');
        },
    });
}

export function useArchiveOnu() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, onuId }) => oltService.archiveOnu(id, onuId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['olts', variables.id, 'onus'] });
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });
            toast.success('ONU dihapus dari aplikasi');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Gagal menghapus ONU');
        },
    });
}
