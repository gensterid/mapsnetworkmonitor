import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Package as PackageIcon, Plus, RefreshCw, Trash2, Pencil } from 'lucide-react';
import clsx from 'clsx';
import {
    usePackages, useCreatePackage, useUpdatePackage, useDeletePackage,
    useMikrotikPppProfiles, useCreatePppProfile,
    useRouters,
} from '@/hooks';
import { useHotspotUserProfiles } from '@/hooks/useMikhmon';
import toast from 'react-hot-toast';
import { fmtIDR, Modal, Field, inputCls } from './helpers';

// ─── Paket tab ─────────────────────────────────────────────────────────────
export default function PackagesTab() {
    const [editing, setEditing] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [routerForProfiles, setRouterForProfiles] = useState('');
    const [pkgType, setPkgType] = useState('pppoe');
    // Sync pkgType saat modal dibuka: edit existing → ikut tipenya, new → reset ke pppoe
    React.useEffect(() => {
        if (modalOpen) {
            setPkgType(editing?.type || 'pppoe');
            if (editing?.routerId) setRouterForProfiles(editing.routerId);
        }
    }, [modalOpen, editing]);
    const { data: rows = [], isLoading, refetch, isRefetching } = usePackages();
    const create = useCreatePackage();
    const update = useUpdatePackage();
    const del = useDeletePackage();
    const { data: routers = [] } = useRouters();
    const { data: pppProfiles = [], isLoading: pppProfilesLoading, isError: pppProfilesError } = useMikrotikPppProfiles(
        pkgType === 'pppoe' ? routerForProfiles : ''
    );
    const { data: hsProfiles = [], isLoading: hsProfilesLoading, isError: hsProfilesError } = useHotspotUserProfiles(
        pkgType === 'hotspot' ? routerForProfiles : ''
    );
    // Aktifkan dispatch berdasar tipe — pakai variabel umum untuk render
    const profileList = pkgType === 'hotspot' ? hsProfiles : pppProfiles;
    const profileLoading = pkgType === 'hotspot' ? hsProfilesLoading : pppProfilesLoading;
    const profileError = pkgType === 'hotspot' ? hsProfilesError : pppProfilesError;
    const profileKind = pkgType === 'hotspot' ? 'Hotspot' : 'PPPoE';

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
                        <select name="type" value={pkgType} onChange={(e) => setPkgType(e.target.value)} className={inputCls}>
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
                    <Field label={`MikroTik Profile ${profileKind} (harus ada di router target)`}>
                        {routerForProfiles && profileLoading ? (
                            <div className={inputCls + ' text-fg-muted flex items-center gap-2'}>
                                <RefreshCw className="w-3 h-3 animate-spin" /> Memuat profile {profileKind} dari router…
                            </div>
                        ) : routerForProfiles && profileList.length > 0 ? (
                            <>
                                <select name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls}>
                                    <option value="">— pilih dari profile yang ada —</option>
                                    {profileList.map(p => <option key={p.id || p.name} value={p.name}>{p.name} {p.rateLimit ? `(${p.rateLimit})` : ''}</option>)}
                                </select>
                                <p className="text-xs text-fg-muted mt-1">{profileList.length} profile {profileKind} ditemukan di router</p>
                            </>
                        ) : routerForProfiles && profileError ? (
                            <>
                                <input name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls} placeholder={pkgType === 'hotspot' ? 'contoh: 1jam' : 'contoh: pppoe-home-10m'} />
                                <p className="text-xs text-amber-400 mt-1">⚠ Tidak bisa baca profile {profileKind} dari router (timeout). Ketik manual nama profile.</p>
                            </>
                        ) : (
                            <input name="mikrotikProfile" defaultValue={editing?.mikrotikProfile} required className={inputCls} placeholder="contoh: pppoe-home-10m" />
                        )}
                    </Field>
                    <Field label="Harga (IDR)"><input name="price" type="number" min="0" defaultValue={editing?.price || 0} required className={inputCls} /></Field>
                    {pkgType === 'pppoe' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Cycle Type">
                                <select name="cycleType" defaultValue={editing?.cycleType || 'monthly'} className={inputCls}>
                                    <option value="monthly">Bulanan</option>
                                    <option value="duration">Durasi (detik)</option>
                                </select>
                            </Field>
                            <Field label="Cycle Value"><input name="cycleValue" type="number" min="1" defaultValue={editing?.cycleValue || 1} required className={inputCls} /></Field>
                        </div>
                    ) : (
                        <>
                            {/* Hidden defaults — backend butuh field ini, tapi untuk hotspot
                                durasi ditangani profile MikHMON, jadi nilai disini diabaikan
                                oleh voucher generator. */}
                            <input type="hidden" name="cycleType" value="monthly" />
                            <input type="hidden" name="cycleValue" value="1" />
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2.5 text-xs text-fg-muted">
                                💡 <span className="text-fg">Durasi voucher ditangani oleh profile MikHMON</span> di MikroTik.
                                Validity time (<code>:local validity</code>) di-set di script profile, bukan di paket.
                            </div>
                        </>
                    )}
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

// ─── Billing Mode picker (anchor_day vs anniversary) ──────────────────────
function BillingModePicker({ defaultMode = 'anchor_day', defaultBillingDay = '' }) {
    const [mode, setMode] = useState(defaultMode);
    return (
        <div className="space-y-2">
            <label className="block text-xs font-medium text-fg-muted uppercase tracking-wider">Cara tagihan</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className={clsx(
                    'cursor-pointer border rounded-lg p-3 transition-colors',
                    mode === 'anchor_day' ? 'border-primary bg-primary/5' : 'border-slate-border hover:bg-white/5'
                )}>
                    <input type="radio" name="billingMode" value="anchor_day"
                        checked={mode === 'anchor_day'} onChange={() => setMode('anchor_day')}
                        className="sr-only" />
                    <div className="text-sm font-semibold text-fg">Tanggal Anchor</div>
                    <div className="text-[11px] text-fg-muted mt-0.5">
                        Tagihan setiap tanggal sama di bulan (mis. 1, 5, 13). Semua customer bisa ditagih bersama.
                    </div>
                </label>
                <label className={clsx(
                    'cursor-pointer border rounded-lg p-3 transition-colors',
                    mode === 'anniversary' ? 'border-primary bg-primary/5' : 'border-slate-border hover:bg-white/5'
                )}>
                    <input type="radio" name="billingMode" value="anniversary"
                        checked={mode === 'anniversary'} onChange={() => setMode('anniversary')}
                        className="sr-only" />
                    <div className="text-sm font-semibold text-fg">Anniversary</div>
                    <div className="text-[11px] text-fg-muted mt-0.5">
                        Tagihan tiap 1 bulan sejak pembayaran terakhir. Bayar 12 Mei → due 12 Jun.
                    </div>
                </label>
            </div>
            {mode === 'anchor_day' && (
                <Field label="Tanggal tagih (1–28, kosong = 1)">
                    <input name="billingDay" type="number" min="1" max="28" defaultValue={defaultBillingDay} className={inputCls} />
                </Field>
            )}
            {mode === 'anniversary' && (
                <p className="text-[11px] text-fg-muted bg-blue-500/5 border border-blue-500/20 rounded p-2">
                    Tanggal tagih akan mengikuti tanggal pembayaran. Cycle pertama dihitung dari tanggal aktivasi.
                </p>
            )}
        </div>
    );
}
