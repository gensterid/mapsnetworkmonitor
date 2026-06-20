import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Ticket, Plus, RefreshCw, Printer, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
    useVouchersForRouter, useVoucherBatches, useGenerateVoucherBatch, useDeleteVoucherBatch,
    usePackages, useRouters,
} from '@/hooks';
import toast from 'react-hot-toast';
import { fmtDate, fmtDateTime, Modal, Field, inputCls } from './helpers';

/**
 * VoucherStatusBadge \xe2\x80\x94 shared between mobile card + desktop table.
 * Per review MEDIUM-1: badge mode conditional duplicate \xe2\x80\x94 small helper
 * untuk satu source. `compact` prop strip border style untuk inline table cell.
 */
function VoucherStatusBadge({ mode, item, compact = false }) {
    const baseCompact = compact ? 'px-2 py-0.5 rounded uppercase' : 'text-[10px] px-2 py-0.5 rounded uppercase font-bold shrink-0';
    if (mode === 'native') {
        const color =
            item.status === 'unused' ? 'bg-amber-500/20 text-amber-400' :
            item.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
            'bg-slate-500/20 text-fg-muted';
        return <span className={clsx(baseCompact, color)}>{item.status}</span>;
    }
    return <span className={compact ? 'text-fg-muted' : 'text-[10px] text-fg-muted shrink-0'}>{item.billingPeriod || '—'}</span>;
}

// \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80 Voucher tab \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80
export default function VouchersTab() {
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

                            {items.length === 0 ? (
                                <div className="px-3 py-6 text-center text-fg-muted">Belum ada voucher</div>
                            ) : (
                                <>
                                    {/* Mobile card stack \xe2\x80\x94 visible < 768px */}
                                    <div className="md:hidden space-y-2">
                                        {items.slice(0, 200).map((it) => (
                                            <div key={it.code || it.id} className="bg-slate-surface/70 border border-slate-border rounded-lg p-3">
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <span className="font-mono text-blue-400 text-sm truncate">{it.code}</span>
                                                    <VoucherStatusBadge mode={mode} item={it} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div>
                                                        <div className="text-fg-muted uppercase text-[9px] mb-0.5">Profile</div>
                                                        <div className="text-fg truncate">{it.profile || '\xe2\x80\x94'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-fg-muted uppercase text-[9px] mb-0.5">Tanggal</div>
                                                        <div className="text-fg-muted">{fmtDate(it.createdAt || it.generatedAt)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Desktop table \xe2\x80\x94 visible \xe2\x89\xa5 768px */}
                                    <div className="hidden md:block overflow-x-auto">
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
                                                {items.slice(0, 200).map((it) => (
                                                    <tr key={it.code || it.id} className="hover:bg-slate-surface/30">
                                                        <td className="px-3 py-2 font-mono text-blue-400">{it.code}</td>
                                                        <td className="px-3 py-2 text-fg text-xs">{it.profile || '—'}</td>
                                                        <td className="px-3 py-2 text-xs">
                                                            <VoucherStatusBadge mode={mode} item={it} compact />
                                                        </td>
                                                        <td className="px-3 py-2 text-fg-muted text-xs">{fmtDate(it.createdAt || it.generatedAt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {items.length > 200 && <div className="text-xs text-fg-muted text-center mt-2">Menampilkan 200 dari {items.length}</div>}
                                </>
                            )}
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

