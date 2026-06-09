import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Network, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useAddressList,
    useAddAddressList,
    useUpdateAddressList,
    useDeleteAddressList,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * /ip/firewall/address-list — building block untuk isolir, walled
 * garden, dan policy firewall. Operator pilih `list` (group name) lalu
 * tambah IP/CIDR/range. List filter dropdown muncul otomatis dari data
 * existing supaya gampang switch antar list yang besar.
 */

const EMPTY = {
    list: '',
    address: '',
    comment: '',
    timeout: '',
    disabled: false,
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

function AddressListFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode, knownLists, prefillList }) {
    const [form, setForm] = useState(initial || { ...EMPTY, list: prefillList || '' });

    useEffect(() => {
        if (isOpen) setForm(initial || { ...EMPTY, list: prefillList || '' });
    }, [isOpen, initial, prefillList]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.list?.trim() || !form.address?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? 'Edit Address List Entry' : 'Tambah Entry'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="List *" hint="nama group · pilih atau ketik baru">
                        <Input value={form.list} onChange={(v) => set('list', v)} placeholder="contoh: isolir" list="addr-list-names" required />
                        <datalist id="addr-list-names">
                            {(knownLists || []).map((l) => <option key={l} value={l} />)}
                        </datalist>
                    </Field>
                    <Field label="Address *" hint="IP / CIDR / range">
                        <Input value={form.address} onChange={(v) => set('address', v)} placeholder="192.168.10.50 atau 10.0.0.0/24" required />
                    </Field>
                    <Field label="Timeout" hint="auto-expire · contoh: 1h, 1d · kosong = permanen">
                        <Input value={form.timeout} onChange={(v) => set('timeout', v)} placeholder="" />
                    </Field>
                    <Field label="Comment">
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!form.disabled}
                        onChange={(e) => set('disabled', e.target.checked)}
                        className="rounded border-slate-border bg-surface-dark text-primary focus:ring-primary/40"
                    />
                    <span>Disabled</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-border/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.list?.trim() || !form.address?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function AddressListPage() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useAddressList(selectedRouterId);
    const addMutation = useAddAddressList(selectedRouterId);
    const updateMutation = useUpdateAddressList(selectedRouterId);
    const deleteMutation = useDeleteAddressList(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');
    const [listFilter, setListFilter] = useState('all');

    const knownLists = useMemo(() => {
        const set = new Set();
        items.forEach((i) => { if (i.list) set.add(i.list); });
        return Array.from(set).sort();
    }, [items]);

    const filtered = useMemo(() => {
        let list = items;
        if (listFilter !== 'all') list = list.filter((i) => i.list === listFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((i) =>
                String(i.address || '').toLowerCase().includes(q) ||
                String(i.list || '').toLowerCase().includes(q) ||
                String(i.comment || '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [items, search, listFilter]);

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
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Network className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Address List</h1>
                        <p className="text-xs text-fg-muted">Group IP untuk firewall (isolir, whitelist, blacklist).</p>
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
                        <span className="hidden xs:inline">Tambah </span>Entry
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <select
                    value={listFilter}
                    onChange={(e) => setListFilter(e.target.value)}
                    className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                    <option value="all">Semua list ({items.length})</option>
                    {knownLists.map((l) => (
                        <option key={l} value={l}>{l} ({items.filter((i) => i.list === l).length})</option>
                    ))}
                </select>
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari address, list, comment…"
                        className="w-full pl-9 pr-3 py-1.5 bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil address-list.
                </div>
            )}

            <div className="rounded-xl border border-slate-border/60 bg-surface-dark/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-surface-dark/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">List</th>
                                <th className="text-left px-4 py-2.5">Address</th>
                                <th className="text-left px-4 py-2.5">Timeout</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-left px-4 py-2.5">Type</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada entry. Klik "Tambah Entry" untuk mulai.' : 'Tidak ada entry cocok filter.'}
                                </td></tr>
                            ) : filtered.map((a) => (
                                <tr key={a.id} className={clsx('hover:bg-slate-surface/30 transition-colors', a.disabled && 'opacity-50', a.dynamic && 'italic')}>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-primary/15 text-primary border-primary/30 uppercase tracking-tight">
                                            {a.list || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{a.address || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{a.timeout || <span className="text-slate-600">∞</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{a.comment || ''}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight',
                                            a.dynamic
                                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
                                        )}>
                                            {a.dynamic ? 'dynamic' : 'static'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(a); setModalMode('edit'); }}
                                                disabled={a.dynamic}
                                                className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-30"
                                                title={a.dynamic ? 'Dynamic entry — managed RouterOS' : 'Edit'}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(a)}
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

            <AddressListFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
                knownLists={knownLists}
                prefillList={listFilter !== 'all' ? listFilter : ''}
            />
            <AddressListFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing}
                onSubmit={handleEdit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
                knownLists={knownLists}
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Address List Entry"
                message="Entry akan dihapus. Aturan firewall yang reference list ini akan mengecualikan IP ini."
                itemName={deleting ? `${deleting.list || '—'} → ${deleting.address || ''}` : ''}
                confirmText="Hapus Entry"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
