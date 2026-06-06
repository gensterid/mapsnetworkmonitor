import React, { useState, useMemo } from 'react';
import { BarChart3, RefreshCw, TrendingUp, Ticket, Wallet, CheckCircle2, Circle } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonReports } from '@/hooks/useMikhmon';

/**
 * MikHMON-equivalent Reports page.
 *
 * Aggregates voucher data LIVE from MikroTik (filtered by MikHMON v3
 * comment regex), joins with per-profile prices stored in
 * mikhmon_profile_settings, and renders:
 *  - 4 summary stat cards: total / unused / used / income
 *  - Status breakdown pie
 *  - Daily generated chart (count + income overlay)
 *  - Per-profile table sorted by income
 *
 * Date range defaults to last 30 days; operator can override.
 */

const RANGE_PRESETS = [
    { label: 'Hari ini', days: 0 },
    { label: '7 hari', days: 7 },
    { label: '30 hari', days: 30 },
    { label: '90 hari', days: 90 },
    { label: 'Semua', days: null },
];

function ymd(d) {
    return new Date(d).toISOString().slice(0, 10);
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
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - presetDays);
        return { from: ymd(from), to: ymd(to) };
    }, [presetDays, customFrom, customTo]);

    const { data, isPending, isError, refetch, isFetching } = useMikhmonReports(selectedRouterId, range);
    const r = data || { total: 0, unused: 0, used: 0, expired: 0, income: 0, by: [], byDay: [] };

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
                    onClick={() => refetch()}
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
                        <StatCard icon={Wallet} label="Income" value={fmtRupiah(r.income)} color="text-emerald-300" />
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
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Voucher per Hari</div>
                                <div className="flex items-center gap-3 text-[10px]">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400" /><span className="text-slate-400">Count</span></span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /><span className="text-slate-400">Income</span></span>
                                </div>
                            </div>
                            {r.byDay.length === 0 ? (
                                <div className="h-56 flex items-center justify-center text-xs text-slate-500">Tidak ada data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={r.byDay}>
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
                                    ) : r.by.map((p) => (
                                        <tr key={p.profile} className="hover:bg-slate-800/30">
                                            <td className="px-4 py-2 font-semibold text-slate-200">{p.profile}</td>
                                            <td className="px-4 py-2 text-right font-mono text-xs text-slate-300">{p.count}</td>
                                            <td className="px-4 py-2 text-right font-mono text-xs text-emerald-300">{fmtRupiah(p.income)}</td>
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
