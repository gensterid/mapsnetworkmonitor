import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Receipt, Users as UsersIcon, Package as PackageIcon, Repeat, Settings as SettingsIcon, Plus, RefreshCw, Search, Lock, Unlock, Trash2, Pencil, Eye, X, Ticket, Printer, BarChart3, MessageSquare, Send, CreditCard, Copy, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import {
    usePackages, useCreatePackage, useUpdatePackage, useDeletePackage,
    useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
    useSubscriptions, useCreateSubscription, useUpdateSubscription, useDeleteSubscription,
    useIsolirSubscription, useUnisolirSubscription, revealSubscriptionPassword,
    useInvoices, useCreateInvoice, usePayInvoice, useCancelInvoice,
    useBillingRouterSettings, useUpdateBillingRouterSettings,
    useVouchersForRouter, useVoucherBatches, useGenerateVoucherBatch, useDeleteVoucherBatch,
    useBillingOverview, useRevenueByMonth, useAgingReport, useTopPayers, useVoucherSales, useRecentPayments,
    useWaLog, useWaTest,
    useCreatePaymentLink,
    useMikrotikPppProfiles, useCreatePppProfile, useIsolirFirewallStatus, useSetupIsolirFirewall,
    useBillingSchedulerStatus, useSetupBillingScheduler,
    useCommentAudit, useResyncComment,
    useImportCandidates,
    useRouters,
} from '@/hooks';
import toast from 'react-hot-toast';

