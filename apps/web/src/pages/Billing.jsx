import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Receipt, Users as UsersIcon, Package as PackageIcon, Repeat, Settings as SettingsIcon, Plus, RefreshCw, Search, Lock, Unlock, Trash2, Pencil, Eye, X } from 'lucide-react';
import clsx from 'clsx';
import {
    usePackages, useCreatePackage, useUpdatePackage, useDeletePackage,
    useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
    useSubscriptions, useCreateSubscription, useUpdateSubscription, useDeleteSubscription,
    useIsolirSubscription, useUnisolirSubscription, revealSubscriptionPassword,
    useInvoices, useCreateInvoice, usePayInvoice, useCancelInvoice,
    useBillingRouterSettings, useUpdateBillingRouterSettings,
    useRouters,
} from '@/hooks';
import toast from 'react-hot-toast';

const TABS = [
    { id: 'customers', label: 'Pelanggan', icon: UsersIcon },
    { id: 'packages', label: 'Paket', icon: PackageIcon },
    { id: 'subscriptions', label: 'Subscription', icon: Repeat },
    { id: 'invoices', label: 'Tagihan', icon: Receipt },
    { id: 'settings', label: 'Pengaturan Router', icon: SettingsIcon },
];

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function Modal({ open, onClose, title, children, footer }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                    <h3 className="font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-slate-800 px-5 py-3 flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <label className="block mb-3">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</span>
            {children}
        </label>
    );
}
const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary';

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
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><UsersIcon className="w-5 h-5 text-primary" /> Pelanggan</CardTitle>
                <div className="flex gap-2 items-center">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama/kode/HP…" className="bg-slate-900 border border-slate-700 text-white text-xs rounded pl-9 pr-3 py-1.5 w-56" />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-slate-400">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/50 text-xs text-slate-500 uppercase">
                                <tr><th className="text-left px-4 py-2">Kode</th><th className="text-left px-4 py-2">Nama</th><th className="text-left px-4 py-2">HP</th><th className="text-left px-4 py-2">Alamat</th><th className="text-left px-4 py-2">PIN</th><th className="px-4 py-2 w-24"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Belum ada pelanggan</td></tr> : rows.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-2 font-mono text-slate-300">{c.code}</td>
                                        <td className="px-4 py-2 text-white">{c.name}</td>
                                        <td className="px-4 py-2 text-slate-400">{c.phone || '—'}</td>
                                        <td className="px-4 py-2 text-slate-400 text-xs max-w-xs truncate">{c.address || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-amber-400">{c.pinCode}</td>
                                        <td className="px-4 py-2 text-right space-x-1">
                                            <button onClick={() => { setEditing(c); setModalOpen(true); }} className="text-slate-400 hover:text-primary"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => { if (confirm(`Hapus pelanggan ${c.name}?`)) del.mutate(c.id); }} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
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
    const { data: rows = [], isLoading, refetch, isRefetching } = usePackages();
    const create = useCreatePackage();
    const update = useUpdatePackage();
    const del = useDeletePackage();
    const { data: routers = [] } = useRouters();

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
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><PackageIcon className="w-5 h-5 text-primary" /> Paket Layanan</CardTitle>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-slate-400">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/50 text-xs text-slate-500 uppercase">
                                <tr><th className="text-left px-4 py-2">Nama</th><th className="text-left px-4 py-2">Tipe</th><th className="text-left px-4 py-2">Profile</th><th className="text-right px-4 py-2">Harga</th><th className="text-left px-4 py-2">Cycle</th><th className="text-center px-4 py-2">Aktif</th><th className="px-4 py-2 w-20"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Belum ada paket</td></tr> : rows.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-2 text-white">{p.name}</td>
                                        <td className="px-4 py-2"><span className={clsx('text-xs px-2 py-0.5 rounded', p.type === 'pppoe' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400')}>{p.type.toUpperCase()}</span></td>
                                        <td className="px-4 py-2 font-mono text-slate-400 text-xs">{p.mikrotikProfile}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(p.price)}</td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">{p.cycleType === 'monthly' ? `${p.cycleValue} bln` : `${p.cycleValue} dtk`}</td>
                                        <td className="px-4 py-2 text-center">{p.active ? '✓' : '—'}</td>
                                        <td className="px-4 py-2 text-right space-x-1">
                                            <button onClick={() => { setEditing(p); setModalOpen(true); }} className="text-slate-400 hover:text-primary"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => { if (confirm(`Hapus paket ${p.name}?`)) del.mutate(p.id); }} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
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
                    <Field label="MikroTik Profile (harus ada di router)"><input name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls} placeholder="contoh: pppoe-home-10m" /></Field>
                    <Field label="Harga (IDR)"><input name="price" type="number" min="0" defaultValue={editing?.price || 0} required className={inputCls} /></Field>
                    <div className="grid grid-cols-2 gap-3">
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
                    <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="active" defaultChecked={editing?.active !== false} /> Aktif</label>
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
    const del = useDeleteSubscription();
    const isolir = useIsolirSubscription();
    const unisolir = useUnisolirSubscription();

    const custMap = useMemo(() => Object.fromEntries(customers.map(c => [c.id, c])), [customers]);
    const pkgMap = useMemo(() => Object.fromEntries(pkgs.map(p => [p.id, p])), [pkgs]);
    const routerMap = useMemo(() => Object.fromEntries(routers.map(r => [r.id, r])), [routers]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await create.mutateAsync({
            customerId: f.get('customerId'),
            packageId: f.get('packageId'),
            routerId: f.get('routerId'),
            mikrotikIdentity: f.get('mikrotikIdentity'),
            plainPassword: f.get('plainPassword'),
            billingDay: Number(f.get('billingDay')) || undefined,
        });
        setModalOpen(false);
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
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><Repeat className="w-5 h-5 text-primary" /> Subscription</CardTitle>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                    <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="w-4 h-4 mr-1" /> Tambah</Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-slate-400">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/50 text-xs text-slate-500 uppercase">
                                <tr><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">Paket</th><th className="text-left px-4 py-2">Router</th><th className="text-left px-4 py-2">Identitas / Pwd</th><th className="text-center px-4 py-2">Tgl Tagih</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Tagihan Berikut</th><th className="px-4 py-2"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">Belum ada subscription</td></tr> : rows.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-2 text-white">{custMap[s.customerId]?.name || '—'}<div className="text-xs text-slate-500 font-mono">{custMap[s.customerId]?.code}</div></td>
                                        <td className="px-4 py-2 text-slate-300">{pkgMap[s.packageId]?.name || '—'}</td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">{routerMap[s.routerId]?.name || '—'}</td>
                                        <td className="px-4 py-2 font-mono text-xs">
                                            <div className="text-blue-400">{s.mikrotikIdentity}</div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-slate-500">{pwdShown[s.id] || '••••••'}</span>
                                                <button onClick={() => showPwd(s.id)} className="text-slate-500 hover:text-amber-400"><Eye className="w-3 h-3" /></button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-center text-slate-400">{s.billingDay || '—'}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                                s.status === 'isolir' ? 'bg-red-500/20 text-red-400' :
                                                s.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-slate-500/20 text-slate-400')}>{s.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">{fmtDate(s.nextDueAt)}</td>
                                        <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                                            {s.status === 'active' ? (
                                                <button title="Isolir" onClick={() => { if (confirm('Isolir subscription ini?')) isolir.mutate({ id: s.id, reason: 'manual' }); }} className="text-slate-400 hover:text-red-400"><Lock className="w-4 h-4" /></button>
                                            ) : s.status === 'isolir' ? (
                                                <button title="Buka Isolir" onClick={() => unisolir.mutate(s.id)} className="text-slate-400 hover:text-emerald-400"><Unlock className="w-4 h-4" /></button>
                                            ) : null}
                                            <button onClick={() => { if (confirm('Hapus subscription? PPPoE secret juga dihapus dari MikroTik.')) del.mutate(s.id); }} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tambah Subscription" footer={<>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
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
                        <select name="routerId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Username PPPoE / Voucher Code"><input name="mikrotikIdentity" required className={inputCls} placeholder="budi-home" /></Field>
                    <Field label="Password"><input name="plainPassword" required className={inputCls} /></Field>
                    <Field label="Tanggal tagih (1-28, kosong = 1)"><input name="billingDay" type="number" min="1" max="28" className={inputCls} /></Field>
                </form>
            </Modal>
        </Card>
    );
}

