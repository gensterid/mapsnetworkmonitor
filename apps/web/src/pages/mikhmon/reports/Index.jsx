import React, { useState, useMemo } from 'react';
import { BarChart3, RefreshCw, TrendingUp, Ticket, Wallet, CheckCircle2, Circle, ListChecks, Download, Printer, BarChart2, Trash2, Search } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonReports, useMikhmonSalesLedger, useDeleteMikhmonLedger } from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-equivalent Reports page.
 *
 * Two complementary data sources:
 *  1. `useMikhmonReports` — computed aggregate from live /ip/hotspot/user
 *     list (all vouchers, used + unused). Drives stat cards + charts +
 *     per-profile table.
 *  2. `useMikhmonSalesLedger` — read from /system/script/print where
 *     comment="mikhmon". This is the canonical sales ledger MikHMON v3
 *     external also uses. Drives the "Laporan Penjualan" table at the
 *     bottom — one row per voucher FIRST LOGIN (= sold).
 *
 * The ledger is authoritative for income. A voucher only enters the
 * ledger when its first session triggers our on-login script, which
 * writes a /system script entry with name encoding the transaction:
 *   <date>-<time>-<user>-<price>-<ip>-<mac>-<validity>-<profile>-<comment>
 */

// Preset semantics:
//   days: number  → last N days back from today
//   days: 0       → today only
//   days: null    → no filter (all data)
//   days: 'month' → current calendar month (1st → last day)
const RANGE_PRESETS = [
    { label: 'Hari ini', days: 0 },
    { label: '7 hari', days: 7 },
    { label: '30 hari', days: 30 },
    { label: 'Bulan ini', days: 'month' },
    { label: 'Semua', days: null },
];

