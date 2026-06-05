import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Users as UsersIcon, RefreshCw, Search, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useHotspotUsers,
    useAddHotspotUser,
    useUpdateHotspotUser,
    useDeleteHotspotUser,
    useHotspotUserProfiles,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-equivalent /ip/hotspot/user management. Profile dropdown is
 * fed by the User Profile page so paket-paket yang sudah didefinisi di
 * Phase A2 langsung bisa dipakai di sini.
 */

const EMPTY = {
    name: '',
    password: '',
    profile: 'default',
    server: '',
    limitUptime: '',
    limitBytesTotal: '',
    macAddress: '',
    comment: '',
    disabled: false,
};

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '0';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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

function UserFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode, profiles }) {
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
            title={mode === 'edit' ? `Edit User: ${initial?.name || ''}` : 'Tambah Hotspot User'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Username *" hint={mode === 'edit' ? 'rename perlu hapus + tambah ulang' : 'unik wajib'}>
                        <Input
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="contoh: pelanggan-rudi"
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
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                tabIndex={-1}
                            >
                                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </Field>
                    <Field label="Profile" hint="paket dari menu User Profile">
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
                    <Field label="Server" hint="hotspot server · all = semua">
                        <Input value={form.server} onChange={(v) => set('server', v)} placeholder="all" />
                    </Field>
                    <Field label="Limit Uptime" hint="durasi maksimum login · contoh: 1d, 12h">
                        <Input value={form.limitUptime} onChange={(v) => set('limitUptime', v)} placeholder="" />
                    </Field>
                    <Field label="Limit Bytes Total" hint="quota total · contoh: 5G, 500M">
                        <Input value={form.limitBytesTotal} onChange={(v) => set('limitBytesTotal', v)} placeholder="" />
                    </Field>
                    <Field label="MAC Lock" hint="kunci ke MAC tertentu (optional)">
                        <Input value={form.macAddress} onChange={(v) => set('macAddress', v)} placeholder="" />
                    </Field>
                    <Field label="Comment">
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!form.disabled}
                        onChange={(e) => set('disabled', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Disabled (akun tidak bisa login)</span>
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

export default function HotspotUsers() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useHotspotUsers(selectedRouterId);
    const { data: profiles = [] } = useHotspotUserProfiles(selectedRouterId);
    const addMutation = useAddHotspotUser(selectedRouterId);
    const updateMutation = useUpdateHotspotUser(selectedRouterId);
    const deleteMutation = useDeleteHotspotUser(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((u) =>
            String(u.name || '').toLowerCase().includes(q) ||
            String(u.profile || '').toLowerCase().includes(q) ||
            String(u.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleAdd = (payload) =>
        addMutation.mutate(payload, { onSuccess: () => setModalMode(null) });

    const handleEdit = (payload) => {
        // RouterOS uses name as key — strip from update payload
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <UsersIcon className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Hotspot Users</h1>
                        <p className="text-xs text-slate-500">User/voucher hotspot dengan paket (profile) dan quota.</p>
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
                        Tambah User
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari username, profile, atau comment…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil hotspot user. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Username</th>
                                <th className="text-left px-4 py-2.5">Profile</th>
                                <th className="text-left px-4 py-2.5">MAC Lock</th>
                                <th className="text-left px-4 py-2.5">Uptime</th>
                                <th className="text-left px-4 py-2.5">Bytes (in/out)</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum ada user. Klik "Tambah User" untuk mulai.' : 'Tidak ada user cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((u) => (
                                <tr key={u.id} className={clsx('hover:bg-slate-800/30 transition-colors', u.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{u.name}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-primary/15 text-primary border-primary/30 uppercase tracking-tight">
                                            {u.profile || 'default'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{u.macAddress || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{u.uptime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                                        <div className="flex flex-col">
                                            <span>↓ {fmtBytes(u.bytesIn)}</span>
                                            <span>↑ {fmtBytes(u.bytesOut)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-xs truncate">{u.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(u); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(u)}
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

            <UserFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
                profiles={profiles}
            />
            <UserFormModal
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
                title="Hapus Hotspot User"
                message="User akan dihapus dari MikroTik. Sesi aktif akan terputus."
                itemName={deleting?.name || ''}
                confirmText="Hapus User"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
