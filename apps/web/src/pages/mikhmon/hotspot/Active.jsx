import React, { useState, useMemo } from 'react';
import { Activity, RefreshCw, Search, Power } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useHotspotActive, useKickHotspotActive } from '@/hooks/useMikhmon';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * Live /ip/hotspot/active monitor.
 * Refreshes at the global cadence (3-30s typical) so operators can watch
 * who's connected without leaving the page. Kick a single session per row
 * — handy when a user gets stuck or you need to free up a slot.
 */

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '0';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function HotspotActive() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: sessions = [], isPending, isError, refetch, isFetching } = useHotspotActive(selectedRouterId);
    const kickMutation = useKickHotspotActive(selectedRouterId);

    const [search, setSearch] = useState('');
    const [confirming, setConfirming] = useState(null);

    const filtered = useMemo(() => {
        if (!search.trim()) return sessions;
        const q = search.toLowerCase();
        return sessions.filter((s) =>
            String(s.user || '').toLowerCase().includes(q) ||
            String(s.address || '').toLowerCase().includes(q) ||
            String(s.macAddress || '').toLowerCase().includes(q),
        );
    }, [sessions, search]);

    const handleKick = () => {
        if (!confirming?.id) return;
        kickMutation.mutate(confirming.id, { onSuccess: () => setConfirming(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Active Sessions</h1>
                        <p className="text-xs text-slate-500">Hotspot users yang sedang login. Auto-refresh sesuai interval di top bar.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh sekarang"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari user, IP, atau MAC…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil active session. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">User</th>
                                <th className="text-left px-4 py-2.5">IP Address</th>
                                <th className="text-left px-4 py-2.5">MAC</th>
                                <th className="text-left px-4 py-2.5">Uptime</th>
                                <th className="text-left px-4 py-2.5">Sisa Sesi</th>
                                <th className="text-left px-4 py-2.5">Bytes (in/out)</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {sessions.length === 0 ? 'Tidak ada session aktif.' : 'Tidak ada session cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
                                            <span className="font-semibold text-slate-200">{s.user || <span className="text-slate-600 italic">—</span>}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{s.address || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{s.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{s.uptime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{s.sessionTimeoutLeft || <span className="text-slate-600">∞</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                                        <div className="flex flex-col">
                                            <span>↓ {fmtBytes(s.bytesIn)}</span>
                                            <span>↑ {fmtBytes(s.bytesOut)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => setConfirming(s)}
                                            disabled={kickMutation.isPending}
                                        >
                                            <Power className="w-3 h-3 mr-1" />
                                            Kick
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/30">
                        Active: <span className="text-emerald-400 font-bold">{filtered.length}</span>
                        {filtered.length !== sessions.length && <> dari {sessions.length}</>}
                    </div>
                )}
            </div>

            <DeleteConfirmationModal
                isOpen={!!confirming}
                onClose={() => setConfirming(null)}
                onConfirm={handleKick}
                title="Kick Hotspot Session"
                message="Session akan diputus. User harus login ulang untuk reconnect."
                itemName={confirming?.user || confirming?.address || ''}
                confirmText="Kick Session"
                isDeleting={kickMutation.isPending}
            />
        </div>
    );
}
