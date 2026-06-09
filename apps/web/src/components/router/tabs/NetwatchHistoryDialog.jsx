import React from 'react';
import { X, Sparkles, User, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNetwatchHistory, useHealNetwatchNow } from '@/hooks/useNetwatchHistory';

const REASON_LABEL = {
    auto_heal_pppoe: { label: 'Auto-Heal (PPPoE)', icon: Sparkles, color: 'text-emerald-400' },
    auto_heal_acs: { label: 'Auto-Heal (ACS)', icon: Sparkles, color: 'text-cyan-400' },
    manual_edit: { label: 'Manual Edit', icon: User, color: 'text-fg' },
    sync_correction: { label: 'Sync Correction', icon: RefreshCw, color: 'text-amber-400' },
};

function formatWhen(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function NetwatchHistoryDialog({ open, onClose, routerId, netwatch }) {
    const { data: history = [], isLoading, refetch } = useNetwatchHistory(routerId, netwatch?.id, { enabled: open });
    const heal = useHealNetwatchNow(routerId);

    if (!open || !netwatch) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
                    {/* min-w-0 + truncate di blok kiri — netwatch.name dan host
                        (font-mono IPv4/IPv6) bisa panjang, tanpa ini "Heal Now"
                        atau close X bisa terdorong keluar di 320-360px.
                        shrink-0 di action group supaya tombol selalu terlihat. */}
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-fg flex items-center gap-2 min-w-0">
                            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="truncate">Riwayat Perubahan IP</span>
                        </h3>
                        <p className="text-xs text-fg-muted mt-0.5 truncate">
                            {netwatch.name || '—'} · IP saat ini: <span className="font-mono text-blue-400">{netwatch.host || '∅'}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {netwatch.linkedOnuId && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => heal.mutate(netwatch.id)}
                                disabled={heal.isPending}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${heal.isPending ? 'animate-spin' : ''}`} />
                                Heal Now
                            </Button>
                        )}
                        <button onClick={onClose} className="text-fg-muted hover:text-fg p-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {isLoading ? (
                        <div className="text-center py-12 text-fg-muted">Memuat riwayat…</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-fg-muted text-sm">Belum ada perubahan IP yang tercatat.</p>
                            {netwatch.linkedOnuId ? (
                                <p className="text-xs text-slate-600 mt-2">
                                    Auto-heal aktif — IP akan otomatis disesuaikan saat customer reconnect dengan IP baru.
                                </p>
                            ) : (
                                <p className="text-xs text-slate-600 mt-2">
                                    Entry ini belum terhubung ke ONU. Edit untuk set <code>linkedOnuId</code> agar auto-heal aktif.
                                </p>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="text-xs text-fg-muted uppercase border-b border-slate-800">
                                <tr>
                                    <th className="text-left py-2 px-2">Waktu</th>
                                    <th className="text-left py-2 px-2">Sebelum</th>
                                    <th className="text-left py-2 px-2">Sesudah</th>
                                    <th className="text-left py-2 px-2">Alasan</th>
                                    <th className="text-left py-2 px-2">Oleh</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {history.map((h) => {
                                    const cfg = REASON_LABEL[h.reason] || { label: h.reason, icon: RefreshCw, color: 'text-fg-muted' };
                                    const Icon = cfg.icon;
                                    return (
                                        <tr key={h.id} className="hover:bg-slate-800/30">
                                            <td className="py-2 px-2 text-fg whitespace-nowrap">{formatWhen(h.changedAt)}</td>
                                            <td className="py-2 px-2 font-mono text-xs text-fg-muted">{h.oldHost || '∅'}</td>
                                            <td className="py-2 px-2 font-mono text-xs text-blue-400">{h.newHost}</td>
                                            <td className="py-2 px-2">
                                                <span className={`inline-flex items-center gap-1 text-xs ${cfg.color}`}>
                                                    <Icon className="w-3 h-3" />
                                                    {cfg.label}
                                                </span>
                                                {h.pppoeUser && (
                                                    <div className="text-[10px] text-slate-600 font-mono mt-0.5">{h.pppoeUser}</div>
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-xs text-fg-muted">
                                                {h.changedBy === 'system' ? <span className="text-emerald-500">sistem</span> : (h.changedBy ? <span className="font-mono text-[10px]">{h.changedBy.slice(0, 8)}</span> : '—')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-slate-900/50">
                    <Button size="sm" variant="ghost" onClick={() => refetch()}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" />
                        Refresh
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>
                </div>
            </div>
        </div>
    );
}
