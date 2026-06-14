import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

const API = '/billing/promises';

const handle = (err) => {
    const data = err?.response?.data;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    return err?.message || 'Operasi gagal';
};

export function usePromises(params = {}) {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.limit) search.set('limit', String(params.limit));
    return useQuery({
        queryKey: ['promises', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}

export function usePromiseSummary() {
    return useQuery({
        queryKey: ['promises-summary'],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/summary`);
            return res.data?.data;
        },
        refetchInterval: 60_000,
        staleTime: 30_000,
    });
}

export function useCreatePromise() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const res = await apiClient.post(API, input);
            return res.data?.data;
        },
        onSuccess: () => {
            toast.success('Janji bayar tercatat');
            qc.invalidateQueries({ queryKey: ['promises'] });
            qc.invalidateQueries({ queryKey: ['promises-summary'] });
            qc.invalidateQueries({ queryKey: ['billing-invoices'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}

export function useFulfillPromise() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await apiClient.post(`${API}/${id}/fulfill`);
            return res.data?.data;
        },
        onSuccess: () => {
            toast.success('Janji bayar ditunaikan');
            qc.invalidateQueries({ queryKey: ['promises'] });
            qc.invalidateQueries({ queryKey: ['promises-summary'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}

export function useCancelPromise() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id) => {
            const res = await apiClient.post(`${API}/${id}/cancel`);
            return res.data?.data;
        },
        onSuccess: () => {
            toast.success('Janji bayar dibatalkan');
            qc.invalidateQueries({ queryKey: ['promises'] });
            qc.invalidateQueries({ queryKey: ['promises-summary'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
