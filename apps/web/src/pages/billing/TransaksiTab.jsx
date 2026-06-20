import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    CreditCard, RefreshCw, ChevronDown, ChevronRight, Search, Filter,
    ExternalLink, Copy, Receipt, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useRouters } from '@/hooks';

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const METHOD_LABEL = {
    manual: 'Manual',
    gateway_tripay: 'Tripay',
    gateway_midtrans: 'Midtrans',
    gateway_xendit: 'Xendit',
};

const METHOD_COLOR = {
    manual: 'bg-slate-500/20 text-slate-300',
    gateway_tripay: 'bg-purple-500/20 text-purple-300',
    gateway_midtrans: 'bg-emerald-500/20 text-emerald-300',
    gateway_xendit: 'bg-blue-500/20 text-blue-300',
};

const STATUS_COLOR = {
    paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function useTransactions(params) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && search.set(k, String(v)));
    return useQuery({
        queryKey: ['billing-transactions', params],
        queryFn: async () => {
            const res = await apiClient.get(`/billing/transactions?${search}`);
            return { rows: res.data?.data ?? [], total: res.data?.meta?.total ?? 0 };
        },
        refetchInterval: 30_000,
    });
}

function useTransactionsSummary() {
    return useQuery({
        queryKey: ['billing-transactions-summary'],
        queryFn: async () => {
            const res = await apiClient.get('/billing/transactions/summary');
            return res.data?.data;
        },
        refetchInterval: 30_000,
    });
}

