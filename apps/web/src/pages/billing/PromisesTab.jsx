import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { HandCoins, CheckCircle2, XCircle, AlertTriangle, Calendar, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { usePromises, usePromiseSummary, useFulfillPromise, useCancelPromise } from '@/hooks/usePromiseToPay';

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_BADGE = {
    pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    fulfilled: { label: 'Ditunaikan', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    broken: { label: 'Lewat', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
    cancelled: { label: 'Batal', cls: 'bg-slate-500/10 text-fg-muted border-slate-500/30' },
};

export default function PromisesTab() {
    const [statusFilter, setStatusFilter] = useState('pending');
    const { data: items = [], isLoading } = usePromises({ status: statusFilter });
    const { data: summary } = usePromiseSummary();
    const fulfill = useFulfillPromise();
    const cancel = useCancelPromise();

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <HandCoins className="w-5 h-5 text-amber-400" />
                                Janji Bayar
                            </CardTitle>
                            <p className="text-fg-muted text-xs mt-1 max-w-2xl">
                                Track kebijakan defer customer. Kalau operator setuju customer bayar lewat tanggal jatuh tempo,
                                catat di sini supaya app skip auto-isolir + kirim WA reminder H-1 dan H+0. Operator tidak perlu ingat manual.
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-sm mb-3">
                        <Stat label="Total pending" value={summary?.pending ?? '—'} tone={summary?.pending > 0 ? 'warn' : 'ok'} />
                        <Stat label="Lewat tanggal" value={summary?.overdue ?? '—'} tone={summary?.overdue > 0 ? 'crit' : 'ok'} />
                        <Stat label="Max defer / invoice" value="2x" small />
                        <Stat label="Auto-isolir kalau lewat" value="opsional" small />
                    </div>

                    <div className="flex items-center gap-1 border-b border-slate-border mb-2">
                        {(['pending', 'fulfilled', 'broken', 'cancelled']).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)} className={clsx(
                                'px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all',
                                statusFilter === s ? 'border-primary text-primary' : 'border-transparent text-fg-muted hover:text-fg'
                            )}>
                                {STATUS_BADGE[s].label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="py-6 text-center text-fg-muted text-sm">Memuat…</div>
                    ) : items.length === 0 ? (
                        <div className="py-6 text-center text-fg-muted text-sm">
                            Tidak ada janji bayar dengan status "{STATUS_BADGE[statusFilter].label}".
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-fg-muted uppercase">
                                    <tr>
                                        <th className="text-left px-2 py-2">Customer / Identity</th>
                                        <th className="text-left px-2 py-2">Tagihan</th>
                                        <th className="text-left px-2 py-2">Tgl Janji</th>
                                        <th className="text-left px-2 py-2">Sisa</th>
                                        <th className="text-left px-2 py-2">Catatan</th>
                                        <th className="text-right px-2 py-2">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {items.map(p => (
                                        <PromiseRow key={p.id} item={p}
                                            onFulfill={() => fulfill.mutate(p.id)}
                                            onCancel={() => cancel.mutate(p.id)}
                                            loading={fulfill.isPending || cancel.isPending}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function PromiseRow({ item, onFulfill, onCancel, loading }) {
    const isPending = item.status === 'pending';
    const isOverdue = isPending && item.daysUntilPromise < 0;
    return (
        <tr className={clsx('hover:bg-slate-surface/30', isOverdue && 'bg-red-500/5')}>
            <td className="px-2 py-2">
                <div className="font-medium text-fg">{item.customerName || '—'}</div>
                <div className="text-xs text-fg-muted font-mono">{item.mikrotikIdentity}</div>
            </td>
            <td className="px-2 py-2">
                <div className="font-mono text-xs text-primary">{item.invoiceNumber}</div>
                <div className="text-xs text-fg-muted">{fmtIDR(item.invoiceAmount)}</div>
            </td>
            <td className="px-2 py-2 text-xs">
                <div className="text-fg flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(item.promisedFor)}</div>
                {item.autoIsolirIfBroken && (
                    <div className="text-[10px] text-amber-400 mt-0.5">Auto-isolir kalau lewat</div>
                )}
            </td>
            <td className="px-2 py-2 text-xs">
                {!isPending ? <span className="text-fg-muted">—</span> : isOverdue ? (
                    <span className="text-red-400 font-semibold">{Math.abs(item.daysUntilPromise)} hari lewat</span>
                ) : item.daysUntilPromise === 0 ? (
                    <span className="text-amber-400 font-semibold">Hari ini</span>
                ) : (
                    <span className="text-fg">{item.daysUntilPromise} hari lagi</span>
                )}
            </td>
            <td className="px-2 py-2 text-xs text-fg-muted max-w-[200px] truncate" title={item.notes || ''}>
                {item.notes || '—'}
            </td>
            <td className="px-2 py-2 text-right">
                {isPending ? (
                    <div className="flex items-center gap-1 justify-end">
                        <button onClick={onFulfill} disabled={loading}
                            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                            title="Tunaikan — customer sudah bayar">
                            <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button onClick={onCancel} disabled={loading}
                            className="text-fg-muted hover:text-red-400 disabled:opacity-50"
                            title="Batalkan promise">
                            <XCircle className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border', STATUS_BADGE[item.status].cls)}>
                        {STATUS_BADGE[item.status].label}
                    </span>
                )}
            </td>
        </tr>
    );
}

function Stat({ label, value, tone, small }) {
    const toneCls = tone === 'crit' ? 'text-red-400'
        : tone === 'warn' ? 'text-amber-400'
        : tone === 'ok' ? 'text-emerald-400'
        : 'text-fg';
    return (
        <div className="rounded-lg border border-slate-border bg-surface-dark/40 p-3">
            <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider">{label}</div>
            <div className={clsx(small ? 'text-sm mt-0.5' : 'text-2xl font-bold mt-1', toneCls)}>{value}</div>
        </div>
    );
}

/**
 * Modal "Buat Janji Bayar" — dipakai dari InvoicesTab via tombol per row.
 * Export terpisah supaya InvoicesTab bisa import + render conditionally.
 */
export function PromiseCreateModal({ invoice, customerName, onClose, onSubmit, loading }) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmrStr = tomorrow.toISOString().slice(0, 10);
    const [date, setDate] = useState(tmrStr);
    const [notes, setNotes] = useState('');
    const [autoIsolir, setAutoIsolir] = useState(false);

    if (!invoice) return null;
    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3"
            onClick={onClose}>
            <div className="w-full max-w-md bg-surface-dark border border-slate-border rounded-xl shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-slate-border">
                    <h3 className="font-semibold text-fg text-base flex items-center gap-2">
                        <HandCoins className="w-4 h-4 text-amber-400" />
                        Buat Janji Bayar
                    </h3>
                </div>
                <div className="px-5 py-4 space-y-3 text-sm">
                    <div className="bg-black/30 border border-slate-border rounded-lg p-3">
                        <div className="text-xs text-fg-muted">Customer</div>
                        <div className="text-fg font-medium">{customerName || '—'}</div>
                        <div className="text-xs text-fg-muted mt-2">Tagihan</div>
                        <div className="font-mono text-primary text-sm">{invoice.invoiceNumber}</div>
                        <div className="text-fg text-sm">{fmtIDR(invoice.amount)}</div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-fg-muted mb-1">Tanggal janji bayar</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={tmrStr}
                            className="w-full bg-surface-darker border border-slate-border rounded px-3 py-2 text-fg" />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-fg-muted mb-1">Catatan (opsional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            placeholder="Contoh: Customer minta defer, gajian tgl 25"
                            className="w-full bg-surface-darker border border-slate-border rounded px-3 py-2 text-fg text-sm" />
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer text-xs">
                        <input type="checkbox" checked={autoIsolir} onChange={e => setAutoIsolir(e.target.checked)} className="mt-0.5" />
                        <span>
                            <span className="text-fg">Auto-isolir kalau lewat janji</span>
                            <span className="block text-fg-muted">
                                Default OFF — operator manual decide. Aktifkan kalau Anda yakin customer akan bayar tepat waktu.
                            </span>
                        </span>
                    </label>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 text-[11px] text-fg-muted">
                        <MessageSquare className="w-3 h-3 inline mr-1 text-amber-400" />
                        App akan kirim WA reminder otomatis H-1 dan H+0 ke nomor customer.
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-slate-border flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={loading}>Batal</Button>
                    <Button onClick={() => onSubmit({
                        invoiceId: invoice.id,
                        promisedFor: new Date(date + 'T00:00:00').toISOString(),
                        notes: notes || undefined,
                        autoIsolirIfBroken: autoIsolir,
                    })} loading={loading}>
                        Simpan
                    </Button>
                </div>
            </div>
        </div>
    );
}
