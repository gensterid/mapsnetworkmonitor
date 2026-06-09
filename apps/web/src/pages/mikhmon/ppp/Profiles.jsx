import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    usePppProfiles,
    useAddPppProfile,
    useUpdatePppProfile,
    useDeletePppProfile,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EMPTY = {
    name: '',
    rateLimit: '',
    localAddress: '',
    remoteAddress: '',
    parentQueue: 'none',
    addressList: '',
    dnsServer: '',
    onlyOne: 'default',
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

function ProfileFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);

    useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit PPP Profile: ${initial?.name || ''}` : 'Tambah PPP Profile'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *" hint={mode === 'edit' ? 'rename perlu hapus + tambah ulang' : ''}>
                        <Input value={form.name} onChange={(v) => set('name', v)} placeholder="contoh: 10M-paket" disabled={mode === 'edit'} required />
                    </Field>
                    <Field label="Rate Limit (rx/tx)" hint="kosong = unlimited · contoh: 10M/2M">
                        <Input value={form.rateLimit} onChange={(v) => set('rateLimit', v)} placeholder="10M/2M" />
                    </Field>
                    <Field label="Local Address" hint="IP gateway PPP">
                        <Input value={form.localAddress} onChange={(v) => set('localAddress', v)} placeholder="192.168.20.1" />
                    </Field>
                    <Field label="Remote Address" hint="pool DHCP / IP single">
                        <Input value={form.remoteAddress} onChange={(v) => set('remoteAddress', v)} placeholder="pool-pppoe" />
                    </Field>
                    <Field label="DNS Server">
                        <Input value={form.dnsServer} onChange={(v) => set('dnsServer', v)} placeholder="8.8.8.8,1.1.1.1" />
                    </Field>
                    <Field label="Parent Queue">
                        <Input value={form.parentQueue} onChange={(v) => set('parentQueue', v)} placeholder="none" />
                    </Field>
                    <Field label="Address List" hint="masuk firewall address-list otomatis">
                        <Input value={form.addressList} onChange={(v) => set('addressList', v)} placeholder="" />
                    </Field>
                    <Field label="Only One" hint="batasi 1 sesi per user · yes/no/default">
                        <select
                            value={form.onlyOne || 'default'}
                            onChange={(e) => set('onlyOne', e.target.value)}
                            className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="default">default</option>
                            <option value="yes">yes</option>
                            <option value="no">no</option>
                        </select>
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-border/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.name?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function PppProfiles() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = usePppProfiles(selectedRouterId);
    const addMutation = useAddPppProfile(selectedRouterId);
    const updateMutation = useUpdatePppProfile(selectedRouterId);
    const deleteMutation = useDeletePppProfile(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.rateLimit || '').toLowerCase().includes(q) ||
            String(p.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const isDefault = (p) => p.name === 'default' || p.name === 'default-encryption';

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
                    <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">PPP Profile</h1>
                        <p className="text-xs text-fg-muted">Paket PPPoE (rate-limit, address pool, parent-queue).</p>
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
                        <span className="hidden xs:inline">Tambah </span>Profile
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name atau rate-limit…"
                    className="w-full pl-9 pr-3 py-2 bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil PPP profile. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-border/60 bg-surface-dark/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-surface-dark/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Rate Limit</th>
                                <th className="text-left px-4 py-2.5">Local / Remote</th>
                                <th className="text-left px-4 py-2.5">Only One</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada PPP profile.' : 'Tidak ada profile cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-surface/30 transition-colors">
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-200">{p.name}</span>
                                            {isDefault(p) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-border/50 text-fg-muted rounded uppercase font-bold tracking-tight">default</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{p.rateLimit || <span className="text-slate-600">unlimited</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                                        <div className="flex flex-col">
                                            <span>{p.localAddress || <span className="text-slate-600">—</span>}</span>
                                            <span className="text-fg-muted">{p.remoteAddress || ''}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{p.onlyOne || 'default'}</td>
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
                                                disabled={isDefault(p)}
                                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30"
                                                title={isDefault(p) ? 'Profile default tidak bisa dihapus' : 'Hapus'}
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

            <ProfileFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <ProfileFormModal
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
                title="Hapus PPP Profile"
                message="Profile akan dihapus. PPP secret yang masih pakai profile ini bisa error — pindahkan ke profile lain dulu."
                itemName={deleting?.name || ''}
                confirmText="Hapus Profile"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
