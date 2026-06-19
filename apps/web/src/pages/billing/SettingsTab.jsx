import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Settings as SettingsIcon, AlertTriangle, Copy, ExternalLink, Ticket } from 'lucide-react';
import clsx from 'clsx';
import {
    useRouters, usePackages,
    useBillingRouterSettings, useUpdateBillingRouterSettings,
} from '@/hooks';
import toast from 'react-hot-toast';
import { Field, inputCls } from './helpers';
import GatewayDefaultsCard from './GatewayDefaultsCard';
import {
    CommentAuditCard,
    IsolirFirewallSetup,
    IsolirProfilePicker,
    IsolirWindowField,
    BillingSchedulerCard,
} from './WaTab';

// ─── Settings tab ──────────────────────────────────────────────────────────
// ─── Hotspot Mode Picker (Polish UI) ───────────────────────────────────────
//
// Card-based selection dengan icon + deskripsi setiap mode. Form submission
// tetap pakai FormData (parent form punya name="hotspotMode" via hidden input
// + radio inputs).
function HotspotModePicker({ initial, routerId }) {
    const [mode, setMode] = useState(initial);
    React.useEffect(() => { setMode(initial); }, [initial, routerId]);

    const options = [
        {
            v: 'disabled',
            label: 'Disabled',
            icon: '⛔',
            color: 'border-slate-border',
            activeColor: 'border-slate-500 bg-slate-500/10',
            desc: 'Hotspot off untuk router ini. Tidak bisa jualan voucher online. Cocok untuk router yang cuma layani PPPoE.',
        },
        {
            v: 'native',
            label: 'Native',
            icon: '🏠',
            color: 'border-slate-border hover:border-emerald-500/40',
            activeColor: 'border-emerald-500 bg-emerald-500/10',
            desc: 'Voucher di-track di DB sistem ini. Tab Voucher tampilkan dari DB. Cocok kalau Anda full pakai aplikasi ini untuk voucher.',
            badge: { text: 'Recommended', color: 'bg-emerald-500/20 text-emerald-400' },
        },
        {
            v: 'mikhmon_bridge',
            label: 'Mikhmon Bridge',
            icon: '🔗',
            color: 'border-slate-border hover:border-blue-500/40',
            activeColor: 'border-blue-500 bg-blue-500/10',
            desc: 'Voucher di-baca langsung dari MikroTik (parser comment Mikhmon v3). Cocok kalau Anda masih pakai MikHMON external untuk generate voucher manual.',
        },
    ];

    return (
        <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5">Mode Hotspot</label>
            <div className="space-y-2">
                {options.map(o => (
                    <label key={o.v} className={clsx(
                        'cursor-pointer border rounded-lg p-3 transition-all block',
                        mode === o.v ? o.activeColor : o.color
                    )}>
                        <input type="radio" name="hotspotMode" value={o.v}
                            checked={mode === o.v}
                            onChange={() => setMode(o.v)}
                            className="sr-only" />
                        <div className="flex items-start gap-2.5">
                            <span className="text-xl shrink-0 leading-none mt-0.5">{o.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-fg text-sm">{o.label}</span>
                                    {o.badge && (
                                        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-bold', o.badge.color)}>
                                            {o.badge.text}
                                        </span>
                                    )}
                                    {mode === o.v && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-fg/10 text-fg ml-auto">DIPILIH</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-fg-muted mt-0.5 leading-relaxed">{o.desc}</p>
                            </div>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}

// ─── Hotspot Packages Hint ─────────────────────────────────────────────────
//
// Tampilkan warning kalau hotspot mode aktif (native/bridge) tapi belum ada
// paket hotspot di tenant. Kasih shortcut untuk buka tab Paket.
function HotspotPackagesHint({ routerId, hotspotMode }) {
    const { data: allPkgs = [] } = usePackages({ type: 'hotspot' });
    if (!routerId || !hotspotMode || hotspotMode === 'disabled') return null;
    // Paket hotspot yang bisa dipakai router ini: routerId null (global) atau match
    const usablePkgs = allPkgs.filter(p => p.active && (!p.routerId || p.routerId === routerId));
    if (usablePkgs.length > 0) return null;

    return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-amber-400 mb-1">Belum Ada Paket Hotspot</div>
                    <p className="text-[11px] text-fg-muted leading-relaxed">
                        Hotspot aktif tapi belum ada paket. Customer tidak akan bisa beli voucher online sampai ada minimal 1 paket. Buka tab <strong>Paket</strong> di atas → klik <strong>+ Paket Baru</strong> → pilih Tipe <code>hotspot</code> → set harga + Profile MikroTik.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── Voucher Jual URL Card (Phase V1) ──────────────────────────────────────
//
// Tampilkan URL public untuk pembelian voucher online di router ini.
// Operator copy link ke flyer / cetak QR code untuk dipasang di lokasi.
function VoucherJualUrlCard({ routers, routerId, hotspotMode }) {
    const router = routers.find(r => r.id === routerId);
    if (!router) return null;

    const slug = String(router.name || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    const origin = window.location.origin;
    const url = `${origin}/beli/${slug}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

    const supportsOnline = hotspotMode && hotspotMode !== 'disabled';

    const copy = () => {
        navigator.clipboard.writeText(url);
        toast.success('URL Jual disalin');
    };

    return (
        <div className={clsx(
            'mb-4 rounded-lg p-3 border',
            supportsOnline ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-amber-500/5 border-amber-500/30'
        )}>
            <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2"
                        style={{ color: supportsOnline ? '#34d399' : '#fbbf24' }}>
                        <Ticket className="w-4 h-4" />
                        URL Jual Voucher Online
                    </div>
                    {supportsOnline ? (
                        <>
                            <div className="font-mono text-xs text-fg break-all bg-surface-darker/40 rounded px-2 py-1.5 mb-2">{url}</div>
                            <div className="flex gap-2 flex-wrap">
                                <button type="button" onClick={copy}
                                    className="text-xs px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400">
                                    <Copy className="w-3 h-3 inline mr-1" /> Salin URL
                                </button>
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400">
                                    <ExternalLink className="w-3 h-3 inline mr-1" /> Buka Preview
                                </a>
                                <a href={qrUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-xs px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400">
                                    <ExternalLink className="w-3 h-3 inline mr-1" /> Download QR
                                </a>
                            </div>
                            <p className="text-[11px] text-fg-muted mt-2">
                                Bagikan URL atau cetak QR untuk dipasang di lokasi. Customer scan/akses → pilih paket → bayar via gateway → terima kode voucher.
                                {' '}Pastikan payment gateway aktif (tenant default atau per-router).
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-fg-muted">
                            Hotspot di-nonaktifkan untuk router ini. Aktifkan di section <strong>Hotspot</strong> di bawah (mode <code>native</code> atau <code>mikhmon_bridge</code>) lalu Simpan.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SettingsTab() {
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
            isolirCheckStartHour: Number(f.get('isolirCheckStartHour') ?? 8),
            isolirCheckEndHour: Number(f.get('isolirCheckEndHour') ?? 17),
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
        <>
        <GatewayDefaultsCard />
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

                {routerId && <VoucherJualUrlCard routers={routers} routerId={routerId} hotspotMode={settings?.hotspotMode} />}

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
                                <BillingSchedulerCard
                                    routerId={routerId}
                                    isolirProfile={settings?.isolirProfile || 'pppoe-isolir'}
                                    startHour={settings?.isolirCheckStartHour ?? 8}
                                    endHour={settings?.isolirCheckEndHour ?? 17}
                                />
                                <CommentAuditCard routerId={routerId} />
                                <Field label="Grace days sebelum auto-isolir (0 = isolir hari saat lewat jatuh tempo)"><input name="isolirGraceDays" type="number" min="0" defaultValue={settings?.isolirGraceDays || 0} className={inputCls} /></Field>
                                <IsolirWindowField
                                    defaultStart={settings?.isolirCheckStartHour ?? 8}
                                    defaultEnd={settings?.isolirCheckEndHour ?? 17}
                                />
                                <Field label="Default tanggal tagih (1-28, dipakai kalau pelanggan tidak set sendiri)"><input name="defaultBillingDay" type="number" min="1" max="28" defaultValue={settings?.defaultBillingDay || 1} className={inputCls} /></Field>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-fg uppercase tracking-wide">Hotspot</h4>
                                <HotspotModePicker initial={settings?.hotspotMode || 'disabled'} routerId={routerId} />
                                <HotspotPackagesHint routerId={routerId} hotspotMode={settings?.hotspotMode} />

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
        </>
    );
}
