import React, { useState, useMemo, useEffect } from 'react';
import { Ticket, RefreshCw, Search, Plus, Trash2, Copy, Printer, AlertCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useMikhmonVouchers,
    useGenerateMikhmonVouchers,
    useDeleteMikhmonVoucher,
    useHotspotUserProfiles,
} from '@/hooks/useMikhmon';
import { useMikhmonInfo } from '@/hooks/useMikhmon';
import { MODE_DESCRIPTORS } from '@/components/mikhmon/ModeBadge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-native voucher generator + manager.
 *
 * Behaves identical to MikHMON external: writes go straight to MikroTik
 * /ip/hotspot/user with the v3 legacy comment (`vc-NNN-mm.dd.yy-note`).
 * The Billing parser picks the entries up automatically when the router
 * is in `hotspot_mode=mikhmon_bridge`. When mode is `native`, a banner
 * + toast warn the operator that these vouchers won't sync to Billing.
 */

const CHARSETS = [
    { v: 'num', label: 'Numeric (0-9)' },
    { v: 'lower', label: 'Lower (a-z)' },
    { v: 'upper', label: 'Upper (A-Z)' },
    { v: 'mix', label: 'Mixed (a-z,A-Z)' },
    { v: 'alnum', label: 'Alphanumeric (a-z,0-9)' },
];

