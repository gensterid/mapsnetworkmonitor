import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useHotspotUserProfiles,
    useAddHotspotUserProfile,
    useUpdateHotspotUserProfile,
    useDeleteHotspotUserProfile,
    useInstallMikhmonScripts,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-equivalent Hotspot → User Profile.
 *
 * Layout mirrors MikHMON v3 external exactly so operators don't have to
 * relearn anything:
 *   - Single form modal for both Add and Edit (no separate "optional"
 *     section, no install wizard button — everything happens on Save)
 *   - Table columns match MikHMON external 1:1
 *   - Toolbar = Refresh + Add Profile only
 *
 * On Save the parent splits the payload into:
 *   1. RouterOS profile fields  → /ip/hotspot/user/profile add|set
 *   2. MikHMON v3 fields        → install-scripts endpoint (which also
 *                                  upserts the billing settings row)
 * so the operator gets one button, two backend writes, full MikHMON
 * external parity.
 */

const EXPIRED_MODES = ['Remove', 'Notice', 'Notice & Remove'];

const EMPTY_FORM = {
    // RouterOS profile native fields
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
    transparentProxy: false,
    incomingFilter: '',
    outgoingFilter: '',
    incomingPacketMark: '',
    outgoingPacketMark: '',
    openStatusPage: '',
    // MikHMON v3 billing fields — first-class, not optional
    expiredMode: 'Remove',
    validity: '1d',
    price: '',
    sellingPrice: '',
    lockUser: false,
    limitUptime: '',
    // MikHMON v3 voucher-generator hints
    userMode: 'vc',
    nameLength: 4,
    prefix: '',
    charType: 'lowcase',
    serverName: '',
};

function Field({ label, hint, children, span = 1, required }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'sm:col-span-2')}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {label}{required && ' *'}
            </span>
            {children}
            {hint && <span className="text-[10px] text-slate-600 italic">{hint}</span>}
        </label>
    );
}

