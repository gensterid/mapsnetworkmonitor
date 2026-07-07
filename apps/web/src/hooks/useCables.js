import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cableService } from '../services/cable.service';
import toast from 'react-hot-toast';

/**
 * Fiber cables (Cara C). Lihat docs/FIBER-CABLE-DESIGN.md.
 */
export function useCables(routerId) {
    return useQuery({
        queryKey: ['cables', routerId || 'all'],
        queryFn: () => cableService.getAll(routerId),
        staleTime: 60000,
    });
}

export function useCreateCable() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: cableService.create,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cables'] });
            toast.success('Kabel disimpan');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Gagal simpan kabel'),
    });
}

export function useUpdateCable() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => cableService.update(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cables'] });
            toast.success('Kabel diperbarui');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Gagal perbarui kabel'),
    });
}

export function useDeleteCable() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => cableService.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['cables'] });
            toast.success('Kabel dihapus');
        },
        onError: (e) => toast.error(e.response?.data?.error || 'Gagal hapus kabel'),
    });
}
