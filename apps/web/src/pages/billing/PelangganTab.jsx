import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Users as UsersIcon, Plus, RefreshCw, Search, Lock, Unlock, Trash2, Pencil,
    Eye, ChevronDown, ChevronRight, X, Phone, MapPin, Receipt, HandCoins,
    Wifi, CreditCard,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
    useCustomers, useDeleteCustomer, useUpdateCustomer,
    useSubscriptions, useUpdateSubscription, useDeleteSubscription,
    useIsolirSubscription, useUnisolirSubscription, revealSubscriptionPassword,
    usePackages, useCreatePackage,
    useInvoices, usePayInvoice,
    useImportCandidates,
    useRouters,
    useCreateCustomerWithSubscription,
    useShiftSubscriptionDue,
} from '@/hooks';
import { useCreatePromise } from '@/hooks/usePromiseToPay';

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const inputCls = 'w-full bg-surface-darker border border-slate-border rounded px-3 py-2 text-fg focus:outline-none focus:border-primary';

function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className={`w-full ${maxWidth} bg-surface-dark border border-slate-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}>
                <div className="flex items-center justify-between border-b border-slate-border px-4 sm:px-5 py-3 shrink-0">
                    <h3 className="font-semibold text-fg text-sm sm:text-base">{title}</h3>
                    <button onClick={onClose} className="text-fg-muted hover:text-fg"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 sm:px-5 py-4 overflow-y-auto custom-scrollbar">{children}</div>
                {footer && <div className="border-t border-slate-border px-4 sm:px-5 py-3 flex justify-end gap-2 shrink-0">{footer}</div>}
            </div>
        </div>,
        document.body
    );
}

function Field({ label, children }) {
    return (
        <div className="mb-3">
            <label className="block text-xs font-medium text-fg-muted mb-1">{label}</label>
            {children}
        </div>
    );
}

export default function PelangganTab() {
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editingSub, setEditingSub] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [search, setSearch] = useState('');
    const [routerFilter, setRouterFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const { data: subs = [], isLoading, refetch, isRefetching } = useSubscriptions();
    const { data: customers = [] } = useCustomers();
    const { data: pkgs = [] } = usePackages();
    const { data: routers = [] } = useRouters();

    const updateSub = useUpdateSubscription();
    const deleteSub = useDeleteSubscription();
    const isolir = useIsolirSubscription();
    const unisolir = useUnisolirSubscription();

    const custMap = useMemo(() => Object.fromEntries(customers.map(c => [c.id, c])), [customers]);
    const pkgMap = useMemo(() => Object.fromEntries(pkgs.map(p => [p.id, p])), [pkgs]);
    const routerMap = useMemo(() => Object.fromEntries(routers.map(r => [r.id, r])), [routers]);

    const rows = useMemo(() => {
        const q = search.toLowerCase().trim();
        return subs.filter(s => {
            if (routerFilter && s.routerId !== routerFilter) return false;
            if (statusFilter && s.status !== statusFilter) return false;
            if (!q) return true;
            const c = custMap[s.customerId];
            return (c?.name || '').toLowerCase().includes(q)
                || (c?.phone || '').toLowerCase().includes(q)
                || (c?.code || '').toLowerCase().includes(q)
                || (s.mikrotikIdentity || '').toLowerCase().includes(q);
        });
    }, [subs, search, routerFilter, statusFilter, custMap]);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <UsersIcon className="w-5 h-5 text-primary" />
                        Pelanggan
                        <span className="text-xs text-fg-muted font-normal ml-2">{rows.length} dari {subs.length}</span>
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => refetch()}>
                            <RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} />
                        </Button>
                        <Button size="sm" onClick={() => setWizardOpen(true)}>
                            <Plus className="w-4 h-4 mr-1" /> Tambah Pelanggan
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-xs">
                    <select value={routerFilter} onChange={e => setRouterFilter(e.target.value)} className={inputCls + ' w-auto py-1.5'}>
                        <option value="">Semua router</option>
                        {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={inputCls + ' w-auto py-1.5'}>
                        <option value="">Semua status</option>
                        <option value="active">Active</option>
                        <option value="isolir">Isolir</option>
                        <option value="suspended">Suspended</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <div className="relative flex-1 min-w-[150px]">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted" />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Cari nama / HP / kode / username PPP..."
                            className={inputCls + ' pl-7 py-1.5'} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? <div className="p-6 text-center text-fg-muted">Memuat…</div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[700px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr>
                                    <th className="w-6"></th>
                                    <th className="text-left px-3 py-2">Nama</th>
                                    <th className="text-left px-3 py-2">Router / Username</th>
                                    <th className="text-left px-3 py-2">Paket</th>
                                    <th className="text-center px-3 py-2">Tagih</th>
                                    <th className="text-left px-3 py-2">Status</th>
                                    <th className="text-left px-3 py-2">Next Due</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {rows.length === 0 ? (
                                    <tr><td colSpan={7} className="px-3 py-8 text-center text-fg-muted">Belum ada pelanggan. Klik <span className="text-fg">Tambah Pelanggan</span> untuk mulai.</td></tr>
                                ) : rows.map((s, idx) => {
                                    // Defensive: kalau subscription tidak punya id (data corrupt /
                                    // bug dari endpoint), log + skip baris supaya operator tidak
                                    // klik tombol yang akan kirim "undefined" ke backend dan 500.
                                    if (!s?.id) {
                                        // eslint-disable-next-line no-console
                                        console.error('[PelangganTab] Subscription tanpa id di rows[' + idx + ']:', s);
                                        return null;
                                    }
                                    const cust = custMap[s.customerId];
                                    const pkg = pkgMap[s.packageId];
                                    const router = routerMap[s.routerId];
                                    const isOpen = expandedId === s.id;
                                    return (
                                        <React.Fragment key={s.id}>
                                            <tr className={clsx('hover:bg-slate-surface/30 cursor-pointer', isOpen && 'bg-slate-surface/40')}
                                                onClick={() => setExpandedId(isOpen ? null : s.id)}>
                                                <td className="px-1 py-2 text-fg-muted">
                                                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </td>
                                                <td className="px-3 py-2 text-fg">
                                                    <div className="font-medium">{cust?.name || '—'}</div>
                                                    <div className="text-[10px] text-fg-muted font-mono">{cust?.code || ''}</div>
                                                </td>
                                                <td className="px-3 py-2 text-xs">
                                                    <div className="text-fg-muted">{router?.name || '—'}</div>
                                                    <div className="font-mono text-blue-400">{s.mikrotikIdentity}</div>
                                                </td>
                                                <td className="px-3 py-2 text-fg">{pkg?.name || '—'}</td>
                                                <td className="px-3 py-2 text-center text-xs text-fg-muted">
                                                    {s.billingMode === 'anniversary' ? (
                                                        <span title="Anniversary mode">Anniv</span>
                                                    ) : (
                                                        s.billingDay || '—'
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className={clsx('text-[10px] px-2 py-0.5 rounded uppercase font-semibold',
                                                        s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                                        s.status === 'isolir' ? 'bg-red-500/20 text-red-400' :
                                                        s.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                                        'bg-slate-500/20 text-fg-muted')}>{s.status}</span>
                                                </td>
                                                <td className="px-3 py-2 text-fg-muted text-xs">{fmtDate(s.nextDueAt)}</td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="bg-black/20">
                                                    <td colSpan={7} className="px-3 py-3">
                                                        <ExpandedDetail
                                                            sub={s} cust={cust} pkg={pkg} router={router}
                                                            onEdit={() => setEditingSub(s)}
                                                            onIsolir={() => {
                                                                if (!s?.id) return toast.error('Subscription id hilang');
                                                                isolir.mutate({ id: s.id, reason: 'manual' });
                                                            }}
                                                            onUnisolir={() => {
                                                                if (!s?.id) return toast.error('Subscription id hilang');
                                                                unisolir.mutate(s.id);
                                                            }}
                                                            onDelete={() => {
                                                                if (!s?.id) return toast.error('Subscription id hilang');
                                                                if (confirm(`Hapus subscription ${cust?.name || s.mikrotikIdentity}?`)) {
                                                                    deleteSub.mutate(s.id);
                                                                    setExpandedId(null);
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>

            {wizardOpen && (
                <TambahPelangganWizard
                    onClose={() => setWizardOpen(false)}
                    routers={routers}
                    pkgs={pkgs}
                />
            )}

            {editingSub && (
                <EditSubscriptionModal
                    sub={editingSub}
                    cust={custMap[editingSub.customerId]}
                    router={routerMap[editingSub.routerId]}
                    pkgs={pkgs}
                    onClose={() => setEditingSub(null)}
                    onSave={async (patch) => {
                        await updateSub.mutateAsync({ id: editingSub.id, ...patch });
                        setEditingSub(null);
                    }}
                    saving={updateSub.isPending}
                />
            )}
        </Card>
    );
}

// ─── Expanded row: detail + recent invoices + actions ──────────────────────
function ExpandedDetail({ sub, cust, pkg, router, onEdit, onIsolir, onUnisolir, onDelete }) {
    const { data: invoices = [] } = useInvoices({ customerId: cust?.id, limit: 5 });
    const [pwdShown, setPwdShown] = useState(false);
    const [pwdValue, setPwdValue] = useState('');

    const reveal = async () => {
        if (pwdShown) { setPwdShown(false); return; }
        const p = await revealSubscriptionPassword(sub.id);
        if (p) {
            setPwdValue(p); setPwdShown(true);
            setTimeout(() => setPwdShown(false), 10000);
        } else toast.error('Password tidak tersedia');
    };

    return (
        <div className="grid lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1.5">Info Pelanggan</div>
                <div className="flex items-baseline gap-2">
                    <Phone className="w-3 h-3 text-fg-muted shrink-0" />
                    <span className="text-fg">{cust?.phone || '—'}</span>
                </div>
                <div className="flex items-baseline gap-2">
                    <MapPin className="w-3 h-3 text-fg-muted shrink-0" />
                    <span className="text-fg break-words">{cust?.address || '—'}</span>
                </div>
                <div className="text-fg-muted">PIN: <span className="text-amber-400 font-mono">{cust?.pinCode || '—'}</span></div>
            </div>

            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1.5">MikroTik / Paket</div>
                <div className="text-fg-muted">Router: <span className="text-fg">{router?.name || '—'}</span></div>
                <div className="text-fg-muted">User: <span className="font-mono text-blue-400">{sub.mikrotikIdentity}</span></div>
                <div className="text-fg-muted flex items-center gap-1.5">
                    Password: <span className="font-mono text-fg">{pwdShown ? pwdValue : '••••••'}</span>
                    <button onClick={reveal} className="text-fg-muted hover:text-amber-400"><Eye className="w-3 h-3" /></button>
                </div>
                <div className="text-fg-muted">Paket: <span className="text-fg">{pkg?.name || '—'}</span> {pkg && <span className="text-emerald-400">({fmtIDR(pkg.price)})</span>}</div>
                <div className="text-fg-muted">Mode: <span className="text-fg">{sub.billingMode === 'anniversary' ? 'Anniversary' : `Tanggal ${sub.billingDay || 1}`}</span></div>
                <div className="text-fg-muted">Next due: <span className="text-fg">{fmtDate(sub.nextDueAt)}</span></div>
            </div>

            <div className="bg-surface-dark/40 border border-slate-border rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1.5">Tagihan Terakhir</div>
                {invoices.length === 0 ? (
                    <div className="text-fg-muted italic">Belum ada tagihan</div>
                ) : invoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="flex items-baseline justify-between">
                        <div>
                            <span className="font-mono text-primary">{inv.invoiceNumber}</span>
                            <div className="text-[10px] text-fg-muted">{fmtDate(inv.dueAt)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-fg">{fmtIDR(inv.amount)}</div>
                            <div className={clsx('text-[10px] uppercase',
                                inv.status === 'paid' ? 'text-emerald-400' :
                                inv.status === 'overdue' ? 'text-red-400' :
                                'text-amber-400')}>{inv.status}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="lg:col-span-3 flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                {sub.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={onIsolir}><Lock className="w-3.5 h-3.5 mr-1" /> Isolir</Button>
                )}
                {sub.status === 'isolir' && (
                    <Button size="sm" variant="outline" onClick={onUnisolir}><Unlock className="w-3.5 h-3.5 mr-1" /> Buka Isolir</Button>
                )}
                <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
                </Button>
            </div>
        </div>
    );
}

// ─── Edit subscription modal (lebih ringkas dari yg lama) ──────────────────
function EditSubscriptionModal({ sub, cust, router, pkgs, onClose, onSave, saving }) {
    const [mode, setMode] = useState(sub.billingMode || 'anchor_day');
    const [overrideDate, setOverrideDate] = useState('');
    const shiftDue = useShiftSubscriptionDue();
    const updateCustomer = useUpdateCustomer();

    const handle = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);

        // Patch subscription (paket, password, mode, billingDay)
        const patch = {
            packageId: f.get('packageId') || undefined,
            billingMode: mode,
            billingDay: mode === 'anchor_day' && f.get('billingDay') ? Number(f.get('billingDay')) : undefined,
        };
        const newPwd = f.get('plainPassword');
        if (newPwd && String(newPwd).trim()) patch.plainPassword = String(newPwd).trim();

        // Patch customer (nama, HP, alamat) — hanya kirim field yang BERUBAH
        // supaya tidak overwrite field lain yang tidak ditampilkan di modal.
        const newName = String(f.get('name') || '').trim();
        const newPhone = String(f.get('phone') || '').trim();
        const newAddress = String(f.get('address') || '').trim();
        const custPatch = {};
        if (newName && newName !== (cust?.name || '')) custPatch.name = newName;
        if (newPhone !== (cust?.phone || '')) custPatch.phone = newPhone || null;
        if (newAddress !== (cust?.address || '')) custPatch.address = newAddress || null;
        if (Object.keys(custPatch).length > 0 && cust?.id) {
            await updateCustomer.mutateAsync({ id: cust.id, ...custPatch });
        }

        await onSave(patch);

        // Shift-due SETELAH save patch. Kirim date STRING (YYYY-MM-DD) langsung
        // — backend interpret sebagai midnight di tenant TZ. Jangan konversi
        // via toISOString() karena browser TZ ≠ backend TZ.
        if (overrideDate) {
            await shiftDue.mutateAsync({ id: sub.id, nextDueAt: overrideDate });
        }
    };

    // Pre-fill input dengan nextDueAt saat ini supaya operator bisa edit incremental
    const currentDueStr = sub.nextDueAt
        ? new Date(sub.nextDueAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
    const currentDueISODate = sub.nextDueAt
        ? new Date(sub.nextDueAt).toISOString().slice(0, 10)
        : '';

    return (
        <Modal open onClose={onClose} title={`Edit — ${cust?.name || sub.mikrotikIdentity}`}
            footer={<>
                <Button variant="ghost" onClick={onClose}>Batal</Button>
                <Button form="sub-edit-form-merged" type="submit" loading={saving || shiftDue.isPending}>Simpan</Button>
            </>}>
            <form id="sub-edit-form-merged" onSubmit={handle}>
                <Field label="Router / Username">
                    <input value={`${router?.name || '—'} / ${sub.mikrotikIdentity}`} disabled className={inputCls + ' opacity-60'} />
                </Field>

                <div className="bg-surface-darker/40 border border-slate-border/40 rounded-lg p-3 mb-3 space-y-2">
                    <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1">Data Pelanggan</div>
                    <Field label="Nama">
                        <input name="name" defaultValue={cust?.name || ''} className={inputCls} placeholder="Nama pelanggan" />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="HP">
                            <input name="phone" defaultValue={cust?.phone || ''} className={inputCls} placeholder="0812-xxx" />
                        </Field>
                        <Field label="Alamat">
                            <input name="address" defaultValue={cust?.address || ''} className={inputCls} placeholder="Jl. ..." />
                        </Field>
                    </div>
                </div>

                <Field label="Paket">
                    <select name="packageId" defaultValue={sub.packageId} className={inputCls}>
                        {pkgs.filter(p => p.active || p.id === sub.packageId).map(p => (
                            <option key={p.id} value={p.id}>{p.name} — {fmtIDR(p.price)}/{p.cycleType === 'monthly' ? 'bln' : 'sesi'}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Password baru (kosongkan jika tidak diubah)">
                    <input name="plainPassword" type="text" placeholder="••••••" className={inputCls} />
                </Field>
                <div className="space-y-2">
                    <label className="block text-xs font-medium text-fg-muted">Cara tagihan</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { v: 'anchor_day', l: 'Tanggal Anchor', d: 'Tagihan tanggal sama tiap bulan' },
                            { v: 'anniversary', l: 'Anniversary', d: 'Tiap 1 bulan dari pembayaran' },
                        ].map(o => (
                            <label key={o.v} className={clsx(
                                'cursor-pointer border rounded p-2 transition-colors text-xs',
                                mode === o.v ? 'border-primary bg-primary/5' : 'border-slate-border hover:bg-white/5'
                            )}>
                                <input type="radio" checked={mode === o.v} onChange={() => setMode(o.v)} className="sr-only" />
                                <div className="font-semibold text-fg">{o.l}</div>
                                <div className="text-fg-muted">{o.d}</div>
                            </label>
                        ))}
                    </div>
                    {mode === 'anchor_day' && (
                        <Field label="Tanggal tagih (1-28)">
                            <input name="billingDay" type="number" min="1" max="28" defaultValue={sub.billingDay || 1} className={inputCls} />
                        </Field>
                    )}
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mt-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Geser Tanggal Tagihan (Override)</div>
                    <div className="text-xs text-fg-muted">
                        Tanggal berikutnya saat ini: <span className="text-fg font-medium">{currentDueStr}</span>
                    </div>
                    <Field label="Geser ke (kosongkan kalau tidak diubah)">
                        <input
                            type="date"
                            value={overrideDate}
                            onChange={e => setOverrideDate(e.target.value)}
                            placeholder={currentDueISODate}
                            className={inputCls}
                        />
                    </Field>
                    <p className="text-[11px] text-fg-muted">
                        Tanggal ini akan jadi <code>nextDueAt</code> baru. Comment di MikroTik (prefix + <code>dn:</code>) juga di-update otomatis supaya scheduler MikroTik baca tanggal yang sama.
                    </p>
                </div>

                <p className="text-xs text-fg-muted mt-3">
                    Perubahan paket & password langsung di-push ke MikroTik. Tanpa override tanggal, tagihan berikut diperbarui di siklus berikutnya.
                </p>
            </form>
        </Modal>
    );
}

// ─── Wizard Tambah Pelanggan (1 form, semua step) ──────────────────────────
function TambahPelangganWizard({ onClose, routers, pkgs }) {
    const [routerId, setRouterId] = useState('');
    const [mikrotikIdentity, setMikrotikIdentity] = useState('');
    const [plainPassword, setPlainPassword] = useState('');
    const [pickedFromRouter, setPickedFromRouter] = useState(false);
    const [pkgId, setPkgId] = useState('');
    const [mode, setMode] = useState('anchor_day');
    const [billingDay, setBillingDay] = useState(1);
    const [pkgCreateOpen, setPkgCreateOpen] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);

    const create = useCreateCustomerWithSubscription();
    const { data: candidates = [], isLoading: candidatesLoading } = useImportCandidates(routerId, 'pppoe');

    const filteredCandidates = useMemo(() => {
        if (!pickerSearch) return candidates;
        const q = pickerSearch.toLowerCase();
        return candidates.filter(c =>
            c.name?.toLowerCase().includes(q) ||
            c.profile?.toLowerCase().includes(q) ||
            c.comment?.toLowerCase().includes(q)
        );
    }, [candidates, pickerSearch]);

    const handlePick = (c) => {
        setMikrotikIdentity(c.name);
        setPlainPassword(c.password || '');
        setPickedFromRouter(true);
        setPickerOpen(false);
        if (!c.password) toast('MikroTik tidak return password — isi manual', { icon: '⚠️' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        if (!routerId) return toast.error('Pilih router dulu');
        if (!mikrotikIdentity || !plainPassword) return toast.error('Username & password PPPoE wajib diisi');
        if (!pkgId) return toast.error('Pilih paket dulu');
        if (!f.get('name')?.toString().trim()) return toast.error('Nama pelanggan wajib diisi');

        try {
            await create.mutateAsync({
                customer: {
                    name: String(f.get('name')).trim(),
                    phone: f.get('phone')?.toString().trim() || null,
                    address: f.get('address')?.toString().trim() || null,
                },
                subscription: {
                    packageId: pkgId,
                    routerId,
                    mikrotikIdentity,
                    plainPassword,
                    billingMode: mode,
                    billingDay: mode === 'anchor_day' ? Number(billingDay) || 1 : undefined,
                },
            });
            onClose();
        } catch { /* toast handled by hook */ }
    };

    const filteredPkgs = pkgs.filter(p => p.type === 'pppoe' && (p.active || p.id === pkgId));

    return (
        <Modal open onClose={onClose} title="Tambah Pelanggan" maxWidth="max-w-2xl"
            footer={<>
                <Button variant="ghost" onClick={onClose}>Batal</Button>
                <Button form="wizard-form" type="submit" loading={create.isPending}>
                    <Plus className="w-4 h-4 mr-1" /> Tambah Pelanggan
                </Button>
            </>}>
            <form id="wizard-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Step 1: Router */}
                <div>
                    <StepLabel n={1}>Pilih Router</StepLabel>
                    <select value={routerId} onChange={e => { setRouterId(e.target.value); setMikrotikIdentity(''); setPlainPassword(''); setPickedFromRouter(false); }} className={inputCls} required>
                        <option value="">— Pilih Router —</option>
                        {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>

                {/* Step 2: PPPoE secret */}
                {routerId && (
                    <div>
                        <StepLabel n={2}>Username PPPoE</StepLabel>
                        <div className="flex items-center gap-2 mb-2">
                            <Button type="button" size="sm" variant={pickedFromRouter ? 'default' : 'outline'} onClick={() => setPickerOpen(true)}>
                                <Wifi className="w-3.5 h-3.5 mr-1" />
                                {pickedFromRouter ? 'Ubah dari router' : 'Pilih dari router'}
                            </Button>
                            <span className="text-xs text-fg-muted">atau</span>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setPickedFromRouter(false); setMikrotikIdentity(''); setPlainPassword(''); }}>
                                Buat baru manual
                            </Button>
                        </div>

                        {pickerOpen && (
                            <div className="border border-slate-border rounded-lg bg-surface-dark/40 mb-2">
                                <div className="p-2 border-b border-slate-border flex items-center gap-2">
                                    <Search className="w-3.5 h-3.5 text-fg-muted" />
                                    <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                                        placeholder="Cari username / profile / comment..."
                                        className="flex-1 bg-transparent text-fg outline-none text-sm" autoFocus />
                                    <button type="button" onClick={() => { setPickerOpen(false); setPickerSearch(''); }} className="text-fg-muted hover:text-fg">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                    {candidatesLoading ? (
                                        <div className="p-3 text-xs text-fg-muted text-center">Memuat dari router…</div>
                                    ) : candidates.length === 0 ? (
                                        <div className="p-3 text-xs text-fg-muted text-center">Tidak ada PPP secret belum-bound di router ini.</div>
                                    ) : filteredCandidates.length === 0 ? (
                                        <div className="p-3 text-xs text-fg-muted text-center">Tidak ada hasil untuk "{pickerSearch}"</div>
                                    ) : (
                                        <table className="w-full text-xs">
                                            <thead className="bg-surface-dark sticky top-0 text-fg-muted uppercase">
                                                <tr>
                                                    <th className="text-left px-2 py-1">Username</th>
                                                    <th className="text-left px-2 py-1">Profile</th>
                                                    <th className="px-2 py-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {filteredCandidates.map(c => (
                                                    <tr key={c.name} className={clsx('hover:bg-slate-surface/50', c.disabled && 'opacity-50')}>
                                                        <td className="px-2 py-1 font-mono text-blue-400">{c.name}</td>
                                                        <td className="px-2 py-1 text-fg-muted">{c.profile || '—'}</td>
                                                        <td className="px-2 py-1 text-right">
                                                            <button type="button" onClick={() => handlePick(c)} className="text-primary hover:underline">Pilih</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <Field label="Username">
                                <input value={mikrotikIdentity} onChange={e => setMikrotikIdentity(e.target.value)} required className={inputCls} placeholder="budi-rumah" />
                            </Field>
                            <Field label="Password">
                                <input value={plainPassword} onChange={e => setPlainPassword(e.target.value)} required className={inputCls} placeholder="••••••" />
                            </Field>
                        </div>
                        {pickedFromRouter && (
                            <p className="text-[11px] text-emerald-400 -mt-2">✓ Diambil dari PPP secret existing di router</p>
                        )}
                    </div>
                )}

                {/* Step 3: Data pelanggan */}
                <div>
                    <StepLabel n={3}>Data Pelanggan</StepLabel>
                    <Field label="Nama"><input name="name" required className={inputCls} placeholder="Budi Santoso" /></Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="HP (opsional)"><input name="phone" className={inputCls} placeholder="0812-xxx" /></Field>
                        <Field label="Alamat (opsional)"><input name="address" className={inputCls} placeholder="Jl. ..." /></Field>
                    </div>
                </div>

                {/* Step 4: Paket */}
                <div>
                    <StepLabel n={4}>Paket Layanan</StepLabel>
                    <div className="flex gap-2">
                        <select value={pkgId} onChange={e => setPkgId(e.target.value)} required className={inputCls + ' flex-1'}>
                            <option value="">— Pilih Paket —</option>
                            {filteredPkgs.map(p => (
                                <option key={p.id} value={p.id}>{p.name} — {fmtIDR(p.price)}/bln</option>
                            ))}
                        </select>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPkgCreateOpen(true)}>
                            <Plus className="w-3.5 h-3.5" /> Buat
                        </Button>
                    </div>
                </div>

                {/* Step 5: Cara tagihan */}
                <div>
                    <StepLabel n={5}>Cara Tagihan</StepLabel>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { v: 'anchor_day', l: 'Tanggal Anchor', d: 'Tagihan tanggal sama tiap bulan (mis. tgl 1)' },
                            { v: 'anniversary', l: 'Anniversary', d: 'Tiap 1 bulan dari hari ini (mis. aktif 12 Jun → due 12 Jul)' },
                        ].map(o => (
                            <label key={o.v} className={clsx(
                                'cursor-pointer border rounded-lg p-2.5 transition-colors',
                                mode === o.v ? 'border-primary bg-primary/5' : 'border-slate-border hover:bg-white/5'
                            )}>
                                <input type="radio" checked={mode === o.v} onChange={() => setMode(o.v)} className="sr-only" />
                                <div className="text-sm font-semibold text-fg">{o.l}</div>
                                <div className="text-[11px] text-fg-muted mt-0.5">{o.d}</div>
                            </label>
                        ))}
                    </div>
                    {mode === 'anchor_day' && (
                        <Field label="Tanggal tagih (1-28)">
                            <input type="number" min="1" max="28" value={billingDay} onChange={e => setBillingDay(e.target.value)} className={inputCls} />
                        </Field>
                    )}
                    <PreviewNextDue mode={mode} billingDay={billingDay} />
                </div>
            </form>

            {pkgCreateOpen && (
                <PaketQuickCreate
                    routerId={routerId}
                    onClose={() => setPkgCreateOpen(false)}
                    onCreated={(pkg) => { setPkgId(pkg.id); setPkgCreateOpen(false); }}
                />
            )}
        </Modal>
    );
}

// Hitung preview tanggal jatuh tempo di sisi client. Logic sama dengan
// backend computeNextDueByMode tapi pakai browser local TZ (untuk display).
// Backend tetap recompute di tenant TZ saat save — preview ini cuma estimasi
// visual untuk operator.
function computePreviewNextDue(mode, billingDay, today = new Date()) {
    if (mode === 'anniversary') {
        const d = new Date(today);
        const srcDay = d.getDate();
        d.setMonth(d.getMonth() + 1);
        // Clamp ke last day kalau bulan tujuan lebih pendek (mis. 31 Jan → 28 Feb)
        if (d.getDate() !== srcDay) d.setDate(0);
        return d;
    }
    const day = Math.max(1, Math.min(28, Number(billingDay) || 1));
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d.getTime() <= today.getTime()) d.setMonth(d.getMonth() + 1);
    return d;
}

function PreviewNextDue({ mode, billingDay }) {
    const preview = useMemo(() => computePreviewNextDue(mode, billingDay), [mode, billingDay]);
    return (
        <div className="mt-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 flex items-baseline gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 shrink-0">Tagihan Pertama:</span>
            <span className="text-fg font-medium">{fmtDate(preview)}</span>
            <span className="text-[11px] text-fg-muted ml-auto">{mode === 'anniversary' ? '(hari ini + 1 bulan)' : `(tanggal ${Math.max(1, Math.min(28, Number(billingDay) || 1))} berikutnya)`}</span>
        </div>
    );
}

function StepLabel({ n, children }) {
    return (
        <div className="text-xs font-bold text-fg uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="bg-primary/20 text-primary rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{n}</span>
            {children}
        </div>
    );
}

// ─── Inline create paket cepat ─────────────────────────────────────────────
function PaketQuickCreate({ routerId, onClose, onCreated }) {
    const create = useCreatePackage();
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [profile, setProfile] = useState('');

    const handle = async (e) => {
        e.preventDefault();
        if (!name || !price || !profile) return toast.error('Lengkapi semua field');
        try {
            const pkg = await create.mutateAsync({
                name, price: String(price), type: 'pppoe', mikrotikProfile: profile,
                cycleType: 'monthly', cycleValue: 1, routerId: routerId || null,
            });
            onCreated(pkg);
        } catch { /* toast */ }
    };

    return createPortal(
        <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
            <div className="w-full max-w-sm bg-surface-dark border border-slate-border rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-slate-border">
                    <h3 className="font-semibold text-fg text-base">Buat Paket Cepat</h3>
                </div>
                <form onSubmit={handle} className="px-5 py-4 space-y-3">
                    <Field label="Nama paket">
                        <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="Paket-10Mbps" />
                    </Field>
                    <Field label="Harga (Rp)">
                        <input type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" className={inputCls} placeholder="50000" />
                    </Field>
                    <Field label="Profile MikroTik">
                        <input value={profile} onChange={e => setProfile(e.target.value)} required className={inputCls} placeholder="10Mbps" />
                    </Field>
                    <p className="text-[11px] text-fg-muted">
                        Profile harus sudah ada di router (PPP profile yang menentukan rate-limit). Lengkapnya bisa di-edit di tab Paket nanti.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" onClick={onClose} size="sm">Batal</Button>
                        <Button type="submit" size="sm" loading={create.isPending}>Simpan & Pilih</Button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
