import React, { useState } from 'react';
import { usePresets, useScanRegistered, usePlanModify, useModifyOnu } from '@/hooks/useProvisioning';
import { useOlts } from '@/hooks';
import { Wrench, Search, RefreshCw, Server, XCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

const selectCls =
    'w-full bg-surface-dark/50 border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary';

function ModifyModal({ isOpen, onClose, olt, onu, presets, onDone }) {
    const planMut = usePlanModify();
    const modMut = useModifyOnu();
    const [presetId, setPresetId] = useState('');
    const [updateVlan, setUpdateVlan] = useState(false);
    const [description, setDescription] = useState('');
    const [plan, setPlan] = useState(null);
    const [result, setResult] = useState(null);
    const [modified, setModified] = useState(false); // sukses → kunci tombol (reset saat remount per-ONT)

    const resetOutputs = () => { setPlan(null); setResult(null); };

    const buildData = () => ({
        presetId,
        ponId: onu.ponId,
        sn: onu.sn,
        onuId: onu.onuId,
        updateVlan,
        ...(description.trim() ? { description: description.trim() } : {}),
    });

    const preview = () => {
        setResult(null);
        const stamp = { _presetId: presetId, _updateVlan: updateVlan, _description: description.trim() };
        planMut.mutate({ oltId: olt.id, data: buildData() }, { onSuccess: (p) => setPlan({ ...p, ...stamp }) });
    };

    const confirm = () => {
        modMut.mutate(
            { oltId: olt.id, data: buildData() },
            {
                onSuccess: (r) => { setResult(r); if (r.success) { setModified(true); onDone?.(); } },
                onError: (e) => setResult({ success: false, error: e?.message || 'Gagal modify (jaringan/server).' }),
            },
        );
    };

    const guardedClose = () => { if (!modMut.isPending) onClose(); };

    const canPreview = !!presetId && (onu?.ponId || '').split('/').filter(Boolean).length >= 3;
    const planFresh = plan && plan._presetId === presetId && plan._updateVlan === updateVlan && plan._description === description.trim();
    const canConfirm = planFresh && !modMut.isPending && !modified;

    return (
        <Modal isOpen={isOpen} onClose={guardedClose} title={`Modify ONT — ${onu?.sn}`} size="lg">
            <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                    <div><span className="text-fg-muted">SN:</span> <span className="font-mono text-fg">{onu?.sn}</span></div>
                    <div><span className="text-fg-muted">PON (F/S/P):</span> <span className="font-mono text-fg">{onu?.ponId || '—'}</span></div>
                    <div><span className="text-fg-muted">ONT-ID:</span> <span className="font-mono text-fg">{onu?.onuId}</span></div>
                    <div><span className="text-fg-muted">Status:</span> <span className="text-fg">{onu?.runState || '—'}</span></div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-fg">Preset target (profil baru)</label>
                    <select value={presetId} onChange={(e) => { setPresetId(e.target.value); resetOutputs(); }} className={selectCls}>
                        <option value="">— pilih preset —</option>
                        {presets.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} (L{p.lineProfile}/S{p.serviceProfile} · VLAN {p.serviceVlan})</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                        <input type="checkbox" checked={updateVlan} onChange={(e) => { setUpdateVlan(e.target.checked); resetOutputs(); }} className="accent-primary" />
                        Ganti VLAN service-port juga
                    </label>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-fg">Label ONT <span className="text-fg-muted font-normal">(opsional)</span></label>
                        <Input value={description} onChange={(e) => { setDescription(e.target.value); resetOutputs(); }} placeholder="mis. nama pelanggan" maxLength={32} />
                    </div>
                </div>
                {updateVlan && (
                    <p className="text-xs text-amber-400">⚠️ Ganti VLAN menghapus service-port lama lalu buat ulang — layanan ONT ini terputus sesaat.</p>
                )}

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
                    <div className={`rounded-lg p-3 text-sm border ${result.success ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                        {result.success ? '🔧 ' + (result.message || 'Berhasil') : '❌ ' + (result.error || 'Gagal')}
                    </div>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-border/50">
                    <Button variant="ghost" onClick={guardedClose} type="button" disabled={modMut.isPending}>Tutup</Button>
                    <Button onClick={confirm} disabled={!canConfirm}>
                        <Wrench className="w-4 h-4 mr-1" /> {modMut.isPending ? 'Menjalankan…' : modified ? 'Ter-modify' : 'Konfirmasi & Ubah'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function ProvisioningModify() {
    const { data: olts = [] } = useOlts();
    const { data: presets = [] } = usePresets();
    const scan = useScanRegistered();
    const [oltId, setOltId] = useState('');
    const [onus, setOnus] = useState(null);
    const [modalOnu, setModalOnu] = useState(null);
    const [query, setQuery] = useState('');

    const olt = olts.find((o) => o.id === oltId);
    const relevantPresets = presets.filter((p) => !p.oltId || p.oltId === oltId);

    const doScan = () => {
        if (!oltId) return;
        setOnus(null);
        scan.mutate(oltId, { onSuccess: (data) => setOnus(data || []) });
    };

    const filtered = (onus || []).filter((o) =>
        !query || o.sn?.toLowerCase().includes(query.toLowerCase()) || o.ponId?.includes(query),
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                    <Wrench className="w-6 h-6 text-primary" /> Modify ONT
                </h1>
                <p className="text-fg-muted text-sm">Ubah profil/VLAN ONT yang sudah teregister (mode auto-auth). Pilih dari SN agar tak salah config.</p>
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
                        {scan.isPending ? 'Memindai…' : 'Scan ONT teregister'}
                    </Button>
                </CardContent>
            </Card>

            {onus !== null && (
                <Card>
                    <CardContent className="p-0">
                        <div className="p-3 border-b border-slate-border/50">
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari SN / PON…" className="max-w-xs" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-border text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                                        <th className="px-4 py-3">SN</th>
                                        <th className="px-4 py-3">PON (F/S/P)</th>
                                        <th className="px-4 py-3">ONT-ID</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted">{onus.length === 0 ? 'Tidak ada ONT teregister.' : 'Tidak ada yang cocok pencarian.'}</td></tr>
                                    ) : (
                                        filtered.map((o, i) => (
                                            <tr key={`${o.sn}-${o.ponId}-${i}`} className="border-b border-slate-border/50 hover:bg-surface-dark/30">
                                                <td className="px-4 py-3 font-mono text-fg">{o.sn}</td>
                                                <td className="px-4 py-3 font-mono text-fg-muted">{o.ponId || '—'}</td>
                                                <td className="px-4 py-3 text-fg-muted">{o.onuId}</td>
                                                <td className="px-4 py-3 text-fg-muted">{o.runState || '—'}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button size="sm" variant="ghost" onClick={() => setModalOnu(o)}>
                                                        Ubah <ChevronRight className="w-4 h-4 ml-1" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {relevantPresets.length === 0 && onus !== null && onus.length > 0 && (
                <p className="text-sm text-amber-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Belum ada preset untuk OLT ini. Buat dulu di menu <Server className="w-4 h-4" /> Provisioning → Preset.
                </p>
            )}

            {modalOnu && (
                <ModifyModal
                    key={`${modalOnu.sn}-${modalOnu.ponId}-${modalOnu.onuId}`}
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
