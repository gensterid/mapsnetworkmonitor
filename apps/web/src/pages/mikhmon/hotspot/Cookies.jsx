import React, { useState, useMemo } from 'react';
import { FileBox, RefreshCw, Search, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useHotspotCookies, useRemoveHotspotCookie } from '@/hooks/useMikhmon';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * /ip/hotspot/cookie — persisted MAC-cookie auto-login records.
 * Read-only list + remove (no edit semantic on RouterOS). Removing a
 * cookie forces the user to re-authenticate on next connect — useful
 * when you want to invalidate a stolen device or a profile change.
 */

export default function HotspotCookies() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: cookies = [], isPending, isError, refetch, isFetching } = useHotspotCookies(selectedRouterId);
    const removeMutation = useRemoveHotspotCookie(selectedRouterId);

    const [search, setSearch] = useState('');
    const [deleting, setDeleting] = useState(null);

    const filtered = useMemo(() => {
        if (!search.trim()) return cookies;
        const q = search.toLowerCase();
        return cookies.filter((c) =>
            String(c.user || '').toLowerCase().includes(q) ||
            String(c.macAddress || '').toLowerCase().includes(q),
        );
    }, [cookies, search]);

    const handleDelete = () => {
        if (!deleting?.id) return;
        removeMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <FileBox className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Hotspot Cookies</h1>
                        <p className="text-xs text-fg-muted">Cookie auto-login per (MAC, user). Hapus untuk paksa user login lagi.</p>
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

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari user atau MAC…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil cookie list. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">User</th>
                                <th className="text-left px-4 py-2.5">MAC Address</th>
                                <th className="text-left px-4 py-2.5">Domain</th>
                                <th className="text-left px-4 py-2.5">Expires In</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {cookies.length === 0 ? 'Belum ada cookie. Cookie dibuat otomatis saat user login dengan MAC cookie aktif.' : 'Tidak ada cookie cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((c) => (
                                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{c.user || <span className="text-slate-600 italic">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{c.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{c.domain || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{c.expiresIn || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => setDeleting(c)}
                                            disabled={removeMutation.isPending}
                                        >
                                            <Trash2 className="w-3 h-3 mr-1" />
                                            Hapus
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-fg-muted bg-slate-900/30">
                        Total: <span className="text-fg font-bold">{filtered.length}</span>
                        {filtered.length !== cookies.length && <> dari {cookies.length}</>}
                    </div>
                )}
            </div>

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Hotspot Cookie"
                message="Cookie auto-login akan dihapus. User harus login ulang via captive portal saat reconnect."
                itemName={deleting ? `${deleting.user || '—'} @ ${deleting.macAddress || '—'}` : ''}
                confirmText="Hapus Cookie"
                isDeleting={removeMutation.isPending}
            />
        </div>
    );
}
