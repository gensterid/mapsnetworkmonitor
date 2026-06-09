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

// MikHMON v3 external uses these 4 modes (matches Mode Kedaluwarsa
// dropdown in the upstream profile form). The leading empty string
// renders as "Select..." so the operator can intentionally leave a
// profile without auto-expiry (matches MikHMON external behavior).
//   Remove          — delete user when expired, no record entry
//   Notice          — send notice, keep user
//   Remove & Record — delete user + write a /log info "record" entry
//                     so operator has a trail of expired vouchers
//   Notice & Record — notice + record
const EXPIRED_MODES = ['Remove', 'Notice', 'Remove & Record', 'Notice & Record'];

/**
 * Color-code the profile name based on its on-login script — matches
 * MikHMON external behavior so operators see the same coloring across
 * both apps:
 *
 *   white  — no on-login script at all (untouched RouterOS profile)
 *   yellow — has SOME script that isn't the current MikHMON template:
 *            either operator-written custom RouterOS, or an OLDER
 *            MikHMON variant whose :put header lacks the ",mikhmon,version,"
 *            meta marker. Both cases mean "not auto-managed by MikHMON
 *            in the recognizable way".
 *   green  — MikHMON Remove or Remove & Record (delete on expiry)
 *   blue   — MikHMON Notice or Notice & Record (kick but keep)
 *
 * Detection only inspects the FIRST executable line of the on-login —
 * operators routinely paste extra notification / logging code after the
 * MikHMON block, and that shouldn't downgrade the color tag.
 */
