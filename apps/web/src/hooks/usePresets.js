import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { presetService } from '../services/preset.service';
import toast from 'react-hot-toast';

export const presetKeys = {
    all: ['presets'],
    detail: (id) => ['presets', id],
};

export function usePresets() {
    return useQuery({
        queryKey: presetKeys.all,
        queryFn: presetService.getAll,
    });
}

export function usePreset(id) {
    return useQuery({
        queryKey: presetKeys.detail(id),
        queryFn: () => presetService.getById(id),
        enabled: !!id,
    });
}

export function useCreatePreset() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: presetService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: presetKeys.all });
            toast.success('Preset created');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to create preset');
        },
    });
}

export function useUpdatePreset() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => presetService.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: presetKeys.all });
            queryClient.invalidateQueries({ queryKey: presetKeys.detail(id) });
            toast.success('Preset updated');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update preset');
        },
    });
}

export function useDeletePreset() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: presetService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: presetKeys.all });
            toast.success('Preset deleted');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to delete preset');
        },
    });
}
