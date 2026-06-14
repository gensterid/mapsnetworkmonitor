import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

const API = '/billing';

const handle = (err) => {
    const data = err?.response?.data;
    // Backend error middleware returns { error: { name, message, details: [{ path, message }] } }
    if (data?.error?.details?.length) {
        const detail = data.error.details[0];
        return `${detail.path}: ${detail.message}`;
    }
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    return err?.message || 'Operation failed';
};

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

// ─── Reports + WA (Phase D) ───────────────────────────────────────────────
export function useBillingOverview() {
    return useQuery({
        queryKey: ['billing-report-overview'],
        refetchInterval: 60_000,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/overview`);
            return res.data?.data ?? null;
        },
    });
}
export function useRevenueByMonth() {
    return useQuery({
        queryKey: ['billing-report-revenue-by-month'],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/revenue-by-month`);
            return res.data?.data ?? [];
        },
    });
}
export function useAgingReport() {
    return useQuery({
        queryKey: ['billing-report-aging'],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/aging`);
            return res.data?.data ?? [];
        },
    });
}
export function useTopPayers(months = 1, limit = 10) {
    return useQuery({
        queryKey: ['billing-report-top-payers', months, limit],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/top-payers?months=${months}&limit=${limit}`);
            return res.data?.data ?? [];
        },
    });
}
export function useVoucherSales(months = 1) {
    return useQuery({
        queryKey: ['billing-report-voucher-sales', months],
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/voucher-sales?months=${months}`);
            return res.data?.data ?? [];
        },
    });
}
export function useRecentPayments(limit = 20) {
    return useQuery({
        queryKey: ['billing-report-recent-payments', limit],
        refetchInterval: 60_000,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/reports/recent-payments?limit=${limit}`);
            return res.data?.data ?? [];
        },
    });
}
export function useWaLog(limit = 100) {
    return useQuery({
        queryKey: ['billing-wa-log', limit],
        refetchInterval: 30_000,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/wa-log?limit=${limit}`);
            return res.data?.data ?? [];
        },
    });
}
export function useWaTest() {
    return useMutation({
        mutationFn: ({ routerId, phone, message }) => apiClient.post(`${API}/wa-test`, { routerId, phone, message }).then(r => r.data?.data),
        onSuccess: (data) => {
            if (data?.ok) toast.success('Pesan WA terkirim');
            else toast.error(data?.error || 'Gagal mengirim WA');
        },
        onError: (e) => toast.error(handle(e)),
    });
}

// ─── MikroTik setup helpers (auto-detect / auto-create isolir) ────────────
export function useMikrotikPppProfiles(routerId) {
    return useQuery({
        queryKey: ['billing-ppp-profiles', routerId],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/mikrotik/${routerId}/ppp-profiles`);
            return res.data?.data ?? [];
        },
    });
}
export function useIsolirFirewallStatus(routerId, profile = 'pppoe-isolir') {
    return useQuery({
        queryKey: ['billing-isolir-status', routerId, profile],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/mikrotik/${routerId}/isolir-status?profile=${encodeURIComponent(profile)}`);
            return res.data?.data ?? null;
        },
    });
}
/**
 * Auto-create profile + firewall isolir. Idempotent: kalau sudah ada, hanya
 * isi yang missing. Return { profile: { created, name }, firewall: { ids } }.
 */
export function useSetupIsolirFirewall() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ routerId, ...body }) => apiClient.post(`${API}/mikrotik/${routerId}/isolir-setup`, body).then(r => r.data?.data),
        onSuccess: (data, vars) => {
            const created = data?.profile?.created;
            toast.success(created ? `Profile "${data.profile.name}" dibuat di MikroTik` : `Profile "${data.profile.name}" sudah ada — firewall di-update`);
            qc.invalidateQueries({ queryKey: ['billing-ppp-profiles', vars.routerId] });
            qc.invalidateQueries({ queryKey: ['billing-isolir-status', vars.routerId] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}
/** Alias yang dipakai SettingsTab — same as useSetupIsolirFirewall, distinct
 * keying biar invalidation konsisten saat operator buat profile manual. */
export function useCreatePppProfile() { return useSetupIsolirFirewall(); }

/**
 * Status master billing scheduler (1 entry yang scan semua /ppp secret).
 * Resilient mode: kalau server aplikasi down, MikroTik scheduler tetap jalan.
 */
export function useBillingSchedulerStatus(routerId) {
    return useQuery({
        queryKey: ['billing-scheduler-status', routerId],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/mikrotik/${routerId}/billing-scheduler-status`);
            return res.data?.data ?? null;
        },
    });
}
export function useSetupBillingScheduler() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ routerId, ...body }) => apiClient.post(`${API}/mikrotik/${routerId}/billing-scheduler-setup`, body).then(r => r.data?.data),
        onSuccess: (data, vars) => {
            toast.success(data?.replaced ? 'Scheduler diperbarui di router' : 'Scheduler dipasang di router');
            qc.invalidateQueries({ queryKey: ['billing-scheduler-status', vars.routerId] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}

/**
 * Audit comments PPP secret di router vs DB. Deteksi dn mismatch / due-vs-dn
 * inkonsistensi / orphan / missing-dn. Operator manual edit di winbox akan
 * ketahuan di sini.
 */
export function useCommentAudit(routerId) {
    return useQuery({
        queryKey: ['billing-comment-audit', routerId],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/mikrotik/${routerId}/audit-comments`);
            return res.data?.data ?? null;
        },
    });
}
export function useResyncComment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (subscriptionId) => apiClient.post(`${API}/subscriptions/${subscriptionId}/resync-comment`).then(r => r.data?.data),
        onSuccess: (_, subscriptionId) => {
            toast.success('Comment di-resync ke router');
            qc.invalidateQueries({ queryKey: ['billing-comment-audit'] });
            qc.invalidateQueries({ queryKey: ['billing-subscriptions'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}

/**
 * Composite create: customer + subscription dalam 1 transaction.
 * Dipakai oleh wizard Tambah Pelanggan di UI baru — operator tidak perlu
 * pindah tab untuk bikin keduanya.
 */
export function useCreateCustomerWithSubscription() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const res = await apiClient.post(`${API}/customer-with-subscription`, input);
            return res.data?.data;
        },
        onSuccess: () => {
            toast.success('Pelanggan + langganan tercatat');
            qc.invalidateQueries({ queryKey: ['billing-customers'] });
            qc.invalidateQueries({ queryKey: ['billing-subscriptions'] });
        },
        onError: (e) => toast.error(handle(e)),
    });
}

/**
 * List user MikroTik (PPPoE secret atau Hotspot user) yang BELUM ter-import
 * ke subscription/voucher di sistem. Untuk fitur "adopt existing".
 */
export function useImportCandidates(routerId, type = 'pppoe') {
    return useQuery({
        queryKey: ['billing-import-candidates', routerId, type],
        enabled: !!routerId,
        queryFn: async () => {
            const res = await apiClient.get(`${API}/mikrotik/${routerId}/import-candidates?type=${type}`);
            return res.data?.data ?? [];
        },
    });
}

// ─── Payment gateway (Phase E) ────────────────────────────────────────────
export function useCreatePaymentLink() {
    return useMutation({
        mutationFn: ({ id, gateway, returnUrl, options }) =>
            apiClient.post(`${API}/invoices/${id}/payment-link`, { gateway, returnUrl, options }).then(r => r.data?.data),
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