function getProfileNameColor(profile) {
    const onLogin = String(profile?.onLogin || '').trim();
    // No script — default RouterOS profile, untouched.
    if (!onLogin) return 'text-slate-200';

    // Find the first executable line, skipping blank lines and comments.
    const firstExec = onLogin.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#')) || '';
    const putMatch = /:put\s*\(\s*"([^"]*)"\s*\)/.exec(firstExec);

    // Has SOME script but no :put header → operator-written custom code.
    // MikHMON external treats this as yellow (script exists but isn't
    // managed by MikHMON in any recognizable way).
    if (!putMatch) return 'text-amber-400';

    const inner = putMatch[1];
    // :put header exists but without the ",mikhmon," meta token →
    // older MikHMON variant or a hand-rolled :put. Still yellow.
    if (!inner.includes('mikhmon')) return 'text-amber-400';

    // Full new-format header — color by mode code.
    const code = inner.split(',')[1] || '';
    if (code === 'rem' || code === 'remc') return 'text-emerald-400';
    if (code === 'ntf' || code === 'ntfc') return 'text-sky-400';
    // Recognized mikhmon marker but mode code we don't know → yellow.
    return 'text-amber-400';
}

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
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
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
            className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
            className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function Select({ value, onChange, options, ...rest }) {
    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
        <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
            <input
                type="checkbox"
                checked={!!checked}
                onChange={(e) => onChange(e.target.checked)}
                className="rounded border-slate-border bg-surface-dark text-primary focus:ring-primary/40"
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
                {/* IDENTITY — matches MikHMON external order: Name, Address
                    Pool, Shared Users, Rate Limit, then Parent Queue. */}
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
                    <Field label="Parent Queue" hint="nama queue tree induk · none = tidak terhubung queue tree" span={2}>
                        <TextInput value={form.parentQueue} onChange={(v) => set('parentQueue', v)} placeholder="none" />
                    </Field>
                </div>

                {/* MIKHMON BILLING — same row layout as MikHMON v3 external.
                    User Mode / Name Length / Prefix / Char Type / Server Name
                    intentionally NOT here — those are voucher-generator
                    settings, not profile settings (matches MikHMON external). */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Mode Kedaluwarsa" hint="kosongkan = profile tanpa auto-expire">
                        <Select
                            value={form.expiredMode}
                            onChange={(v) => set('expiredMode', v)}
                            options={[{ value: '', label: 'Select...' }, ...EXPIRED_MODES.map(m => ({ value: m, label: m }))]}
                        />
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

                {/* ROUTEROS PROFILE — collapsible advanced */}
                <button
                    type="button"
                    onClick={() => setShowAdvanced((s) => !s)}
                    className="text-xs text-fg-muted hover:text-slate-200 underline-offset-2 hover:underline"
                >
                    {showAdvanced ? '− Sembunyikan' : '+ Tampilkan'} field RouterOS lanjutan
                </button>

                {showAdvanced && (
                    <div className="space-y-3 p-3 rounded-lg bg-surface-dark/30 border border-slate-border/60">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Session Timeout"><TextInput value={form.sessionTimeout} onChange={(v) => set('sessionTimeout', v)} placeholder="" /></Field>
                            <Field label="Idle Timeout"><TextInput value={form.idleTimeout} onChange={(v) => set('idleTimeout', v)} placeholder="none" /></Field>
                            <Field label="Keepalive Timeout"><TextInput value={form.keepaliveTimeout} onChange={(v) => set('keepaliveTimeout', v)} placeholder="2m" /></Field>
                            <Field label="Status Auto Refresh"><TextInput value={form.statusAutorefresh} onChange={(v) => set('statusAutorefresh', v)} placeholder="1m" /></Field>
                            <Field label="MAC Cookie Timeout"><TextInput value={form.macCookieTimeout} onChange={(v) => set('macCookieTimeout', v)} placeholder="3d" /></Field>
                            <div className="flex items-end pb-1">
                                <CheckboxField label="Add MAC Cookie" checked={form.addMacCookie} onChange={(v) => set('addMacCookie', v)} />
                            </div>
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

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-border/40">
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
        // Skip script install if operator left Mode Kedaluwarsa empty
        // (matches MikHMON external — "Select..." means no auto-expire).
        // Also skip when validity blank since the script can't compute
        // an expiry time without it.
        if (!payload.expiredMode?.trim()) return;
        if (!payload.validity?.toString().trim()) return;
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
                        <p className="text-xs text-fg-muted">Paket hotspot (rate limit, validity, harga). Save = profile dibuat + script auto-expire ter-install.</p>
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
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama atau rate-limit…"
                    className="w-full pl-9 pr-3 py-2 bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil profile. Cek koneksi router.
                </div>
            )}

            {/* TABLE — columns match MikHMON v3 external */}
            <div className="rounded-xl border border-slate-border/60 bg-surface-dark/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[1000px]">
                        <thead className="bg-surface-dark/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
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
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {profiles.length === 0 ? 'Belum ada profile. Klik "Tambah Profile".' : 'Tidak ada profile yang cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => {
                                const b = resolveBilling(p) || {};
                                // MikHMON external leaves Mode Kedaluwarsa /
                                // Masa Berlaku / Harga / Harga Jual / Kunci
                                // Pengguna BLANK for profiles that haven't
                                // been MikHMON-configured. We follow the
                                // same convention so the table doesn't
                                // imply config that isn't actually there.
                                const hasMikhmonConfig = !!(
                                    b.validity ||
                                    b.expiredMode ||
                                    (b.price && parseFloat(b.price) > 0) ||
                                    (b.sellingPrice && parseFloat(b.sellingPrice) > 0) ||
                                    b.lockUser ||
                                    b.limitUptime
                                );
                                const sellingPriceVal = b.sellingPrice && parseFloat(b.sellingPrice) > 0
                                    ? Number(b.sellingPrice)
                                    : (b.price && parseFloat(b.price) > 0 ? Number(b.price) : null);
                                const priceVal = b.price && parseFloat(b.price) > 0 ? Number(b.price) : null;
                                return (
                                    <tr key={p.id} className="hover:bg-slate-surface/30 transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={clsx('font-semibold', getProfileNameColor(p))}>{p.name}</span>
                                                {p.default && (
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-border/50 text-fg-muted rounded uppercase font-bold tracking-tight">default</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-fg">{p.sharedUsers || '1'}</td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-fg max-w-[200px] truncate">{p.rateLimit || ''}</td>
                                        <td className="px-3 py-2.5 text-xs">
                                            {hasMikhmonConfig && b.expiredMode ? (
                                                <span className={clsx(
                                                    'inline-flex text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-tight',
                                                    b.expiredMode === 'Notice' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                                                    b.expiredMode === 'Notice & Record' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                                                    b.expiredMode === 'Remove & Record' ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' :
                                                    'bg-slate-border/40 text-fg border-slate-600/40'
                                                )}>
                                                    {b.expiredMode}
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs">
                                            {(b.validity || b.limitUptime) ? (
                                                <div className="flex flex-col gap-0.5">
                                                    {b.validity && <span className="text-emerald-300">{b.validity}</span>}
                                                    {b.limitUptime && (
                                                        <span className="text-cyan-300 text-[10px]">⏱ {b.limitUptime}</span>
                                                    )}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-right text-fg">
                                            {priceVal !== null ? priceVal.toLocaleString('id-ID') : ''}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-right">
                                            {sellingPriceVal !== null ? (
                                                <span className="text-emerald-300">{sellingPriceVal.toLocaleString('id-ID')}</span>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-xs">
                                            {hasMikhmonConfig ? (
                                                b.lockUser ? (
                                                    <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Enable</span>
                                                ) : (
                                                    <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-slate-border/40 text-fg-muted border border-slate-600/40">Disable</span>
                                                )
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
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
                    <div className="px-4 py-2 border-t border-slate-border/40 text-[10px] uppercase tracking-wider text-fg-muted bg-surface-dark/30">
                        Total: <span className="text-fg font-bold">{filtered.length}</span>
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
