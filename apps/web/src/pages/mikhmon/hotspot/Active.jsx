import React, { useState, useMemo } from 'react';
import { Activity, RefreshCw, Search, X as XIcon } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useHotspotActive, useKickHotspotActive } from '@/hooks/useMikhmon';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * Hotspot Active — mirrors MikHMON external 1:1.
 *
 * Columns (left → right) match MikHMON v3 external "Hotspot Aktif" page:
 *   Server | User | Address | Mac Address | Uptime | Bytes In | Bytes Out
 *   | Time Left | Login By | Komentar | (kick icon)
 *
 * Auto-refresh follows the global cadence selector at the top bar so the
 * operator can leave this open as a monitor.
 */

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '0';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KiB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(2)} MiB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
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
            String(s.macAddress || '').toLowerCase().includes(q) ||
            String(s.server || '').toLowerCase().includes(q) ||
            String(s.comment || '').toLowerCase().includes(q),
        );
    }, [sessions, search]);

    const handleKick = () => {
        if (!confirming?.id) return;
        kickMutation.mutate(confirming.id, { onSuccess: () => setConfirming(null) });
    };

    return (
        <div className="space-y-4 max-w-7xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Hotspot Aktif <span className="text-xs text-fg-muted font-normal">· {sessions.length} items</span></h1>
                        <p className="text-xs text-fg-muted">User yang sedang login. Auto-refresh sesuai interval di top bar.</p>
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh sekarang"
                >
                    <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari server, user, IP, MAC, atau komentar…"
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
                    <table className="w-full text-sm min-w-[1200px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-center px-2 py-2.5 w-8"></th>
                                <th className="text-left px-3 py-2.5">Server</th>
                                <th className="text-left px-3 py-2.5">User</th>
                                <th className="text-left px-3 py-2.5">Address</th>
                                <th className="text-left px-3 py-2.5">Mac Address</th>
                                <th className="text-right px-3 py-2.5">Uptime</th>
                                <th className="text-right px-3 py-2.5">Bytes In</th>
                                <th className="text-right px-3 py-2.5">Bytes Out</th>
                                <th className="text-right px-3 py-2.5">Time Left</th>
                                <th className="text-left px-3 py-2.5">Login By</th>
                                <th className="text-left px-3 py-2.5">Komentar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={11} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={11} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {sessions.length === 0 ? 'Tidak ada session aktif.' : 'Tidak ada session cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-2 py-2.5 text-center">
                                        <button
                                            onClick={() => setConfirming(s)}
                                            disabled={kickMutation.isPending}
                                            className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-40"
                                            title="Kick session"
                                        >
                                            <XIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-fg">{s.server || ''}</td>
                                    <td className="px-3 py-2.5">
                                        <span className="font-semibold text-slate-200">{s.user || ''}</span>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg">{s.address || ''}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg-muted">{(s.macAddress || '').toUpperCase()}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg text-right">{s.uptime || ''}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg text-right">{s.bytesIn ? fmtBytes(s.bytesIn) : ''}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg text-right">{s.bytesOut ? fmtBytes(s.bytesOut) : ''}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-fg text-right">{s.sessionTimeoutLeft || ''}</td>
                                    <td className="px-3 py-2.5 text-xs text-fg">{s.loginBy || ''}</td>
                                    <td className="px-3 py-2.5 text-xs text-fg-muted max-w-[300px] truncate" title={s.comment}>{s.comment || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-fg-muted bg-slate-900/30">
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
