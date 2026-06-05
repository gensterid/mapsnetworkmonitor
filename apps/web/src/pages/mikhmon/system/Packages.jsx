import React, { useMemo, useState } from 'react';
import { Server, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useSystemPackages } from '@/hooks/useMikhmon';

export default function SystemPackages() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useSystemPackages(selectedRouterId);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.version || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Server className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">RouterOS Packages</h1>
                        <p className="text-xs text-slate-500">Package terinstall di router · read-only.</p>
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

            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name atau version…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil package list.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Version</th>
                                <th className="text-left px-4 py-2.5">Build Time</th>
                                <th className="text-left px-4 py-2.5">Scheduled</th>
                                <th className="text-left px-4 py-2.5">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum bisa baca package list.' : 'Tidak ada package cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => (
                                <tr key={p.id} className={clsx('hover:bg-slate-800/30 transition-colors', p.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{p.name}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.version || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{p.buildTime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{p.scheduled || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5">
                                        {p.disabled ? (
                                            <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border bg-slate-500/15 text-slate-400 border-slate-500/30">disabled</span>
                                        ) : (
                                            <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">active</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/30">
                        Total: <span className="text-slate-300 font-bold">{filtered.length}</span>
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>
        </div>
    );
}
