import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Network, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useIpPools,
    useAddIpPool,
    useUpdateIpPool,
    useDeleteIpPool,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EMPTY = {
    name: '',
    ranges: '',
    nextPool: 'none',
    comment: '',
};

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'sm:col-span-2')}>
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
            className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function PoolFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode, pools }) {
    const [form, setForm] = useState(initial || EMPTY);

    useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim() || !form.ranges?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit Pool: ${initial?.name || ''}` : 'Tambah IP Pool'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *">
                        <Input value={form.name} onChange={(v) => set('name', v)} placeholder="contoh: pool-pppoe" disabled={mode === 'edit'} required />
                    </Field>
                    <Field label="Next Pool" hint="pool fallback saat full · none = no chain">
                        <Input value={form.nextPool} onChange={(v) => set('nextPool', v)} placeholder="none" list="pool-names" />
                        <datalist id="pool-names">
                            {(pools || []).filter((p) => p.name !== form.name).map((p) => (
                                <option key={p.id} value={p.name} />
                            ))}
                        </datalist>
                    </Field>
                    <Field label="Ranges *" hint="IP range · multi pisah koma · contoh: 10.0.0.10-10.0.0.250" span={2}>
                        <Input value={form.ranges} onChange={(v) => set('ranges', v)} placeholder="10.0.0.10-10.0.0.250" required />
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-border/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.name?.trim() || !form.ranges?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function IpPool() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useIpPools(selectedRouterId);
    const addMutation = useAddIpPool(selectedRouterId);
    const updateMutation = useUpdateIpPool(selectedRouterId);
    const deleteMutation = useDeleteIpPool(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.ranges || '').toLowerCase().includes(q) ||
            String(p.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleAdd = (payload) =>
        addMutation.mutate(payload, { onSuccess: () => setModalMode(null) });

    const handleEdit = (payload) => {
        const { name: _name, ...rest } = payload;
        void _name;
        updateMutation.mutate(
            { id: editing.id, input: rest },
            { onSuccess: () => { setModalMode(null); setEditing(null); } },
        );
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Network className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">IP Pool</h1>
                        <p className="text-xs text-fg-muted">Range IP yang dipakai DHCP / PPPoE assignment.</p>
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
                        <span className="hidden xs:inline">Tambah </span>Pool
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name, range, comment…"
                    className="w-full pl-9 pr-3 py-2 bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil IP pool.
                </div>
            )}

            <div className="rounded-xl border border-slate-border/60 bg-surface-dark/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-surface-dark/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Ranges</th>
                                <th className="text-left px-4 py-2.5">Next Pool</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada IP pool.' : 'Tidak ada pool cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-surface/30 transition-colors">
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{p.name}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg break-all max-w-xs">{p.ranges || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{p.nextPool || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{p.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(p); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(p)}
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
                    <div className="px-4 py-2 border-t border-slate-border/40 text-[10px] uppercase tracking-wider text-fg-muted bg-surface-dark/30">
                        Total: <span className="text-fg font-bold">{filtered.length}</span>
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <PoolFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
                pools={items}
            />
            <PoolFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing}
                onSubmit={handleEdit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
                pools={items}
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus IP Pool"
                message="Pool akan dihapus. PPP profile / DHCP server yang masih reference pool ini akan error."
                itemName={deleting?.name || ''}
                confirmText="Hapus Pool"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
