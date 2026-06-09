import React, { useState, useMemo } from 'react';
import { FileBox, RefreshCw, Search, Download, Trash2, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useBackupList,
    useCreateBackup,
    useDeleteBackup,
} from '@/hooks/useMikhmon';
import { mikhmonApi } from '@/services/mikhmon.service';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { formatShortDateTime } from '@/lib/timezone';

/**
 * Backup management delegates to the existing /api/router-backups/*
 * surface (router-backup.service.ts). The MikHMON page is a thin UI
 * that wraps create/list/download/delete.
 *
 * Three backup types:
 *   - backup : binary .backup (full router state, RouterOS-only restore)
 *   - rsc    : text export.rsc (cross-version restore-friendly)
 *   - json   : app-side JSON snapshot (PPP/profile/voucher mirror)
 */

const TYPE_STYLES = {
    backup: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rsc: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    json: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '—';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function CreateModal({ isOpen, onClose, onSubmit, isSubmitting }) {
    const [type, setType] = useState('backup');
    const [comment, setComment] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ type, comment: comment.trim() || undefined });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Buat Backup" maxWidth="max-w-md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">Type</span>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { v: 'backup', label: 'binary .backup', hint: 'full state' },
                            { v: 'rsc', label: 'export .rsc', hint: 'cross-version' },
                            { v: 'json', label: 'snapshot .json', hint: 'app mirror' },
                        ].map((opt) => (
                            <button
                                type="button"
                                key={opt.v}
                                onClick={() => setType(opt.v)}
                                className={clsx(
                                    'flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition-colors',
                                    type === opt.v
                                        ? 'border-primary/40 bg-primary/10'
                                        : 'border-slate-700/50 bg-slate-900/40 hover:bg-slate-800/40',
                                )}
                            >
                                <span className="text-xs font-bold text-slate-200">{opt.label}</span>
                                <span className="text-[10px] text-fg-muted">{opt.hint}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">Comment (opsional)</span>
                    <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="contoh: sebelum upgrade firmware"
                        className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </label>

                <p className="text-[11px] text-fg-muted italic leading-relaxed">
                    Backup ditrigger di MikroTik, lalu file di-fetch ke server app. Untuk type <span className="font-mono text-fg">backup</span> dan <span className="font-mono text-fg">rsc</span> proses bisa 10-30 detik tergantung ukuran config.
                </p>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>Buat Backup</Button>
                </div>
            </form>
        </Modal>
    );
}

export default function SystemBackup() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useBackupList(selectedRouterId);
    const createMutation = useCreateBackup(selectedRouterId);
    const deleteMutation = useDeleteBackup(selectedRouterId);

    const [showCreate, setShowCreate] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const list = Array.isArray(items) ? items : [];
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter((b) =>
            String(b.filename || '').toLowerCase().includes(q) ||
            String(b.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleCreate = (payload) => {
        createMutation.mutate(payload, { onSuccess: () => setShowCreate(false) });
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <FileBox className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Backup</h1>
                        <p className="text-xs text-fg-muted">Backup file disimpan di server app. Klik download untuk ambil ke browser.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                    <Button size="sm" onClick={() => setShowCreate(true)} disabled={!selectedRouterId}>
                        <Plus className="w-4 h-4 mr-1" />
                        <span className="hidden xs:inline">Buat </span>Backup
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari filename atau comment…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil daftar backup.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Filename</th>
                                <th className="text-left px-4 py-2.5">Type</th>
                                <th className="text-left px-4 py-2.5">Size</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-left px-4 py-2.5">Dibuat</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {(!items || items.length === 0) ? 'Belum ada backup. Klik "Buat Backup" untuk mulai.' : 'Tidak ada backup cocok.'}
                                </td></tr>
                            ) : filtered.map((b) => (
                                <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200 max-w-[250px] truncate" title={b.filename}>{b.filename}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border',
                                            TYPE_STYLES[b.type] || 'bg-slate-500/15 text-fg-muted border-slate-500/30',
                                        )}>
                                            {b.type || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{fmtBytes(b.size)}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{b.comment || ''}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{b.createdAt ? formatShortDateTime(b.createdAt) : '—'}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <a
                                                href={mikhmonApi.backup.downloadUrl(b.id)}
                                                download={b.filename}
                                                className="p-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                                                title="Download"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </a>
                                            <button
                                                onClick={() => setDeleting(b)}
                                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
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
                        {(items && filtered.length !== items.length) && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <CreateModal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onSubmit={handleCreate}
                isSubmitting={createMutation.isPending}
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Backup"
                message="File backup di server akan dihapus permanen. Pastikan sudah download dulu kalau perlu."
                itemName={deleting?.filename || ''}
                confirmText="Hapus Backup"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
