import React, { useState, useMemo } from 'react';
import { Network, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useHotspotHosts } from '@/hooks/useMikhmon';

/**
 * /ip/hotspot/host — live device discovery table. Read-only by
 * operator convention (RouterOS auto-prunes stale entries). Useful for
 * troubleshooting "kenapa device ini tidak konek" — you can see the
 * MAC↔IP↔hostname trail without leaving the app.
 */

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '0';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusBadge({ host }) {
    if (host.bypassed) {
        return <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">bypassed</span>;
    }
    if (host.authorized) {
        return <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">authorized</span>;
    }
    return <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-500/15 text-fg-muted border border-slate-500/30">unauth</span>;
}

export default function HotspotHosts() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: hosts = [], isPending, isError, refetch, isFetching } = useHotspotHosts(selectedRouterId);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filtered = useMemo(() => {
        let list = hosts;
        if (statusFilter === 'authorized') list = list.filter((h) => h.authorized);
        else if (statusFilter === 'bypassed') list = list.filter((h) => h.bypassed);
        else if (statusFilter === 'unauth') list = list.filter((h) => !h.authorized && !h.bypassed);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((h) =>
                String(h.macAddress || '').toLowerCase().includes(q) ||
                String(h.address || '').toLowerCase().includes(q) ||
                String(h.hostname || '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [hosts, search, statusFilter]);

    const counts = useMemo(() => ({
        all: hosts.length,
        authorized: hosts.filter((h) => h.authorized).length,
        bypassed: hosts.filter((h) => h.bypassed).length,
        unauth: hosts.filter((h) => !h.authorized && !h.bypassed).length,
    }), [hosts]);

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Network className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Hotspot Hosts</h1>
                        <p className="text-xs text-fg-muted">Device yang terdeteksi di interface hotspot, baik sudah login atau belum.</p>
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh"
                >
                    <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {['all', 'authorized', 'bypassed', 'unauth'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={clsx(
                            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                            statusFilter === s
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'border-slate-700/50 text-fg-muted hover:text-slate-200 hover:bg-white/5',
                        )}
                    >
                        {s === 'all' ? 'Semua' : s}
                        <span className="ml-1.5 opacity-70 font-mono">{counts[s] ?? 0}</span>
                    </button>
                ))}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari MAC, IP, atau hostname…"
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil host list. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Status</th>
                                <th className="text-left px-4 py-2.5">MAC</th>
                                <th className="text-left px-4 py-2.5">IP</th>
                                <th className="text-left px-4 py-2.5">Hostname</th>
                                <th className="text-left px-4 py-2.5">Uptime</th>
                                <th className="text-left px-4 py-2.5">Idle</th>
                                <th className="text-left px-4 py-2.5">Bytes (in/out)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {hosts.length === 0 ? 'Belum ada host terdeteksi.' : 'Tidak ada host cocok filter.'}
                                </td></tr>
                            ) : filtered.map((h) => (
                                <tr key={h.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5"><StatusBadge host={h} /></td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{h.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{h.address || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{h.hostname || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{h.uptime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{h.idleTime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                                        <div className="flex flex-col">
                                            <span>↓ {fmtBytes(h.bytesIn)}</span>
                                            <span>↑ {fmtBytes(h.bytesOut)}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-fg-muted bg-slate-900/30">
                        Total: <span className="text-fg font-bold">{filtered.length}</span>
                        {filtered.length !== hosts.length && <> dari {hosts.length}</>}
                    </div>
                )}
            </div>
        </div>
    );
}
