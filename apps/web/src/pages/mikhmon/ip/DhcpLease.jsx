import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Network, RefreshCw, Search, Pin } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useDhcpLeases,
    useAddDhcpLease,
    useUpdateDhcpLease,
    useDeleteDhcpLease,
    useMakeDhcpLeaseStatic,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EMPTY = {
    address: '',
    macAddress: '',
    clientId: '',
    server: 'all',
    comment: '',
    blocked: false,
    disabled: false,
};

const STATUS_STYLES = {
    bound: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    waiting: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    offered: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    busy: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
};

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'sm:col-span-2')}>
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

function LeaseFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);

    useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.address?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? 'Edit DHCP Lease' : 'Tambah Static Lease'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Address *" hint="IP yang di-bind">
                        <Input value={form.address} onChange={(v) => set('address', v)} placeholder="192.168.10.50" required />
                    </Field>
                    <Field label="MAC Address" hint="format: AA:BB:CC:DD:EE:FF">
                        <Input value={form.macAddress} onChange={(v) => set('macAddress', v)} placeholder="" />
                    </Field>
                    <Field label="Client ID" hint="DHCP client identifier (optional)">
                        <Input value={form.clientId} onChange={(v) => set('clientId', v)} placeholder="" />
                    </Field>
                    <Field label="Server" hint="DHCP server target · all = semua">
                        <Input value={form.server} onChange={(v) => set('server', v)} placeholder="all" />
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!form.blocked}
                            onChange={(e) => set('blocked', e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                        />
                        <span>Blocked (tolak DHCP request)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!form.disabled}
                            onChange={(e) => set('disabled', e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                        />
                        <span>Disabled</span>
                    </label>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.address?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function DhcpLease() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useDhcpLeases(selectedRouterId);
    const addMutation = useAddDhcpLease(selectedRouterId);
    const updateMutation = useUpdateDhcpLease(selectedRouterId);
    const deleteMutation = useDeleteDhcpLease(selectedRouterId);
    const makeStaticMutation = useMakeDhcpLeaseStatic(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');

    const filtered = useMemo(() => {
        let list = items;
        if (filter === 'static') list = list.filter((l) => !l.dynamic);
        else if (filter === 'dynamic') list = list.filter((l) => l.dynamic);
        else if (filter === 'bound') list = list.filter((l) => l.status === 'bound');
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((l) =>
                String(l.address || '').toLowerCase().includes(q) ||
                String(l.macAddress || '').toLowerCase().includes(q) ||
                String(l.hostname || '').toLowerCase().includes(q) ||
                String(l.comment || '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [items, search, filter]);

    const counts = useMemo(() => ({
        all: items.length,
        static: items.filter((l) => !l.dynamic).length,
        dynamic: items.filter((l) => l.dynamic).length,
        bound: items.filter((l) => l.status === 'bound').length,
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
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Network className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">DHCP Lease</h1>
                        <p className="text-xs text-slate-500">DHCP lease table. Convert dynamic lease ke static dengan pin icon.</p>
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
                        <span className="hidden xs:inline">Tambah </span>Static
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {['all', 'static', 'dynamic', 'bound'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={clsx(
                            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                            filter === s
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-white/5',
                        )}
                    >
                        {s === 'all' ? 'Semua' : s}
                        <span className="ml-1.5 opacity-70 font-mono">{counts[s] ?? 0}</span>
                    </button>
                ))}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari IP, MAC, hostname…"
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil DHCP lease.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Status</th>
                                <th className="text-left px-4 py-2.5">Address</th>
                                <th className="text-left px-4 py-2.5">MAC</th>
                                <th className="text-left px-4 py-2.5">Hostname</th>
                                <th className="text-left px-4 py-2.5">Server</th>
                                <th className="text-left px-4 py-2.5">Expires</th>
                                <th className="text-left px-4 py-2.5">Type</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum ada DHCP lease.' : 'Tidak ada lease cocok filter.'}
                                </td></tr>
                            ) : filtered.map((l) => (
                                <tr key={l.id} className={clsx('hover:bg-slate-800/30 transition-colors', l.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-tight border',
                                            STATUS_STYLES[l.status] || 'bg-slate-500/15 text-slate-400 border-slate-500/30',
                                        )}>
                                            {l.status || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-200">{l.address || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{l.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px] truncate">{l.hostname || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{l.server || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{l.expiresAfter || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={clsx(
                                            'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight',
                                            l.dynamic
                                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
                                        )}>
                                            {l.dynamic ? 'dynamic' : 'static'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            {l.dynamic && (
                                                <button
                                                    onClick={() => makeStaticMutation.mutate(l.id)}
                                                    disabled={makeStaticMutation.isPending}
                                                    className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                                                    title="Convert ke static"
                                                >
                                                    <Pin className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setEditing(l); setModalMode('edit'); }}
                                                disabled={l.dynamic}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-30"
                                                title={l.dynamic ? 'Convert ke static dulu untuk edit' : 'Edit'}
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(l)}
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

            <LeaseFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <LeaseFormModal
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
                title="Hapus DHCP Lease"
                message="Lease akan dihapus. Kalau dynamic, device akan request IP lagi saat reconnect."
                itemName={deleting?.address || deleting?.macAddress || ''}
                confirmText="Hapus Lease"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
