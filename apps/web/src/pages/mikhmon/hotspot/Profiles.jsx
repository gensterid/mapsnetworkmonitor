import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useHotspotUserProfiles,
    useAddHotspotUserProfile,
    useUpdateHotspotUserProfile,
    useDeleteHotspotUserProfile,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-equivalent Hotspot → User Profile page.
 *
 * Fields exposed match the MikHMON v3 form so operators feel at home:
 * core fields (name, shared, rate-limit, session/idle/keepalive/refresh)
 * + MAC cookie pair + Address Pool + Parent Queue + On Login script.
 * Advanced packet-mark / filter fields collapse behind "Advanced".
 */

const EMPTY_FORM = {
    name: '',
    sharedUsers: '1',
    rateLimit: '',
    sessionTimeout: '',
    idleTimeout: 'none',
    keepaliveTimeout: '2m',
    statusAutorefresh: '1m',
    addressPool: 'none',
    macCookieTimeout: '3d',
    addMacCookie: true,
    parentQueue: 'none',
    addressList: '',
    onLogin: '',
    onLogout: '',
    transparentProxy: false,
    incomingFilter: '',
    outgoingFilter: '',
    incomingPacketMark: '',
    outgoingPacketMark: '',
    openStatusPage: '',
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

function TextInput({ value, onChange, placeholder, ...rest }) {
    return (
        <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function CheckboxField({ label, checked, onChange }) {
    return (
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
                type="checkbox"
                checked={!!checked}
                onChange={(e) => onChange(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
            />
            <span>{label}</span>
        </label>
    );
}

function ProfileFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY_FORM);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Re-init when modal re-opens for a different row
    React.useEffect(() => {
        if (isOpen) {
            setForm(initial || EMPTY_FORM);
            setShowAdvanced(false);
        }
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim()) {
            return;
        }
        // Strip empty strings so backend doesn't blank values via PATCH
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit Profile: ${initial?.name || ''}` : 'Tambah User Profile'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Core fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *">
                        <TextInput
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="e.g. 1Day, 7Day, Unlimited"
                            disabled={mode === 'edit' && initial?.default}
                            required
                        />
                    </Field>
                    <Field label="Shared Users" hint="Berapa device boleh pakai 1 akun bersamaan">
                        <TextInput value={form.sharedUsers} onChange={(v) => set('sharedUsers', v)} placeholder="1" />
                    </Field>
                    <Field label="Rate Limit (rx/tx)" hint="kosong = unlimited · contoh: 1M/2M">
                        <TextInput value={form.rateLimit} onChange={(v) => set('rateLimit', v)} placeholder="1M/1M" />
                    </Field>
                    <Field label="Session Timeout" hint="durasi sesi · contoh: 1d, 8h, 30m">
                        <TextInput value={form.sessionTimeout} onChange={(v) => set('sessionTimeout', v)} placeholder="" />
                    </Field>
                    <Field label="Idle Timeout" hint="putus kalau diam X menit · none = no idle check">
                        <TextInput value={form.idleTimeout} onChange={(v) => set('idleTimeout', v)} placeholder="none" />
                    </Field>
                    <Field label="Keepalive Timeout">
                        <TextInput value={form.keepaliveTimeout} onChange={(v) => set('keepaliveTimeout', v)} placeholder="2m" />
                    </Field>
                    <Field label="Status Auto Refresh">
                        <TextInput value={form.statusAutorefresh} onChange={(v) => set('statusAutorefresh', v)} placeholder="1m" />
                    </Field>
                    <Field label="Address Pool" hint="pool DHCP yg dipakai · none = pakai default">
                        <TextInput value={form.addressPool} onChange={(v) => set('addressPool', v)} placeholder="none" />
                    </Field>
                </div>

                {/* MAC Cookie */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                    <Field label="MAC Cookie Timeout" hint="auto-login dari MAC sama">
                        <TextInput value={form.macCookieTimeout} onChange={(v) => set('macCookieTimeout', v)} placeholder="3d" />
                    </Field>
                    <div className="flex items-end">
                        <CheckboxField
                            label="Add MAC Cookie"
                            checked={form.addMacCookie}
                            onChange={(v) => set('addMacCookie', v)}
                        />
                    </div>
                </div>

                {/* On Login / Logout script (MikHMON usage tracker biasanya tulis di sini) */}
                <div className="grid grid-cols-1 gap-3">
                    <Field label="On Login Script" hint="RouterOS script · MikHMON biasanya tulis usage tracker di sini">
                        <textarea
                            value={form.onLogin || ''}
                            onChange={(e) => set('onLogin', e.target.value)}
                            rows={3}
                            placeholder=":log info ..."
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="On Logout Script">
                        <textarea
                            value={form.onLogout || ''}
                            onChange={(e) => set('onLogout', e.target.value)}
                            rows={2}
                            placeholder=""
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                </div>

                {/* Advanced toggle */}
                <button
                    type="button"
                    onClick={() => setShowAdvanced((s) => !s)}
                    className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                >
                    {showAdvanced ? '− Sembunyikan' : '+ Tampilkan'} field lanjutan (parent-queue, filter, packet-mark)
                </button>

                {showAdvanced && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                        <Field label="Parent Queue">
                            <TextInput value={form.parentQueue} onChange={(v) => set('parentQueue', v)} placeholder="none" />
                        </Field>
                        <Field label="Address List">
                            <TextInput value={form.addressList} onChange={(v) => set('addressList', v)} placeholder="" />
                        </Field>
                        <Field label="Incoming Filter">
                            <TextInput value={form.incomingFilter} onChange={(v) => set('incomingFilter', v)} placeholder="" />
                        </Field>
                        <Field label="Outgoing Filter">
                            <TextInput value={form.outgoingFilter} onChange={(v) => set('outgoingFilter', v)} placeholder="" />
                        </Field>
                        <Field label="Incoming Packet Mark">
                            <TextInput value={form.incomingPacketMark} onChange={(v) => set('incomingPacketMark', v)} placeholder="" />
                        </Field>
                        <Field label="Outgoing Packet Mark">
                            <TextInput value={form.outgoingPacketMark} onChange={(v) => set('outgoingPacketMark', v)} placeholder="" />
                        </Field>
                        <Field label="Open Status Page">
                            <TextInput value={form.openStatusPage} onChange={(v) => set('openStatusPage', v)} placeholder="always | http-login" />
                        </Field>
                        <div className="flex items-end">
                            <CheckboxField
                                label="Transparent Proxy"
                                checked={form.transparentProxy}
                                onChange={(v) => set('transparentProxy', v)}
                            />
                        </div>
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Batal
                    </Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.name?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function HotspotProfiles() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: profiles = [], isPending, isError, refetch, isFetching } = useHotspotUserProfiles(selectedRouterId);
    const addMutation = useAddHotspotUserProfile(selectedRouterId);
    const updateMutation = useUpdateHotspotUserProfile(selectedRouterId);
    const deleteMutation = useDeleteHotspotUserProfile(selectedRouterId);

    const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return profiles;
        const q = search.toLowerCase();
        return profiles.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.rateLimit || '').toLowerCase().includes(q),
        );
    }, [profiles, search]);

    const handleAdd = (payload) => {
        addMutation.mutate(payload, {
            onSuccess: () => setModalMode(null),
        });
    };

    const handleEdit = (payload) => {
        const { name: _name, ...rest } = payload; // RouterOS doesn't accept renaming via set (name is the key)
        void _name;
        updateMutation.mutate(
            { id: editing.id, input: rest },
            { onSuccess: () => { setModalMode(null); setEditing(null); } },
        );
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
        });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Hotspot User Profile</h1>
                        <p className="text-xs text-slate-500">Paket hotspot (rate limit, durasi, shared user) yang dipakai voucher.</p>
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
                    <Button
                        size="sm"
                        onClick={() => { setEditing(null); setModalMode('add'); }}
                        disabled={!selectedRouterId}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Tambah Profile
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name atau rate-limit…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {/* Table */}
            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil profile. Cek koneksi router.
                </div>
            )}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Rate Limit</th>
                                <th className="text-left px-4 py-2.5">Shared</th>
                                <th className="text-left px-4 py-2.5">Session</th>
                                <th className="text-left px-4 py-2.5">Idle</th>
                                <th className="text-left px-4 py-2.5">MAC Cookie</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {profiles.length === 0 ? 'Belum ada profile. Klik "Tambah Profile" untuk mulai.' : 'Tidak ada profile yang cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-200">{p.name}</span>
                                            {p.default && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded uppercase font-bold tracking-tight">default</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.rateLimit || <span className="text-slate-600">unlimited</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.sharedUsers || '1'}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.sessionTimeout || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{p.idleTimeout || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                                        {p.addMacCookie ? (
                                            <span className="text-emerald-400">{p.macCookieTimeout || 'yes'}</span>
                                        ) : <span className="text-slate-600">no</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(p); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(p)}
                                                disabled={p.default}
                                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                                                title={p.default ? 'Profile default tidak bisa dihapus' : 'Hapus'}
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
                        {filtered.length !== profiles.length && <> dari {profiles.length}</>}
                    </div>
                )}
            </div>

            {/* Add/Edit modal */}
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

            {/* Delete confirmation */}
            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus User Profile"
                message={`Profile ini akan dihapus dari MikroTik. Voucher/user yang masih pakai profile ini bisa error. Lanjutkan?`}
                itemName={deleting?.name || ''}
                confirmText="Hapus Profile"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
