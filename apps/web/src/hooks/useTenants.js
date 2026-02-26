import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantService } from '../lib/api';
import toast from 'react-hot-toast';

export const useTenants = (options = {}) => {
    return useQuery({
        queryKey: ['tenants'],
        queryFn: async () => {
            const data = await tenantService.getAll();
            return data || [];
        },
        ...options
    });
};

export const useTenant = (id) => {
    return useQuery({
        queryKey: ['tenants', id],
        queryFn: async () => {
            const data = await tenantService.getById(id);
            return data;
        },
        enabled: !!id
    });
};

export const useCreateTenant = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => tenantService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            toast.success('ISP baru berhasil ditambahkan');
        },
        onError: (error) => {
            toast.error(error.message || 'Gagal menambahkan ISP');
        }
    });
};

export const useUpdateTenant = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => tenantService.update(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            queryClient.invalidateQueries({ queryKey: ['tenants', variables.id] });
            toast.success('ISP berhasil diperbarui');
        },
        onError: (error) => {
            toast.error(error.message || 'Gagal memperbarui ISP');
        }
    });
};

export const useDeleteTenant = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => tenantService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            toast.success('ISP berhasil dihapus');
        },
        onError: (error) => {
            toast.error(error.message || 'Gagal menghapus ISP');
        }
    });
};
