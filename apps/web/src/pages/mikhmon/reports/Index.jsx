import React, { useState, useMemo } from 'react';
import { BarChart3, RefreshCw, TrendingUp, Ticket, Wallet, CheckCircle2, Circle, ListChecks } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonReports, useMikhmonSalesLedger } from '@/hooks/useMikhmon';

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
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                <Icon className={clsx('w-3.5 h-3.5', color || 'text-slate-400')} />
                {label}
            </div>
            <div className={clsx('text-2xl font-bold tabular-nums', color || 'text-slate-200')}>{value}</div>
            {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

const PIE_COLORS = { unused: '#22d3ee', used: '#10b981', expired: '#f59e0b' };

export default function MikhmonReports() {
    const { selectedRouterId } = useMikhmonContext();
    const [presetDays, setPresetDays] = useState(30);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

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
                        <p className="text-xs text-slate-500">Voucher count + sales (Rp). Data live MikroTik + harga dari setting profile.</p>
                    </div>
                </div>
                <button
                    onClick={() => { refetch(); refetchLedger(); }}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
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
                                : 'border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-white/5',
                        )}
                    >
                        {p.label}
                    </button>
                ))}
                <span className="text-slate-700">|</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg px-2.5 py-1.5" />
                <span className="text-slate-500 text-xs">s/d</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg px-2.5 py-1.5" />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">Gagal ambil laporan.</div>
            )}

            {isPending ? (
                <div className="text-center text-slate-500 text-sm py-20">Memuat laporan…</div>
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
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Status Voucher</div>
                            {pieData.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-slate-500">Tidak ada data</div>
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
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Voucher per Hari
                                    <span className="ml-2 text-[10px] normal-case text-slate-600 font-normal">(klik bar untuk filter hari)</span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px]">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400" /><span className="text-slate-400">Count</span></span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-slate-400">Income</span></span>
                                </div>
                            </div>
                            {ledgerByDay.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-slate-500">Tidak ada data</div>
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
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Per Profile (urut by income)
                        </div>
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm min-w-[500px]">
                                <thead className="bg-slate-900/30 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="text-left px-4 py-2">Profile</th>
                                        <th className="text-right px-4 py-2">Voucher</th>
                                        <th className="text-right px-4 py-2">Income</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {r.by.length === 0 ? (
                                        <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500 text-xs">Belum ada data</td></tr>
                                    ) : r.by.map((p) => {
                                        // Cross-reference with ledger so income matches the
                                        // sold-only ledger view when both have data.
                                        const lp = ledger.countByProfile.find((x) => x.profile === p.profile);
                                        const income = lp?.income ?? p.income;
                                        return (
                                            <tr key={p.profile} className="hover:bg-slate-800/30">
                                                <td className="px-4 py-2 font-semibold text-slate-200">{p.profile}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-slate-300">{p.count}</td>
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
                        Total at top right = sum of all sold prices in range. */}
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-slate-500">
                                <ListChecks className="w-3.5 h-3.5" />
                                Laporan Penjualan ({ledger.entries.length})
                            </span>
                            <span className="flex items-center gap-3">
                                <span className="text-slate-500 normal-case font-normal">Total</span>
                                <span className="text-emerald-300 text-sm font-bold tabular-nums">{fmtRupiah(ledger.total)}</span>
                                {ledgerFetching && <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />}
                            </span>
                        </div>
                        <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className="bg-slate-900/30 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0">
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
                                    {ledger.entries.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                            Belum ada voucher terjual di rentang ini.
                                            <div className="text-[10px] mt-1 opacity-70">Ledger terisi otomatis saat voucher pertama kali login (on-login script).</div>
                                        </td></tr>
                                    ) : ledger.entries.map((e, idx) => (
                                        <tr key={e.scriptId || idx} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 text-right">{idx + 1}</td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-300">{e.date}</td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{e.time}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs text-slate-100">{e.username}</td>
                                            <td className="px-3 py-1.5">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 font-bold uppercase tracking-tight">
                                                    {e.profile || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400 max-w-[260px] truncate" title={e.comment}>{e.comment || ''}</td>
                                            <td className="px-3 py-1.5 font-mono text-xs text-right text-emerald-300">{fmtRupiah(e.price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </>
            )}
        </div>
    );
}