// ─── Tagihan tab ───────────────────────────────────────────────────────────
function InvoicesTab() {
    const [filter, setFilter] = useState('');
    const [payTarget, setPayTarget] = useState(null);
    const { data: rows = [], isLoading, refetch, isRefetching } = useInvoices({ status: filter || undefined });
    const { data: customers = [] } = useCustomers();
    const pay = usePayInvoice();
    const cancel = useCancelInvoice();
    const custMap = useMemo(() => Object.fromEntries(customers.map(c => [c.id, c])), [customers]);

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
            <CardHeader className="flex flex-row items-center justify-between">
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
                {isLoading ? <div className="p-6 text-center text-slate-400">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/50 text-xs text-slate-500 uppercase">
                                <tr><th className="text-left px-4 py-2">No. Invoice</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-right px-4 py-2">Jumlah</th><th className="text-left px-4 py-2">Jatuh Tempo</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Dibayar</th><th className="px-4 py-2"></th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Tidak ada tagihan</td></tr> : rows.map(i => (
                                    <tr key={i.id} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-2 font-mono text-blue-400">{i.invoiceNumber}</td>
                                        <td className="px-4 py-2 text-white">{custMap[i.customerId]?.name || '—'}</td>
                                        <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmtIDR(i.amount)}</td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">{fmtDate(i.dueAt)}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                i.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                                                i.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                                                i.status === 'unpaid' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-slate-500/20 text-slate-400')}>{i.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-400 text-xs">{fmtDateTime(i.paidAt)}</td>
                                        <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                                            {i.status !== 'paid' && i.status !== 'cancelled' && <Button size="sm" onClick={() => setPayTarget(i)}>Bayar</Button>}
                                            {i.status === 'unpaid' && <button onClick={() => { if (confirm('Batalkan tagihan?')) cancel.mutate(i.id); }} className="text-slate-400 hover:text-red-400 px-2"><X className="w-4 h-4" /></button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

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

// ─── Settings tab ──────────────────────────────────────────────────────────
function SettingsTab() {
    const { data: routers = [] } = useRouters();
    const [routerId, setRouterId] = useState('');
    const { data: settings } = useBillingRouterSettings(routerId);
    const update = useUpdateBillingRouterSettings();

    const save = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await update.mutateAsync({
            routerId,
            pppoeBillingEnabled: f.get('pppoeBillingEnabled') === 'on',
            hotspotMode: f.get('hotspotMode'),
            isolirProfile: f.get('isolirProfile'),
            isolirRedirectUrl: f.get('isolirRedirectUrl') || null,
            isolirGraceDays: Number(f.get('isolirGraceDays')) || 0,
            defaultBillingDay: Number(f.get('defaultBillingDay')) || 1,
            waProvider: f.get('waProvider'),
            waNotifHMinus1Enabled: f.get('waNotifHMinus1Enabled') === 'on',
            waNotifDueDayEnabled: f.get('waNotifDueDayEnabled') === 'on',
            waNotifOverdueEnabled: f.get('waNotifOverdueEnabled') === 'on',
            waNotifIsolirEnabled: f.get('waNotifIsolirEnabled') === 'on',
            gatewayTripayEnabled: f.get('gatewayTripayEnabled') === 'on',
            gatewayMidtransEnabled: f.get('gatewayMidtransEnabled') === 'on',
            gatewayXenditEnabled: f.get('gatewayXenditEnabled') === 'on',
            invoiceFooterText: f.get('invoiceFooterText') || null,
        });
    };

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
                    <form onSubmit={save} className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">PPPoE</h4>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="pppoeBillingEnabled" defaultChecked={settings?.pppoeBillingEnabled} /> Aktifkan billing PPPoE</label>
                                <Field label="Profile Isolir"><input name="isolirProfile" defaultValue={settings?.isolirProfile || 'pppoe-isolir'} className={inputCls} /></Field>
                                <Field label="Redirect URL halaman tagihan"><input name="isolirRedirectUrl" defaultValue={settings?.isolirRedirectUrl || ''} className={inputCls} placeholder="https://genster.id/tagihan" /></Field>
                                <Field label="Grace days sebelum auto-isolir"><input name="isolirGraceDays" type="number" min="0" defaultValue={settings?.isolirGraceDays || 0} className={inputCls} /></Field>
                                <Field label="Default tanggal tagih"><input name="defaultBillingDay" type="number" min="1" max="28" defaultValue={settings?.defaultBillingDay || 1} className={inputCls} /></Field>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Hotspot</h4>
                                <Field label="Mode">
                                    <select name="hotspotMode" defaultValue={settings?.hotspotMode || 'disabled'} className={inputCls}>
                                        <option value="disabled">Disabled</option>
                                        <option value="native">Native (sistem ini)</option>
                                        <option value="mikhmon_bridge">Mikhmon Bridge (baca dari MikroTik)</option>
                                    </select>
                                </Field>

                                <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide pt-2">Notifikasi WhatsApp</h4>
                                <Field label="Provider WA">
                                    <select name="waProvider" defaultValue={settings?.waProvider || 'none'} className={inputCls}>
                                        <option value="none">— Nonaktif —</option>
                                        <option value="fonnte">Fonnte</option>
                                        <option value="wablas">Wablas</option>
                                        <option value="webhook">Webhook generic</option>
                                    </select>
                                </Field>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="waNotifHMinus1Enabled" defaultChecked={settings?.waNotifHMinus1Enabled !== false} /> H-1 jatuh tempo</label>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="waNotifDueDayEnabled" defaultChecked={settings?.waNotifDueDayEnabled !== false} /> Hari-H jatuh tempo</label>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="waNotifOverdueEnabled" defaultChecked={settings?.waNotifOverdueEnabled !== false} /> Saat overdue</label>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="waNotifIsolirEnabled" defaultChecked={settings?.waNotifIsolirEnabled !== false} /> Saat isolir</label>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">Payment Gateway</h4>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="gatewayTripayEnabled" defaultChecked={settings?.gatewayTripayEnabled} /> Tripay</label>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="gatewayMidtransEnabled" defaultChecked={settings?.gatewayMidtransEnabled} /> Midtrans</label>
                                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" name="gatewayXenditEnabled" defaultChecked={settings?.gatewayXenditEnabled} /> Xendit</label>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">Konfigurasi kredensial gateway dilakukan di Phase E (sesi berikutnya). Toggle ini hanya untuk indikasi.</p>
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
            <div className="px-6 pt-6 border-b border-slate-800 bg-slate-900/20">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Receipt className="w-7 h-7 text-primary" />
                            Billing & Manajemen Pelanggan
                        </h1>
                        <p className="text-slate-400 text-sm">Pelanggan PPPoE & Hotspot, paket, tagihan, isolir otomatis</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)} className={clsx(
                                'px-5 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2',
                                tab === t.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-300'
                            )}>
                                <Icon className="w-4 h-4" /> {t.label}
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
                {tab === 'settings' && <SettingsTab />}
            </div>
        </div>
    );
}