const TABS = [
    { id: 'customers', label: 'Pelanggan', icon: UsersIcon },
    { id: 'packages', label: 'Paket', icon: PackageIcon },
    { id: 'subscriptions', label: 'Subscription', icon: Repeat },
    { id: 'invoices', label: 'Tagihan', icon: Receipt },
    { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket },
    { id: 'reports', label: 'Laporan', icon: BarChart3 },
    { id: 'wa', label: 'Notifikasi WA', icon: MessageSquare },
    { id: 'settings', label: 'Pengaturan Router', icon: SettingsIcon },
];

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
    if (!open) return null;
    // Render via portal so the modal escapes any ancestor with transform /
    // overflow / containing-block that would otherwise pin `position: fixed`
    // to a scrolled content area instead of the viewport.
    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className={`w-full ${maxWidth} bg-surface-dark border border-slate-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}>
                <div className="flex items-center justify-between border-b border-slate-border px-4 sm:px-5 py-3 shrink-0">
                    <h3 className="font-semibold text-fg text-sm sm:text-base">{title}</h3>
                    <button onClick={onClose} aria-label="Close" className="text-fg-muted hover:text-fg min-h-10 min-w-10 flex items-center justify-center -mr-2"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0">{children}</div>
                {footer && <div className="border-t border-slate-border px-4 sm:px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">{footer}</div>}
            </div>
        </div>,
        document.body
    );
}

function Field({ label, children }) {
    return (
        <label className="block mb-3">
            <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">{label}</span>
            {children}
        </label>
    );
}
const inputCls = 'w-full bg-slate-surface border border-slate-border rounded px-3 py-2 text-fg text-sm focus:ring-1 focus:ring-primary';

// ─── Pelanggan tab ─────────────────────────────────────────────────────────
function CustomersTab() {
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const { data: rows = [], isLoading, refetch, isRefetching } = useCustomers({ search });
    const create = useCreateCustomer();
    const update = useUpdateCustomer();
    const del = useDeleteCustomer();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
            name: f.get('name'),
            phone: f.get('phone') || null,
            email: f.get('email') || null,
            address: f.get('address') || null,
            pinCode: f.get('pinCode') || undefined,
            notes: f.get('notes') || null,
        };
        if (editing) await update.mutateAsync({ id: editing.id, ...payload });
        else await create.mutateAsync(payload);
        setModalOpen(false); setEditing(null);
    };

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <CardTitle className="text-base flex items-center gap-2"><UsersIcon className="w-5 h-5 text-primary" /> Pelanggan</CardTitle>
                <div className="flex gap-2 items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama/kode/HP…" className="bg-surface-dark border border-slate-border text-fg text-xs rounded pl-9 pr-3 py-1.5 w-full sm:w-56" />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Kode</th><th className="text-left px-4 py-2">Nama</th><th className="text-left px-4 py-2">HP</th><th className="text-left px-4 py-2">Alamat</th><th className="text-left px-4 py-2">PIN</th><th className="px-4 py-2 w-24"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-fg-muted">Belum ada pelanggan</td></tr> : rows.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 font-mono text-fg">{c.code}</td>
                                        <td className="px-4 py-2 text-fg">{c.name}</td>
                                        <td className="px-4 py-2 text-fg-muted">{c.phone || '—'}</td>
                                        <td className="px-4 py-2 text-fg-muted text-xs max-w-xs truncate">{c.address || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-amber-400">{c.pinCode}</td>
                                        <td className="px-4 py-2 text-right space-x-1">
                                            <button onClick={() => { setEditing(c); setModalOpen(true); }} className="text-fg-muted hover:text-primary"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => { if (confirm(`Hapus pelanggan ${c.name}?`)) del.mutate(c.id); }} className="text-fg-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? `Edit ${editing.name}` : 'Tambah Pelanggan'} footer={<>
                <Button variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>Batal</Button>
                <Button form="cust-form" type="submit" loading={create.isPending || update.isPending}>{editing ? 'Simpan' : 'Buat'}</Button>
            </>}>
                <form id="cust-form" onSubmit={handleSubmit}>
                    <Field label="Nama"><input name="name" defaultValue={editing?.name} required className={inputCls} /></Field>
                    <Field label="Nomor HP"><input name="phone" defaultValue={editing?.phone || ''} className={inputCls} /></Field>
                    <Field label="Email"><input name="email" type="email" defaultValue={editing?.email || ''} className={inputCls} /></Field>
                    <Field label="Alamat"><textarea name="address" defaultValue={editing?.address || ''} className={inputCls} rows={2} /></Field>
                    <Field label="PIN (4-8 digit, kosong = otomatis dari HP)"><input name="pinCode" defaultValue={editing?.pinCode || ''} className={inputCls} /></Field>
                    <Field label="Catatan"><textarea name="notes" defaultValue={editing?.notes || ''} className={inputCls} rows={2} /></Field>
                </form>
            </Modal>
        </Card>
    );
}

// ─── Paket tab ─────────────────────────────────────────────────────────────
function PackagesTab() {
    const [editing, setEditing] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [routerForProfiles, setRouterForProfiles] = useState('');
    const { data: rows = [], isLoading, refetch, isRefetching } = usePackages();
    const create = useCreatePackage();
    const update = useUpdatePackage();
    const del = useDeletePackage();
    const { data: routers = [] } = useRouters();
    const { data: pppProfiles = [], isLoading: pppProfilesLoading, isError: pppProfilesError } = useMikrotikPppProfiles(routerForProfiles);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
            name: f.get('name'),
            type: f.get('type'),
            mikrotikProfile: f.get('mikrotikProfile'),
            price: Number(f.get('price')) || 0,
            cycleType: f.get('cycleType'),
            cycleValue: Number(f.get('cycleValue')) || 1,
            description: f.get('description') || null,
            routerId: f.get('routerId') || null,
            active: f.get('active') === 'on',
        };
        if (editing) await update.mutateAsync({ id: editing.id, ...payload });
        else await create.mutateAsync(payload);
        setModalOpen(false); setEditing(null);
    };

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <CardTitle className="text-base flex items-center gap-2"><PackageIcon className="w-5 h-5 text-primary" /> Paket Layanan</CardTitle>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Nama</th><th className="text-left px-4 py-2">Tipe</th><th className="text-left px-4 py-2">Profile</th><th className="text-right px-4 py-2">Harga</th><th className="text-left px-4 py-2">Cycle</th><th className="text-center px-4 py-2">Aktif</th><th className="px-4 py-2 w-20"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-muted">Belum ada paket</td></tr> : rows.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 text-fg">{p.name}</td>
                                        <td className="px-4 py-2"><span className={clsx('text-xs px-2 py-0.5 rounded', p.type === 'pppoe' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400')}>{p.type.toUpperCase()}</span></td>
                                        <td className="px-4 py-2 font-mono text-fg-muted text-xs">{p.mikrotikProfile}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(p.price)}</td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{p.cycleType === 'monthly' ? `${p.cycleValue} bln` : `${p.cycleValue} dtk`}</td>
                                        <td className="px-4 py-2 text-center">{p.active ? '✓' : '—'}</td>
                                        <td className="px-4 py-2 text-right space-x-1">
                                            <button onClick={() => { setEditing(p); setModalOpen(true); }} className="text-fg-muted hover:text-primary"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => { if (confirm(`Hapus paket ${p.name}?`)) del.mutate(p.id); }} className="text-fg-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? `Edit ${editing.name}` : 'Tambah Paket'} footer={<>
                <Button variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>Batal</Button>
                <Button form="pkg-form" type="submit" loading={create.isPending || update.isPending}>{editing ? 'Simpan' : 'Buat'}</Button>
            </>}>
                <form id="pkg-form" onSubmit={handleSubmit}>
                    <Field label="Nama Paket"><input name="name" defaultValue={editing?.name} required className={inputCls} /></Field>
                    <Field label="Tipe">
                        <select name="type" defaultValue={editing?.type || 'pppoe'} className={inputCls}>
                            <option value="pppoe">PPPoE</option>
                            <option value="hotspot">Hotspot</option>
                        </select>
                    </Field>
                    <Field label="Router untuk preview profile (opsional)">
                        <select value={routerForProfiles} onChange={(e) => setRouterForProfiles(e.target.value)} className={inputCls}>
                            <option value="">— pilih router supaya muncul daftar profile —</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="MikroTik Profile (harus ada di router target)">
                        {routerForProfiles && pppProfilesLoading ? (
                            <div className={inputCls + ' text-fg-muted flex items-center gap-2'}>
                                <RefreshCw className="w-3 h-3 animate-spin" /> Memuat profile dari router…
                            </div>
                        ) : routerForProfiles && pppProfiles.length > 0 ? (
                            <>
                                <select name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls}>
                                    <option value="">— pilih dari profile yang ada —</option>
                                    {pppProfiles.map(p => <option key={p.id} value={p.name}>{p.name} {p.rateLimit ? `(${p.rateLimit})` : ''}</option>)}
                                </select>
                                <p className="text-xs text-fg-muted mt-1">{pppProfiles.length} profile ditemukan di router</p>
                            </>
                        ) : routerForProfiles && pppProfilesError ? (
                            <>
                                <input name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls} placeholder="contoh: pppoe-home-10m" />
                                <p className="text-xs text-amber-400 mt-1">⚠ Tidak bisa baca profile dari router (timeout). Ketik manual nama profile.</p>
                            </>
                        ) : (
                            <input name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls} placeholder="contoh: pppoe-home-10m" />
                        )}
                    </Field>
                    <Field label="Harga (IDR)"><input name="price" type="number" min="0" defaultValue={editing?.price || 0} required className={inputCls} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Cycle Type">
                            <select name="cycleType" defaultValue={editing?.cycleType || 'monthly'} className={inputCls}>
                                <option value="monthly">Bulanan</option>
                                <option value="duration">Durasi (detik)</option>
                            </select>
                        </Field>
                        <Field label="Cycle Value"><input name="cycleValue" type="number" min="1" defaultValue={editing?.cycleValue || 1} required className={inputCls} /></Field>
                    </div>
                    <Field label="Khusus Router (opsional)">
                        <select name="routerId" defaultValue={editing?.routerId || ''} className={inputCls}>
                            <option value="">Semua router tenant</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Deskripsi"><textarea name="description" defaultValue={editing?.description || ''} className={inputCls} rows={2} /></Field>
                    <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="active" defaultChecked={editing?.active !== false} /> Aktif</label>
                </form>
            </Modal>
        </Card>
    );
}

// ─── Subscription tab ──────────────────────────────────────────────────────
function SubscriptionsTab() {
    const [modalOpen, setModalOpen] = useState(false);
    const [pwdShown, setPwdShown] = useState({});
    const { data: rows = [], isLoading, refetch, isRefetching } = useSubscriptions();
    const { data: customers = [] } = useCustomers();
    const { data: pkgs = [] } = usePackages();
    const { data: routers = [] } = useRouters();
    const create = useCreateSubscription();
    const update = useUpdateSubscription();
    const del = useDeleteSubscription();
    const isolir = useIsolirSubscription();
    const unisolir = useUnisolirSubscription();
    const [editingSub, setEditingSub] = useState(null);

    const custMap = useMemo(() => Object.fromEntries(customers.map(c => [c.id, c])), [customers]);
    const pkgMap = useMemo(() => Object.fromEntries(pkgs.map(p => [p.id, p])), [pkgs]);
    const routerMap = useMemo(() => Object.fromEntries(routers.map(r => [r.id, r])), [routers]);

    // Form state (controlled) — needed so "Pilih dari MikroTik" can fill fields
    const [subRouterId, setSubRouterId] = useState('');
    const [subIdentity, setSubIdentity] = useState('');
    const [subPassword, setSubPassword] = useState('');
    const [subPickerOpen, setSubPickerOpen] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const { data: importCandidates = [], isLoading: importLoading } = useImportCandidates(subRouterId, 'pppoe');
    const filteredCandidates = useMemo(() => {
        const q = pickerSearch.trim().toLowerCase();
        if (!q) return importCandidates;
        return importCandidates.filter((c) =>
            c.name?.toLowerCase().includes(q) ||
            c.profile?.toLowerCase().includes(q) ||
            c.comment?.toLowerCase().includes(q)
        );
    }, [importCandidates, pickerSearch]);

    const resetSubForm = () => {
        setSubRouterId(''); setSubIdentity(''); setSubPassword(''); setSubPickerOpen(false); setPickerSearch('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await create.mutateAsync({
            customerId: f.get('customerId'),
            packageId: f.get('packageId'),
            routerId: subRouterId || f.get('routerId'),
            mikrotikIdentity: subIdentity || f.get('mikrotikIdentity'),
            plainPassword: subPassword || f.get('plainPassword'),
            billingDay: Number(f.get('billingDay')) || undefined,
        });
        setModalOpen(false);
        resetSubForm();
    };

    const showPwd = async (id) => {
        const p = await revealSubscriptionPassword(id);
        if (p) {
            setPwdShown(s => ({ ...s, [id]: p }));
            setTimeout(() => setPwdShown(s => { const c = { ...s }; delete c[id]; return c; }), 10000);
        } else toast.error('Password tidak tersedia');
    };

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <CardTitle className="text-base flex items-center gap-2"><Repeat className="w-5 h-5 text-primary" /> Subscription</CardTitle>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">Paket</th><th className="text-left px-4 py-2">Router</th><th className="text-left px-4 py-2">Identitas / Pwd</th><th className="text-center px-4 py-2">Tgl Tagih</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Tagihan Berikut</th><th className="px-4 py-2"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-center text-fg-muted">Belum ada subscription</td></tr> : rows.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 text-fg">{custMap[s.customerId]?.name || '—'}<div className="text-xs text-fg-muted font-mono">{custMap[s.customerId]?.code}</div></td>
                                        <td className="px-4 py-2 text-fg">{pkgMap[s.packageId]?.name || '—'}</td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{routerMap[s.routerId]?.name || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-xs">
                                            <div className="text-blue-400">{s.mikrotikIdentity}</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-fg-muted">{pwdShown[s.id] || '••••••'}</span>
                                                <button onClick={() => showPwd(s.id)} className="text-fg-muted hover:text-amber-400"><Eye className="w-3 h-3" /></button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-center text-fg-muted">{s.billingDay || '—'}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                                s.status === 'isolir' ? 'bg-red-500/20 text-red-400' :
                                                s.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-slate-500/20 text-fg-muted')}>{s.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDate(s.nextDueAt)}</td>
                                        <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                                            {s.status === 'active' ? (
                                                <button title="Isolir" onClick={() => { if (confirm('Isolir subscription ini?')) isolir.mutate({ id: s.id, reason: 'manual' }); }} className="text-fg-muted hover:text-red-400"><Lock className="w-4 h-4" /></button>
                                            ) : s.status === 'isolir' ? (
                                                <button title="Buka Isolir" onClick={() => unisolir.mutate(s.id)} className="text-fg-muted hover:text-emerald-400"><Unlock className="w-4 h-4" /></button>
                                            ) : null}
                                            <button title="Edit" onClick={() => setEditingSub(s)} className="text-fg-muted hover:text-blue-400"><Pencil className="w-4 h-4" /></button>
                                            <button title="Hapus" onClick={() => { if (confirm('Hapus subscription? PPPoE secret juga dihapus dari MikroTik.')) del.mutate(s.id); }} className="text-fg-muted hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetSubForm(); }} maxWidth="max-w-2xl" title="Tambah Subscription" footer={<>
                <Button variant="ghost" onClick={() => { setModalOpen(false); resetSubForm(); }}>Batal</Button>
                <Button form="sub-form" type="submit" loading={create.isPending}>Buat & Push ke MikroTik</Button>
            </>}>
                <form id="sub-form" onSubmit={handleSubmit}>
                    <Field label="Pelanggan">
                        <select name="customerId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Paket">
                        <select name="packageId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {pkgs.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} — {fmtIDR(p.price)}/{p.cycleType === 'monthly' ? 'bln' : 'sesi'}</option>)}
                        </select>
                    </Field>
                    <Field label="Router">
                        <select name="routerId" value={subRouterId} onChange={(e) => setSubRouterId(e.target.value)} required className={inputCls}>
                            <option value="">Pilih…</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>

                    {subRouterId && (
                        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 mb-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-fg uppercase">Pilih dari MikroTik existing</div>
                                    <p className="text-xs text-fg-muted mt-0.5">Adopt user PPPoE yang sudah ada di router. Username & password auto-isi.</p>
                                </div>
                                <button type="button" onClick={() => setSubPickerOpen(p => !p)} className="text-xs text-primary hover:underline">
                                    {subPickerOpen ? 'Sembunyikan' : 'Buka picker'}
                                </button>
                            </div>
                            {subPickerOpen && (
                                <>
                                    {!importLoading && importCandidates.length > 0 && (
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" />
                                            <input
                                                type="text"
                                                value={pickerSearch}
                                                onChange={(e) => setPickerSearch(e.target.value)}
                                                placeholder={`Cari dari ${importCandidates.length} user (username, profile, comment)…`}
                                                className="w-full bg-surface-dark border border-slate-border rounded pl-8 pr-3 py-1.5 text-xs text-fg placeholder-slate-500 focus:ring-1 focus:ring-primary"
                                                autoFocus
                                            />
                                            {pickerSearch && (
                                                <button type="button" onClick={() => setPickerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <div className="max-h-48 overflow-y-auto border border-slate-border rounded bg-surface-dark/40">
                                        {importLoading ? (
                                            <div className="p-3 text-xs text-fg-muted text-center">Memuat dari router…</div>
                                        ) : importCandidates.length === 0 ? (
                                            <div className="p-3 text-xs text-fg-muted text-center">Tidak ada user PPPoE belum-bound, atau router timeout.</div>
                                        ) : filteredCandidates.length === 0 ? (
                                            <div className="p-3 text-xs text-fg-muted text-center">Tidak ada hasil untuk "{pickerSearch}".</div>
                                        ) : (
                                            <table className="w-full text-xs">
                                                <thead className="bg-surface-dark sticky top-0 text-fg-muted uppercase">
                                                    <tr><th className="text-left px-2 py-1">Username</th><th className="text-left px-2 py-1">Profile</th><th className="px-2 py-1"></th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800">
                                                    {filteredCandidates.map((c) => (
                                                        <tr key={c.name} className={clsx('hover:bg-slate-surface/50', c.disabled && 'opacity-50')}>
                                                            <td className="px-2 py-1 font-mono text-blue-400">{c.name}</td>
                                                            <td className="px-2 py-1 text-fg-muted">{c.profile || '—'}</td>
                                                            <td className="px-2 py-1 text-right">
                                                                <button type="button" onClick={() => {
                                                                    setSubIdentity(c.name);
                                                                    setSubPassword(c.password || '');
                                                                    setSubPickerOpen(false);
                                                                    setPickerSearch('');
                                                                    if (!c.password) toast('MikroTik tidak return password — isi manual', { icon: '⚠️' });
                                                                }} className="text-primary hover:underline">Pilih</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                    {!importLoading && pickerSearch && filteredCandidates.length > 0 && (
                                        <p className="text-xs text-fg-muted text-right">{filteredCandidates.length} hasil dari {importCandidates.length}</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <Field label="Username PPPoE / Voucher Code">
                        <input name="mikrotikIdentity" value={subIdentity} onChange={(e) => setSubIdentity(e.target.value)} required className={inputCls} placeholder="budi-home" />
                    </Field>
                    <Field label="Password">
                        <input name="plainPassword" value={subPassword} onChange={(e) => setSubPassword(e.target.value)} required className={inputCls} />
                    </Field>
                    <Field label="Tanggal tagih (1-28, kosong = 1)"><input name="billingDay" type="number" min="1" max="28" className={inputCls} /></Field>
                </form>
            </Modal>

            <Modal
                open={!!editingSub}
                onClose={() => setEditingSub(null)}
                title={`Edit Subscription — ${editingSub ? (custMap[editingSub.customerId]?.name || editingSub.mikrotikIdentity) : ''}`}
                footer={<>
                    <Button variant="ghost" onClick={() => setEditingSub(null)}>Batal</Button>
                    <Button form="sub-edit-form" type="submit" loading={update.isPending}>Simpan</Button>
                </>}
            >
                {editingSub && (
                    <form
                        id="sub-edit-form"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.target);
                            const patch = {
                                id: editingSub.id,
                                packageId: f.get('packageId') || undefined,
                                billingDay: f.get('billingDay') ? Number(f.get('billingDay')) : undefined,
                            };
                            const newPwd = f.get('plainPassword');
                            if (newPwd && String(newPwd).trim()) patch.plainPassword = String(newPwd).trim();
                            await update.mutateAsync(patch);
                            setEditingSub(null);
                        }}
                    >
                        <Field label="Pelanggan">
                            <input value={custMap[editingSub.customerId]?.name || '—'} disabled className={inputCls + ' opacity-60'} />
                        </Field>
                        <Field label="Router / Username">
                            <input value={`${routerMap[editingSub.routerId]?.name || '—'} / ${editingSub.mikrotikIdentity}`} disabled className={inputCls + ' opacity-60'} />
                        </Field>
                        <Field label="Paket">
                            <select name="packageId" defaultValue={editingSub.packageId} className={inputCls}>
                                {pkgs.filter(p => p.active || p.id === editingSub.packageId).map(p => (
                                    <option key={p.id} value={p.id}>{p.name} — {fmtIDR(p.price)}/{p.cycleType === 'monthly' ? 'bln' : 'sesi'}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Password baru (kosongkan jika tidak diubah)">
                            <input name="plainPassword" type="text" placeholder="••••••" className={inputCls} />
                        </Field>
                        <Field label="Tanggal tagih (1-28)">
                            <input name="billingDay" type="number" min="1" max="28" defaultValue={editingSub.billingDay || ''} className={inputCls} />
                        </Field>
                        <p className="text-xs text-fg-muted mt-2">
                            Perubahan paket / password langsung di-push ke MikroTik (profile + secret password). Tagihan berikut & tanggal isolir baru ter-update saat siklus tagihan berikutnya.
                        </p>
                    </form>
                )}
            </Modal>
        </Card>
    );
}

// ─── Tagihan tab ───────────────────────────────────────────────────────────
function InvoicesTab() {
    const [filter, setFilter] = useState('');
    const [payTarget, setPayTarget] = useState(null);
    const [linkTarget, setLinkTarget] = useState(null);
    const [linkResult, setLinkResult] = useState(null);
    const { data: rows = [], isLoading, refetch, isRefetching } = useInvoices({ status: filter || undefined });
    const { data: customers = [] } = useCustomers();
    const pay = usePayInvoice();
    const cancel = useCancelInvoice();
    const createLink = useCreatePaymentLink();
    const custMap = useMemo(() => Object.fromEntries(customers.map(c => [c.id, c])), [customers]);

    const handleCreateLink = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            const result = await createLink.mutateAsync({
                id: linkTarget.id,
                gateway: f.get('gateway'),
                returnUrl: f.get('returnUrl') || undefined,
            });
            setLinkResult(result);
        } catch {}
    };

    const handlePay = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await pay.mutateAsync({
            id: payTarget.id,
            amount: Number(f.get('amount')) || payTarget.amount,
            method: f.get('method'),
            notes: f.get('notes') || undefined,
        });
        setPayTarget(null);
    };

    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> Tagihan</CardTitle>
                <div className="flex gap-2">
                    <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls + ' text-xs py-1.5 w-auto'}>
                        <option value="">Semua status</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">No. Invoice</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-right px-4 py-2">Jumlah</th><th className="text-left px-4 py-2">Jatuh Tempo</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Dibayar</th><th className="px-4 py-2"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-muted">Tidak ada tagihan</td></tr> : rows.map(i => (
                                    <tr key={i.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 font-mono text-blue-400">{i.invoiceNumber}</td>
                                        <td className="px-4 py-2 text-fg">{custMap[i.customerId]?.name || '—'}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(i.amount)}</td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDate(i.dueAt)}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                i.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                                                i.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                                                i.status === 'unpaid' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-slate-500/20 text-fg-muted')}>{i.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(i.paidAt)}</td>
                                        <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                                            {i.status !== 'paid' && i.status !== 'cancelled' && (
                                                <>
                                                    <Button size="sm" variant="outline" onClick={() => { setLinkTarget(i); setLinkResult(null); }}><CreditCard className="w-3.5 h-3.5 mr-1" /> Link Bayar</Button>
                                                    <Button size="sm" onClick={() => setPayTarget(i)}>Bayar Manual</Button>
                                                </>
                                            )}
                                            {i.status === 'unpaid' && <button onClick={() => { if (confirm('Batalkan tagihan?')) cancel.mutate(i.id); }} className="text-fg-muted hover:text-red-400 px-2"><X className="w-4 h-4" /></button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Modal open={!!linkTarget} onClose={() => { setLinkTarget(null); setLinkResult(null); }} title={`Link Pembayaran — ${linkTarget?.invoiceNumber}`} footer={
                linkResult ? (
                    <Button onClick={() => { setLinkTarget(null); setLinkResult(null); }}>Selesai</Button>
                ) : (
                    <>
                        <Button variant="ghost" onClick={() => { setLinkTarget(null); setLinkResult(null); }}>Batal</Button>
                        <Button form="link-form" type="submit" loading={createLink.isPending}>Buat Link</Button>
                    </>
                )
            }>
                {!linkResult ? (
                    <form id="link-form" onSubmit={handleCreateLink}>
                        <Field label="Gateway">
                            <select name="gateway" defaultValue="tripay" required className={inputCls}>
                                <option value="tripay">Tripay</option>
                                <option value="midtrans">Midtrans</option>
                                <option value="xendit">Xendit</option>
                            </select>
                        </Field>
                        <Field label="Return URL setelah bayar (opsional)">
                            <input name="returnUrl" type="url" className={inputCls} placeholder="https://genster.id/terima-kasih" />
                        </Field>
                        <p className="text-xs text-fg-muted">Pastikan gateway sudah dikonfigurasi di tab Pengaturan Router.</p>
                    </form>
                ) : (
                    <div className="space-y-3">
                        <div className="bg-slate-surface/50 border border-slate-border rounded p-3">
                            <div className="text-xs text-fg-muted mb-1">URL Pembayaran</div>
                            <div className="flex items-center gap-2">
                                <input readOnly value={linkResult.paymentUrl} className={inputCls + ' font-mono text-xs'} />
                                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(linkResult.paymentUrl); toast.success('Tersalin'); }}><Copy className="w-3.5 h-3.5" /></Button>
                                <a href={linkResult.paymentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1.5 rounded border border-slate-border"><ExternalLink className="w-3.5 h-3.5" /> Buka</a>
                            </div>
                        </div>
                        <div className="text-xs text-fg-muted">
                            Gateway TXN ID: <span className="font-mono text-fg">{linkResult.gatewayTxnId}</span>
                            {linkResult.expiresAt && <><br />Berlaku sampai: {fmtDateTime(linkResult.expiresAt)}</>}
                        </div>
                        <p className="text-xs text-fg-muted mt-2">Status invoice akan otomatis terupdate ke "paid" saat customer berhasil membayar (lewat webhook gateway).</p>
                    </div>
                )}
            </Modal>

            <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={`Bayar ${payTarget?.invoiceNumber}`} footer={<>
                <Button variant="ghost" onClick={() => setPayTarget(null)}>Batal</Button>
                <Button form="pay-form" type="submit" loading={pay.isPending}>Catat Pembayaran</Button>
            </>}>
                {payTarget && (
                    <form id="pay-form" onSubmit={handlePay}>
                        <Field label="Jumlah (IDR)"><input name="amount" type="number" defaultValue={payTarget.amount} required className={inputCls} /></Field>
                        <Field label="Metode">
                            <select name="method" defaultValue="manual_cash" className={inputCls}>
                                <option value="manual_cash">Tunai</option>
                                <option value="manual_transfer">Transfer Manual</option>
                                <option value="gateway_tripay">Gateway: Tripay</option>
                                <option value="gateway_midtrans">Gateway: Midtrans</option>
                                <option value="gateway_xendit">Gateway: Xendit</option>
                            </select>
                        </Field>
                        <Field label="Catatan"><textarea name="notes" className={inputCls} rows={2} /></Field>
                    </form>
                )}
            </Modal>
        </Card>
    );
}

// ─── Voucher tab ───────────────────────────────────────────────────────────
function VouchersTab() {
    const { data: routers = [] } = useRouters();
    const { data: pkgs = [] } = usePackages({ type: 'hotspot' });
    const [routerId, setRouterId] = useState('');
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const { data: routerData } = useVouchersForRouter(routerId);
    const { data: batches = [], refetch: refetchBatches, isRefetching } = useVoucherBatches({ routerId: routerId || undefined });
    const generate = useGenerateVoucherBatch();
    const delBatch = useDeleteVoucherBatch();

    const mode = routerData?.mode || 'disabled';
    const items = routerData?.items || [];

    const handleGenerate = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await generate.mutateAsync({
            routerId,
            packageId: f.get('packageId'),
            count: Number(f.get('count')) || 10,
            codeMode: f.get('codeMode'),
            charsetMode: f.get('charsetMode'),
            codeLength: Number(f.get('codeLength')) || 6,
            prefix: f.get('prefix') || undefined,
            note: f.get('note') || undefined,
        });
        setBatchModalOpen(false);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                    <CardTitle className="text-base flex items-center gap-2"><Ticket className="w-5 h-5 text-primary" /> Voucher Hotspot</CardTitle>
                    <div className="flex gap-2 items-center">
                        <select value={routerId} onChange={(e) => setRouterId(e.target.value)} className={inputCls + ' text-xs py-1.5 w-auto'}>
                            <option value="">— Pilih Router —</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                        <Button size="sm" variant="outline" onClick={() => refetchBatches()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                        <Button size="sm" disabled={!routerId || mode === 'disabled' || pkgs.length === 0} onClick={() => setBatchModalOpen(true)}><Plus className="w-4 h-4 mr-1" /> Generate Batch</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {!routerId ? (
                        <div className="p-6 text-center text-fg-muted text-sm">Pilih router untuk melihat voucher.</div>
                    ) : mode === 'disabled' ? (
                        <div className="p-6 text-center text-fg-muted text-sm">
                            Hotspot belum diaktifkan untuk router ini.
                            <br />
                            <span className="text-xs text-fg-muted">Buka tab "Pengaturan Router" → set "Mode Hotspot" → Native atau Mikhmon Bridge.</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs text-fg-muted">
                                <span>Mode:</span>
                                <span className={clsx('px-2 py-0.5 rounded font-mono', mode === 'native' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400')}>{mode}</span>
                                <span>•</span>
                                <span>{items.length} entry</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[640px]">
                                    <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                        <tr>
                                            <th className="text-left px-3 py-2">Kode</th>
                                            <th className="text-left px-3 py-2">Profile</th>
                                            <th className="text-left px-3 py-2">Status / Note</th>
                                            <th className="text-left px-3 py-2">Tanggal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {items.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-fg-muted">Belum ada voucher</td></tr> : items.slice(0, 200).map((it, i) => (
                                            <tr key={i} className="hover:bg-slate-surface/30">
                                                <td className="px-3 py-2 font-mono text-blue-400">{it.code}</td>
                                                <td className="px-3 py-2 text-fg text-xs">{it.profile || '—'}</td>
                                                <td className="px-3 py-2 text-xs">
                                                    {mode === 'native' ? (
                                                        <span className={clsx('px-2 py-0.5 rounded uppercase', it.status === 'unused' ? 'bg-amber-500/20 text-amber-400' : it.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-fg-muted')}>{it.status}</span>
                                                    ) : (
                                                        <span className="text-fg-muted">{it.billingPeriod || '—'}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-fg-muted text-xs">{fmtDate(it.createdAt || it.generatedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {items.length > 200 && <div className="text-xs text-fg-muted text-center mt-2">Menampilkan 200 dari {items.length}</div>}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Batch list (native only) */}
            {mode === 'native' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Batch Generate</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[640px]">
                                <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                    <tr>
                                        <th className="text-left px-4 py-2">Tanggal</th>
                                        <th className="text-left px-4 py-2">Jumlah</th>
                                        <th className="text-left px-4 py-2">Catatan / Paket</th>
                                        <th className="px-4 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {batches.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-fg-muted">Belum ada batch</td></tr> : batches.map(b => (
                                        <tr key={b.id} className="hover:bg-slate-surface/30">
                                            <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(b.generatedAt)}</td>
                                            <td className="px-4 py-2 text-fg">{b.count}</td>
                                            <td className="px-4 py-2 text-fg-muted text-xs">{b.notes || '—'}</td>
                                            <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                                                <a href={`/billing/vouchers/print/${b.id}?layout=a4`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-slate-surface"><Printer className="w-3.5 h-3.5" /> Cetak</a>
                                                <button onClick={() => { if (confirm(`Hapus batch ini? ${b.count} voucher juga dihapus dari MikroTik.`)) delBatch.mutate(b.id); }} className="text-fg-muted hover:text-red-400 px-2"><Trash2 className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Modal open={batchModalOpen} onClose={() => setBatchModalOpen(false)} maxWidth="max-w-2xl" title="Generate Batch Voucher" footer={<>
                <Button variant="ghost" onClick={() => setBatchModalOpen(false)}>Batal</Button>
                <Button form="batch-form" type="submit" loading={generate.isPending}>Generate & Push</Button>
            </>}>
                <form id="batch-form" onSubmit={handleGenerate}>
                    <Field label="Paket Hotspot">
                        <select name="packageId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {pkgs.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} — {fmtIDR(p.price)} ({p.cycleType === 'duration' ? `${p.cycleValue} dtk` : 'bulanan'})</option>)}
                        </select>
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Jumlah Voucher (1-500)"><input name="count" type="number" min="1" max="500" defaultValue="10" required className={inputCls} /></Field>
                        <Field label="Panjang Kode (3-12)"><input name="codeLength" type="number" min="3" max="12" defaultValue="6" required className={inputCls} /></Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Format Kode">
                            <select name="charsetMode" defaultValue="num" className={inputCls}>
                                <option value="num">Angka (123456)</option>
                                <option value="lower">Huruf kecil</option>
                                <option value="upper">Huruf besar</option>
                                <option value="upplow">Huruf besar+kecil</option>
                                <option value="mix">Campuran (huruf+angka)</option>
                                <option value="mix1">Huruf kecil + angka</option>
                                <option value="mix2">Huruf besar + angka</option>
                            </select>
                        </Field>
                        <Field label="Mode">
                            <select name="codeMode" defaultValue="vc" className={inputCls}>
                                <option value="vc">VC (kode = password)</option>
                                <option value="up">UP (kode + password terpisah)</option>
                            </select>
                        </Field>
                    </div>
                    <Field label="Prefix (opsional)"><input name="prefix" maxLength="6" className={inputCls} placeholder="HSP-" /></Field>
                    <Field label="Catatan / Tag Paket (untuk template)"><input name="note" className={inputCls} placeholder="Voucher 1 Hari" /></Field>
                </form>
            </Modal>
        </div>
    );
}

// ─── Reports tab ───────────────────────────────────────────────────────────
function ReportsTab() {
    const { data: ov } = useBillingOverview();
    const { data: rev = [] } = useRevenueByMonth();
    const { data: aging = [] } = useAgingReport();
    const { data: top = [] } = useTopPayers(1, 10);
    const { data: vs = [] } = useVoucherSales(1);
    const { data: payments = [] } = useRecentPayments(20);

    const maxRev = useMemo(() => Math.max(1, ...rev.map(r => Number(r.revenue) || 0)), [rev]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Pelanggan Aktif</div>
                    <div className="text-2xl font-bold text-fg">{ov?.active_customers ?? '—'}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Subscription Aktif</div>
                    <div className="text-2xl font-bold text-emerald-400">{ov?.active_subscriptions ?? '—'}</div>
                    <div className="text-xs text-fg-muted mt-1">Isolir: {ov?.isolir_subscriptions ?? '—'}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Pendapatan Bulan Ini</div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono">{fmtIDR(ov?.revenue_this_month)}</div>
                    <div className="text-xs text-fg-muted mt-1">Bulan lalu: {fmtIDR(ov?.revenue_last_month)}</div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                    <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Piutang (Outstanding)</div>
                    <div className="text-2xl font-bold text-amber-400 font-mono">{fmtIDR(ov?.receivables_total)}</div>
                    <div className="text-xs text-fg-muted mt-1">Unpaid: {ov?.unpaid_invoices ?? 0} • Overdue: {ov?.overdue_invoices ?? 0}</div>
                </CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="text-base">Tren Pendapatan (12 bulan)</CardTitle></CardHeader>
                <CardContent>
                    {rev.length === 0 ? <div className="text-center text-fg-muted py-6">Belum ada data</div> : (
                        <div className="space-y-2">
                            {rev.map(r => {
                                const pct = ((Number(r.revenue) || 0) / maxRev) * 100;
                                return (
                                    <div key={r.month} className="flex items-center gap-3 text-sm">
                                        <div className="w-20 text-fg-muted text-xs font-mono">{r.month}</div>
                                        <div className="flex-1 h-6 bg-slate-surface rounded overflow-hidden relative">
                                            <div className="h-full bg-gradient-to-r from-emerald-500/40 to-emerald-500/80" style={{ width: `${pct}%` }} />
                                            <div className="absolute inset-0 flex items-center justify-end pr-2 text-xs text-fg font-mono">{fmtIDR(r.revenue)}</div>
                                        </div>
                                        <div className="w-12 text-right text-xs text-fg-muted">{r.invoices}x</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle className="text-base">Aging (Piutang per umur)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Bucket</th><th className="text-right px-4 py-2">Tagihan</th><th className="text-right px-4 py-2">Jumlah</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {aging.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Tidak ada piutang</td></tr> : aging.map((a, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{a.bucket === 'current' ? 'Belum jatuh tempo' : `${a.bucket} hari`}</td>
                                        <td className="px-4 py-2 text-right text-fg">{a.invoices}</td>
                                        <td className="px-4 py-2 text-right text-amber-400 font-mono">{fmtIDR(a.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Top 10 Pelanggan (1 bulan)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Pelanggan</th><th className="text-right px-4 py-2">Tagihan</th><th className="text-right px-4 py-2">Total</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {top.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : top.map((t, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{t.name} <span className="text-xs text-fg-muted font-mono">{t.code}</span></td>
                                        <td className="px-4 py-2 text-right text-fg">{t.invoices_paid}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(t.total_paid)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <CardHeader><CardTitle className="text-base">Penjualan Voucher per Paket (1 bulan)</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Paket</th><th className="text-right px-4 py-2">Jumlah</th><th className="text-right px-4 py-2">Pendapatan</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {vs.length === 0 ? <tr><td colSpan={3} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : vs.map((v, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg">{v.package_name}</td>
                                        <td className="px-4 py-2 text-right text-fg">{v.vouchers_sold}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(v.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Pembayaran Terbaru</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Tanggal</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">Invoice</th><th className="text-right px-4 py-2">Jumlah</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {payments.length === 0 ? <tr><td colSpan={4} className="px-4 py-4 text-center text-fg-muted">Belum ada</td></tr> : payments.map((p, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(p.recorded_at)}</td>
                                        <td className="px-4 py-2 text-fg">{p.customer_name}</td>
                                        <td className="px-4 py-2 font-mono text-blue-400 text-xs">{p.invoice_number}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(p.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ─── WA Notifications tab ──────────────────────────────────────────────────
function WaTab() {
    const { data: routers = [] } = useRouters();
    const { data: log = [], refetch, isRefetching } = useWaLog(200);
    const test = useWaTest();
    const [modal, setModal] = useState(false);

    const handleTest = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await test.mutateAsync({
            routerId: f.get('routerId'),
            phone: f.get('phone'),
            message: f.get('message') || undefined,
        });
        setModal(false);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                    <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-5 h-5 text-primary" /> Riwayat Notifikasi WA</CardTitle>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                        <Button size="sm" onClick={() => setModal(true)}><Send className="w-4 h-4 mr-1" /> Tes Kirim</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Waktu</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">HP</th><th className="text-left px-4 py-2">Tipe</th><th className="text-left px-4 py-2">Provider</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Error</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {log.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-muted">Belum ada notifikasi terkirim</td></tr> : log.map(l => (
                                    <tr key={l.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(l.sent_at || l.created_at)}</td>
                                        <td className="px-4 py-2 text-fg">{l.customer_name || '—'} {l.customer_code && <span className="text-xs text-fg-muted font-mono">({l.customer_code})</span>}</td>
                                        <td className="px-4 py-2 font-mono text-fg-muted">{l.to_phone}</td>
                                        <td className="px-4 py-2 text-xs"><span className="px-2 py-0.5 rounded bg-slate-surface text-fg uppercase">{l.type}</span></td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{l.provider}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                l.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                                                l.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                'bg-amber-500/20 text-amber-400')}>{l.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-red-400 text-xs max-w-xs truncate">{l.error || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Modal open={modal} onClose={() => setModal(false)} title="Tes Kirim WA" footer={<>
                <Button variant="ghost" onClick={() => setModal(false)}>Batal</Button>
                <Button form="wa-test-form" type="submit" loading={test.isPending}>Kirim</Button>
            </>}>
                <form id="wa-test-form" onSubmit={handleTest}>
                    <Field label="Router (mengambil konfigurasi WA)">
                        <select name="routerId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Nomor HP tujuan (+62 atau 08…)"><input name="phone" required className={inputCls} placeholder="08123456789" /></Field>
                    <Field label="Pesan (opsional, default: pesan tes)"><textarea name="message" className={inputCls} rows={3} placeholder="Pesan tes dari sistem billing." /></Field>
                </form>
            </Modal>
        </div>
    );
}

// ─── Profile picker (dropdown dari MikroTik + opsi buat baru) ──────────────
function IsolirProfilePicker({ routerId, currentValue }) {
    const { data: profiles = [], isLoading, refetch, isRefetching } = useMikrotikPppProfiles(routerId);
    const create = useCreatePppProfile();
    const [creating, setCreating] = useState(false);

    const exists = profiles.some(p => p.name === currentValue);

    const handleCreate = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await create.mutateAsync({
                routerId,
                name: f.get('name'),
                rateLimit: f.get('rateLimit') || undefined,
                addressList: f.get('addressList') || undefined,
                onlyOne: 'yes',
                comment: 'auto-billing-isolir',
            });
            setCreating(false);
            refetch();
        } catch {}
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Profile Isolir</span>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isRefetching && 'animate-spin')} /> {isLoading ? 'memuat…' : `${profiles.length} profile di router`}
                </button>
            </div>
            <select name="isolirProfile" defaultValue={currentValue} className={inputCls}>
                {!exists && <option value={currentValue}>{currentValue} ⚠ (tidak ada di router)</option>}
                {profiles.map(p => <option key={p.id} value={p.name}>{p.name} {p.rateLimit ? `— ${p.rateLimit}` : ''}</option>)}
                {profiles.length === 0 && <option value={currentValue}>{currentValue}</option>}
            </select>
            <button type="button" onClick={() => setCreating(c => !c)} className="text-xs text-primary hover:underline mt-1">
                {creating ? 'Batal' : '+ Buat profile isolir baru di MikroTik'}
            </button>

            {creating && (
                <div className="bg-slate-surface/50 border border-slate-border rounded-lg p-3 mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-fg-muted">Sistem akan menjalankan <code>/ppp profile add</code> di router. Konfigurasi default sudah cocok untuk isolir umum.</p>
                    <form onSubmit={handleCreate}>
                        <Field label="Nama Profile"><input name="name" defaultValue="pppoe-isolir" required className={inputCls} /></Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Field label="Rate Limit (mis. 256k/256k)"><input name="rateLimit" defaultValue="256k/256k" className={inputCls} /></Field>
                            <Field label="Address List (untuk redirect)"><input name="addressList" defaultValue="isolir" className={inputCls} /></Field>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Batal</Button>
                            <Button type="submit" size="sm" loading={create.isPending}>Buat di MikroTik</Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

// ─── Comment audit (deteksi typo / manual edit operator) ──────────────────
function CommentAuditCard({ routerId }) {
    const { data, refetch, isFetching } = useCommentAudit(routerId);
    const resync = useResyncComment();

    if (!routerId) return null;
    const issues = data?.issues || [];

    const labelFor = (k) => {
        switch (k) {
            case 'missing-dn': return 'Tanpa dn:';
            case 'mismatched-dn': return 'dn ≠ DB';
            case 'inconsistent-due-vs-dn': return 'due ≠ dn (typo)';
            case 'orphan-mikrotik': return 'Orphan di router';
            default: return k;
        }
    };

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Audit Comment di Router</div>
                    <p className="text-xs text-fg-muted mt-0.5">
                        Deteksi typo / edit manual operator di winbox. Klik "Resync" untuk paksa sistem menulis ulang.
                    </p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} /> scan
                </button>
            </div>

            {data && (
                <div className="text-xs text-fg-muted">
                    {data.totalSecrets} secret di router • {data.totalSubs} subscription di DB •{' '}
                    {issues.length === 0 ? (
                        <span className="text-emerald-400 font-semibold">semua konsisten ✓</span>
                    ) : (
                        <span className="text-amber-400 font-semibold">{issues.length} issue ditemukan</span>
                    )}
                </div>
            )}

            {issues.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-slate-border rounded bg-surface-dark/40">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-dark sticky top-0 text-fg-muted uppercase">
                            <tr>
                                <th className="text-left px-2 py-1">Username</th>
                                <th className="text-left px-2 py-1">Issue</th>
                                <th className="text-left px-2 py-1">Saat ini</th>
                                <th className="text-left px-2 py-1">Seharusnya</th>
                                <th className="px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {issues.map((i, idx) => (
                                <tr key={idx} className="hover:bg-slate-surface/50">
                                    <td className="px-2 py-1 font-mono text-blue-400">{i.name}</td>
                                    <td className="px-2 py-1">
                                        <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{labelFor(i.kind)}</span>
                                    </td>
                                    <td className="px-2 py-1 font-mono text-fg-muted">{i.current || '—'}</td>
                                    <td className="px-2 py-1 font-mono text-emerald-400">{i.expected || '—'}</td>
                                    <td className="px-2 py-1 text-right">
                                        {i.subscriptionId ? (
                                            <button type="button" onClick={() => resync.mutate(i.subscriptionId)} className="text-primary hover:underline">Resync</button>
                                        ) : (
                                            <span className="text-fg-muted text-[10px]">orphan</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Master billing scheduler (resilient isolir) ───────────────────────────
function BillingSchedulerCard({ routerId, isolirProfile }) {
    const { data: status, refetch, isFetching } = useBillingSchedulerStatus(routerId);
    const setup = useSetupBillingScheduler();
    const [interval, setInterval_] = useState('1h');

    if (!routerId) return null;

    const handleSetup = async () => {
        await setup.mutateAsync({
            routerId,
            isolirProfile: isolirProfile || 'pppoe-isolir',
            interval,
        });
        refetch();
    };

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Scheduler Auto-Isolir di Router</div>
                    <p className="text-xs text-fg-muted mt-0.5">
                        1 scheduler entry yang scan semua /ppp secret tiap interval. Tetap jalan walau server aplikasi down.
                    </p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} /> cek
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Status</div>
                    <div className={status?.present ? 'text-emerald-400 font-semibold' : 'text-fg-muted'}>
                        {status?.present ? '✓ Terpasang' : '— Belum'}
                    </div>
                </div>
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Interval</div>
                    <div className="text-fg">{status?.interval || '—'}</div>
                </div>
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Run Count</div>
                    <div className="text-fg">{status?.runCount || '—'}</div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Field label="Interval (cth: 1h, 30m, 6h)">
                    <input value={interval} onChange={(e) => setInterval_(e.target.value)} className={inputCls} placeholder="1h" />
                </Field>
            </div>

            <Button size="sm" type="button" onClick={handleSetup} loading={setup.isPending}>
                {status?.present ? 'Update Scheduler di Router' : 'Pasang Scheduler di Router'}
            </Button>

            <p className="text-xs text-fg-muted">
                Scheduler akan baca <code className="text-blue-400">dn:YYYYMMDD</code> dari comment tiap PPP secret.
                Sistem otomatis tulis comment ini saat buat/payment subscription dengan format
                <code className="text-blue-400"> dn:20260606 due:jun/06/2026</code>.
            </p>
        </div>
    );
}

// ─── Firewall isolir auto-setup ────────────────────────────────────────────
function IsolirFirewallSetup({ routerId }) {
    const { data: status, refetch, isFetching } = useIsolirFirewallStatus(routerId, 'isolir');
    const setup = useSetupIsolirFirewall();
    const [showSetup, setShowSetup] = useState(false);

    const handleSetup = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await setup.mutateAsync({
                routerId,
                listName: f.get('listName') || 'isolir',
                redirectIp: f.get('redirectIp'),
                redirectPort: Number(f.get('redirectPort')) || 80,
                addWalledGarden: f.get('walled') === 'on',
            });
            setShowSetup(false);
            refetch();
        } catch {}
    };

    if (!routerId) return null;

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Firewall Isolir di MikroTik</div>
                    <p className="text-xs text-fg-muted mt-0.5">Address-list, NAT redirect, dan walled-garden untuk redirect pelanggan isolir ke halaman tagihan.</p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg">
                    {isFetching ? 'cek…' : 'refresh'}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <FwBadge label="Address List" ok={status?.addressListPresent} />
                <FwBadge label="NAT Redirect" ok={status?.natRedirectPresent} />
                <FwBadge label="Walled Garden" ok={status?.walledGardenPresent} />
            </div>

            {!status?.addressListPresent || !status?.natRedirectPresent ? (
                <button type="button" onClick={() => setShowSetup(s => !s)} className="text-xs text-primary hover:underline">
                    {showSetup ? 'Batal' : '+ Auto-setup firewall isolir'}
                </button>
            ) : (
                <p className="text-xs text-emerald-400">✓ Firewall isolir sudah lengkap di router ini.</p>
            )}

            {showSetup && (
                <form onSubmit={handleSetup} className="bg-surface-dark/50 border border-slate-border rounded p-3 space-y-2 mt-2">
                    <p className="text-xs text-fg-muted">Sistem akan menjalankan command MikroTik untuk membuat: address-list, NAT dst-nat tcp/80, dan (opsional) filter walled-garden.</p>
                    <Field label="Nama Address List"><input name="listName" defaultValue="isolir" className={inputCls} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Field label="IP halaman tagihan (di sisi LAN router)"><input name="redirectIp" required defaultValue="" placeholder="10.10.0.5" className={inputCls} /></Field>
                        <Field label="Port"><input name="redirectPort" type="number" defaultValue="80" className={inputCls} /></Field>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-fg">
                        <input type="checkbox" name="walled" defaultChecked />
                        Tambah walled-garden (allow billing IP, drop traffic lain) — wajib supaya redirect bekerja
                    </label>
                    <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setShowSetup(false)}>Batal</Button>
                        <Button type="submit" size="sm" loading={setup.isPending}>Setup Firewall</Button>
                    </div>
                </form>
            )}
        </div>
    );
}

function FwBadge({ label, ok }) {
    return (
        <div className={clsx('rounded p-2 border text-center',
            ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                 'bg-slate-border/30 border-slate-border text-fg-muted')}>
            <div className="font-semibold uppercase text-[10px] tracking-wide">{label}</div>
            <div className="text-sm font-bold mt-0.5">{ok ? '✓ Ada' : '— Belum'}</div>
        </div>
    );
}

// ─── Settings tab ──────────────────────────────────────────────────────────
function SettingsTab() {
    const { data: routers = [] } = useRouters();
    const [routerId, setRouterId] = useState('');
    const { data: settings } = useBillingRouterSettings(routerId);
    const update = useUpdateBillingRouterSettings();
    const [waProvider, setWaProvider] = useState('none');
    const [showTripay, setShowTripay] = useState(false);
    const [showMidtrans, setShowMidtrans] = useState(false);
    const [showXendit, setShowXendit] = useState(false);

    React.useEffect(() => { setWaProvider(settings?.waProvider || 'none'); }, [settings?.waProvider]);
    React.useEffect(() => {
        setShowTripay(!!settings?.gatewayTripayEnabled);
        setShowMidtrans(!!settings?.gatewayMidtransEnabled);
        setShowXendit(!!settings?.gatewayXenditEnabled);
    }, [settings?.gatewayTripayEnabled, settings?.gatewayMidtransEnabled, settings?.gatewayXenditEnabled]);

    const save = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);

        // Build provider-specific waConfig
        let waConfig = {};
        if (waProvider === 'fonnte') {
            waConfig = {
                token: f.get('fonnteToken') || '',
                deviceId: f.get('fonnteDeviceId') || undefined,
                countryCode: f.get('fonnteCountryCode') || '62',
            };
        } else if (waProvider === 'wablas') {
            waConfig = {
                token: f.get('wablasToken') || '',
                secret: f.get('wablasSecret') || undefined,
                baseUrl: f.get('wablasBaseUrl') || undefined,
            };
        } else if (waProvider === 'webhook') {
            waConfig = {
                url: f.get('webhookUrl') || '',
                method: f.get('webhookMethod') || 'POST',
            };
        }

        // Build gateway config (jsonb) per provider
        const existingGatewayCfg = settings?.gatewayConfig || {};
        const gatewayConfig = { ...existingGatewayCfg };
        if (showTripay) {
            gatewayConfig.tripay = {
                apiKey: f.get('tripayApiKey') || '',
                privateKey: f.get('tripayPrivateKey') || '',
                merchantCode: f.get('tripayMerchantCode') || '',
                sandbox: f.get('tripaySandbox') === 'on',
                defaultMethod: f.get('tripayDefaultMethod') || 'QRIS',
            };
        }
        if (showMidtrans) {
            gatewayConfig.midtrans = {
                serverKey: f.get('midtransServerKey') || '',
                clientKey: f.get('midtransClientKey') || undefined,
                isProduction: f.get('midtransProduction') === 'on',
            };
        }
        if (showXendit) {
            gatewayConfig.xendit = {
                secretKey: f.get('xenditSecretKey') || '',
                callbackToken: f.get('xenditCallbackToken') || '',
            };
        }

        await update.mutateAsync({
            routerId,
            pppoeBillingEnabled: f.get('pppoeBillingEnabled') === 'on',
            hotspotMode: f.get('hotspotMode'),
            isolirProfile: f.get('isolirProfile'),
            isolirRedirectUrl: f.get('isolirRedirectUrl') || null,
            isolirGraceDays: Number(f.get('isolirGraceDays')) || 0,
            defaultBillingDay: Number(f.get('defaultBillingDay')) || 1,
            waProvider,
            waConfig,
            waNotifHMinus1Enabled: f.get('waNotifHMinus1Enabled') === 'on',
            waNotifDueDayEnabled: f.get('waNotifDueDayEnabled') === 'on',
            waNotifOverdueEnabled: f.get('waNotifOverdueEnabled') === 'on',
            waNotifIsolirEnabled: f.get('waNotifIsolirEnabled') === 'on',
            gatewayTripayEnabled: showTripay,
            gatewayMidtransEnabled: showMidtrans,
            gatewayXenditEnabled: showXendit,
            gatewayConfig,
            invoiceFooterText: f.get('invoiceFooterText') || null,
        });
    };

    const cfg = settings?.waConfig || {};

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="w-5 h-5 text-primary" /> Pengaturan Billing per Router</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="mb-4">
                    <Field label="Pilih Router">
                        <select value={routerId} onChange={(e) => setRouterId(e.target.value)} className={inputCls}>
                            <option value="">— Pilih —</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                </div>

                {routerId && (
                    // key remounts the form when settings change so defaultChecked /
                    // defaultValue re-apply with fresh data. Without this, a refetch
                    // of settings (e.g. tab re-open) would leave checkboxes stale at
                    // the value they had during initial mount.
                    <form key={`settings-${routerId}-${settings?.updatedAt || 'new'}`} onSubmit={save} className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-fg uppercase tracking-wide">PPPoE</h4>
                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="pppoeBillingEnabled" defaultChecked={settings?.pppoeBillingEnabled} /> Aktifkan billing PPPoE</label>
                                <IsolirProfilePicker
                                    routerId={routerId}
                                    currentValue={settings?.isolirProfile || 'pppoe-isolir'}
                                />
                                <Field label="Redirect URL halaman tagihan"><input name="isolirRedirectUrl" defaultValue={settings?.isolirRedirectUrl || ''} className={inputCls} placeholder="https://genster.id/tagihan" /></Field>
                                <IsolirFirewallSetup routerId={routerId} />
                                <BillingSchedulerCard routerId={routerId} isolirProfile={settings?.isolirProfile || 'pppoe-isolir'} />
                                <CommentAuditCard routerId={routerId} />
                                <Field label="Grace days sebelum auto-isolir (0 = isolir hari saat lewat jatuh tempo)"><input name="isolirGraceDays" type="number" min="0" defaultValue={settings?.isolirGraceDays || 0} className={inputCls} /></Field>
                                <Field label="Default tanggal tagih (1-28, dipakai kalau pelanggan tidak set sendiri)"><input name="defaultBillingDay" type="number" min="1" max="28" defaultValue={settings?.defaultBillingDay || 1} className={inputCls} /></Field>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-fg uppercase tracking-wide">Hotspot</h4>
                                <Field label="Mode">
                                    <select name="hotspotMode" defaultValue={settings?.hotspotMode || 'disabled'} className={inputCls}>
                                        <option value="disabled">Disabled</option>
                                        <option value="native">Native (sistem ini)</option>
                                        <option value="mikhmon_bridge">Mikhmon Bridge (baca dari MikroTik)</option>
                                    </select>
                                </Field>

                                <h4 className="text-sm font-semibold text-fg uppercase tracking-wide pt-2">Notifikasi WhatsApp</h4>
                                <Field label="Provider WA">
                                    <select value={waProvider} onChange={(e) => setWaProvider(e.target.value)} className={inputCls}>
                                        <option value="none">— Nonaktif —</option>
                                        <option value="fonnte">Fonnte</option>
                                        <option value="wablas">Wablas</option>
                                        <option value="webhook">Webhook generic</option>
                                    </select>
                                </Field>
                                {waProvider === 'fonnte' && (
                                    <div className="space-y-2 pl-3 border-l-2 border-emerald-500/30">
                                        <Field label="Token Fonnte"><input name="fonnteToken" defaultValue={cfg.token || ''} className={inputCls} placeholder="api.fonnte.com token" /></Field>
                                        <Field label="Device ID (opsional, untuk multi-device)"><input name="fonnteDeviceId" defaultValue={cfg.deviceId || ''} className={inputCls} /></Field>
                                        <Field label="Country code default (mis. 62)"><input name="fonnteCountryCode" defaultValue={cfg.countryCode || '62'} className={inputCls} /></Field>
                                    </div>
                                )}
                                {waProvider === 'wablas' && (
                                    <div className="space-y-2 pl-3 border-l-2 border-emerald-500/30">
                                        <Field label="Token Wablas"><input name="wablasToken" defaultValue={cfg.token || ''} className={inputCls} /></Field>
                                        <Field label="Secret (opsional)"><input name="wablasSecret" defaultValue={cfg.secret || ''} className={inputCls} /></Field>
                                        <Field label="Base URL (opsional, default https://console.wablas.com)"><input name="wablasBaseUrl" defaultValue={cfg.baseUrl || ''} className={inputCls} placeholder="https://xxx.wablas.com" /></Field>
                                    </div>
                                )}
                                {waProvider === 'webhook' && (
                                    <div className="space-y-2 pl-3 border-l-2 border-emerald-500/30">
                                        <Field label="Webhook URL"><input name="webhookUrl" defaultValue={cfg.url || ''} className={inputCls} placeholder="https://your.gateway.tld/send" /></Field>
                                        <Field label="HTTP Method">
                                            <select name="webhookMethod" defaultValue={cfg.method || 'POST'} className={inputCls}>
                                                <option value="POST">POST</option>
                                                <option value="PUT">PUT</option>
                                            </select>
                                        </Field>
                                        <p className="text-xs text-fg-muted">Body JSON: {`{ phone, message, type, invoiceId, subscriptionId }`}</p>
                                    </div>
                                )}
                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="waNotifHMinus1Enabled" defaultChecked={settings?.waNotifHMinus1Enabled !== false} /> H-1 jatuh tempo</label>
                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="waNotifDueDayEnabled" defaultChecked={settings?.waNotifDueDayEnabled !== false} /> Hari-H jatuh tempo</label>
                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="waNotifOverdueEnabled" defaultChecked={settings?.waNotifOverdueEnabled !== false} /> Saat overdue</label>
                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="waNotifIsolirEnabled" defaultChecked={settings?.waNotifIsolirEnabled !== false} /> Saat isolir</label>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-fg uppercase tracking-wide">Payment Gateway</h4>
                            {(() => {
                                const tripayCfg = settings?.gatewayConfig?.tripay || {};
                                const midtransCfg = settings?.gatewayConfig?.midtrans || {};
                                const xenditCfg = settings?.gatewayConfig?.xendit || {};
                                const baseUrl = (typeof window !== 'undefined' ? window.location.origin : '');
                                return (
                                    <>
                                        <div className="flex flex-wrap gap-4">
                                            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={showTripay} onChange={e => setShowTripay(e.target.checked)} /> Tripay</label>
                                            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={showMidtrans} onChange={e => setShowMidtrans(e.target.checked)} /> Midtrans</label>
                                            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" checked={showXendit} onChange={e => setShowXendit(e.target.checked)} /> Xendit</label>
                                        </div>

                                        {showTripay && (
                                            <div className="space-y-2 pl-3 border-l-2 border-blue-500/30">
                                                <h5 className="text-xs font-semibold text-blue-400 uppercase">Tripay</h5>
                                                <Field label="API Key"><input name="tripayApiKey" defaultValue={tripayCfg.apiKey || ''} className={inputCls} /></Field>
                                                <Field label="Private Key"><input name="tripayPrivateKey" defaultValue={tripayCfg.privateKey || ''} className={inputCls} type="password" /></Field>
                                                <Field label="Merchant Code"><input name="tripayMerchantCode" defaultValue={tripayCfg.merchantCode || ''} className={inputCls} placeholder="T1234" /></Field>
                                                <Field label="Default Method"><input name="tripayDefaultMethod" defaultValue={tripayCfg.defaultMethod || 'QRIS'} className={inputCls} placeholder="QRIS / BRIVA / BCAVA" /></Field>
                                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="tripaySandbox" defaultChecked={!!tripayCfg.sandbox} /> Mode sandbox</label>
                                                <p className="text-xs text-fg-muted">Webhook URL: <code className="text-blue-400">{baseUrl}/api/billing/webhook/tripay</code></p>
                                            </div>
                                        )}

                                        {showMidtrans && (
                                            <div className="space-y-2 pl-3 border-l-2 border-blue-500/30">
                                                <h5 className="text-xs font-semibold text-blue-400 uppercase">Midtrans</h5>
                                                <Field label="Server Key"><input name="midtransServerKey" defaultValue={midtransCfg.serverKey || ''} className={inputCls} type="password" /></Field>
                                                <Field label="Client Key (opsional)"><input name="midtransClientKey" defaultValue={midtransCfg.clientKey || ''} className={inputCls} /></Field>
                                                <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="midtransProduction" defaultChecked={!!midtransCfg.isProduction} /> Mode production (default sandbox)</label>
                                                <p className="text-xs text-fg-muted">Webhook URL: <code className="text-blue-400">{baseUrl}/api/billing/webhook/midtrans</code> — set di Midtrans dashboard</p>
                                            </div>
                                        )}

                                        {showXendit && (
                                            <div className="space-y-2 pl-3 border-l-2 border-blue-500/30">
                                                <h5 className="text-xs font-semibold text-blue-400 uppercase">Xendit</h5>
                                                <Field label="Secret Key"><input name="xenditSecretKey" defaultValue={xenditCfg.secretKey || ''} className={inputCls} type="password" /></Field>
                                                <Field label="Callback Verification Token"><input name="xenditCallbackToken" defaultValue={xenditCfg.callbackToken || ''} className={inputCls} type="password" /></Field>
                                                <p className="text-xs text-fg-muted">Webhook URL: <code className="text-blue-400">{baseUrl}/api/billing/webhook/xendit</code> — set di Xendit dashboard</p>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        <Field label="Footer Invoice"><textarea name="invoiceFooterText" defaultValue={settings?.invoiceFooterText || ''} className={inputCls} rows={2} placeholder="Terima kasih atas pembayaran Anda. Hubungi 0812-xxx untuk bantuan." /></Field>

                        <div className="flex justify-end">
                            <Button type="submit" loading={update.isPending}>Simpan</Button>
                        </div>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Page root ─────────────────────────────────────────────────────────────
export default function Billing() {
    const [tab, setTab] = useState('customers');
    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-border bg-surface-dark/20">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-fg flex items-center gap-2">
                            <Receipt className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                            Billing & Manajemen Pelanggan
                        </h1>
                        <p className="text-fg-muted text-xs sm:text-sm">Pelanggan PPPoE & Hotspot, paket, tagihan, isolir otomatis</p>
                    </div>
                </div>
                {/* Tabs container — overflow-x-auto supaya bisa di-scroll horizontal
                    di mobile (8 tab tidak muat di lebar layar). shrink-0 di tiap
                    button supaya tidak ke-shrink jadi 2 baris. */}
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar -mx-4 sm:-mx-6 px-4 sm:px-6">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)} className={clsx(
                                'shrink-0 px-3 sm:px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap',
                                tab === t.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-fg-muted hover:text-fg'
                            )}>
                                <Icon className="w-4 h-4 shrink-0" /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                {tab === 'customers' && <CustomersTab />}
                {tab === 'packages' && <PackagesTab />}
                {tab === 'subscriptions' && <SubscriptionsTab />}
                {tab === 'invoices' && <InvoicesTab />}
                {tab === 'vouchers' && <VouchersTab />}
                {tab === 'reports' && <ReportsTab />}
                {tab === 'wa' && <WaTab />}
                {tab === 'settings' && <SettingsTab />}
            </div>
        </div>
    );
}