export default function TransaksiTab() {
    const [method, setMethod] = useState('');
    const [status, setStatus] = useState('');
    const [routerFilter, setRouterFilter] = useState('');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const { data: routers = [] } = useRouters();
    const { data: txData, isLoading, refetch, isRefetching } = useTransactions({
        method, status, routerId: routerFilter, search,
        limit: 200,
    });
    const { data: summary } = useTransactionsSummary();

    const rows = txData?.rows || [];
    const total = txData?.total || 0;

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <StatCard label="Pendapatan (Paid)" value={fmtIDR(summary?.totalPaid ?? 0)} sub={`${summary?.countPaid ?? 0} transaksi`} tone="ok" />
                <StatCard label="Menunggu (Pending)" value={fmtIDR(summary?.totalPending ?? 0)} sub={`${summary?.countPending ?? 0} link belum bayar`} tone={summary?.countPending > 0 ? 'warn' : ''} />
                <StatCard label="Per Method"
                    children={
                        <div className="text-xs text-fg-muted space-y-0.5 mt-1">
                            {Object.entries(summary?.revenueByMethod || {}).slice(0, 4).map(([m, amt]) => (
                                <div key={m} className="flex justify-between gap-2">
                                    <span>{METHOD_LABEL[m] || m}</span>
                                    <span className="text-fg">{fmtIDR(amt)}</span>
                                </div>
                            ))}
                            {Object.keys(summary?.revenueByMethod || {}).length === 0 && <span className="italic">—</span>}
                        </div>
                    }
                />
                <StatCard label="Total Transaksi" value={String(total)} sub="setelah filter" />
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-primary" /> Daftar Transaksi
                        </CardTitle>
                        <Button size="sm" variant="outline" onClick={() => refetch()}>
                            <RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} />
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center text-xs mt-2">
                        <select value={method} onChange={e => setMethod(e.target.value)}
                            className="bg-surface-darker border border-slate-border rounded px-2 py-1.5 text-fg">
                            <option value="">Semua method</option>
                            <option value="manual">Manual</option>
                            <option value="gateway_tripay">Tripay</option>
                            <option value="gateway_midtrans">Midtrans</option>
                            <option value="gateway_xendit">Xendit</option>
                        </select>
                        <select value={status} onChange={e => setStatus(e.target.value)}
                            className="bg-surface-darker border border-slate-border rounded px-2 py-1.5 text-fg">
                            <option value="">Semua status</option>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                            <option value="failed">Failed</option>
                        </select>
                        <select value={routerFilter} onChange={e => setRouterFilter(e.target.value)}
                            className="bg-surface-darker border border-slate-border rounded px-2 py-1.5 text-fg">
                            <option value="">Semua router</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                        <div className="relative flex-1 min-w-[150px]">
                            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted" />
                            <input value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Cari nama / invoice / txn id..."
                                className="w-full bg-surface-darker border border-slate-border rounded pl-7 pr-2 py-1.5 text-fg" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> :
                     rows.length === 0 ? <div className="p-8 text-center text-fg-muted text-sm">Belum ada transaksi.</div> : (
                        <>
                            {/* Mobile card stack \xe2\x80\x94 visible < 768px */}
                            <div className="md:hidden p-2 space-y-2">
                                {rows.map(t => (
                                    <TransactionCardMobile
                                        key={t.id}
                                        tx={t}
                                        expanded={expandedId === t.id}
                                        onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                                    />
                                ))}
                            </div>

                            {/* Desktop table \xe2\x80\x94 visible \xe2\x89\xa5 768px */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-sm min-w-[800px]">
                                <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                    <tr>
                                        <th className="w-6"></th>
                                        <th className="text-left px-3 py-2">Waktu</th>
                                        <th className="text-left px-3 py-2">Customer</th>
                                        <th className="text-left px-3 py-2">Invoice</th>
                                        <th className="text-right px-3 py-2">Jumlah</th>
                                        <th className="text-left px-3 py-2">Method</th>
                                        <th className="text-left px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {rows.map(t => {
                                        const isOpen = expandedId === t.id;
                                        return (
                                            <React.Fragment key={t.id}>
                                                <tr className={clsx('hover:bg-slate-surface/30 cursor-pointer', isOpen && 'bg-slate-surface/40')}
                                                    onClick={() => setExpandedId(isOpen ? null : t.id)}>
                                                    <td className="px-1 py-2 text-fg-muted">
                                                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </td>
                                                    <td className="px-3 py-2 text-fg-muted text-xs">{fmtDateTime(t.recordedAt)}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="text-fg">{t.customerName || '—'}</div>
                                                        <div className="text-[10px] text-fg-muted">{t.customerPhone || ''}</div>
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-xs text-primary">{t.invoiceNumber}</td>
                                                    <td className="px-3 py-2 text-right text-fg font-medium">{fmtIDR(t.amount)}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={clsx('text-[10px] px-2 py-0.5 rounded uppercase font-semibold', METHOD_COLOR[t.method] || METHOD_COLOR.manual)}>
                                                            {METHOD_LABEL[t.method] || t.method}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={clsx('text-[10px] px-2 py-0.5 rounded uppercase font-semibold border', STATUS_COLOR[t.status])}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="bg-black/20">
                                                        <td colSpan={7} className="px-3 py-3">
                                                            <DetailRow tx={t} />
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * TransactionCardMobile \xe2\x80\x94 card layout untuk transaksi di viewport < 768px.
 * Show: time + customer + invoice + amount + method/status badge.
 * Tap card untuk expand DetailRow.
 */
function TransactionCardMobile({ tx, expanded, onToggle }) {
    return (
        <div className="bg-slate-surface/70 border border-slate-border rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="w-full text-left p-3 hover:bg-slate-surface/30 min-h-[44px]"
            >
                {/* Row 1: time + status badge */}
                <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] text-fg-muted font-mono">{fmtDateTime(tx.recordedAt)}</span>
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded uppercase font-bold border shrink-0', STATUS_COLOR[tx.status])}>
                        {tx.status}
                    </span>
                </div>

                {/* Row 2: customer + amount */}
                <div className="flex items-end justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-fg text-sm truncate font-medium">{tx.customerName || '\xe2\x80\x94'}</div>
                        {tx.customerPhone && (
                            <div className="text-[10px] text-fg-muted truncate">{tx.customerPhone}</div>
                        )}
                    </div>
                    <div className="text-fg font-mono font-bold shrink-0">{fmtIDR(tx.amount)}</div>
                </div>

                {/* Row 3: invoice + method */}
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-primary truncate">{tx.invoiceNumber}</span>
                    <span className={clsx('text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0', METHOD_COLOR[tx.method] || METHOD_COLOR.manual)}>
                        {METHOD_LABEL[tx.method] || tx.method}
                    </span>
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-3 pb-3 pt-1 bg-black/20 border-t border-slate-border">
                    <DetailRow tx={tx} />
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, sub, tone, children }) {
    const toneCls = tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-fg';
    return (
        <div className="rounded-lg border border-slate-border bg-surface-dark/40 p-3">
            <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider">{label}</div>
            {value && <div className={clsx('text-lg sm:text-xl font-bold mt-1', toneCls)}>{value}</div>}
            {sub && <div className="text-[11px] text-fg-muted mt-0.5">{sub}</div>}
            {children}
        </div>
    );
}

function DetailRow({ tx }) {
    const copy = (text, label) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} disalin`);
    };
    return (
        <div className="grid lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1.5">Detail Transaksi</div>
                <Field label="ID Transaksi"><code className="text-fg-muted">{tx.id}</code></Field>
                <Field label="Invoice"><span className="font-mono text-primary">{tx.invoiceNumber}</span></Field>
                <Field label="Router"><span className="text-fg">{tx.routerName || '—'}</span></Field>
                <Field label="Method"><span className="text-fg">{METHOD_LABEL[tx.method]}</span></Field>
                {tx.gatewayTxnId && (
                    <Field label="Gateway Txn">
                        <span className="font-mono text-fg break-all">{tx.gatewayTxnId}</span>
                        <button onClick={() => copy(tx.gatewayTxnId, 'Txn ID')} className="ml-1 text-fg-muted hover:text-fg"><Copy className="w-3 h-3 inline" /></button>
                    </Field>
                )}
                {tx.notes && <Field label="Catatan"><span className="text-fg-muted italic">{tx.notes}</span></Field>}
            </div>

            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1.5">Customer</div>
                <Field label="Nama"><span className="text-fg">{tx.customerName || '—'}</span></Field>
                <Field label="HP"><span className="text-fg">{tx.customerPhone || '—'}</span></Field>
                {tx.paymentUrl && (
                    <div className="pt-2 border-t border-slate-border/40">
                        <a href={tx.paymentUrl} target="_blank" rel="noopener noreferrer"
                            className="text-primary hover:underline text-xs flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Buka Halaman Bayar
                        </a>
                        <button onClick={() => copy(tx.paymentUrl, 'Link Bayar')}
                            className="text-fg-muted hover:text-fg text-[10px] mt-1 flex items-center gap-1">
                            <Copy className="w-3 h-3" /> Salin link
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[10px] uppercase text-fg-muted font-bold tracking-wider">Gateway Payload</span>
                    {tx.gatewayPayload && (
                        <button onClick={() => copy(JSON.stringify(tx.gatewayPayload, null, 2), 'Payload JSON')}
                            className="text-fg-muted hover:text-fg text-[10px] flex items-center gap-1">
                            <Copy className="w-3 h-3" /> Copy JSON
                        </button>
                    )}
                </div>
                {tx.gatewayPayload ? (
                    <pre className="text-[10px] font-mono text-fg-muted bg-surface-darker/60 border border-slate-border/40 rounded p-2 overflow-auto max-h-48">
                        {JSON.stringify(tx.gatewayPayload, null, 2)}
                    </pre>
                ) : (
                    <div className="text-fg-muted italic">Tidak ada payload (manual payment)</div>
                )}
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="text-fg-muted text-[10px] uppercase w-20 shrink-0">{label}</span>
            <span className="flex-1 min-w-0">{children}</span>
        </div>
    );
}
