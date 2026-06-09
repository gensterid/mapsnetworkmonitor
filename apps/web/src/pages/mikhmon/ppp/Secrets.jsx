import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Users as UsersIcon, RefreshCw, Search, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    usePppSecrets,
    useAddPppSecret,
    useUpdatePppSecret,
    useDeletePppSecret,
    usePppProfiles,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EMPTY = {
    name: '',
    password: '',
    profile: 'default',
    service: 'any',
    comment: '',
    disabled: false,
};

const SERVICES = ['any', 'pppoe', 'pptp', 'l2tp', 'ovpn', 'sstp'];

function Field({ label, hint, children }) {
    return (
        <label className="flex flex-col gap-1">
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

function SecretFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode, profiles }) {
    const [form, setForm] = useState(initial || EMPTY);
    const [showPw, setShowPw] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm(initial || EMPTY);
            setShowPw(false);
        }
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim()) return;
        if (mode === 'add' && !form.password?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit PPP Secret: ${initial?.name || ''}` : 'Tambah PPP Secret'}
            maxWidth="max-w-xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Username *" hint={mode === 'edit' ? 'rename perlu hapus + tambah ulang' : ''}>
                        <Input
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="pelanggan-xxx"
                            disabled={mode === 'edit'}
                            required
                        />
                    </Field>
                    <Field label={mode === 'edit' ? 'Password baru (opsional)' : 'Password *'}>
                        <div className="relative">
                            <input
                                type={showPw ? 'text' : 'password'}
                                value={form.password ?? ''}
                                onChange={(e) => set('password', e.target.value)}
                                placeholder={mode === 'edit' ? 'kosongkan = tidak ubah' : ''}
                                className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                required={mode === 'add'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPw((s) => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                                tabIndex={-1}
                            >
                                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </Field>
                    <Field label="Profile" hint="paket dari PPP → Profile">
                        <select
                            value={form.profile || 'default'}
                            onChange={(e) => set('profile', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="default">default</option>
                            {(profiles || []).filter((p) => p.name !== 'default').map((p) => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Service">
                        <select
                            value={form.service || 'any'}
                            onChange={(e) => set('service', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
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
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Disabled</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitting || !form.name?.trim() || (mode === 'add' && !form.password?.trim())}
                    >
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function PppSecrets() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = usePppSecrets(selectedRouterId);
    const { data: profiles = [] } = usePppProfiles(selectedRouterId);
    const addMutation = useAddPppSecret(selectedRouterId);
    const updateMutation = useUpdatePppSecret(selectedRouterId);
    const deleteMutation = useDeletePppSecret(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((s) =>
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.profile || '').toLowerCase().includes(q) ||
            String(s.comment || '').toLowerCase().includes(q),
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
                    <UsersIcon className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">PPP Secrets</h1>
                        <p className="text-xs text-fg-muted">User PPPoE/PPTP/L2TP yang terdaftar di router.</p>
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
                        <span className="hidden xs:inline">Tambah </span>Secret
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari username, profile, atau comment…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil PPP secret. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Username</th>
                                <th className="text-left px-4 py-2.5">Profile</th>
                                <th className="text-left px-4 py-2.5">Service</th>
                                <th className="text-left px-4 py-2.5">Last Logout</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada PPP secret.' : 'Tidak ada secret cocok.'}
                                </td></tr>
                            ) : filtered.map((s) => (
                                <tr key={s.id} className={clsx('hover:bg-slate-800/30 transition-colors', s.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{s.name}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-primary/15 text-primary border-primary/30 uppercase tracking-tight">
                                            {s.profile || 'default'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{s.service || 'any'}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{s.lastLoggedOut || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{s.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(s); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(s)}
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

            <SecretFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
                profiles={profiles}
            />
            <SecretFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing}
                onSubmit={handleEdit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
                profiles={profiles}
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus PPP Secret"
                message="Secret akan dihapus. Sesi aktif user akan terputus saat reconnect."
                itemName={deleting?.name || ''}
                confirmText="Hapus Secret"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