function TextInput({ value, onChange, ...rest }) {
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

function NumberInput({ value, onChange, ...rest }) {
    return (
        <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function Select({ value, onChange, options, ...rest }) {
    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        >
            {options.map((o) => (
                typeof o === 'string'
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
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

    useEffect(() => {
        if (isOpen) {
            setForm(initial || EMPTY_FORM);
            setShowAdvanced(false);
        }
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim()) return;
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
            title={mode === 'edit' ? `Edit User Profile: ${initial?.name || ''}` : 'Tambah User Profile'}
            maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* IDENTITY */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nama" required>
                        <TextInput
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="contoh: PAKET-1HARI"
                            disabled={mode === 'edit'}
                            required
                        />
                    </Field>
                    <Field label="Shared Users" hint="Berapa device boleh pakai 1 akun bersamaan">
                        <NumberInput value={form.sharedUsers} onChange={(v) => set('sharedUsers', v)} min="1" placeholder="1" />
                    </Field>
                    <Field label="Rate Limit (rx/tx)" hint="kosong = unlimited · contoh: 1M/2M">
                        <TextInput value={form.rateLimit} onChange={(v) => set('rateLimit', v)} placeholder="1M/1M" />
                    </Field>
                    <Field label="Address Pool" hint="pool DHCP · none = pakai default">
                        <TextInput value={form.addressPool} onChange={(v) => set('addressPool', v)} placeholder="none" />
                    </Field>
                </div>

                {/* MIKHMON BILLING — same row layout as MikHMON v3 external */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Mode Kedaluwarsa">
                        <Select value={form.expiredMode} onChange={(v) => set('expiredMode', v)} options={EXPIRED_MODES} />
                    </Field>
                    <Field label="Masa Berlaku" hint="durasi setelah first login · contoh: 1d, 12h, 30m">
                        <TextInput value={form.validity} onChange={(v) => set('validity', v)} placeholder="1d" />
                    </Field>
                    <Field label="Harga Rp" hint="biaya operator">
                        <NumberInput value={form.price} onChange={(v) => set('price', v)} placeholder="0" />
                    </Field>
                    <Field label="Harga Jual Rp" hint="dipakai untuk Reports income">
                        <NumberInput value={form.sellingPrice} onChange={(v) => set('sellingPrice', v)} placeholder="5000" />
                    </Field>
                    <Field label="Limit Uptime" hint="cumulative connect time · beda dengan Masa Berlaku">
                        <TextInput value={form.limitUptime} onChange={(v) => set('limitUptime', v)} placeholder="(opsional) 10h" />
                    </Field>
                    <div className="flex items-end pb-1">
                        <CheckboxField
                            label="Kunci Pengguna — lock voucher ke MAC pertama yang login"
                            checked={form.lockUser}
                            onChange={(v) => set('lockUser', v)}
                        />
                    </div>
                </div>

                {/* MIKHMON VOUCHER GENERATOR DEFAULTS (also MikHMON v3 ext) */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                    <Field label="User Mode">
                        <Select value={form.userMode} onChange={(v) => set('userMode', v)} options={[
                            { value: 'vc', label: 'vc (user=password)' },
                            { value: 'up', label: 'up (terpisah)' },
                        ]} />
                    </Field>
                    <Field label="Name Length">
                        <NumberInput value={form.nameLength} onChange={(v) => set('nameLength', v)} min="3" max="20" />
                    </Field>
                    <Field label="Prefix">
                        <TextInput value={form.prefix} onChange={(v) => set('prefix', v)} placeholder="" />
                    </Field>
                    <Field label="Char Type">
                        <Select value={form.charType} onChange={(v) => set('charType', v)} options={['lowcase', 'upcase', 'mix', 'numbers']} />
                    </Field>
                    <Field label="Server Name" span={2}>
                        <TextInput value={form.serverName} onChange={(v) => set('serverName', v)} placeholder="" />
                    </Field>
                </div>

                {/* ROUTEROS PROFILE — collapsible advanced */}
                <button
                    type="button"
                    onClick={() => setShowAdvanced((s) => !s)}
                    className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                >
                    {showAdvanced ? '− Sembunyikan' : '+ Tampilkan'} field RouterOS lanjutan
                </button>

                {showAdvanced && (
                    <div className="space-y-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Session Timeout"><TextInput value={form.sessionTimeout} onChange={(v) => set('sessionTimeout', v)} placeholder="" /></Field>
                            <Field label="Idle Timeout"><TextInput value={form.idleTimeout} onChange={(v) => set('idleTimeout', v)} placeholder="none" /></Field>
                            <Field label="Keepalive Timeout"><TextInput value={form.keepaliveTimeout} onChange={(v) => set('keepaliveTimeout', v)} placeholder="2m" /></Field>
                            <Field label="Status Auto Refresh"><TextInput value={form.statusAutorefresh} onChange={(v) => set('statusAutorefresh', v)} placeholder="1m" /></Field>
                            <Field label="MAC Cookie Timeout"><TextInput value={form.macCookieTimeout} onChange={(v) => set('macCookieTimeout', v)} placeholder="3d" /></Field>
                            <div className="flex items-end pb-1">
                                <CheckboxField label="Add MAC Cookie" checked={form.addMacCookie} onChange={(v) => set('addMacCookie', v)} />
                            </div>
                            <Field label="Parent Queue"><TextInput value={form.parentQueue} onChange={(v) => set('parentQueue', v)} placeholder="none" /></Field>
                            <Field label="Address List"><TextInput value={form.addressList} onChange={(v) => set('addressList', v)} placeholder="" /></Field>
                            <Field label="Incoming Filter"><TextInput value={form.incomingFilter} onChange={(v) => set('incomingFilter', v)} placeholder="" /></Field>
                            <Field label="Outgoing Filter"><TextInput value={form.outgoingFilter} onChange={(v) => set('outgoingFilter', v)} placeholder="" /></Field>
                            <Field label="Incoming Packet Mark"><TextInput value={form.incomingPacketMark} onChange={(v) => set('incomingPacketMark', v)} placeholder="" /></Field>
                            <Field label="Outgoing Packet Mark"><TextInput value={form.outgoingPacketMark} onChange={(v) => set('outgoingPacketMark', v)} placeholder="" /></Field>
                            <Field label="Open Status Page"><TextInput value={form.openStatusPage} onChange={(v) => set('openStatusPage', v)} placeholder="always | http-login" /></Field>
                            <div className="flex items-end pb-1">
                                <CheckboxField label="Transparent Proxy" checked={form.transparentProxy} onChange={(v) => set('transparentProxy', v)} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !form.name?.trim()}>
                        {mode === 'edit' ? 'Update' : 'Simpan'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// Fields that go to /ip/hotspot/user/profile (RouterOS native) — anything
// else on the form is a MikHMON billing field that gets installed via the
// install-scripts endpoint.
const ROUTEROS_FIELDS = new Set([
    'name', 'sharedUsers', 'rateLimit', 'sessionTimeout', 'idleTimeout',
    'keepaliveTimeout', 'statusAutorefresh', 'addressPool', 'macCookieTimeout',
    'addMacCookie', 'parentQueue', 'addressList', 'onLogin', 'onLogout',
    'transparentProxy', 'incomingFilter', 'outgoingFilter',
    'incomingPacketMark', 'outgoingPacketMark', 'openStatusPage',
]);

function splitPayload(payload) {
    const ros = {};
    const mikhmon = {};
    for (const [k, v] of Object.entries(payload)) {
        if (ROUTEROS_FIELDS.has(k)) ros[k] = v;
        else mikhmon[k] = v;
    }
    return { ros, mikhmon };
}

export default function HotspotProfiles() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: profiles = [], isPending, isError, refetch, isFetching } = useHotspotUserProfiles(selectedRouterId);
    const addMutation = useAddHotspotUserProfile(selectedRouterId);
    const updateMutation = useUpdateHotspotUserProfile(selectedRouterId);
    const deleteMutation = useDeleteHotspotUserProfile(selectedRouterId);
    const installMutation = useInstallMikhmonScripts(selectedRouterId);

    const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    // Merge billing values (from backend p.billing + parsed p.mikhmonConfig)
    // into the row so columns render the live values. Backend already does
    // the merge per profile so we just read what's there.
    const resolveBilling = (p) => p?.billing || null;

    // Pre-fill edit form with billing + mikhmonConfig so MikHMON v3 fields
    // are populated, then merge the RouterOS profile attrs on top.
    const buildEditInitial = (p) => {
        if (!p) return EMPTY_FORM;
        const b = resolveBilling(p) || {};
        const mc = p.mikhmonConfig || {};
        return {
            ...EMPTY_FORM,
            // RouterOS attrs
            name: p.name,
            sharedUsers: p.sharedUsers ?? EMPTY_FORM.sharedUsers,
            rateLimit: p.rateLimit ?? '',
            sessionTimeout: p.sessionTimeout ?? '',
            idleTimeout: p.idleTimeout ?? 'none',
            keepaliveTimeout: p.keepaliveTimeout ?? '2m',
            statusAutorefresh: p.statusAutorefresh ?? '1m',
            addressPool: p.addressPool ?? 'none',
            macCookieTimeout: p.macCookieTimeout ?? '3d',
            addMacCookie: !!p.addMacCookie,
            parentQueue: p.parentQueue ?? 'none',
            addressList: p.addressList ?? '',
            transparentProxy: !!p.transparentProxy,
            incomingFilter: p.incomingFilter ?? '',
            outgoingFilter: p.outgoingFilter ?? '',
            incomingPacketMark: p.incomingPacketMark ?? '',
            outgoingPacketMark: p.outgoingPacketMark ?? '',
            openStatusPage: p.openStatusPage ?? '',
            // MikHMON v3 billing (DB > parsed > default)
            validity: b.validity || mc.validity || '1d',
            expiredMode: b.expiredMode || mc.expiredMode || 'Remove',
            price: b.price ?? mc.price ?? '',
            sellingPrice: b.sellingPrice ?? mc.sellingPrice ?? '',
            lockUser: b.lockUser ?? !!mc.lockUser,
            limitUptime: b.limitUptime || '',
            userMode: mc.userMode || 'vc',
            nameLength: mc.nameLength ?? 4,
            prefix: mc.prefix || '',
            charType: mc.charType || 'lowcase',
            serverName: mc.serverName || '',
        };
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return profiles;
        const q = search.toLowerCase();
        return profiles.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.rateLimit || '').toLowerCase().includes(q),
        );
    }, [profiles, search]);

    const installScriptsFor = async (profileId, payload) => {
        if (!payload.validity?.toString().trim()) return; // no validity → skip script install
        await installMutation.mutateAsync({
            profileId,
            input: {
                validity: payload.validity,
                expiredMode: payload.expiredMode || 'Remove',
                price: payload.price ? Number(payload.price) : 0,
                sellingPrice: payload.sellingPrice ? Number(payload.sellingPrice) : (payload.price ? Number(payload.price) : 0),
                sharing: payload.sharedUsers ? Number(payload.sharedUsers) : 1,
                lockUser: !!payload.lockUser,
                limitUptime: payload.limitUptime || undefined,
                userMode: payload.userMode || 'vc',
                nameLength: payload.nameLength ? Number(payload.nameLength) : 4,
                prefix: payload.prefix || '',
                charType: payload.charType || 'lowcase',
                serverName: payload.serverName || '',
            },
        }).catch(() => { /* toast already shown by hook */ });
    };

    const handleAdd = (payload) => {
        const { ros } = splitPayload(payload);
        addMutation.mutate(ros, {
            onSuccess: async (resp) => {
                const profileId = resp?.data?.id || resp?.id;
                if (profileId) await installScriptsFor(profileId, payload);
                setModalMode(null);
            },
        });
    };

    const handleEdit = (payload) => {
        const { ros } = splitPayload(payload);
        // RouterOS doesn't accept rename via set — drop name from PATCH
        const { name: _name, ...rest } = ros;
        void _name;
        updateMutation.mutate(
            { id: editing.id, input: rest },
            {
                onSuccess: async () => {
                    await installScriptsFor(editing.id, payload);
                    setModalMode(null);
                    setEditing(null);
                },
            },
        );
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
        });
    };

    const isSavingAny = addMutation.isPending || updateMutation.isPending || installMutation.isPending;

    return (
        <div className="space-y-4 max-w-6xl">
            {/* HEADER */}
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">User Profile</h1>
                        <p className="text-xs text-slate-500">Paket hotspot (rate limit, validity, harga). Save = profile dibuat + script auto-expire ter-install.</p>
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

            {/* SEARCH */}
            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau rate-limit…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil profile. Cek koneksi router.
                </div>
            )}

            {/* TABLE — columns match MikHMON v3 external */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[1000px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="text-left px-3 py-2.5">Nama</th>
                                <th className="text-left px-3 py-2.5">Shared Users</th>
                                <th className="text-left px-3 py-2.5">Rate Limit</th>
                                <th className="text-left px-3 py-2.5">Mode Kedaluwarsa</th>
                                <th className="text-left px-3 py-2.5">Masa Berlaku</th>
                                <th className="text-right px-3 py-2.5">Harga Rp</th>
                                <th className="text-right px-3 py-2.5">Harga Jual Rp</th>
                                <th className="text-center px-3 py-2.5">Kunci Pengguna</th>
                                <th className="text-right px-3 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {profiles.length === 0 ? 'Belum ada profile. Klik "Tambah Profile".' : 'Tidak ada profile yang cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => {
                                const b = resolveBilling(p) || {};
                                return (
                                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-slate-200">{p.name}</span>
                                                {p.default && (
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded uppercase font-bold tracking-tight">default</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{p.sharedUsers || b.sharedUsers || '1'}</td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-slate-300 max-w-[160px] truncate">{p.rateLimit || <span className="text-slate-600">unlimited</span>}</td>
                                        <td className="px-3 py-2.5 text-xs">
                                            <span className={clsx(
                                                'inline-flex text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-tight',
                                                b.expiredMode === 'Notice' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                                                b.expiredMode === 'Notice & Remove' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                                                'bg-slate-700/40 text-slate-300 border-slate-600/40'
                                            )}>
                                                {b.expiredMode || 'Remove'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs">
                                            <div className="flex flex-col gap-0.5">
                                                <span className={b.validity ? 'text-emerald-300' : 'text-slate-600'}>
                                                    {b.validity || '—'}
                                                </span>
                                                {b.limitUptime && (
                                                    <span className="text-cyan-300 text-[10px]">⏱ {b.limitUptime}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-right text-slate-300">
                                            {b.price && parseFloat(b.price) > 0 ? Number(b.price).toLocaleString('id-ID') : <span className="text-slate-600">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-right">
                                            {b.sellingPrice && parseFloat(b.sellingPrice) > 0 ? (
                                                <span className="text-emerald-300">{Number(b.sellingPrice).toLocaleString('id-ID')}</span>
                                            ) : b.price && parseFloat(b.price) > 0 ? (
                                                <span className="text-emerald-300">{Number(b.price).toLocaleString('id-ID')}</span>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-xs">
                                            {b.lockUser ? (
                                                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Enable</span>
                                            ) : (
                                                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-slate-700/40 text-slate-400 border border-slate-600/40">Disable</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
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
                                );
                            })}
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

            {/* MODALS */}
            <ProfileFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={EMPTY_FORM}
                onSubmit={handleAdd}
                isSubmitting={isSavingAny}
                mode="add"
            />
            <ProfileFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing ? buildEditInitial(editing) : EMPTY_FORM}
                onSubmit={handleEdit}
                isSubmitting={isSavingAny}
                mode="edit"
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus User Profile"
                message="Profile akan dihapus dari MikroTik. Voucher/user yang masih pakai profile ini bisa error."
                itemName={deleting?.name || ''}
                confirmText="Hapus Profile"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
