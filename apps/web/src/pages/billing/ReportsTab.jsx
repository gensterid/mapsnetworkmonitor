import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import clsx from 'clsx';
import {
    useBillingOverview, useRevenueByMonth, useAgingReport,
    useTopPayers, useVoucherSales, useRecentPayments,
} from '@/hooks';
import { fmtIDR, fmtDate } from './helpers';

// ─── Reports tab ───────────────────────────────────────────────────────────
export default function ReportsTab() {
    const { data: ov } = useBillingOverview();
    const { data: rev = [] } = useRevenueByMonth();
    const { data: aging = [] } = useAgingReport();
    const { data: top = [] } = useTopPayers(1, 10);
    const { data: vs = [] } = useVoucherSales(1);
    const { data: payments = [] } = useRecentPayments(20);

    const maxRev = useMemo(() => Math.max(1, ...rev.map(r => Number(r.revenue) || 0)), [rev]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Pelanggan Aktif</div>
                    <div className="text-2xl font-bold text-fg">{ov?.active_customers ?? '—'}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Subscription Aktif</div>
                    <div className="text-2xl font-bold text-emerald-400">{ov?.active_subscriptions ?? '—'}</div>
                    <div className="text-xs text-fg-muted mt-1">Isolir: {ov?.isolir_subscriptions ?? '—'}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Pendapatan Bulan Ini</div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono">{fmtIDR(ov?.revenue_this_month)}</div>
                    <div className="text-xs text-fg-muted mt-1">Bulan lalu: {fmtIDR(ov?.revenue_last_month)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Piutang (Outstanding)</div>
                    <div className="text-2xl font-bold text-amber-400 font-mono">{fmtIDR(ov?.receivables_total)}</div>
                    <div className="text-xs text-fg-muted mt-1">Unpaid: {ov?.unpaid_invoices ?? 0} • Overdue: {ov?.overdue_invoices ?? 0}</div>
                </CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-base">Tren Pendapatan (12 bulan)</CardTitle></CardHeader>
                <CardContent>
                    {rev.length === 0 ? <div className="text-center text-fg-muted py-6">Belum ada data</div> : (
                        <div className="space-y-2">
                            {rev.map(r => {
                                const pct = ((Number(r.revenue) || 0) / maxRev) * 100;
                                return (
                                    <div key={r.month} className="flex items-center gap-3 text-sm">
                                        <div className="w-20 text-fg-muted text-xs font-mono">{r.month}</div>
                                        <div className="flex-1 h-6 bg-slate-surface rounded overflow-hidden relative">
                                            <div className="h-full bg-gradient-to-r from-emerald-500/40 to-emerald-500/80" style={{ width: `${pct}%` }} />
                                            <div className="absolute inset-0 flex items-center justify-end pr-2 text-xs text-fg font-mono">{fmtIDR(r.revenue)}</div>
                                        </div>
                                        <div className="w-12 text-right text-xs text-fg-muted">{r.invoices}x</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle className="text-base">Aging (Piutang per umur)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Bucket</th><th className="text-right px-4 py-2">Tagihan</th><th className="text-right px-4 py-2">Jumlah</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {aging.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Tidak ada piutang</td></tr> : aging.map((a, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{a.bucket === 'current' ? 'Belum jatuh tempo' : `${a.bucket} hari`}</td>
                                        <td className="px-4 py-2 text-right text-fg">{a.invoices}</td>
                                        <td className="px-4 py-2 text-right text-amber-400 font-mono">{fmtIDR(a.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Top 10 Pelanggan (1 bulan)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Pelanggan</th><th className="text-right px-4 py-2">Tagihan</th><th className="text-right px-4 py-2">Total</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {top.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : top.map((t, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{t.name} <span className="text-xs text-fg-muted font-mono">{t.code}</span></td>
                                        <td className="px-4 py-2 text-right text-fg">{t.invoices_paid}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(t.total_paid)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle className="text-base">Penjualan Voucher per Paket (1 bulan)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Paket</th><th className="text-right px-4 py-2">Jumlah</th><th className="text-right px-4 py-2">Pendapatan</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {vs.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : vs.map((v, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{v.package_name}</td>
                                        <td className="px-4 py-2 text-right text-fg">{v.vouchers_sold}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(v.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Pembayaran Terbaru</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Tanggal</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">Invoice</th><th className="text-right px-4 py-2">Jumlah</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {payments.length === 0 ? <tr><td colSpan={4} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : payments.map((p, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(p.recorded_at)}</td>
                                        <td className="px-4 py-2 text-fg">{p.customer_name}</td>
                                        <td className="px-4 py-2 font-mono text-blue-400 text-xs">{p.invoice_number}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(p.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ─── WA Notifications tab ──────────────────────────────────────────────────
