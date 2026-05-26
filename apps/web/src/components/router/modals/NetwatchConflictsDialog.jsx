import React, { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Database, Server, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useNetwatchConflicts, useResolveConflicts } from '@/hooks/useNetwatchConflicts';
import { formatRelativeTime } from '@/components/router/router-utils';

/**
 * Conflicts panel — operator sees rows where app DB and MikroTik /tool netwatch
 * disagree on host. Operator selects rows + picks side (MikroTik or App), system
 * resolves in bulk and writes audit history.
 */
export default function NetwatchConflictsDialog({ open, onClose, routerId }) {
    const { data: conflicts = [], isLoading } = useNetwatchConflicts(routerId, { enabled: open });
    const resolve = useResolveConflicts(routerId);
    const [selected, setSelected] = useState(new Set());

    const allSelected = useMemo(
        () => conflicts.length > 0 && selected.size === conflicts.length,
        [conflicts, selected]
    );

    const toggleAll = () => {
        if (allSelected) setSelected(new Set());
        else setSelected(new Set(conflicts.map((c) => c.id)));
    };
    const toggleOne = (id) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const handleResolve = async (source) => {
        if (selected.size === 0) return;
        await resolve.mutateAsync({ entryIds: Array.from(selected), source });
        setSelected(new Set());
    };

    return (
        <Modal isOpen={open} onClose={onClose} title="Netwatch Sync Conflicts" maxWidth="max-w-5xl">
            <div className="space-y-4 p-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-slate-300 leading-relaxed">
                        <div className="font-semibold text-amber-300 mb-0.5">Konflik antara MikroTik &amp; Aplikasi</div>
                        <p className="text-slate-400">
                            Pilih entry yang ingin diselesaikan, lalu pilih sumber kebenaran:
                            <strong className="text-emerald-300"> MikroTik </strong>
                            (hapus row aplikasi yang berbeda) atau
                            <strong className="text-blue-300"> Aplikasi </strong>
                            (push host aplikasi ke MikroTik). Setiap aksi tercatat di History.
                        </p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Memuat konflik...
                    </div>
                ) : conflicts.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                        Tidak ada konflik. Semua entry sinkron antara MikroTik dan aplikasi.
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto border border-slate-800/50 rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-900/60">
                                    <tr>
                                        <th className="p-2 text-left w-10">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={toggleAll}
                                                className="cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-2 text-left text-slate-400 font-medium">Name</th>
                                        <th className="p-2 text-left text-slate-400 font-medium">
                                            <Database className="w-3 h-3 inline mr-1 text-blue-400" /> App Host
                                        </th>
                                        <th className="p-2 text-left text-slate-400 font-medium">
                                            <Server className="w-3 h-3 inline mr-1 text-emerald-400" /> MikroTik Host
                                        </th>
                                        <th className="p-2 text-left text-slate-400 font-medium">Reason</th>
                                        <th className="p-2 text-left text-slate-400 font-medium">Updated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {conflicts.map((c) => (
                                        <tr key={c.id} className="hover:bg-slate-800/30">
                                            <td className="p-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(c.id)}
                                                    onChange={() => toggleOne(c.id)}
                                                    className="cursor-pointer"
                                                />
                                            </td>
                                            <td className="p-2 text-slate-300 font-medium">{c.name || '—'}</td>
                                            <td className="p-2 font-mono text-blue-300">{c.host || '—'}</td>
                                            <td className="p-2 font-mono text-emerald-300">{c.mikrotikHost || '—'}</td>
                                            <td className="p-2 text-slate-400 max-w-xs truncate" title={c.conflictReason}>
                                                {c.conflictReason || '—'}
                                            </td>
                                            <td className="p-2 text-slate-500 text-[10px]">
                                                {formatRelativeTime(c.updatedAt)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/50">
                            <div className="text-xs text-slate-400">
                                {selected.size} dari {conflicts.length} entry dipilih
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResolve('mikrotik')}
                                    disabled={selected.size === 0 || resolve.isPending}
                                    className={clsx(
                                        'gap-1.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10',
                                        (selected.size === 0 || resolve.isPending) && 'opacity-50 cursor-not-allowed'
                                    )}
                                >
                                    <Server className="w-3.5 h-3.5" />
                                    Pakai MikroTik
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResolve('app')}
                                    disabled={selected.size === 0 || resolve.isPending}
                                    className={clsx(
                                        'gap-1.5 border-blue-500/30 text-blue-300 hover:bg-blue-500/10',
                                        (selected.size === 0 || resolve.isPending) && 'opacity-50 cursor-not-allowed'
                                    )}
                                >
                                    <Database className="w-3.5 h-3.5" />
                                    Pakai Aplikasi
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
