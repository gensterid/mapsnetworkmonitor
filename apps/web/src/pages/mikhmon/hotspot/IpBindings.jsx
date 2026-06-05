import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useIpBindings,
    useAddIpBinding,
    useUpdateIpBinding,
    useDeleteIpBinding,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * IP Binding manages exceptions to the hotspot captive portal:
 *   - bypassed: MAC/IP bypasses login (printer, CCTV, IoT)
 *   - blocked:  device denied access entirely
 *   - regular:  managed hotspot user (auto-created on first login)
 */

const EMPTY = {
    macAddress: '',
    address: '',
    toAddress: '',
    server: 'all',
    type: 'bypassed',
    comment: '',
    disabled: false,
};

const TYPE_STYLES = {
    bypassed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    blocked: 'bg-red-500/15 text-red-300 border-red-500/30',
    regular: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'col-span-2')}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
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

function BindingFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);

    React.useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.macAddress?.trim() && !form.address?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? 'Edit IP Binding' : 'Tambah IP Binding'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="MAC Address" hint="format: AA:BB:CC:DD:EE:FF · minimal MAC atau IP terisi">
                        <Input value={form.macAddress} onChange={(v) => set('macAddress', v)} placeholder="AA:BB:CC:DD:EE:FF" />
                    </Field>
                    <Field label="Address (IP)" hint="IP yang di-bind">
                        <Input value={form.address} onChange={(v) => set('address', v)} placeholder="192.168.10.50" />
                    </Field>
                    <Field label="To Address" hint="map ke IP lain (optional)">
                        <Input value={form.toAddress} onChange={(v) => set('toAddress', v)} placeholder="" />
                    </Field>
                    <Field label="Server" hint="server hotspot · all = semua">
                        <Input value={form.server} onChange={(v) => set('server', v)} placeholder="all" />
                    </Field>
                    <Field label="Type *" hint="bypassed = skip login · blocked = tolak · regular = normal user">
                        <select
                            value={form.type}
                            onChange={(e) => set('type', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="bypassed">bypassed</option>
                            <option value="blocked">blocked</option>
                            <option value="regular">regular</option>
                        </select>
                    </Field>
                    <Field label="Comment">
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="contoh: Printer Lt2" />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
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
                        disabled={isSubmitting || (!form.macAddress?.trim() && !form.address?.trim())}
                    >
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function IpBindings() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useIpBindings(selectedRouterId);
    const addMutation = useAddIpBinding(selectedRouterId);
    const updateMutation = useUpdateIpBinding(selectedRouterId);
    const deleteMutation = useDeleteIpBinding(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    const filtered = useMemo(() => {
        let list = items;
        if (typeFilter !== 'all') list = list.filter((x) => x.type === typeFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((x) =>
                String(x.macAddress || '').toLowerCase().includes(q) ||
                String(x.address || '').toLowerCase().includes(q) ||
                String(x.comment || '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [items, search, typeFilter]);

    const counts = useMemo(() => ({
        all: items.length,
        bypassed: items.filter((x) => x.type === 'bypassed').length,
        blocked: items.filter((x) => x.type === 'blocked').length,
        regular: items.filter((x) => x.type === 'regular').length,
    }), [items]);

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
                        <h1 className="text-xl font-bold text-slate-100">IP Binding</h1>
                        <p className="text-xs text-slate-500">Bypass login captive portal per MAC/IP (printer, CCTV) atau blokir device.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalMode('add'); }} disabled={!selectedRouterId}>
                        <Plus className="w-4 h-4 mr-1" />
                        Tambah Binding
                    </Button>
                </div>
            </div>

            {/* Type filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'bypassed', 'blocked', 'regular']).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={clsx(
                            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                            typeFilter === t
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-white/5',
                        )}
                    >
                        {t === 'all' ? 'Semua' : t}
                        <span className="ml-1.5 opacity-70 font-mono">{counts[t] ?? 0}</span>
                    </button>
                ))}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari MAC, IP, comment…"
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil IP binding. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Type</th>
                                <th className="text-left px-4 py-2.5">MAC Address</th>
                                <th className="text-left px-4 py-2.5">Address</th>
                                <th className="text-left px-4 py-2.5">To Address</th>
                                <th className="text-left px-4 py-2.5">Server</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum ada binding. Klik "Tambah Binding" untuk mulai.' : 'Tidak ada binding cocok filter.'}
                                </td></tr>
                            ) : filtered.map((b) => (
                                <tr key={b.id} className={clsx('hover:bg-slate-800/30 transition-colors', b.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border',
                                            TYPE_STYLES[b.type] || TYPE_STYLES.regular,
                                        )}>
                                            {b.type || 'regular'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{b.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{b.address || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{b.toAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{b.server || 'all'}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-xs truncate">{b.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(b); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
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
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/30">
                        Total: <span className="text-slate-300 font-bold">{filtered.length}</span>
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <BindingFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <BindingFormModal
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
                title="Hapus IP Binding"
                message="Entry akan dihapus dari MikroTik. Device akan kembali ikut aturan default hotspot."
                itemName={deleting?.macAddress || deleting?.address || ''}
                confirmText="Hapus"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
