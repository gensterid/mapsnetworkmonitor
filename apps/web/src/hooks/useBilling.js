import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

const API = '/billing';

const handle = (err) => err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Operation failed';

// ─── Packages ──────────────────────────────────────────────────────────────
export function usePackages(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-packages', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/packages?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}
export function useCreatePackage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => apiClient.post(`${API}/packages`, input).then(r => r.data?.data),
        onSuccess: () => { toast.success('Paket dibuat'); qc.invalidateQueries({ queryKey: ['billing-packages'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useUpdatePackage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...patch }) => apiClient.patch(`${API}/packages/${id}`, patch).then(r => r.data?.data),
        onSuccess: () => { toast.success('Paket diperbarui'); qc.invalidateQueries({ queryKey: ['billing-packages'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useDeletePackage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.delete(`${API}/packages/${id}`),
        onSuccess: () => { toast.success('Paket dihapus'); qc.invalidateQueries({ queryKey: ['billing-packages'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}

// ─── Customers ─────────────────────────────────────────────────────────────
export function useCustomers(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-customers', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/customers?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}
export function useCreateCustomer() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => apiClient.post(`${API}/customers`, input).then(r => r.data?.data),
        onSuccess: () => { toast.success('Pelanggan dibuat'); qc.invalidateQueries({ queryKey: ['billing-customers'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useUpdateCustomer() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...patch }) => apiClient.patch(`${API}/customers/${id}`, patch).then(r => r.data?.data),
        onSuccess: () => { toast.success('Pelanggan diperbarui'); qc.invalidateQueries({ queryKey: ['billing-customers'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useDeleteCustomer() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.delete(`${API}/customers/${id}`),
        onSuccess: () => { toast.success('Pelanggan dihapus'); qc.invalidateQueries({ queryKey: ['billing-customers'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}

// ─── Subscriptions ─────────────────────────────────────────────────────────
export function useSubscriptions(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-subscriptions', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/subscriptions?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}
export function useCreateSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => apiClient.post(`${API}/subscriptions`, input).then(r => r.data?.data),
        onSuccess: () => { toast.success('Subscription dibuat & dikirim ke MikroTik'); qc.invalidateQueries({ queryKey: ['billing-subscriptions'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useUpdateSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...patch }) => apiClient.patch(`${API}/subscriptions/${id}`, patch).then(r => r.data?.data),
        onSuccess: () => { toast.success('Subscription diperbarui'); qc.invalidateQueries({ queryKey: ['billing-subscriptions'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useDeleteSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.delete(`${API}/subscriptions/${id}`),
        onSuccess: () => { toast.success('Subscription dihapus'); qc.invalidateQueries({ queryKey: ['billing-subscriptions'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useIsolirSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }) => apiClient.post(`${API}/subscriptions/${id}/isolir`, { reason }).then(r => r.data?.data),
        onSuccess: () => { toast.success('Subscription di-isolir'); qc.invalidateQueries({ queryKey: ['billing-subscriptions'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useUnisolirSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.post(`${API}/subscriptions/${id}/unisolir`).then(r => r.data?.data),
        onSuccess: () => { toast.success('Subscription dipulihkan'); qc.invalidateQueries({ queryKey: ['billing-subscriptions'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export async function revealSubscriptionPassword(id) {
    const res = await apiClient.post(`${API}/subscriptions/${id}/reveal-password`);
    return res.data?.data?.password ?? null;
}

// ─── Invoices ──────────────────────────────────────────────────────────────
export function useInvoices(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-invoices', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/invoices?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}
export function useCreateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => apiClient.post(`${API}/invoices`, input).then(r => r.data?.data),
        onSuccess: () => { toast.success('Tagihan dibuat'); qc.invalidateQueries({ queryKey: ['billing-invoices'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
export function usePayInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...payload }) => apiClient.post(`${API}/invoices/${id}/pay`, payload).then(r => r.data?.data),
        onSuccess: () => {
            toast.success('Pembayaran tercatat');
            qc.invalidateQueries({ queryKey: ['billing-invoices'] });
            qc.invalidateQueries({ queryKey: ['billing-subscriptions'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useCancelInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.post(`${API}/invoices/${id}/cancel`).then(r => r.data?.data),
        onSuccess: () => { toast.success('Tagihan dibatalkan'); qc.invalidateQueries({ queryKey: ['billing-invoices'] }); },
        onError: (e) => toast.error(handle(e)),
    });
}

// ─── Vouchers (Phase C) ───────────────────────────────────────────────────
export function useVouchersForRouter(routerId) {
    return useQuery({
        queryKey: ['billing-vouchers', routerId],
        enabled: !!routerId,
        refetchInterval: 60_000,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/vouchers/router/${routerId}`);
            return res.data?.data ?? { mode: 'disabled', items: [] };
        },
    });
}
export function useVoucherBatches(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-voucher-batches', params],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/vouchers/batches?${search}`);
            return res.data?.data ?? [];
        },
        refetchInterval: 60_000,
    });
}
export function useVoucherBatch(id) {
    return useQuery({
        queryKey: ['billing-voucher-batch', id],
        enabled: !!id,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/vouchers/batches/${id}`);
            return res.data?.data ?? null;
        },
    });
}
export function useGenerateVoucherBatch() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input) => apiClient.post(`${API}/vouchers/batches`, input).then(r => r.data?.data),
        onSuccess: (data) => {
            toast.success(`${data.created} voucher dibuat${data.failed ? `, ${data.failed} gagal` : ''}`);
            qc.invalidateQueries({ queryKey: ['billing-voucher-batches'] });
            qc.invalidateQueries({ queryKey: ['billing-vouchers'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useDeleteVoucherBatch() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.delete(`${API}/vouchers/batches/${id}`).then(r => r.data?.data),
        onSuccess: () => {
            toast.success('Batch dihapus');
            qc.invalidateQueries({ queryKey: ['billing-voucher-batches'] });
            qc.invalidateQueries({ queryKey: ['billing-vouchers'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
export function useMarkBatchPrinted() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => apiClient.post(`${API}/vouchers/batches/${id}/mark-printed`).then(r => r.data?.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-vouchers'] }),
        onError: (e) => toast.error(handle(e)),
    });
}

// ─── Per-router settings ──────────────────────────────────────────────────
export function useBillingRouterSettings(routerId) {
    return useQuery({
        queryKey: ['billing-router-settings', routerId],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/settings/router/${routerId}`);
            return res.data?.data ?? null;
        },
    });
}
export function useUpdateBillingRouterSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ routerId, ...patch }) => apiClient.put(`${API}/settings/router/${routerId}`, patch).then(r => r.data?.data),
        onSuccess: (_, vars) => { toast.success('Setting tersimpan'); qc.invalidateQueries({ queryKey: ['billing-router-settings', vars.routerId] }); },
        onError: (e) => toast.error(handle(e)),
    });
}
