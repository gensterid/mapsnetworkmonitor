import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search, Zap, ZapOff, ListPlus, Save } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useHotspotUserProfiles,
    useAddHotspotUserProfile,
    useUpdateHotspotUserProfile,
    useDeleteHotspotUserProfile,
    useProfileBillingSettings,
    useUpsertProfileBillingSetting,
    useBulkUpsertProfileBillingSettings,
    useInstallMikhmonScripts,
    useUninstallMikhmonScripts,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EXPIRED_MODES = ['Remove', 'Notice', 'Notice & Remove'];
const VALIDITY_PRESETS = ['', '1h', '3h', '6h', '12h', '1d', '3d', '7d', '30d'];

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
    // MikHMON billing fields — only used in 'add' mode to bundle script
    // install + price set into the same submit. Empty validity = skip
    // wizard, operator can install later via the ⚡ button.
    mikhmonValidity: '',
    mikhmonExpiredMode: 'Remove',
    mikhmonPrice: '',
    mikhmonSellingPrice: '',
    mikhmonLockUser: false,
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
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

                {/* MikHMON Billing section — only meaningful in 'add' mode.
                    Filling Validity here makes the parent auto-install the
                    on-login script after the profile is created (1-step
                    flow like MikHMON external). Skip = manual install via
                    the ⚡ button later. */}
                {mode === 'add' && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                            <span>⚡</span>
                            MikHMON Auto-Expire (opsional)
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            Isi <span className="font-mono text-emerald-300">Validity</span> untuk auto-install script MikHMON v3 setelah profile dibuat.
                            Voucher pakai profile ini akan auto-expire X waktu setelah <strong>first login</strong>.
                            Kosongkan = skip script (bisa install belakangan via tombol ⚡).
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Mode Kedaluwarsa">
                                <select
                                    value={form.mikhmonExpiredMode || 'Remove'}
                                    onChange={(e) => set('mikhmonExpiredMode', e.target.value)}
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {EXPIRED_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </Field>
                            <Field label="Masa Berlaku">
                                <select
                                    value={['1h', '3h', '6h', '12h', '1d', '3d', '7d', '30d', ''].includes(form.mikhmonValidity) ? form.mikhmonValidity : 'custom'}
                                    onChange={(e) => { if (e.target.value !== 'custom') set('mikhmonValidity', e.target.value); }}
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    <option value="">(skip)</option>
                                    <option value="1h">1 jam</option>
                                    <option value="3h">3 jam</option>
                                    <option value="6h">6 jam</option>
                                    <option value="12h">12 jam</option>
                                    <option value="1d">1 hari</option>
                                    <option value="3d">3 hari</option>
                                    <option value="7d">7 hari</option>
                                    <option value="30d">30 hari</option>
                                    <option value="custom">Custom…</option>
                                </select>
                            </Field>
                            <Field label="Custom Validity (override)">
                                <TextInput value={form.mikhmonValidity} onChange={(v) => set('mikhmonValidity', v)} placeholder="2h30m / 5d / etc" />
                            </Field>
                            <div /> {/* spacer */}
                            <Field label="Harga Rp" hint="biaya operator (opsional)">
                                <input
                                    type="number"
                                    value={form.mikhmonPrice}
                                    onChange={(e) => set('mikhmonPrice', e.target.value)}
                                    placeholder="0"
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </Field>
                            <Field label="Harga Jual Rp" hint="masuk Reports income">
                                <input
                                    type="number"
                                    value={form.mikhmonSellingPrice}
                                    onChange={(e) => set('mikhmonSellingPrice', e.target.value)}
                                    placeholder="5000"
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </Field>
                        </div>
                        <CheckboxField
                            label="Kunci Pengguna — lock voucher ke MAC pertama yang login"
                            checked={form.mikhmonLockUser}
                            onChange={(v) => set('mikhmonLockUser', v)}
                        />
                    </div>
                )}

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