// ymd returns "YYYY-MM-DD" in the USER'S LOCAL timezone. toISOString()
// would round-trip via UTC and shift the date for browsers east/west of
// UTC (e.g. WIB +7 turns 2026-06-01 00:00 local into 2026-05-31 17:00 UTC,
// and toISOString().slice(0,10) gives "2026-05-31" — off by one day).
function ymd(d) {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmtRupiah(n) {
    const v = Number(n) || 0;
    return 'Rp ' + v.toLocaleString('id-ID');
}

function StatCard({ icon: Icon, label, value, color, hint }) {
    return (
        <div className="rounded-xl border p-4 bg-slate-900/50 border-slate-800">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-fg-muted mb-2">
                <Icon className={clsx('w-3.5 h-3.5', color || 'text-fg-muted')} />
                {label}
            </div>
            <div className={clsx('text-2xl font-bold tabular-nums', color || 'text-slate-200')}>{value}</div>
            {hint && <div className="text-[10px] text-fg-muted mt-1">{hint}</div>}
        </div>
    );
}

const PIE_COLORS = { unused: '#22d3ee', used: '#10b981', expired: '#f59e0b' };

// MikHMON external default scope is current-month — matches that.
const DEFAULT_PRESET = 'month';

const MONTHS_LC = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function ownerFromRange(range) {
    if (!range?.from || !range?.to) return null;
    const f = new Date(range.from);
    const t = new Date(range.to);
    if (f.getFullYear() !== t.getFullYear() || f.getMonth() !== t.getMonth()) return null;
    return `${MONTHS_LC[f.getMonth()]}${f.getFullYear()}`;
}

export default function MikhmonReports() {
    const { selectedRouterId } = useMikhmonContext();
    const [presetDays, setPresetDays] = useState(DEFAULT_PRESET);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [search, setSearch] = useState('');
    const [showRingkasan, setShowRingkasan] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(null);
    const deleteLedger = useDeleteMikhmonLedger(selectedRouterId);

    const range = useMemo(() => {
        if (customFrom && customTo) return { from: customFrom, to: customTo };
        if (presetDays === null) return {};
        if (presetDays === 0) {
            const today = ymd(new Date());
            return { from: today, to: today };
        }
        if (presetDays === 'month') {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { from: ymd(first), to: ymd(last) };
        }
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - presetDays);
        return { from: ymd(from), to: ymd(to) };
    }, [presetDays, customFrom, customTo]);

    const { data, isPending, isError, refetch, isFetching } = useMikhmonReports(selectedRouterId, range);
    const r = data || { total: 0, unused: 0, used: 0, expired: 0, income: 0, by: [], byDay: [] };

    // Sales ledger from /system script — MikHMON v3 reference behavior.
    // Same date range applied so the table aligns with the charts above.
    // Note: lib/api.get() already unwraps the { data: ... } response envelope,
    // so the hook returns the SalesReport object directly — no second .data lookup.
    const { data: ledger = { entries: [], total: 0, countByProfile: [] }, isFetching: ledgerFetching, refetch: refetchLedger } = useMikhmonSalesLedger(
        selectedRouterId,
        range,
    );

    // Build per-day buckets from the ledger so the chart matches the
    // Laporan Penjualan rows. Previously the chart used computeReports'
    // byDay which only counts CURRENT /ip/hotspot/user vouchers — used
    // and removed vouchers were missing, so days with high turnover
    // showed as gaps. Using ledger gives every day with at least one
    // sold voucher.
    const ledgerByDay = useMemo(() => {
        const map = new Map();
        for (const e of ledger.entries) {
            // entry.date is "mmm/dd/yyyy" (e.g. "jun/08/2026"); convert to
            // ISO "YYYY-MM-DD" for sortable x-axis labels.
            const m = /^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i.exec(String(e.date || ''));
            if (!m) continue;
            const moIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].toLowerCase());
            if (moIdx < 0) continue;
            const day = `${m[3]}-${String(moIdx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
            const cur = map.get(day) || { date: day, count: 0, income: 0 };
            cur.count += 1;
            cur.income += Number(e.price) || 0;
            map.set(day, cur);
        }
        return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [ledger.entries]);

    // Bar-click handler — sets the custom date range to the clicked day
    // so the table + cards narrow to that single day's sales. Click again
    // on the same day's button row (or pick a preset) to clear.
    const handleBarClick = (e) => {
        const day = e?.activePayload?.[0]?.payload?.date;
        if (day) {
            setPresetDays(null);
            setCustomFrom(day);
            setCustomTo(day);
        }
    };

    // Search box filters the Laporan Penjualan rows in-memory (not a refetch).
    // Operator scans for a specific username or note without changing the date range.
    const entriesFiltered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return ledger.entries;
        return ledger.entries.filter((e) =>
            String(e.username || '').toLowerCase().includes(q) ||
            String(e.profile || '').toLowerCase().includes(q) ||
            String(e.comment || '').toLowerCase().includes(q),
        );
    }, [ledger.entries, search]);

    // CSV export — same columns as the table.
    const handleExportCSV = () => {
        if (entriesFiltered.length === 0) {
            toast.error('Tidak ada data untuk diekspor');
            return;
        }
        const header = ['No', 'Tanggal', 'Waktu', 'Username', 'Profil', 'Komentar', 'Harga'];
        const rows = entriesFiltered.map((e, i) => [
            i + 1, e.date, e.time, e.username, e.profile, e.comment, e.price,
        ]);
        const escape = (s) => {
            const v = String(s ?? '');
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        };
        const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ownerTag = ownerFromRange(range) || ymd(new Date());
        a.href = url;
        a.download = `laporan-penjualan-${ownerTag}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Diekspor ${entriesFiltered.length} baris`);
    };

    // Cetak — open print window with the visible entries formatted as a
    // clean table (one big page, monospace, ready to send to a printer).
    const handlePrint = () => {
        if (entriesFiltered.length === 0) {
            toast.error('Tidak ada data untuk dicetak');
            return;
        }
        const ownerTag = ownerFromRange(range);
        const title = ownerTag
            ? `Laporan Penjualan ${ownerTag}`
            : `Laporan Penjualan ${range.from || ''} s/d ${range.to || ''}`;
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        const rowsHtml = entriesFiltered.map((e, i) => `
            <tr>
                <td style="text-align:right">${i + 1}</td>
                <td>${e.date}</td>
                <td>${e.time}</td>
                <td>${e.username}</td>
                <td>${e.profile}</td>
                <td>${e.comment || ''}</td>
                <td style="text-align:right">${fmtRupiah(e.price)}</td>
            </tr>
        `).join('');
        w.document.write(`<!doctype html>
<html><head><title>${title}</title>
<style>
    @page { margin: 12mm; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; color: #000; }
    h1 { font-size: 14px; margin: 0 0 8px; }
    .total { font-size: 12px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; }
    th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; }
</style></head>
<body>
    <h1>${title}</h1>
    <div class="total"><strong>Total:</strong> ${fmtRupiah(ledger.total)} (${entriesFiltered.length} voucher)</div>
    <table>
        <thead><tr>
            <th>No</th><th>Tanggal</th><th>Waktu</th><th>Username</th><th>Profil</th><th>Komentar</th><th>Harga</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>
    <script>setTimeout(() => window.print(), 200);</script>
</body></html>`);
        w.document.close();
    };

    // Owner button label like "Hapus jun2026" — only enabled when the
    // range falls in a single month (otherwise no clean bucket to delete).
    const ownerFilter = ownerFromRange(range);
    const handleDeleteConfirmed = () => {
        if (!ownerFilter) return;
        deleteLedger.mutate(ownerFilter, {
            onSuccess: (resp) => {
                toast.success(`${resp?.data?.removed ?? 0} entries dihapus`);
                setConfirmingDelete(null);
                refetchLedger();
            },
            onError: (e) => toast.error(e?.response?.data?.message || 'Gagal hapus data'),
        });
    };

    const pieData = [
        { name: 'unused', value: r.unused, color: PIE_COLORS.unused },
        { name: 'used', value: r.used, color: PIE_COLORS.used },
        { name: 'expired', value: r.expired, color: PIE_COLORS.expired },
    ].filter((d) => d.value > 0);

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Laporan MikHMON</h1>
                        <p className="text-xs text-fg-muted">Voucher count + sales (Rp). Data live MikroTik + harga dari setting profile.</p>
                    </div>
                </div>
                <button
                    onClick={() => { refetch(); refetchLedger(); }}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh"
                >
                    <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {RANGE_PRESETS.map((p) => (
                    <button
                        key={p.label}
                        onClick={() => { setPresetDays(p.days); setCustomFrom(''); setCustomTo(''); }}
                        className={clsx(
                            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                            presetDays === p.days && !customFrom
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'border-slate-700/50 text-fg-muted hover:text-slate-200 hover:bg-white/5',
                        )}
                    >
                        {p.label}
                    </button>
                ))}
                <span className="text-slate-700">|</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg px-2.5 py-1.5" />
                <span className="text-fg-muted text-xs">s/d</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg px-2.5 py-1.5" />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">Gagal ambil laporan.</div>
            )}

            {isPending ? (
                <div className="text-center text-fg-muted text-sm py-20">Memuat laporan…</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard icon={Ticket} label="Total Voucher" value={r.total} color="text-slate-100" />
                        <StatCard icon={Circle} label="Unused" value={r.unused} color="text-cyan-300" />
                        <StatCard icon={CheckCircle2} label="Used + Expired" value={r.used + r.expired} color="text-emerald-300" hint={`${r.used} aktif · ${r.expired} expired`} />
                        <StatCard icon={Wallet} label="Income" value={fmtRupiah(ledger.total || r.income)} color="text-emerald-300" hint={ledger.entries.length > 0 ? `${ledger.entries.length} voucher terjual` : undefined} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-fg-muted mb-3">Status Voucher</div>
                            {pieData.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-fg-muted">Tidak ada data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 lg:col-span-2">
                            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                <div className="text-xs font-bold uppercase tracking-wider text-fg-muted min-w-0">
                                    Voucher per Hari
                                    <span className="ml-2 text-[10px] normal-case text-slate-600 font-normal hidden sm:inline">(klik bar untuk filter hari)</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] shrink-0">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400" /><span className="text-fg-muted">Count</span></span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-fg-muted">Income</span></span>
                                </div>
                            </div>
                            {ledgerByDay.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-fg-muted">Tidak ada data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={ledgerByDay} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" />
                                        <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} formatter={(v, n) => n === 'income' ? fmtRupiah(v) : v} />
                                        <Bar yAxisId="left" dataKey="count" fill="#22d3ee" />
                                        <Bar yAxisId="right" dataKey="income" fill="#10b981" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider text-fg-muted flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Per Profile (urut by income)
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm min-w-[500px]">
                                <thead className="bg-slate-900/30 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                    <tr>
                                        <th className="text-left px-4 py-2">Profile</th>
                                        <th className="text-right px-4 py-2">Voucher</th>
                                        <th className="text-right px-4 py-2">Income</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {r.by.length === 0 ? (
                                        <tr><td colSpan={3} className="px-4 py-8 text-center text-fg-muted text-xs">Belum ada data</td></tr>
                                    ) : r.by.map((p) => {
                                        // Cross-reference with ledger so income matches the
                                        // sold-only ledger view when both have data.
                                        const lp = ledger.countByProfile.find((x) => x.profile === p.profile);
                                        const income = lp?.income ?? p.income;
                                        return (
                                            <tr key={p.profile} className="hover:bg-slate-800/30">
                                                <td className="px-4 py-2 font-semibold text-slate-200">{p.profile}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-fg">{p.count}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-emerald-300">{fmtRupiah(income)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Laporan Penjualan — sourced from /system script ledger.
                        Mirrors MikHMON external "Laporan Penjualan" tab exactly:
                        only sold vouchers (first login fired), columns match
                        MikHMON's № Tanggal Waktu Username Profil Komentar Harga.
                        Total at top right = sum of all sold prices in range.
                        Toolbar mirrors MikHMON external: Search · CSV · Ringkasan ·
                        Cetak · Hapus data <owner>. */}
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-2 flex-wrap">
                            <span className="flex items-center gap-2 text-fg-muted">
                                <ListChecks className="w-3.5 h-3.5" />
                                Laporan Penjualan ({entriesFiltered.length}{entriesFiltered.length !== ledger.entries.length && ` / ${ledger.entries.length}`})
                            </span>
                            <span className="flex items-center gap-3">
                                <span className="text-fg-muted normal-case font-normal">Total</span>
                                <span className="text-emerald-300 text-sm font-bold tabular-nums">{fmtRupiah(ledger.total)}</span>
                                {ledgerFetching && <RefreshCw className="w-3 h-3 animate-spin text-fg-muted" />}
                            </span>
                        </div>

                        {/* Toolbar — Search + action buttons */}
                        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-900/30 flex items-center gap-2 flex-wrap">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="w-3.5 h-3.5 text-fg-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Cari username / profil / komentar…"
                                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </div>
                            <button
                                onClick={handleExportCSV}
                                disabled={entriesFiltered.length === 0}
                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-fg hover:bg-white/5 disabled:opacity-40 normal-case"
                                title="Download CSV"
                            >
                                <Download className="w-3.5 h-3.5" /> CSV
                            </button>
                            <button
                                onClick={() => setShowRingkasan(true)}
                                disabled={ledgerByDay.length === 0}
                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-fg hover:bg-white/5 disabled:opacity-40 normal-case"
                                title="Ringkasan per hari"
                            >
                                <BarChart2 className="w-3.5 h-3.5" /> Ringkasan
                            </button>
                            <button
                                onClick={handlePrint}
                                disabled={entriesFiltered.length === 0}
                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700/60 text-fg hover:bg-white/5 disabled:opacity-40 normal-case"
                                title="Cetak laporan"
                            >
                                <Printer className="w-3.5 h-3.5" /> Cetak
                            </button>
                            <button
                                onClick={() => setConfirmingDelete({ owner: ownerFilter, count: ledger.entries.length })}
                                disabled={!ownerFilter || ledger.entries.length === 0}
                                className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-40 normal-case"
                                title={ownerFilter ? `Hapus seluruh ledger ${ownerFilter}` : 'Hanya tersedia untuk rentang 1 bulan'}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {ownerFilter ? `Hapus data ${ownerFilter}` : 'Hapus data'}
                            </button>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className="bg-slate-900/30 text-[10px] font-bold uppercase tracking-wider text-fg-muted sticky top-0">
                                    <tr>
                                        <th className="text-right px-3 py-2 w-12">№</th>
                                        <th className="text-left px-3 py-2">Tanggal</th>
                                        <th className="text-left px-3 py-2">Waktu</th>
                                        <th className="text-left px-3 py-2">Username</th>
                                        <th className="text-left px-3 py-2">Profil</th>
                                        <th className="text-left px-3 py-2">Komentar</th>
                                        <th className="text-right px-3 py-2">Harga</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {entriesFiltered.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted text-xs">
                                            {ledger.entries.length === 0 ? (
                                                <>
                                                    Belum ada voucher terjual di rentang ini.
                                                    <div className="text-[10px] mt-1 opacity-70">Ledger terisi otomatis saat voucher pertama kali login (on-login script).</div>
                                                </>
                                            ) : (
                                                <>Tidak ada baris cocok pencarian.</>
                                            )}
                                        </td></tr>
                                    ) : entriesFiltered.map((e, idx) => (
                                        <tr key={e.scriptId || idx} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted text-right">{idx + 1}</td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-fg">{e.date}</td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted">{e.time}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs text-slate-100">{e.username}</td>
                                            <td className="px-3 py-1.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 font-bold uppercase tracking-tight">
                                                    {e.profile || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted max-w-[260px] truncate" title={e.comment}>{e.comment || ''}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs text-right text-emerald-300">{fmtRupiah(e.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </>
            )}

            {/* Ringkasan — daily breakdown table popped from chart data. */}
            <Modal
                isOpen={showRingkasan}
                onClose={() => setShowRingkasan(false)}
                title={`Ringkasan ${ownerFilter ? ownerFilter : (range.from || '') + ' s/d ' + (range.to || '')}`}
                maxWidth="max-w-xl"
            >
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-fg-muted">Total Voucher Terjual</span>
                        <span className="font-bold text-slate-100">{ledger.entries.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-b border-slate-800 pb-3">
                        <span className="text-fg-muted">Total Pendapatan</span>
                        <span className="font-bold text-emerald-300 tabular-nums">{fmtRupiah(ledger.total)}</span>
                    </div>
                    <div className="overflow-y-auto max-h-[400px] custom-scrollbar">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/30 text-[10px] font-bold uppercase tracking-wider text-fg-muted sticky top-0">
                                <tr>
                                    <th className="text-left px-3 py-2">Tanggal</th>
                                    <th className="text-right px-3 py-2">Voucher</th>
                                    <th className="text-right px-3 py-2">Pendapatan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {ledgerByDay.length === 0 ? (
                                    <tr><td colSpan={3} className="px-3 py-6 text-center text-fg-muted text-xs">Tidak ada data</td></tr>
                                ) : ledgerByDay.map((d) => (
                                    <tr key={d.date} className="hover:bg-slate-800/30">
                                        <td className="px-3 py-1.5 font-mono text-[11px] text-fg">{d.date}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-xs text-fg">{d.count}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-xs text-emerald-300">{fmtRupiah(d.income)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <DeleteConfirmationModal
                isOpen={!!confirmingDelete}
                onClose={() => setConfirmingDelete(null)}
                onConfirm={handleDeleteConfirmed}
                title={`Hapus Data Ledger ${confirmingDelete?.owner || ''}`}
                message={`Anda akan menghapus ${confirmingDelete?.count ?? 0} entri ledger dari /system script untuk bulan ${confirmingDelete?.owner || ''}. Voucher di /ip/hotspot/user TIDAK ikut terhapus — hanya history Reports yang hilang. Operasi tidak bisa di-undo.`}
                itemName={confirmingDelete?.owner || ''}
                confirmText="Hapus Permanent"
                isDeleting={deleteLedger.isPending}
            />
        </div>
    );
}
