import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Building2, Save, Info, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const inputCls = 'w-full bg-surface-darker border border-slate-border rounded px-3 py-2 text-fg focus:outline-none focus:border-primary text-sm';

/**
 * Tenant-level Payment Gateway defaults.
 * Operator setup di sini sekali → semua router auto-pakai. Per-router
 * setting di tab Pengaturan Router jadi override.
 */
export default function GatewayDefaultsCard() {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);

    const { data: cfg, isLoading } = useQuery({
        queryKey: ['billing-gateway-defaults'],
        queryFn: async () => {
            const res = await apiClient.get('/billing/settings/gateway-defaults');
            return res.data?.data;
        },
    });

    const save = useMutation({
        mutationFn: async (payload) => {
            const res = await apiClient.put('/billing/settings/gateway-defaults', payload);
            return res.data?.data;
        },
        onSuccess: () => {
            toast.success('Default gateway disimpan — semua router auto-pakai (kecuali override)');
            qc.invalidateQueries({ queryKey: ['billing-gateway-defaults'] });
        },
        onError: (e) => toast.error(e?.response?.data?.error || 'Gagal simpan'),
    });

    const [form, setForm] = useState({
        tripayEnabled: false, midtransEnabled: false, xenditEnabled: false,
        tripay: { merchantCode: '', apiKey: '', privateKey: '', isProduction: false },
        midtrans: { serverKey: '', clientKey: '', isProduction: false },
        xendit: { secretKey: '', callbackToken: '' },
    });

    useEffect(() => {
        if (!cfg) return;
        setForm({
            tripayEnabled: !!cfg.tripayEnabled,
            midtransEnabled: !!cfg.midtransEnabled,
            xenditEnabled: !!cfg.xenditEnabled,
            tripay: cfg.config?.tripay || { merchantCode: '', apiKey: '', privateKey: '', isProduction: false },
            midtrans: cfg.config?.midtrans || { serverKey: '', clientKey: '', isProduction: false },
            xendit: cfg.config?.xendit || { secretKey: '', callbackToken: '' },
        });
    }, [cfg]);

    const handleSubmit = (e) => {
        e.preventDefault();
        save.mutate({
            tripayEnabled: form.tripayEnabled,
            midtransEnabled: form.midtransEnabled,
            xenditEnabled: form.xenditEnabled,
            config: {
                tripay: form.tripayEnabled ? form.tripay : undefined,
                midtrans: form.midtransEnabled ? form.midtrans : undefined,
                xendit: form.xenditEnabled ? form.xendit : undefined,
            },
        });
    };

    const enabledCount = [form.tripayEnabled, form.midtransEnabled, form.xenditEnabled].filter(Boolean).length;

    return (
        <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
            <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <Building2 className="w-5 h-5 text-blue-400" />
                        Default Gateway (Tenant)
                        {enabledCount > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold ml-2">
                                {enabledCount} aktif
                            </span>
                        )}
                    </CardTitle>
                </div>
                <p className="text-xs text-fg-muted mt-1 flex items-baseline gap-1.5">
                    <Info className="w-3 h-3 shrink-0 mt-0.5 text-blue-400" />
                    Setup sekali di sini → semua router auto-pakai. Per-router setting di bawah jadi <span className="text-fg font-medium">override</span> (kalau diisi, akan dipakai; kalau kosong, fallback ke default ini).
                </p>
            </CardHeader>
            {open && (
                <CardContent>
                    {isLoading ? <div className="text-fg-muted text-sm">Memuat…</div> : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex flex-wrap gap-3">
                                <Check label="Tripay" checked={form.tripayEnabled}
                                    onChange={v => setForm(s => ({ ...s, tripayEnabled: v }))} />
                                <Check label="Midtrans" checked={form.midtransEnabled}
                                    onChange={v => setForm(s => ({ ...s, midtransEnabled: v }))} />
                                <Check label="Xendit" checked={form.xenditEnabled}
                                    onChange={v => setForm(s => ({ ...s, xenditEnabled: v }))} />
                            </div>

                            {form.tripayEnabled && (
                                <Section title="Tripay">
                                    <Field label="Merchant Code"><input value={form.tripay.merchantCode || ''}
                                        onChange={e => setForm(s => ({ ...s, tripay: { ...s.tripay, merchantCode: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <Field label="API Key"><input value={form.tripay.apiKey || ''} type="password"
                                        onChange={e => setForm(s => ({ ...s, tripay: { ...s.tripay, apiKey: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <Field label="Private Key"><input value={form.tripay.privateKey || ''} type="password"
                                        onChange={e => setForm(s => ({ ...s, tripay: { ...s.tripay, privateKey: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                                        <input type="checkbox" checked={!!form.tripay.isProduction}
                                            onChange={e => setForm(s => ({ ...s, tripay: { ...s.tripay, isProduction: e.target.checked } }))} />
                                        Mode production (default sandbox)
                                    </label>
                                </Section>
                            )}

                            {form.midtransEnabled && (
                                <Section title="Midtrans">
                                    <Field label="Server Key"><input value={form.midtrans.serverKey || ''} type="password"
                                        onChange={e => setForm(s => ({ ...s, midtrans: { ...s.midtrans, serverKey: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <Field label="Client Key (opsional)"><input value={form.midtrans.clientKey || ''}
                                        onChange={e => setForm(s => ({ ...s, midtrans: { ...s.midtrans, clientKey: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                                        <input type="checkbox" checked={!!form.midtrans.isProduction}
                                            onChange={e => setForm(s => ({ ...s, midtrans: { ...s.midtrans, isProduction: e.target.checked } }))} />
                                        Mode production (default sandbox)
                                    </label>
                                </Section>
                            )}

                            {form.xenditEnabled && (
                                <Section title="Xendit">
                                    <Field label="Secret Key"><input value={form.xendit.secretKey || ''} type="password"
                                        onChange={e => setForm(s => ({ ...s, xendit: { ...s.xendit, secretKey: e.target.value } }))}
                                        className={inputCls} /></Field>
                                    <Field label="Callback Verification Token"><input value={form.xendit.callbackToken || ''} type="password"
                                        onChange={e => setForm(s => ({ ...s, xendit: { ...s.xendit, callbackToken: e.target.value } }))}
                                        className={inputCls} /></Field>
                                </Section>
                            )}

                            <div className="flex justify-end">
                                <Button type="submit" loading={save.isPending}>
                                    <Save className="w-4 h-4 mr-1" /> Simpan Default
                                </Button>
                            </div>

                            <div className="text-[11px] text-fg-muted border-t border-slate-border/40 pt-2">
                                Webhook URL untuk gateway:
                                <ul className="mt-1 space-y-0.5 font-mono text-blue-400">
                                    <li>• Tripay: {window.location.origin}/api/billing/webhook/tripay</li>
                                    <li>• Midtrans: {window.location.origin}/api/billing/webhook/midtrans</li>
                                    <li>• Xendit: {window.location.origin}/api/billing/webhook/xendit</li>
                                </ul>
                            </div>
                        </form>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

function Check({ label, checked, onChange }) {
    return (
        <label className={clsx(
            'cursor-pointer border rounded-lg px-3 py-2 flex items-center gap-2 transition-colors text-sm',
            checked ? 'border-blue-500 bg-blue-500/10 text-fg' : 'border-slate-border text-fg-muted hover:bg-white/5'
        )}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
            <div className={clsx('w-3 h-3 rounded border', checked ? 'bg-blue-500 border-blue-500' : 'border-slate-border')} />
            {label}
        </label>
    );
}

function Section({ title, children }) {
    return (
        <div className="border border-slate-border/40 rounded-lg p-3 bg-surface-darker/40 space-y-2">
            <h5 className="text-xs font-semibold text-blue-400 uppercase">{title}</h5>
            {children}
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">{label}</label>
            {children}
        </div>
    );
}
