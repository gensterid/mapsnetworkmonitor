import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BarChart3, Users, AlertCircle, TrendingUp, Coins, Ticket, RefreshCw,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';
import { get } from '@/lib/api';

/**
 * MikHMON Reports — tenant-wide billing/voucher reports.
 *
 * Reuses the existing /api/billing/reports/* endpoints (no MikHMON-
 * specific reporting layer needed). Reports are tenant-scoped, not
 * router-scoped, so this page doesn't depend on the MikHMON router
 * selector. Keeps the surface focused on what an operator wants in
 * a MikHMON workflow: overview KPIs, revenue trend, voucher sales,
 * recent payments. For the full Billing report set (aging, top
 * payers, etc.) use the Billing tab.
 */

function fmtIDR(n) {
    const v = parseFloat(n || 0);
    if (!v) return 'Rp 0';
    return 'Rp ' + Math.round(v).toLocaleString('id-ID');
}

function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function useOverview() {
    return useQuery({
        queryKey: ['mikhmon', 'billing-reports', 'overview'],
        queryFn: () => get('/billing/reports/overview'),
        staleTime: 30 * 1000,
    });
}
function useRevenue() {
    return useQuery({
        queryKey: ['mikhmon', 'billing-reports', 'revenue'],
        queryFn: () => get('/billing/reports/revenue-by-month'),
        staleTime: 60 * 1000,
    });
}
function useVoucherSales() {
    return useQuery({
        queryKey: ['mikhmon', 'billing-reports', 'voucher-sales'],
        queryFn: () => get('/billing/reports/voucher-sales?months=1'),
        staleTime: 60 * 1000,
    });
}
function useRecentPayments() {
    return useQuery({
        queryKey: ['mikhmon', 'billing-reports', 'recent-payments'],
        queryFn: () => get('/billing/reports/recent-payments?limit=15'),
        staleTime: 30 * 1000,
    });
}

function StatTile({ icon: Icon, label, value, hint, color = 'text-slate-200' }) {
    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
            <div className={clsx('text-2xl font-bold tabular-nums', color)}>{value}</div>
            {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

export default function Reports() {
    const overview = useOverview();
    const revenue = useRevenue();
    const voucherSales = useVoucherSales();
    const recentPayments = useRecentPayments();

    const ov = overview.data || {};
    const revenueData = useReshapedRevenue(revenue.data);
    const vsData = voucherSales.data || [];
    const paymentsData = recentPayments.data || [];

    const isLoading = overview.isPending && revenue.isPending && voucherSales.isPending;

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Billing Reports</h1>
                        <p className="text-xs text-slate-500">Ringkasan revenue, voucher sales, dan pembayaran terbaru (tenant-wide).</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        overview.refetch();
                        revenue.refetch();
                        voucherSales.refetch();
                        recentPayments.refetch();
                    }}
                    disabled={isLoading}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh"
                >
                    <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
                </button>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                    icon={Users}
                    label="Active Customers"
                    value={ov.active_customers ?? '—'}
                    hint={`${ov.active_subscriptions ?? 0} active sub`}
                    color="text-emerald-300"
                />
                <StatTile
                    icon={AlertCircle}
                    label="Isolir / Overdue"
                    value={`${ov.isolir_subscriptions ?? 0} / ${ov.overdue_invoices ?? 0}`}
                    hint={`${ov.unpaid_invoices ?? 0} unpaid`}
                    color={(ov.isolir_subscriptions || ov.overdue_invoices) ? 'text-red-300' : 'text-slate-200'}
                />
                <StatTile
                    icon={Coins}
                    label="Receivables"
                    value={fmtIDR(ov.receivables_total)}
                    hint="unpaid + overdue"
                    color="text-amber-300"
                />
                <StatTile
                    icon={TrendingUp}
                    label="Revenue MTD"
                    value={fmtIDR(ov.revenue_this_month)}
                    hint={`bulan lalu: ${fmtIDR(ov.revenue_last_month)}`}
                    color="text-emerald-300"
                />
            </div>

            {/* Revenue chart */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Revenue 12 Bulan
                    </h2>
                    {revenue.isPending && <span className="text-[10px] text-slate-500">memuat…</span>}
                </div>
                {revenueData.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-xs text-slate-500">
                        Belum ada data revenue.
                    </div>
                ) : (
                    <div className="h-56 -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={revenueData}>
                                <defs>
                                    <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" />
                                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" tickFormatter={(v) => fmtIDR(v).replace('Rp ', '')} width={75} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                                    formatter={(v) => fmtIDR(v)}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#22d3ee" fill="url(#rv)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* Voucher sales + Recent payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                        <Ticket className="w-3.5 h-3.5" />
                        Voucher Sales (30 hari)
                    </h2>
                    {vsData.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">Belum ada penjualan voucher.</div>
                    ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                            {vsData.map((row, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/40 last:border-0">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-200 truncate">{row.package_name || row.packageName || '—'}</div>
                                        <div className="text-[10px] text-slate-500">{row.count ?? row.invoices ?? 0} voucher</div>
                                    </div>
                                    <div className="text-sm font-mono text-emerald-300 shrink-0">{fmtIDR(row.revenue)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                        <Coins className="w-3.5 h-3.5" />
                        Pembayaran Terbaru
                    </h2>
                    {paymentsData.length === 0 ? (
                        <div className="text-xs text-slate-500 py-6 text-center">Belum ada pembayaran tercatat.</div>
                    ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                            {paymentsData.map((p, i) => (
                                <div key={p.id || i} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/40 last:border-0">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold text-slate-200 truncate">{p.customer_name || p.customerName || p.invoice_number || p.invoiceNumber || '—'}</div>
                                        <div className="text-[10px] text-slate-500">{fmtDate(p.paid_at || p.paidAt)} · {p.method || p.gateway || 'manual'}</div>
                                    </div>
                                    <div className="text-sm font-mono text-emerald-300 shrink-0">{fmtIDR(p.amount)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="text-xs text-slate-600 italic">
                Untuk laporan lengkap (aging, top-payers, dll) buka tab <span className="font-bold text-slate-400">Billing → Laporan</span>.
            </div>
        </div>
    );
}

function useReshapedRevenue(raw) {
    // Backend returns Drizzle exec result — may be wrapped { rows: [...] }
    // or a direct array depending on the driver. Normalize both.
    const rows = Array.isArray(raw) ? raw : (raw?.rows || []);
    return rows.map((r) => ({
        month: String(r.month || '').slice(5), // YYYY-MM → MM
        revenue: parseFloat(r.revenue || 0),
    }));
}
