import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { oltService } from '../services/olt.service';
import toast from 'react-hot-toast';

export function useOlts() {
    return useQuery({
        queryKey: ['olts'],
        queryFn: oltService.getAll,
    });
}

export function useOlt(id) {
    return useQuery({
        queryKey: ['olts', id],
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
    return useQuery({
        queryKey: ['olts', id, 'onus'],
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