const EMPTY_FORM = {
    count: 10,
    length: 6,
    charset: 'num',
    prefix: '',
    profile: 'default',
    server: '',
    mode: 'vc',
    limitUptime: '',
    limitBytesTotal: '',
    noteOverride: '',
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

function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
            () => toast.success('Disalin ke clipboard'),
            () => toast.error('Gagal salin'),
        );
    } else {
        toast.error('Clipboard tidak tersedia');
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Generate Form
// ─────────────────────────────────────────────────────────────────────────

function GenerateModal({ isOpen, onClose, onSubmit, isSubmitting, profiles, modeHint }) {
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (isOpen) setForm(EMPTY_FORM);
    }, [isOpen]);

    // Auto-fill limitUptime from the selected profile's billing config
    // (operator can still override). Updates only when the operator's
    // current limitUptime is empty so we don't clobber a manual entry.
    useEffect(() => {
        if (!form.profile || !profiles?.length) return;
        const p = profiles.find((x) => x.name === form.profile);
        const billing = p?.billing;
        if (!billing) return;
        setForm((f) => {
            const next = { ...f };
            if (!f.limitUptime?.trim() && billing.limitUptime) next.limitUptime = billing.limitUptime;
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.profile, profiles]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            count: parseInt(form.count, 10),
            length: parseInt(form.length, 10),
            charset: form.charset,
            prefix: form.prefix?.trim() || undefined,
            profile: form.profile,
            server: form.server?.trim() || undefined,
            mode: form.mode,
            limitUptime: form.limitUptime?.trim() || undefined,
            limitBytesTotal: form.limitBytesTotal?.trim() || undefined,
            noteOverride: form.noteOverride?.trim() || undefined,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Generate Voucher Hotspot" maxWidth="max-w-2xl">
            {modeHint === 'native' && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <strong>Mode: Billing App (native).</strong> Voucher yang dibuat di sini tidak akan ter-track otomatis di Billing app — pakai tab Billing kalau ingin masuk Billing tracking.
                    </div>
                </div>
            )}
            {modeHint === 'mikhmon_bridge' && (
                <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <strong>Mode: MikHMON Bridge.</strong> Voucher akan otomatis ter-track di Billing app via comment parser dalam 1 sync cycle.
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Labels match MikHMON external 1:1 so operators don't relearn
                    naming. Layout split into two visual groups:
                      1. Identitas voucher — Qty/Server/User Mode/Profile
                      2. Format kode — Name Length/Prefix/Char Type/Comment
                      3. Limit RouterOS — Time Limit/Data Limit (optional override) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Qty *" hint="jumlah voucher di-generate (1-500)">
                        <input
                            type="number"
                            min={1}
                            max={500}
                            value={form.count}
                            onChange={(e) => set('count', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            required
                        />
                    </Field>
                    <Field label="Server" hint="hotspot server · kosong = all">
                        <input
                            type="text"
                            value={form.server}
                            onChange={(e) => set('server', e.target.value)}
                            placeholder="all"
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="User Mode" hint="vc = username = password (1 kode) · up = user + password terpisah">
                        <select
                            value={form.mode}
                            onChange={(e) => set('mode', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="vc">vc (single code)</option>
                            <option value="up">up (user + password)</option>
                        </select>
                    </Field>
                    <Field label="Profile *" hint="paket dari User Profile (validity + harga sudah di-set di sana)">
                        <select
                            value={form.profile}
                            onChange={(e) => set('profile', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            required
                        >
                            <option value="default">default</option>
                            {(profiles || []).filter((p) => p.name !== 'default').map((p) => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                        </select>
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                    <Field label="Name Length" hint="3-20">
                        <input
                            type="number"
                            min={3}
                            max={20}
                            value={form.length}
                            onChange={(e) => set('length', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="Prefix" hint="depan kode">
                        <input
                            type="text"
                            value={form.prefix}
                            onChange={(e) => set('prefix', e.target.value)}
                            placeholder=""
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="Char Type" span={2}>
                        <select
                            value={form.charset}
                            onChange={(e) => set('charset', e.target.value)}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {CHARSETS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Comment" hint="muncul di comment field MikroTik · default = nama profile" span={2}>
                        <input
                            type="text"
                            value={form.noteOverride}
                            onChange={(e) => set('noteOverride', e.target.value)}
                            placeholder="(default = nama profile)"
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="Time Limit" hint="override durasi · contoh: 1d, 12h">
                        <input
                            type="text"
                            value={form.limitUptime}
                            onChange={(e) => set('limitUptime', e.target.value)}
                            placeholder=""
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                    <Field label="Data Limit" hint="override quota · contoh: 5G">
                        <input
                            type="text"
                            value={form.limitBytesTotal}
                            onChange={(e) => set('limitBytesTotal', e.target.value)}
                            placeholder=""
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </Field>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>Generate</Button>
                </div>
            </form>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Print Modal — browser-native print of voucher cards
// ─────────────────────────────────────────────────────────────────────────

function PrintModal({ isOpen, onClose, vouchers, routerName }) {
    if (!isOpen) return null;

    const handlePrint = () => {
        // Print just the inner content. Easiest cross-browser: open a new window.
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        const html = `<!doctype html>
<html><head><title>Voucher Hotspot</title>
<style>
  @page { margin: 10mm; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 12px; color: #000; }
  h1 { font-size: 14px; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .card { border: 1px dashed #555; padding: 8px 10px; break-inside: avoid; }
  .card .row { display: flex; justify-content: space-between; font-size: 9px; color: #555; margin-bottom: 4px; }
  .card .code { font-family: ui-monospace, monospace; font-size: 16px; font-weight: bold; letter-spacing: 1px; }
  .card .meta { font-size: 9px; color: #777; margin-top: 2px; }
  @media print { .noprint { display: none; } }
</style></head>
<body>
<h1>Voucher Hotspot — ${routerName || ''} · ${new Date().toLocaleDateString('id-ID')}</h1>
<div class="grid">
${vouchers.map((v) => `
  <div class="card">
    <div class="row"><span>USER</span><span>${v.profile || ''}</span></div>
    <div class="code">${v.name}</div>
    ${v.mode === 'up' ? `<div class="row" style="margin-top:6px"><span>PASS</span></div><div class="code">${v.password || ''}</div>` : ''}
    <div class="meta">${v.note || ''}${v.limitUptime ? ' · ' + v.limitUptime : ''}</div>
  </div>
`).join('')}
</div>
<script>setTimeout(() => window.print(), 200);</script>
</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Print ${vouchers.length} Voucher`} maxWidth="max-w-2xl">
            <div className="space-y-3">
                <p className="text-xs text-slate-400">
                    Preview voucher yang akan dicetak. Klik <span className="font-bold">Print</span> untuk buka jendela print browser.
                </p>
                <div className="max-h-72 overflow-y-auto custom-scrollbar bg-slate-900/50 border border-slate-700/40 rounded-lg p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {vouchers.map((v) => (
                            <div key={v.id || v.name} className="border border-dashed border-slate-600 p-2 rounded">
                                <div className="text-[9px] uppercase tracking-wider text-slate-500 flex justify-between">
                                    <span>USER</span><span>{v.profile}</span>
                                </div>
                                <div className="font-mono font-bold text-slate-100 text-sm tracking-wider">{v.name}</div>
                                {v.mode === 'up' && (
                                    <>
                                        <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-1">PASS</div>
                                        <div className="font-mono font-bold text-slate-100 text-sm tracking-wider">{v.password}</div>
                                    </>
                                )}
                                <div className="text-[9px] text-slate-500 mt-1">{v.note || ''}{v.limitUptime ? ` · ${v.limitUptime}` : ''}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button variant="ghost" onClick={onClose}>Tutup</Button>
                    <Button onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-1" />
                        Print
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function VouchersPage() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: info } = useMikhmonInfo(selectedRouterId);
    const { data: profiles = [] } = useHotspotUserProfiles(selectedRouterId);
    const { data: payload, isPending, isError, refetch, isFetching } = useMikhmonVouchers(selectedRouterId);
    const generateMutation = useGenerateMikhmonVouchers(selectedRouterId);
    const deleteMutation = useDeleteMikhmonVoucher(selectedRouterId);

    const items = payload?.data || [];
    const modeHint = payload?.modeHint || info?.hotspotMode || 'disabled';

    const [showGenerate, setShowGenerate] = useState(false);
    const [printList, setPrintList] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((v) =>
            String(v.name || '').toLowerCase().includes(q) ||
            String(v.profile || '').toLowerCase().includes(q) ||
            String(v.note || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const toggleSelect = (id) => {
        setSelectedIds((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleGenerate = (input) => {
        generateMutation.mutate(input, {
            onSuccess: (resp) => {
                setShowGenerate(false);
                // Offer to print the freshly generated batch
                const created = resp?.data?.created || [];
                if (created.length > 0) {
                    setPrintList(created.map((c, i) => ({
                        id: `new-${i}`,
                        name: c.name,
                        password: c.password,
                        profile: input.profile,
                        mode: input.mode,
                        note: input.noteOverride || input.profile,
                        limitUptime: input.limitUptime,
                    })));
                }
            },
        });
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    const handlePrintSelected = () => {
        const list = items.filter((v) => selectedIds.has(v.id));
        if (list.length === 0) {
            toast.error('Pilih voucher dulu yang mau dicetak (centang baris).');
            return;
        }
        setPrintList(list);
    };

    const desc = MODE_DESCRIPTORS[modeHint] || MODE_DESCRIPTORS.disabled;

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Ticket className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Voucher Hotspot</h1>
                        <p className="text-xs text-slate-500">Generate voucher format MikHMON v3 langsung ke MikroTik.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                    {selectedIds.size > 0 && (
                        <Button size="sm" variant="secondary" onClick={handlePrintSelected}>
                            <Printer className="w-4 h-4 mr-1" />
                            Print ({selectedIds.size})
                        </Button>
                    )}
                    <Button size="sm" onClick={() => setShowGenerate(true)} disabled={!selectedRouterId}>
                        <Plus className="w-4 h-4 mr-1" />
                        Generate
                    </Button>
                </div>
            </div>

            {/* Mode badge — operator always knows what tracking they're getting */}
            <div className={clsx('rounded-lg border p-3 flex items-start gap-3', desc.ring)}>
                <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', desc.dot)} />
                <div className="flex-1 text-xs">
                    <div className={clsx('font-bold uppercase tracking-tight', desc.text)}>Mode: {desc.label}</div>
                    <p className="text-slate-400 mt-1 leading-relaxed">{desc.tooltip}</p>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari kode, profile, atau note…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil daftar voucher.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="w-8 px-2 py-2.5">
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedIds(new Set(filtered.map((v) => v.id)));
                                            else setSelectedIds(new Set());
                                        }}
                                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                    />
                                </th>
                                <th className="text-left px-4 py-2.5">Code</th>
                                <th className="text-left px-4 py-2.5">Mode</th>
                                <th className="text-left px-4 py-2.5">Profile</th>
                                <th className="text-left px-4 py-2.5">Note</th>
                                <th className="text-left px-4 py-2.5">Uptime / Limit</th>
                                <th className="text-left px-4 py-2.5">Generated</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs">
                                    {items.length === 0 ? 'Belum ada voucher. Klik "Generate" untuk mulai.' : 'Tidak ada voucher cocok.'}
                                </td></tr>
                            ) : filtered.map((v) => (
                                <tr key={v.id} className={clsx('hover:bg-slate-800/30 transition-colors', v.disabled && 'opacity-50')}>
                                    <td className="px-2 py-2.5">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(v.id)}
                                            onChange={() => toggleSelect(v.id)}
                                            className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                        />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-slate-100 text-sm tracking-wider">{v.name}</span>
                                            <button
                                                onClick={() => copyToClipboard(v.name)}
                                                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5"
                                                title="Copy code"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                        </div>
                                        {v.mode === 'up' && v.password && (
                                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">pwd: {v.password}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight bg-slate-700/50 text-slate-300">
                                            {v.mode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="text-[10px] px-2 py-0.5 rounded font-bold border bg-primary/15 text-primary border-primary/30 uppercase tracking-tight">
                                            {v.profile || 'default'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[150px] truncate">{v.note || ''}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                                        {v.uptime || '0s'}{v.limitUptime ? ` / ${v.limitUptime}` : ''}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500">
                                        {v.generatedAt ? new Date(v.generatedAt).toLocaleDateString('id-ID') : '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button
                                            onClick={() => setDeleting(v)}
                                            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                            title="Hapus"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
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
                        {selectedIds.size > 0 && <> · <span className="text-primary">{selectedIds.size} dipilih</span></>}
                    </div>
                )}
            </div>

            <GenerateModal
                isOpen={showGenerate}
                onClose={() => setShowGenerate(false)}
                onSubmit={handleGenerate}
                isSubmitting={generateMutation.isPending}
                profiles={profiles}
                modeHint={modeHint}
            />

            <PrintModal
                isOpen={!!printList}
                onClose={() => setPrintList(null)}
                vouchers={printList || []}
                routerName={info?.router?.name}
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Voucher"
                message="Voucher akan dihapus dari MikroTik. User yang sedang pakai voucher ini akan terputus saat reconnect."
                itemName={deleting?.name || ''}
                confirmText="Hapus Voucher"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