// Inline modal for installing MikHMON v3 auto-expire scripts to a profile.
// Validity dropdown mirrors the most common MikHMON external defaults;
// operator can also paste custom RouterOS time strings.
function InstallScriptsModal({ isOpen, onClose, profile, defaultValidity, defaultPrice, onSubmit, isSubmitting }) {
    const [validity, setValidity] = useState(defaultValidity || '1d');
    const [price, setPrice] = useState(defaultPrice || '');
    const [lockUser, setLockUser] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setValidity(defaultValidity || '1d');
            setPrice(defaultPrice || '');
            setLockUser(false);
        }
    }, [isOpen, defaultValidity, defaultPrice]);

    if (!isOpen || !profile) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validity?.trim()) return;
        onSubmit({ validity: validity.trim(), lockUser, price: price ? Number(price) : 0 });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Install MikHMON Auto-Expire — ${profile.name}`} maxWidth="max-w-md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-xs text-slate-400 leading-relaxed bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                    Patch profile <span className="font-mono text-slate-200">{profile.name}</span> dengan on-login / on-logout script MikHMON v3.
                    Voucher yang pakai profile ini auto-expire <strong>X waktu setelah first login</strong>, bukan setelah cumulative uptime.
                </div>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Validity *</span>
                    <div className="flex gap-2">
                        <select
                            value={['1h', '3h', '6h', '12h', '1d', '3d', '7d', '30d'].includes(validity) ? validity : 'custom'}
                            onChange={(e) => { if (e.target.value !== 'custom') setValidity(e.target.value); }}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="1h">1 jam</option>
                            <option value="3h">3 jam</option>
                            <option value="6h">6 jam</option>
                            <option value="12h">12 jam</option>
                            <option value="1d">1 hari</option>
                            <option value="3d">3 hari</option>
                            <option value="7d">7 hari</option>
                            <option value="30d">30 hari</option>
                            <option value="custom">Custom…</option>
                        </select>
                        <input
                            type="text"
                            value={validity}
                            onChange={(e) => setValidity(e.target.value)}
                            placeholder="1d / 12h / 2h30m"
                            className="flex-1 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            required
                        />
                    </div>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Harga (Rp)</span>
                    <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="5000"
                        className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <span className="text-[10px] text-slate-600 italic">Dipakai di Reports untuk hitung income</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={lockUser}
                        onChange={(e) => setLockUser(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Lock voucher ke MAC pertama yang login (mencegah voucher dipakai bareng-bareng)</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting || !validity?.trim()}>
                        <Zap className="w-4 h-4 mr-1" />
                        Install
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Setup Cepat — bulk import modal for operators migrating from MikHMON
 * external. MikHMON external stores per-profile metadata (price,
 * validity, expiredMode, lockUser) in the browser's localStorage, so
 * those values aren't on the router for our parser to find. This modal
 * lets the operator enter every profile's settings in one place and
 * save them all in one round-trip.
 */
function BulkSetupModal({ isOpen, onClose, profiles, currentRows, onSubmit, isSubmitting }) {
    const [rows, setRows] = useState({});

    useEffect(() => {
        if (!isOpen) return;
        const init = {};
        for (const p of profiles) {
            const existing = currentRows[p.name] || {};
            init[p.name] = {
                profileName: p.name,
                validity: existing.validity || '1d',
                expiredMode: existing.expiredMode || 'Remove',
                price: existing.price || '',
                sellingPrice: existing.sellingPrice || existing.price || '',
                lockUser: !!existing.lockUser,
            };
        }
        setRows(init);
    }, [isOpen, profiles, currentRows]);

    const setRow = (name, key, value) => {
        setRows((r) => ({ ...r, [name]: { ...r[name], [key]: value } }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const items = Object.values(rows)
            .filter((r) => r.validity || r.price || r.sellingPrice)
            .map((r) => ({
                profileName: r.profileName,
                validity: r.validity || undefined,
                expiredMode: r.expiredMode || 'Remove',
                price: r.price ? Number(r.price) : 0,
                sellingPrice: r.sellingPrice ? Number(r.sellingPrice) : (r.price ? Number(r.price) : 0),
                lockUser: !!r.lockUser,
            }));
        if (items.length === 0) return;
        onSubmit(items);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Setup Cepat Semua Profile" maxWidth="max-w-5xl">
            <div className="mb-3 text-xs text-slate-400 leading-relaxed bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                Isi <strong>Masa Berlaku</strong>, <strong>Harga</strong>, dan <strong>Harga Jual</strong> untuk setiap profile.
                Cocok untuk migrasi dari MikHMON eksternal — yang aslinya menyimpan setting di browser localStorage, bukan di MikroTik.
                Setelah Save All, Reports langsung pakai angka ini.
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar max-h-[60vh]">
                        <table className="w-full text-xs min-w-[900px]">
                            <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0">
                                <tr>
                                    <th className="text-left px-3 py-2">Nama</th>
                                    <th className="text-left px-3 py-2 w-[140px]">Mode Kedaluwarsa</th>
                                    <th className="text-left px-3 py-2 w-[110px]">Masa Berlaku</th>
                                    <th className="text-right px-3 py-2 w-[110px]">Harga Rp</th>
                                    <th className="text-right px-3 py-2 w-[110px]">Harga Jual Rp</th>
                                    <th className="text-center px-3 py-2 w-[90px]">Kunci User</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {profiles.map((p) => {
                                    const r = rows[p.name] || {};
                                    return (
                                        <tr key={p.name} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-1.5 font-semibold text-slate-200">{p.name}</td>
                                            <td className="px-3 py-1.5">
                                                <select
                                                    value={r.expiredMode || 'Remove'}
                                                    onChange={(e) => setRow(p.name, 'expiredMode', e.target.value)}
                                                    className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded px-2 py-1"
                                                >
                                                    {EXPIRED_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="text"
                                                    value={r.validity || ''}
                                                    onChange={(e) => setRow(p.name, 'validity', e.target.value)}
                                                    list={`validity-presets-${p.name}`}
                                                    placeholder="1d"
                                                    className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded px-2 py-1"
                                                />
                                                <datalist id={`validity-presets-${p.name}`}>
                                                    {VALIDITY_PRESETS.filter(Boolean).map((v) => <option key={v} value={v} />)}
                                                </datalist>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    value={r.price || ''}
                                                    onChange={(e) => setRow(p.name, 'price', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded px-2 py-1 text-right"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    value={r.sellingPrice || ''}
                                                    onChange={(e) => setRow(p.name, 'sellingPrice', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded px-2 py-1 text-right"
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={!!r.lockUser}
                                                    onChange={(e) => setRow(p.name, 'lockUser', e.target.checked)}
                                                    className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
                        <Save className="w-4 h-4 mr-1" />
                        Simpan Semua
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function HotspotProfiles() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: profiles = [], isPending, isError, refetch, isFetching } = useHotspotUserProfiles(selectedRouterId);
    const { data: billingSettings = [] } = useProfileBillingSettings(selectedRouterId);
    const addMutation = useAddHotspotUserProfile(selectedRouterId);
    const updateMutation = useUpdateHotspotUserProfile(selectedRouterId);
    const deleteMutation = useDeleteHotspotUserProfile(selectedRouterId);
    const upsertBillingMutation = useUpsertProfileBillingSetting(selectedRouterId);
    const bulkBillingMutation = useBulkUpsertProfileBillingSettings(selectedRouterId);
    const installMutation = useInstallMikhmonScripts(selectedRouterId);
    const uninstallMutation = useUninstallMikhmonScripts(selectedRouterId);

    const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [installing, setInstalling] = useState(null);
    const [uninstallingConfirm, setUninstallingConfirm] = useState(null);
    const [showBulkSetup, setShowBulkSetup] = useState(false);
    const [search, setSearch] = useState('');

    // Lookup by profile name. DB settings still merged via this map for
    // legacy callers; primary display now reads p.billing emitted by the
    // backend (which merges DB > parsed-from-script > null).
    const billingByName = useMemo(() => {
        const m = new Map();
        for (const b of billingSettings) m.set(b.profileName, b);
        return m;
    }, [billingSettings]);

    const isMikhmonManaged = (p) => {
        if (typeof p.onLogin === 'string' && p.onLogin.includes('#mikhmon-managed')) return true;
        if (p.billing?.scriptsInstalled) return true;
        if (p.mikhmonConfig) return true; // existing MikHMON-external profile
        const b = billingByName.get(p.name);
        return !!(b?.scriptsInstalled);
    };

    // Resolve the displayed validity + price for a row. Priority:
    //   1. Backend-merged `p.billing` (DB > parsed)
    //   2. DB-only billingByName (older paths)
    const resolveBilling = (p) => {
        const fromBackend = p.billing;
        if (fromBackend && (fromBackend.validity || (fromBackend.price && Number(fromBackend.price) > 0))) {
            return fromBackend;
        }
        return billingByName.get(p.name) || null;
    };

    const handleInstall = (payload) => {
        if (!installing?.id) return;
        // Save price separately (script wizard handles validity/lockUser inside its endpoint)
        if (payload.price !== undefined) {
            upsertBillingMutation.mutate({
                profileName: installing.name,
                price: payload.price,
                validity: payload.validity,
                lockUser: payload.lockUser,
            });
        }
        installMutation.mutate(
            { profileId: installing.id, input: { validity: payload.validity, lockUser: payload.lockUser } },
            { onSuccess: () => setInstalling(null) },
        );
    };

    const handleUninstall = () => {
        if (!uninstallingConfirm?.id) return;
        uninstallMutation.mutate(uninstallingConfirm.id, {
            onSuccess: () => setUninstallingConfirm(null),
        });
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return profiles;
        const q = search.toLowerCase();
        return profiles.filter((p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.rateLimit || '').toLowerCase().includes(q),
        );
    }, [profiles, search]);

    const handleAdd = (payload) => {
        // Extract MikHMON-only fields so the MikroTik /add call gets just
        // the RouterOS-native profile fields. mikhmon* fields are handled
        // after the profile is successfully created.
        const {
            mikhmonValidity,
            mikhmonExpiredMode,
            mikhmonPrice,
            mikhmonSellingPrice,
            mikhmonLockUser,
            ...routerOsPayload
        } = payload;

        addMutation.mutate(routerOsPayload, {
            onSuccess: async (resp) => {
                setModalMode(null);

                const profileId = resp?.data?.id || resp?.id;
                const profileName = routerOsPayload.name;
                const wantsWizard = !!(mikhmonValidity || '').trim();
                const hasAnyBilling = wantsWizard
                    || (mikhmonPrice && Number(mikhmonPrice) > 0)
                    || (mikhmonSellingPrice && Number(mikhmonSellingPrice) > 0);

                if (hasAnyBilling && profileName) {
                    // 1) Save full billing record (works even when validity
                    //    is skipped — operator can still record prices for
                    //    Reports without installing the scripts).
                    try {
                        await upsertBillingMutation.mutateAsync({
                            profileName,
                            price: mikhmonPrice ? Number(mikhmonPrice) : 0,
                            sellingPrice: mikhmonSellingPrice ? Number(mikhmonSellingPrice) : (mikhmonPrice ? Number(mikhmonPrice) : 0),
                            validity: wantsWizard ? mikhmonValidity.trim() : undefined,
                            expiredMode: mikhmonExpiredMode || 'Remove',
                            lockUser: !!mikhmonLockUser,
                        });
                    } catch { /* toast handled */ }
                }

                if (wantsWizard && profileId && profileName) {
                    // 2) Install scripts (script wizard ensures the master
                    //    cleanup scheduler on first run).
                    try {
                        await installMutation.mutateAsync({
                            profileId,
                            input: { validity: mikhmonValidity.trim(), lockUser: !!mikhmonLockUser },
                        });
                    } catch { /* toast handled */ }
                }
            },
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
                        variant="secondary"
                        onClick={() => setShowBulkSetup(true)}
                        disabled={!selectedRouterId || profiles.length === 0}
                        title="Bulk setup harga + masa berlaku untuk semua profile sekaligus (cocok migrasi dari MikHMON eksternal)"
                    >
                        <ListPlus className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Setup </span>Cepat
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => { setEditing(null); setModalMode('add'); }}
                        disabled={!selectedRouterId}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Tambah </span>Profile
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
                                    {profiles.length === 0 ? 'Belum ada profile. Klik "Tambah Profile" untuk mulai.' : 'Tidak ada profile yang cocok.'}
                                </td></tr>
                            ) : filtered.map((p) => {
                                const b = resolveBilling(p);
                                const managed = isMikhmonManaged(p);
                                return (
                                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-200">{p.name}</span>
                                            {p.default && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded uppercase font-bold tracking-tight">default</span>
                                            )}
                                            {managed && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded uppercase font-bold tracking-tight inline-flex items-center gap-1" title="MikHMON v3 auto-expire scripts terpasang">
                                                    <Zap className="w-2.5 h-2.5" />
                                                    mikhmon
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{p.sharedUsers || (b?.sharedUsers ?? '1')}</td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-slate-300 max-w-[160px] truncate">{p.rateLimit || <span className="text-slate-600">unlimited</span>}</td>
                                    <td className="px-3 py-2.5 text-xs">
                                        <span className={clsx(
                                            'inline-flex text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-tight',
                                            b?.expiredMode === 'Notice' ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' :
                                            b?.expiredMode === 'Notice & Remove' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' :
                                            'bg-slate-700/40 text-slate-300 border-slate-600/40'
                                        )}>
                                            {b?.expiredMode || 'Remove'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs">
                                        {b?.validity ? (
                                            <span className="text-emerald-300">{b.validity}</span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-right">
                                        {b?.price && parseFloat(b.price) > 0 ? (
                                            <span className="text-slate-300">{Number(b.price).toLocaleString('id-ID')}</span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs text-right">
                                        {b?.sellingPrice && parseFloat(b.sellingPrice) > 0 ? (
                                            <span className="text-emerald-300">{Number(b.sellingPrice).toLocaleString('id-ID')}</span>
                                        ) : b?.price && parseFloat(b.price) > 0 ? (
                                            <span className="text-emerald-300">{Number(b.price).toLocaleString('id-ID')}</span>
                                        ) : (
                                            <span className="text-slate-600">—</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-xs">
                                        {b?.lockUser ? (
                                            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Enable</span>
                                        ) : (
                                            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-slate-700/40 text-slate-400 border border-slate-600/40">Disable</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            {managed ? (
                                                <button
                                                    onClick={() => setUninstallingConfirm(p)}
                                                    className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                                    title="Uninstall MikHMON scripts"
                                                >
                                                    <ZapOff className="w-3.5 h-3.5" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setInstalling(p)}
                                                    disabled={p.default}
                                                    className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
                                                    title={p.default ? 'Profile default tidak disarankan dipakai voucher' : 'Install MikHMON v3 auto-expire scripts + set harga'}
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                </button>
                                            )}
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
                            );})}
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

            <InstallScriptsModal
                isOpen={!!installing}
                onClose={() => setInstalling(null)}
                profile={installing}
                defaultValidity={installing ? (resolveBilling(installing)?.validity || '') : ''}
                defaultPrice={installing ? (resolveBilling(installing)?.price || '') : ''}
                onSubmit={handleInstall}
                isSubmitting={installMutation.isPending || upsertBillingMutation.isPending}
            />

            <BulkSetupModal
                isOpen={showBulkSetup}
                onClose={() => setShowBulkSetup(false)}
                profiles={profiles}
                currentRows={Object.fromEntries(profiles.map((p) => [p.name, resolveBilling(p) || {}]))}
                onSubmit={(items) => {
                    bulkBillingMutation.mutate(items, {
                        onSuccess: () => setShowBulkSetup(false),
                    });
                }}
                isSubmitting={bulkBillingMutation.isPending}
            />

            <DeleteConfirmationModal
                isOpen={!!uninstallingConfirm}
                onClose={() => setUninstallingConfirm(null)}
                onConfirm={handleUninstall}
                title="Lepas MikHMON Scripts"
                message="Script on-login / on-logout MikHMON v3 akan dilepas dari profile. Voucher baru tidak akan auto-expire setelah first login. Voucher existing yang sudah punya scheduler tetap akan ke-cleanup saat expired."
                itemName={uninstallingConfirm?.name || ''}
                confirmText="Lepas Scripts"
                isDeleting={uninstallMutation.isPending}
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
