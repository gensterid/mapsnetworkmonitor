import React, { useState } from 'react';
import { usePresets, useScanUnconfigured, usePlanAuthorize, useAuthorizeOnu } from '@/hooks/useProvisioning';
import { useOlts } from '@/hooks';
import { Zap, Search, RefreshCw, CheckCircle, XCircle, Server, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

const selectCls =
    'w-full bg-surface-dark/50 border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary';

function AuthorizeModal({ isOpen, onClose, olt, onu, presets, onDone }) {
    const planMut = usePlanAuthorize();
    const authMut = useAuthorizeOnu();
    const [presetId, setPresetId] = useState('');
    const [onuId, setOnuId] = useState(onu?.suggestedOnuId || '');
    // Plan diberi stempel (_presetId/_onuId) supaya preview yg tak lagi cocok
    // dengan pilihan saat ini tidak ditampilkan/dipakai konfirmasi (anti race).
    const [plan, setPlan] = useState(null);
    const [result, setResult] = useState(null);
    // Sukses authorize → kunci tombol Konfirmasi. Reset hanya saat modal remount
    // per-ONU (key di parent), bukan saat preview ulang.
    const [authorized, setAuthorized] = useState(false);

    const resetOutputs = () => {
        setPlan(null);
        setResult(null);
    };

    const preview = () => {
        setResult(null);
        const reqPresetId = presetId;
        const reqOnuId = onuId;
        planMut.mutate(
            { presetId: reqPresetId, ponId: onu.ponId, sn: onu.sn, onuId: reqOnuId, oltType: olt?.type },
            { onSuccess: (p) => setPlan({ ...p, _presetId: reqPresetId, _onuId: reqOnuId }) },
        );
    };

    const confirm = () => {
        authMut.mutate(
            { oltId: olt.id, data: { presetId, ponId: onu.ponId, sn: onu.sn, onuId } },
            {
                onSuccess: (r) => {
                    setResult(r);
                    if (r.success && !r.alreadyProvisioned) {
                        setAuthorized(true);
                        onDone?.();
                    }
                },
                onError: (e) => setResult({ success: false, error: e?.message || 'Gagal authorize (jaringan/server).' }),
            },
        );
    };

    // Tutup diblok selama tulis-live berjalan (jangan hilangkan hasil di tengah).
    const guardedClose = () => {
        if (!authMut.isPending) onClose();
    };

    const ontIdNum = Number(onuId);
    const ponOk = (onu?.ponId || '').split('/').filter(Boolean).length >= 3;
    const canPreview = !!presetId && onuId !== '' && ontIdNum >= 1 && ontIdNum <= 128 && ponOk;
    // Plan dianggap segar hanya bila stempelnya cocok pilihan saat ini.
    const planFresh = plan && plan._presetId === presetId && plan._onuId === onuId;
    const canConfirm = planFresh && !authMut.isPending && !authorized;

    return (
        <Modal isOpen={isOpen} onClose={guardedClose} title={`Authorize ONU — ${onu?.sn}`} size="lg">
            <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                    <div><span className="text-fg-muted">SN:</span> <span className="font-mono text-fg">{onu?.sn}</span></div>
                    <div><span className="text-fg-muted">PON (F/S/P):</span> <span className="font-mono text-fg">{onu?.ponId || '—'}</span></div>
                    <div><span className="text-fg-muted">Vendor:</span> <span className="text-fg">{onu?.vendorModel || '—'}</span></div>
                    <div><span className="text-fg-muted">OLT:</span> <span className="text-fg">{olt?.name}</span></div>
                </div>

                {!ponOk && (
                    <p className="text-xs text-amber-400">PON tidak lengkap (butuh F/S/P mis. 0/0/2). Authorize butuh nomor port.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">Preset</label>
                        <select value={presetId} onChange={(e) => { setPresetId(e.target.value); resetOutputs(); }} className={selectCls}>
                            <option value="">— pilih preset —</option>
                            {presets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} (VLAN {p.serviceVlan}{p.lineProfile ? ` · L${p.lineProfile}/S${p.serviceProfile}` : ''})</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">ONT-ID <span className="text-fg-muted font-normal">(1–128)</span></label>
                        <Input type="number" value={onuId} onChange={(e) => { setOnuId(e.target.value); resetOutputs(); }} min="1" max="128" placeholder="nomor ONT bebas" />
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button variant="ghost" onClick={preview} disabled={!canPreview || planMut.isPending}>
                        <Search className="w-4 h-4 mr-1" /> {planMut.isPending ? 'Menyusun…' : 'Preview Perintah'}
                    </Button>
                </div>

                {planFresh && (
                    <div className="space-y-3">
                        <div className="rounded-lg border border-slate-border bg-gray-900 p-3">
                            <p className="text-xs text-fg-muted mb-2">Perintah yang akan dijalankan (setelah <span className="font-mono">enable</span> otomatis):</p>
                            <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed">{plan.steps.map((s) => s.command).join('\n')}</pre>
                        </div>
                        {plan.warnings?.length > 0 && (
                            <ul className="text-xs text-amber-400 list-disc pl-5 space-y-1">
                                {plan.warnings.map((w) => <li key={w}>{w}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {result && (
                    <div className={`rounded-lg p-3 text-sm border ${result.success ? (result.alreadyProvisioned ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300') : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                        {result.success
                            ? (result.alreadyProvisioned ? 'ℹ️ ' : '✅ ') + (result.message || 'Berhasil')
                            : '❌ ' + (result.error || 'Gagal')}
                    </div>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-border/50">
                    <Button variant="ghost" onClick={guardedClose} type="button" disabled={authMut.isPending}>Tutup</Button>
                    <Button onClick={confirm} disabled={!canConfirm}>
                        <Zap className="w-4 h-4 mr-1" /> {authMut.isPending ? 'Menjalankan…' : authorized ? 'Ter-authorize' : 'Konfirmasi & Authorize'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function ProvisioningAuthorize() {
    const { data: olts = [] } = useOlts();
    const { data: presets = [] } = usePresets();
    const scan = useScanUnconfigured();
    const [oltId, setOltId] = useState('');
    const [onus, setOnus] = useState(null);
    const [modalOnu, setModalOnu] = useState(null);

    const olt = olts.find((o) => o.id === oltId);
    // Preset relevan: global (tanpa oltId) atau terikat OLT terpilih.
    const relevantPresets = presets.filter((p) => !p.oltId || p.oltId === oltId);

    const doScan = () => {
        if (!oltId) return;
        setOnus(null);
        scan.mutate(oltId, { onSuccess: (data) => setOnus(data || []) });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                    <Zap className="w-6 h-6 text-primary" /> Authorize ONU
                </h1>
                <p className="text-fg-muted text-sm">Daftarkan ONU yang belum ter-authorize ke OLT (Fase-1). Preview dulu, lalu konfirmasi.</p>
            </div>

            <Card>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium text-fg">OLT</label>
                        <select value={oltId} onChange={(e) => { setOltId(e.target.value); setOnus(null); }} className={selectCls}>
                            <option value="">— pilih OLT —</option>
                            {olts.map((o) => (
                                <option key={o.id} value={o.id}>{o.name} ({o.host})</option>
                            ))}
                        </select>
                    </div>
                    <Button onClick={doScan} disabled={!oltId || scan.isPending}>
                        {scan.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
                        {scan.isPending ? 'Memindai…' : 'Scan ONU belum ter-authorize'}
                    </Button>
                </CardContent>
            </Card>

            {onus !== null && (
                <Card>
                    <CardContent className="p-0 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-border text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                                    <th className="px-4 py-3">SN</th>
                                    <th className="px-4 py-3">PON (F/S/P)</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3">Logic ID</th>
                                    <th className="px-4 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {onus.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                                        <div className="flex flex-col items-center gap-1">
                                            <CheckCircle className="w-5 h-5 text-emerald-400" /> Tidak ada ONU menunggu authorize.
                                        </div>
                                    </td></tr>
                                ) : (
                                    onus.map((o, i) => (
                                        <tr key={`${o.sn}-${o.ponId}-${i}`} className="border-b border-slate-border/50 hover:bg-surface-dark/30">
                                            <td className="px-4 py-3 font-mono text-fg">{o.sn}</td>
                                            <td className="px-4 py-3 font-mono text-fg-muted">{o.ponId || '—'}</td>
                                            <td className="px-4 py-3 text-fg-muted">{o.vendorModel || '—'}</td>
                                            <td className="px-4 py-3 text-fg-muted">{o.suggestedOnuId || '—'}</td>
                                            <td className="px-4 py-3 text-right">
                                                <Button size="sm" variant="ghost" onClick={() => setModalOnu(o)}>
                                                    Authorize <ChevronRight className="w-4 h-4 ml-1" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            {relevantPresets.length === 0 && onus !== null && onus.length > 0 && (
                <p className="text-sm text-amber-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Belum ada preset untuk OLT ini. Buat dulu di menu <Server className="w-4 h-4" /> Provisioning → Preset.
                </p>
            )}

            {modalOnu && (
                <AuthorizeModal
                    key={`${modalOnu.sn}-${modalOnu.ponId}`}
                    isOpen={!!modalOnu}
                    onClose={() => setModalOnu(null)}
                    olt={olt}
                    onu={modalOnu}
                    presets={relevantPresets}
                    onDone={doScan}
                />
            )}
        </div>
    );
}
