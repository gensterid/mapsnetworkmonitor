import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Receipt, RefreshCw, Copy, CreditCard, ExternalLink, HandCoins } from 'lucide-react';
import clsx from 'clsx';
import {
    useInvoices, usePayInvoice, useCancelInvoice,
    useCustomers, useCreatePaymentLink,
} from '@/hooks';
import { useCreatePromise } from '@/hooks/usePromiseToPay';
import toast from 'react-hot-toast';
import { fmtIDR, fmtDate, fmtDateTime, Modal, Field, inputCls } from './helpers';

// ─── Tagihan tab ───────────────────────────────────────────────────────────
export default function InvoicesTab() {
    const [filter, setFilter] = useState('');
    const [payTarget, setPayTarget] = useState(null);
    const [linkTarget, setLinkTarget] = useState(null);
    const [linkResult, setLinkResult] = useState(null);
    const [promiseTarget, setPromiseTarget] = useState(null);
    const { data: rows = [], isLoading, refetch, isRefetching } = useInvoices({ status: filter || undefined });
    const { data: customers = [] } = useCustomers();
    const pay = usePayInvoice();
    const cancel = useCancelInvoice();
    const createLink = useCreatePaymentLink();
    const createPromise = useCreatePromise();
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
                                                    <Button size="sm" variant="outline" onClick={() => setPromiseTarget(i)} title="Defer dengan janji bayar"><HandCoins className="w-3.5 h-3.5 mr-1" /> Janji Bayar</Button>
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

            <PromiseCreateModal
                invoice={promiseTarget}
                customerName={promiseTarget ? (custMap[promiseTarget.customerId]?.name || '—') : ''}
                onClose={() => setPromiseTarget(null)}
                onSubmit={async (payload) => {
                    try {
                        await createPromise.mutateAsync(payload);
                        setPromiseTarget(null);
                    } catch { /* toast handled by hook */ }
                }}
                loading={createPromise.isPending}
            />
        </Card>
    );
}

