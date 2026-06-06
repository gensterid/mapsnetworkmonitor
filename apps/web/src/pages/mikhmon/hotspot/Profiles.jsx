import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, RefreshCw, Search, Zap, ZapOff, ListPlus, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
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
    mikhmonLimitUptime: '',
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
                            <Field label="Limit Uptime" hint="cumulative connect time · beda dengan Masa Berlaku · contoh: 10h, 5h30m">
                                <TextInput value={form.mikhmonLimitUptime} onChange={(v) => set('mikhmonLimitUptime', v)} placeholder="10h" />
                            </Field>
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
// All fields mirror the MikHMON v3 external profile form so the script
// body emitted to RouterOS is byte-compatible — operator can switch
// back and forth between this app and MikHMON external without losing
// data on either side.
function InstallScriptsModal({ isOpen, onClose, profile, defaults, onSubmit, isSubmitting }) {
    const d = defaults || {};
    const [validity, setValidity] = useState(d.validity || '1d');
    const [expiredMode, setExpiredMode] = useState(d.expiredMode || 'Remove');
    const [price, setPrice] = useState(d.price ?? '');
    const [sellingPrice, setSellingPrice] = useState(d.sellingPrice ?? '');
    const [sharing, setSharing] = useState(d.sharing ?? d.sharedUsers ?? 1);
    const [lockUser, setLockUser] = useState(!!d.lockUser);
    const [limitUptime, setLimitUptime] = useState(d.limitUptime || '');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [userMode, setUserMode] = useState(d.userMode || 'vc');
    const [nameLength, setNameLength] = useState(d.nameLength ?? 4);
    const [prefix, setPrefix] = useState(d.prefix || '');
    const [charType, setCharType] = useState(d.charType || 'lowcase');
    const [serverName, setServerName] = useState(d.serverName || '');

    useEffect(() => {
        if (!isOpen) return;
        setValidity(d.validity || '1d');
        setExpiredMode(d.expiredMode || 'Remove');
        setPrice(d.price ?? '');
        setSellingPrice(d.sellingPrice ?? '');
        setSharing(d.sharing ?? d.sharedUsers ?? 1);
        setLockUser(!!d.lockUser);
        setLimitUptime(d.limitUptime || '');
        setUserMode(d.userMode || 'vc');
        setNameLength(d.nameLength ?? 4);
        setPrefix(d.prefix || '');
        setCharType(d.charType || 'lowcase');
        setServerName(d.serverName || '');
        setShowAdvanced(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, profile?.id]);

    if (!isOpen || !profile) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validity?.trim()) return;
        onSubmit({
            validity: validity.trim(),
            expiredMode,
            price: price ? Number(price) : 0,
            sellingPrice: sellingPrice ? Number(sellingPrice) : (price ? Number(price) : 0),
            sharing: Number(sharing) || 1,
            lockUser,
            limitUptime: limitUptime?.trim() || undefined,
            userMode,
            nameLength: Number(nameLength) || 4,
            prefix,
            charType,
            serverName,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Install MikHMON v3 Scripts — ${profile.name}`} maxWidth="max-w-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-xs text-slate-400 leading-relaxed bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                    Patch profile <span className="font-mono text-slate-200">{profile.name}</span> dengan on-login / on-logout script
                    versi MikHMON v3. Field di bawah <strong>byte-kompatibel</strong> dengan MikHMON eksternal — operator yang switch
                    bolak-balik akan lihat nilai persis sama.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Masa Berlaku *</span>
                        <div className="flex gap-2">
                            <select
                                value={['1h', '3h', '6h', '12h', '1d', '3d', '7d', '30d'].includes(validity) ? validity : 'custom'}
                                onChange={(e) => { if (e.target.value !== 'custom') setValidity(e.target.value); }}
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                <option value="1h">1h</option><option value="3h">3h</option><option value="6h">6h</option>
                                <option value="12h">12h</option><option value="1d">1d</option><option value="3d">3d</option>
                                <option value="7d">7d</option><option value="30d">30d</option>
                                <option value="custom">Custom</option>
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
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mode Kedaluwarsa</span>
                        <select
                            value={expiredMode}
                            onChange={(e) => setExpiredMode(e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {EXPIRED_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Harga Rp</span>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="0"
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Harga Jual Rp</span>
                        <input
                            type="number"
                            value={sellingPrice}
                            onChange={(e) => setSellingPrice(e.target.value)}
                            placeholder="5000"
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <span className="text-[10px] text-slate-600 italic">Income di Reports</span>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Shared Users</span>
                        <input
                            type="number"
                            min="1"
                            value={sharing}
                            onChange={(e) => setSharing(e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Limit Uptime</span>
                        <input
                            type="text"
                            value={limitUptime}
                            onChange={(e) => setLimitUptime(e.target.value)}
                            placeholder="10h (opsional)"
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <span className="text-[10px] text-slate-600 italic">Cumulative connect time — beda dengan Masa Berlaku</span>
                    </label>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={lockUser}
                        onChange={(e) => setLockUser(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span><strong>Kunci Pengguna</strong> — lock voucher ke MAC pertama yang login</span>
                </label>

                <button
                    type="button"
                    onClick={() => setShowAdvanced((s) => !s)}
                    className="text-xs text-slate-400 hover:text-slate-200 underline-offset-2 hover:underline"
                >
                    {showAdvanced ? '− Sembunyikan' : '+ Tampilkan'} field MikHMON v3 lanjutan (userMode, prefix, charType, serverName)
                </button>

                {showAdvanced && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">User Mode</span>
                            <select value={userMode} onChange={(e) => setUserMode(e.target.value)}
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40">
                                <option value="vc">vc — username = password</option>
                                <option value="up">up — username + password berbeda</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Char Type</span>
                            <select value={charType} onChange={(e) => setCharType(e.target.value)}
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40">
                                <option value="lowcase">lowcase</option>
                                <option value="upcase">upcase</option>
                                <option value="mix">mix</option>
                                <option value="numbers">numbers</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Name Length</span>
                            <input type="number" min="3" max="20" value={nameLength}
                                onChange={(e) => setNameLength(e.target.value)}
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prefix</span>
                            <input type="text" value={prefix}
                                onChange={(e) => setPrefix(e.target.value)} placeholder=""
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        </label>
                        <label className="flex flex-col gap-1 sm:col-span-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Server Name (display)</span>
                            <input type="text" value={serverName}
                                onChange={(e) => setServerName(e.target.value)} placeholder=""
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        </label>
                    </div>
                )}

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
                limitUptime: existing.limitUptime || '',
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
            .filter((r) => r.validity || r.limitUptime || r.price || r.sellingPrice)
            .map((r) => ({
                profileName: r.profileName,
                validity: r.validity || undefined,
                limitUptime: r.limitUptime || undefined,
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
                                    <th className="text-left px-3 py-2 w-[110px]">Limit Uptime</th>
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
                                                    type="text"
                                                    value={r.limitUptime || ''}
                                                    onChange={(e) => setRow(p.name, 'limitUptime', e.target.value)}
                                                    placeholder="(opsional) 10h"
                                                    title="Cumulative connect time. Beda dengan Masa Berlaku. Kosongkan kalau tidak pakai."
                                                    className="w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded px-2 py-1"
                                                />
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

/**
 * Import MikHMON external backup. MikHMON v3 external's
 * Settings → Backup downloads localStorage as JSON. This modal lets
 * the operator upload that file, the parser scans for profile entries
 * (handles multiple MikHMON variants — flat array, nested object,
 * key-prefixed maps), and we preview + bulk-import.
 */
function parseMikhmonBackup(rawJson) {
    const result = [];
    if (!rawJson) return result;

    const numFromAny = (v) => {
        if (v === undefined || v === null) return undefined;
        const cleaned = String(v).replace(/[^\d.-]/g, '');
        const n = parseFloat(cleaned);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    // A profile-shape detector — flexible to many MikHMON forks
    const looksLikeProfile = (o) => o && typeof o === 'object' &&
        (o.name || o.profile) &&
        (o.validity !== undefined || o.price !== undefined || o.selling !== undefined ||
         o.sellingPrice !== undefined || o.expmode !== undefined);

    const pushProfile = (p) => {
        const name = p.name || p.profile;
        if (!name) return;
        const expMode = p.expmode || p.expiredMode || p.expired_mode || p['expired-mode'];
        const lockRaw = p.lock || p.lockUser || p.lock_user;
        result.push({
            profileName: String(name),
            validity: p.validity || p.valid || undefined,
            limitUptime: p.limitUptime || p.uptime || p.limit_uptime || undefined,
            expiredMode: expMode || 'Remove',
            price: numFromAny(p.price ?? p.cost ?? 0),
            sellingPrice: numFromAny(p.selling ?? p.sellingPrice ?? p.sell ?? p.jual ?? p.price ?? 0),
            lockUser: typeof lockRaw === 'string' ? /enable|true|yes|1/i.test(lockRaw) : !!lockRaw,
            sharedUsers: parseInt(p.sharing ?? p.shared ?? p.sharedUsers ?? '1', 10) || 1,
        });
    };

    // Strategy 1: top-level array of profiles
    if (Array.isArray(rawJson)) {
        for (const item of rawJson) if (looksLikeProfile(item)) pushProfile(item);
    }

    // Strategy 2: nested array under `profiles` / `profile` / `data.profiles`
    if (result.length === 0 && typeof rawJson === 'object') {
        const arrays = [rawJson.profiles, rawJson.profile, rawJson?.data?.profiles, rawJson?.data?.profile];
        for (const arr of arrays) {
            if (Array.isArray(arr)) for (const item of arr) if (looksLikeProfile(item)) pushProfile(item);
        }
    }

    // Strategy 3: keys like "mikhmon-<site>-profile-<name>" (localStorage dump)
    if (result.length === 0 && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
        for (const [key, value] of Object.entries(rawJson)) {
            if (!/profile/i.test(key)) continue;
            let parsed = value;
            if (typeof value === 'string') {
                try { parsed = JSON.parse(value); } catch { continue; }
            }
            if (Array.isArray(parsed)) {
                for (const item of parsed) if (looksLikeProfile(item)) pushProfile(item);
            } else if (looksLikeProfile(parsed)) {
                pushProfile(parsed);
            }
        }
    }

    return result;
}

function ImportMikhmonModal({ isOpen, onClose, onSubmit, isSubmitting }) {
    const [rawText, setRawText] = useState('');
    const [parsed, setParsed] = useState([]);
    const [error, setError] = useState(null);
    const [fileName, setFileName] = useState('');

    useEffect(() => {
        if (!isOpen) { setRawText(''); setParsed([]); setError(null); setFileName(''); }
    }, [isOpen]);

    const handleFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFileName(f.name);
        try {
            const text = await f.text();
            setRawText(text);
            doParse(text);
        } catch (err) {
            setError('Gagal baca file: ' + err.message);
        }
    };

    const doParse = (text) => {
        setError(null);
        try {
            const json = JSON.parse(text);
            const items = parseMikhmonBackup(json);
            if (items.length === 0) {
                setError('Tidak ditemukan profile di file. Format MikHMON tidak dikenali.');
                setParsed([]);
            } else {
                setParsed(items);
            }
        } catch (err) {
            setError('JSON tidak valid: ' + err.message);
            setParsed([]);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import dari MikHMON Backup" maxWidth="max-w-3xl">
            <div className="space-y-4">
                <div className="text-xs text-slate-300 bg-slate-900/40 border border-slate-700/40 rounded-lg p-3 leading-relaxed">
                    <p className="font-semibold text-slate-200 mb-1">Cara dapat file backup:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                        <li>Buka MikHMON eksternal Anda di browser yang sama dengan setup biasa</li>
                        <li>Menu <strong>Settings → Backup → Backup Local Storage</strong></li>
                        <li>Download file <code className="bg-slate-800 px-1 rounded text-[10px]">mikhmon-backup-*.json</code></li>
                        <li>Upload file itu di sini</li>
                    </ol>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-700 hover:border-primary/40 hover:bg-slate-900/40 cursor-pointer transition-colors text-sm text-slate-300">
                        <input type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
                        <span>📁 {fileName || 'Pilih file JSON…'}</span>
                    </label>

                    <details className="text-xs text-slate-400">
                        <summary className="cursor-pointer hover:text-slate-200">atau paste JSON langsung</summary>
                        <textarea
                            value={rawText}
                            onChange={(e) => { setRawText(e.target.value); doParse(e.target.value); }}
                            rows={6}
                            placeholder='{"profiles":[{"name":"PAKET-1HARI","validity":"1d","price":"5000","selling":"5000"},...]}'
                            className="mt-2 w-full bg-slate-900/60 border border-slate-700/60 text-slate-200 text-[11px] font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </details>
                </div>

                {error && (
                    <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{error}</div>
                )}

                {parsed.length > 0 && (
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                            Preview — {parsed.length} profile terdeteksi
                        </div>
                        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0">
                                    <tr>
                                        <th className="text-left px-3 py-2">Nama</th>
                                        <th className="text-left px-3 py-2">Masa Berlaku</th>
                                        <th className="text-left px-3 py-2">Uptime</th>
                                        <th className="text-right px-3 py-2">Harga</th>
                                        <th className="text-right px-3 py-2">Harga Jual</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {parsed.map((p) => (
                                        <tr key={p.profileName}>
                                            <td className="px-3 py-1.5 font-semibold text-slate-200">{p.profileName}</td>
                                            <td className="px-3 py-1.5 font-mono text-emerald-300">{p.validity || '—'}</td>
                                            <td className="px-3 py-1.5 font-mono text-cyan-300">{p.limitUptime || '—'}</td>
                                            <td className="px-3 py-1.5 font-mono text-right text-slate-300">{p.price ? p.price.toLocaleString('id-ID') : '—'}</td>
                                            <td className="px-3 py-1.5 font-mono text-right text-emerald-300">{p.sellingPrice ? p.sellingPrice.toLocaleString('id-ID') : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button
                        type="button"
                        onClick={() => onSubmit(parsed)}
                        loading={isSubmitting}
                        disabled={isSubmitting || parsed.length === 0}
                    >
                        <Save className="w-4 h-4 mr-1" />
                        Import {parsed.length > 0 ? `${parsed.length} Profile` : ''}
                    </Button>
                </div>
            </div>
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
    const [showImport, setShowImport] = useState(false);
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
        // Pass the full MikHMON v3 payload to the install endpoint so it
        // can bake every field into the on-login `:local` block. The
        // backend also upserts to mikhmon_profile_settings so the DB row
        // stays in sync — frontend doesn't need a separate upsert call.
        installMutation.mutate(
            { profileId: installing.id, input: payload },
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

    // Count profiles whose Harga Jual + Masa Berlaku is empty — these are
    // the ones that need Setup Cepat for Reports income to compute. We
    // skip the RouterOS-default profile (always there, never used for
    // vouchers) so it doesn't pad the warning count.
    const profilesMissingBilling = useMemo(() => {
        return profiles.filter((p) => {
            if (p.default) return false;
            const b = resolveBilling(p);
            const hasPrice = b?.sellingPrice && Number(b.sellingPrice) > 0;
            const hasValidity = !!b?.validity;
            return !hasPrice && !hasValidity;
        });
    }, [profiles, billingByName]); // eslint-disable-line react-hooks/exhaustive-deps

    // Detect profiles managed by an OUTDATED Phase A10 script template
    // (carries `#mikhmon-managed` but missing the v3 reference :local
    // declarations). Operator needs to re-install via the wizard to get
    // the new template that is byte-compatible with MikHMON external.
    const profilesOutdatedScript = useMemo(() => {
        return profiles.filter((p) => {
            if (p.default) return false;
            const ol = String(p.onLogin || '');
            if (!ol.includes('#mikhmon-managed')) return false;
            // v3 reference must have :local validity "..." or :local sellingPrice
            const hasV3Header = /:local\s+validity\s+"/.test(ol) || /:local\s+sellingPrice\s+"/.test(ol);
            return !hasV3Header;
        });
    }, [profiles]);

    const [reinstalling, setReinstalling] = useState(false);
    const bulkReinstall = async () => {
        if (profilesOutdatedScript.length === 0) return;
        setReinstalling(true);
        let ok = 0, fail = 0;
        for (const p of profilesOutdatedScript) {
            // Reuse billing settings + parsed mikhmonConfig as defaults
            const b = resolveBilling(p) || {};
            try {
                await installMutation.mutateAsync({
                    profileId: p.id,
                    input: {
                        validity: b.validity || '1d',
                        expiredMode: b.expiredMode || 'Remove',
                        price: b.price ? Number(b.price) : 0,
                        sellingPrice: b.sellingPrice ? Number(b.sellingPrice) : (b.price ? Number(b.price) : 0),
                        sharing: b.sharedUsers ?? b.sharing ?? 1,
                        lockUser: !!b.lockUser,
                        limitUptime: b.limitUptime || undefined,
                        userMode: b.userMode || 'vc',
                        nameLength: b.nameLength ?? 4,
                        prefix: b.prefix || '',
                        charType: b.charType || 'lowcase',
                        serverName: b.serverName || '',
                    },
                });
                ok++;
            } catch {
                fail++;
            }
        }
        setReinstalling(false);
        if (fail === 0) toast.success(`${ok} profile berhasil di-update ke MikHMON v3`);
        else toast.error(`${ok} sukses, ${fail} gagal — cek koneksi router`);
    };

    const handleAdd = (payload) => {
        // Extract MikHMON-only fields so the MikroTik /add call gets just
        // the RouterOS-native profile fields. mikhmon* fields are handled
        // after the profile is successfully created.
        const {
            mikhmonValidity,
            mikhmonLimitUptime,
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
                    || !!(mikhmonLimitUptime || '').trim()
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
                            limitUptime: (mikhmonLimitUptime || '').trim() || undefined,
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
                        onClick={() => setShowImport(true)}
                        disabled={!selectedRouterId}
                        title="Upload file backup MikHMON eksternal (JSON) → otomatis isi harga semua profile"
                    >
                        <Upload className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Import </span>MikHMON
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowBulkSetup(true)}
                        disabled={!selectedRouterId || profiles.length === 0}
                        title="Bulk setup harga + masa berlaku untuk semua profile sekaligus"
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
            {/* Setup banner — shows when there's at least one profile
                without price/validity set. MikHMON external stores those
                in browser localStorage, so existing setups land here with
                empty fields and Reports income = Rp 0 until operator
                clicks Setup Cepat. */}
            {!isPending && profilesOutdatedScript.length > 0 && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center text-xl">⚡</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-cyan-200">
                            {profilesOutdatedScript.length} profile pakai script versi lama (pre-A11)
                        </div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            Script on-login profile-profile ini perlu di-update ke MikHMON v3 reference template supaya
                            kolom Validity / Harga / Mode Kedaluwarsa <strong>roundtrip jalan</strong> (tidak hilang setelah refresh),
                            dan <strong>byte-compatible</strong> dengan MikHMON eksternal.
                            <br /><br />
                            <span className="text-amber-300">⚠ Backup script lama via Winbox export kalau ada customisasi manual sebelum klik Re-install.</span>
                        </p>
                        <Button
                            size="sm"
                            onClick={bulkReinstall}
                            disabled={reinstalling || installMutation.isPending}
                            loading={reinstalling}
                            className="mt-3"
                        >
                            <Zap className="w-4 h-4 mr-1" />
                            Re-install Semua ({profilesOutdatedScript.length})
                        </Button>
                    </div>
                </div>
            )}

            {!isPending && profilesMissingBilling.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-xl">⚠️</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-amber-200">
                            {profilesMissingBilling.length} profile belum di-set Masa Berlaku / Harga Jual
                        </div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            MikHMON eksternal simpan harga di <strong>browser localStorage</strong>, bukan di MikroTik.
                            Jadi profile yang sudah ada perlu diisi sekali di app ini.
                            Setelah disimpan, Reports income langsung muncul.
                        </p>
                        <Button
                            size="sm"
                            onClick={() => setShowBulkSetup(true)}
                            className="mt-3"
                        >
                            <ListPlus className="w-4 h-4 mr-1" />
                            Setup Cepat Sekarang
                        </Button>
                    </div>
                </div>
            )}

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
                                        <div className="flex flex-col gap-0.5">
                                            <span title="Masa Berlaku — sejak first login" className={b?.validity ? 'text-emerald-300' : 'text-slate-600'}>
                                                {b?.validity || '—'}
                                            </span>
                                            <span title="Limit Uptime — cumulative connect time" className={b?.limitUptime ? 'text-cyan-300 text-[10px]' : 'text-slate-700 text-[10px]'}>
                                                {b?.limitUptime ? `⏱ ${b.limitUptime}` : ''}
                                            </span>
                                        </div>
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
                defaults={installing ? {
                    ...(resolveBilling(installing) || {}),
                    // mikhmonConfig (parsed from on-login) carries extra MikHMON
                    // v3 fields like userMode/prefix/charType. Merge so the
                    // modal pre-fills exactly what's currently in the script.
                    ...(installing.mikhmonConfig || {}),
                } : {}}
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

            <ImportMikhmonModal
                isOpen={showImport}
                onClose={() => setShowImport(false)}
                onSubmit={(items) => {
                    // Filter to profiles that actually exist on this router so
                    // we don't pollute settings with stale profile names from
                    // the operator's old MikHMON setup.
                    const existing = new Set(profiles.map((p) => p.name));
                    const filtered = items.filter((it) => existing.has(it.profileName));
                    if (filtered.length === 0) {
                        toast.error('Tidak ada profile dalam backup yang cocok dengan router ini');
                        return;
                    }
                    bulkBillingMutation.mutate(filtered, {
                        onSuccess: () => setShowImport(false),
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
