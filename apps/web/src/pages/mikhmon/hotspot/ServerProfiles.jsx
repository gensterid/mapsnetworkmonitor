import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Server, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useHotspotServerProfiles,
    useAddHotspotServerProfile,
    useUpdateHotspotServerProfile,
    useDeleteHotspotServerProfile,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * /ip/hotspot/profile — server-side captive portal profile.
 * Operators rarely edit these (RouterOS default works) but MikHMON
 * exposes the table for visibility and rare tweaks (HTML directory,
 * login-by methods, RADIUS toggle).
 */

const EMPTY = {
    name: '',
    hotspotAddress: '',
    dnsName: '',
    htmlDirectory: 'hotspot',
    rateLimit: '',
    httpProxy: '',
    smtpServer: '',
    loginBy: 'cookie,http-chap',
    macAuthMode: '',
    useRadius: false,
    splitUserDomain: false,
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

function CheckRow({ label, checked, onChange }) {
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

function ServerProfileFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
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
            title={mode === 'edit' ? `Edit Server Profile: ${initial?.name || ''}` : 'Tambah Server Profile'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *" hint={mode === 'edit' && initial?.default ? 'profile default tidak bisa rename' : ''}>
                        <Input
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="contoh: hsprof1"
                            disabled={mode === 'edit'}
                            required
                        />
                    </Field>
                    <Field label="Hotspot Address" hint="IP yang dipakai user akses portal">
                        <Input value={form.hotspotAddress} onChange={(v) => set('hotspotAddress', v)} placeholder="10.5.50.1" />
                    </Field>
                    <Field label="DNS Name" hint="hostname captive portal">
                        <Input value={form.dnsName} onChange={(v) => set('dnsName', v)} placeholder="hotspot.local" />
                    </Field>
                    <Field label="HTML Directory" hint="path template captive portal">
                        <Input value={form.htmlDirectory} onChange={(v) => set('htmlDirectory', v)} placeholder="hotspot" />
                    </Field>
                    <Field label="Rate Limit (rx/tx)" hint="default rate untuk profile ini">
                        <Input value={form.rateLimit} onChange={(v) => set('rateLimit', v)} placeholder="" />
                    </Field>
                    <Field label="HTTP Proxy">
                        <Input value={form.httpProxy} onChange={(v) => set('httpProxy', v)} placeholder="0.0.0.0:0" />
                    </Field>
                    <Field label="SMTP Server" hint="redirect SMTP outgoing">
                        <Input value={form.smtpServer} onChange={(v) => set('smtpServer', v)} placeholder="0.0.0.0" />
                    </Field>
                    <Field label="Login By" hint="metode login · csv: cookie,http-chap,http-pap,mac">
                        <Input value={form.loginBy} onChange={(v) => set('loginBy', v)} placeholder="cookie,http-chap" />
                    </Field>
                    <Field label="MAC Auth Mode" hint="kosong = off · mac-as-username = pakai MAC sebagai user">
                        <Input value={form.macAuthMode} onChange={(v) => set('macAuthMode', v)} placeholder="" />
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                    <CheckRow label="Use RADIUS" checked={form.useRadius} onChange={(v) => set('useRadius', v)} />
                    <CheckRow label="Split User Domain" checked={form.splitUserDomain} onChange={(v) => set('splitUserDomain', v)} />
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.name?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function HotspotServerProfiles() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useHotspotServerProfiles(selectedRouterId);
    const addMutation = useAddHotspotServerProfile(selectedRouterId);
    const updateMutation = useUpdateHotspotServerProfile(selectedRouterId);
    const deleteMutation = useDeleteHotspotServerProfile(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.dnsName || '').toLowerCase().includes(q),
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
                    <Server className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Server Profile</h1>
                        <p className="text-xs text-slate-500">Profile server hotspot (captive portal config, login methods).</p>
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
                        <span className="hidden xs:inline">Tambah </span>Profile
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name atau DNS…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil server profile. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[600px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">DNS / Address</th>
                                <th className="text-left px-4 py-2.5">HTML Dir</th>
                                <th className="text-left px-4 py-2.5">Login By</th>
                                <th className="text-left px-4 py-2.5">RADIUS</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum ada server profile.' : 'Tidak ada profile cocok.'}
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
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                                        <div className="flex flex-col">
                                            <span>{p.dnsName || <span className="text-slate-600">—</span>}</span>
                                            <span className="text-slate-500">{p.hotspotAddress || ''}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{p.htmlDirectory || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400 max-w-[200px] truncate">{p.loginBy || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs">
                                        {p.useRadius ? <span className="text-emerald-400">✓</span> : <span className="text-slate-600">—</span>}
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
                                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30"
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
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <ServerProfileFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <ServerProfileFormModal
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
                title="Hapus Server Profile"
                message="Profile akan dihapus. Hotspot server yang masih pakai profile ini akan error — pindahkan dulu ke profile lain."
                itemName={deleting?.name || ''}
                confirmText="Hapus Profile"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
