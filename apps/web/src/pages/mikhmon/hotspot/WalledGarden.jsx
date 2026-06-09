import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useWalledGarden,
    useAddWalledGarden,
    useUpdateWalledGarden,
    useDeleteWalledGarden,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * Walled Garden — domain/host whitelist for the hotspot captive portal.
 * Users hit these without logging in. Common entries: payment gateway,
 * social-login OAuth, CDN that the login page depends on.
 *
 * RouterOS exposes two tables. This page covers the L7/HTTP table at
 * /ip/hotspot/walled-garden — by far the most-used one. The IP-level
 * table can be added later if needed.
 */

const EMPTY = {
    dstHost: '',
    serverName: '',
    path: '',
    method: '',
    action: 'allow',
    comment: '',
    disabled: false,
};

const ACTION_STYLES = {
    allow: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    deny: 'bg-red-500/15 text-red-300 border-red-500/30',
};

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'col-span-2')}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
            {children}
            {hint && <span className="text-[10px] text-slate-600 italic">{hint}</span>}
        </label>
    );
}

function Input({ value, onChange, ...rest }) {
    return (
        <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function GardenFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);

    React.useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.dstHost?.trim() && !form.serverName?.trim() && !form.path?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? 'Edit Walled Garden Entry' : 'Tambah Walled Garden Entry'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Dst Host" hint="domain/host (regex didukung) · contoh: youtube.com" span={2}>
                        <Input value={form.dstHost} onChange={(v) => set('dstHost', v)} placeholder="*.contoh.com" />
                    </Field>
                    <Field label="Server" hint="hotspot server target · kosong = semua">
                        <Input value={form.serverName} onChange={(v) => set('serverName', v)} placeholder="" />
                    </Field>
                    <Field label="Path" hint="URL path filter · contoh: /api/*">
                        <Input value={form.path} onChange={(v) => set('path', v)} placeholder="" />
                    </Field>
                    <Field label="Method" hint="HTTP method · GET, POST, dll · kosong = semua">
                        <Input value={form.method} onChange={(v) => set('method', v)} placeholder="" />
                    </Field>
                    <Field label="Action *" hint="allow = bypass auth · deny = blokir">
                        <select
                            value={form.action}
                            onChange={(e) => set('action', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="allow">allow</option>
                            <option value="deny">deny</option>
                        </select>
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="contoh: Payment Gateway Tripay" />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!form.disabled}
                        onChange={(e) => set('disabled', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Disabled (entry dibuat tapi tidak aktif)</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitting || (!form.dstHost?.trim() && !form.serverName?.trim() && !form.path?.trim())}
                    >
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function WalledGarden() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useWalledGarden(selectedRouterId);
    const addMutation = useAddWalledGarden(selectedRouterId);
    const updateMutation = useUpdateWalledGarden(selectedRouterId);
    const deleteMutation = useDeleteWalledGarden(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((x) =>
            String(x.dstHost || '').toLowerCase().includes(q) ||
            String(x.path || '').toLowerCase().includes(q) ||
            String(x.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleAdd = (payload) =>
        addMutation.mutate(payload, { onSuccess: () => setModalMode(null) });

    const handleEdit = (payload) =>
        updateMutation.mutate(
            { id: editing.id, input: payload },
            { onSuccess: () => { setModalMode(null); setEditing(null); } },
        );

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Walled Garden</h1>
                        <p className="text-xs text-fg-muted">Whitelist domain/host yang boleh diakses tanpa login captive portal.</p>
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
                    <Button size="sm" onClick={() => { setEditing(null); setModalMode('add'); }} disabled={!selectedRouterId}>
                        <Plus className="w-4 h-4 mr-1" />
                        Tambah Entry
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari host, path, comment…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil walled-garden. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Action</th>
                                <th className="text-left px-4 py-2.5">Dst Host</th>
                                <th className="text-left px-4 py-2.5">Path</th>
                                <th className="text-left px-4 py-2.5">Method</th>
                                <th className="text-left px-4 py-2.5">Server</th>
                                <th className="text-left px-4 py-2.5">Hits</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada entry. Klik "Tambah Entry" untuk mulai.' : 'Tidak ada entry cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((w) => (
                                <tr key={w.id} className={clsx('hover:bg-slate-800/30 transition-colors', w.disabled && 'opacity-50', w.dynamic && 'italic')}>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border',
                                            ACTION_STYLES[w.action] || ACTION_STYLES.allow,
                                        )}>
                                            {w.action || 'allow'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg break-all max-w-xs">{w.dstHost || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{w.path || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{w.method || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{w.serverName || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{w.hits || '0'}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{w.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(w); setModalMode('edit'); }}
                                                disabled={w.dynamic}
                                                className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-30"
                                                title={w.dynamic ? 'Entry dynamic — bisa hapus saja' : 'Edit'}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(w)}
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
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <GardenFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <GardenFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing}
                onSubmit={handleEdit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Walled Garden Entry"
                message="Entry akan dihapus dari MikroTik. User hotspot tidak akan bisa lagi akses host ini tanpa login."
                itemName={deleting?.dstHost || deleting?.path || ''}
                confirmText="Hapus"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
