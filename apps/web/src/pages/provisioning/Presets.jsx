import React, { useState } from 'react';
import { usePresets, useCreatePreset, useUpdatePreset, useDeletePreset } from '@/hooks/useProvisioning';
import { useOlts } from '@/hooks';
import { Plus, SlidersHorizontal, Edit, Trash2, KeyRound, Server } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

const OLT_TYPES = ['', 'cdata', 'hsgq', 'generic'];
const WAN_MODES = ['bridge', 'pppoe', 'dhcp'];

const EMPTY = {
    name: '',
    description: '',
    oltType: 'cdata',
    oltId: '',
    onuTypeProfile: '',
    lineProfile: '',
    serviceProfile: '',
    serviceVlan: '',
    mgmtVlan: '',
    wanMode: 'bridge',
    pppoeUsername: '',
    pppoePassword: '',
    acsUrl: '',
    acsUsername: '',
    acsPassword: '',
    informInterval: '',
};

const selectCls =
    'w-full bg-surface-dark/50 border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary';

/** Bangun state form dari preset (atau kosong). Secret TAK di-echo. */
function initForm(preset) {
    if (!preset) return EMPTY;
    return {
        name: preset.name || '',
        description: preset.description || '',
        oltType: preset.oltType || '',
        oltId: preset.oltId || '',
        onuTypeProfile: preset.onuTypeProfile || '',
        lineProfile: preset.lineProfile || '',
        serviceProfile: preset.serviceProfile || '',
        serviceVlan: preset.serviceVlan != null ? String(preset.serviceVlan) : '',
        mgmtVlan: preset.mgmtVlan != null ? String(preset.mgmtVlan) : '',
        wanMode: preset.wanMode || 'bridge',
        pppoeUsername: preset.pppoeUsername || '',
        pppoePassword: '',
        acsUrl: preset.acsUrl || '',
        acsUsername: preset.acsUsername || '',
        acsPassword: '',
        informInterval: preset.informInterval != null ? String(preset.informInterval) : '',
    };
}

// Di-remount lewat `key` di parent tiap buka/target berganti, jadi state cukup
// diinisialisasi sekali dari prop (tanpa useEffect → hindari cascading render).
function PresetFormModal({ isOpen, onClose, preset }) {
    const { data: olts = [] } = useOlts();
    const createPreset = useCreatePreset();
    const updatePreset = useUpdatePreset();
    const [formData, setFormData] = useState(() => initForm(preset));

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const buildPayload = () => {
        const p = { name: formData.name.trim(), serviceVlan: parseInt(formData.serviceVlan, 10) };
        const addStr = (k) => {
            const v = (formData[k] || '').trim();
            if (v) p[k] = v;
        };
        const addNum = (k) => {
            if (formData[k] !== '' && formData[k] != null) p[k] = parseInt(formData[k], 10);
        };
        ['description', 'oltType', 'oltId', 'onuTypeProfile', 'lineProfile', 'serviceProfile', 'acsUrl', 'acsUsername'].forEach(addStr);
        ['mgmtVlan', 'informInterval'].forEach(addNum);
        p.wanMode = formData.wanMode || 'bridge';
        if (p.wanMode === 'pppoe') addStr('pppoeUsername');
        // Secret hanya dikirim bila diketik (kosong = tidak diubah).
        if (formData.acsPassword) p.acsPassword = formData.acsPassword;
        if (formData.pppoePassword) p.pppoePassword = formData.pppoePassword;
        return p;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = buildPayload();
        if (preset) {
            updatePreset.mutate({ id: preset.id, data: payload }, { onSuccess: onClose });
        } else {
            createPreset.mutate(payload, { onSuccess: onClose });
        }
    };

    const saving = createPreset.isPending || updatePreset.isPending;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={preset ? `Edit Preset — ${preset.name}` : 'Preset Provisioning Baru'} size="lg">
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Dasar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">Nama <span className="text-red-400">*</span></label>
                        <Input name="name" value={formData.name} onChange={handleChange} placeholder="mis. ZTE-Home-100M" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">Deskripsi</label>
                        <Input name="description" value={formData.description} onChange={handleChange} placeholder="Opsional" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">Merk OLT</label>
                        <select name="oltType" value={formData.oltType} onChange={handleChange} className={selectCls}>
                            {OLT_TYPES.map((t) => (
                                <option key={t || 'auto'} value={t}>{t ? t.toUpperCase() : '(auto)'}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">OLT (opsional — kosong = global)</label>
                        <select name="oltId" value={formData.oltId} onChange={handleChange} className={selectCls}>
                            <option value="">— semua OLT (global) —</option>
                            {olts.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Profil & VLAN */}
                <div className="space-y-4 p-4 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                    <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Profil & VLAN</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">ONU Type Profile</label>
                            <Input name="onuTypeProfile" value={formData.onuTypeProfile} onChange={handleChange} placeholder="mis. HOME-1GE" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Line Profile</label>
                            <Input name="lineProfile" value={formData.lineProfile} onChange={handleChange} placeholder="id/nama" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Service Profile</label>
                            <Input name="serviceProfile" value={formData.serviceProfile} onChange={handleChange} placeholder="id/nama" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Service VLAN <span className="text-red-400">*</span></label>
                            <Input type="number" name="serviceVlan" value={formData.serviceVlan} onChange={handleChange} placeholder="1–4094" min="1" max="4094" required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Mgmt VLAN</label>
                            <Input type="number" name="mgmtVlan" value={formData.mgmtVlan} onChange={handleChange} placeholder="Opsional (jalur TR-069)" min="1" max="4094" />
                        </div>
                    </div>
                </div>

                {/* WAN */}
                <div className="space-y-4 p-4 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                    <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">WAN</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Mode WAN</label>
                            <select name="wanMode" value={formData.wanMode} onChange={handleChange} className={selectCls}>
                                {WAN_MODES.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {formData.wanMode === 'pppoe' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">PPPoE Username</label>
                                <Input name="pppoeUsername" value={formData.pppoeUsername} onChange={handleChange} placeholder="username" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">PPPoE Password</label>
                                <Input type="password" name="pppoePassword" value={formData.pppoePassword} onChange={handleChange} placeholder={preset?.hasPppoePassword ? 'tersimpan — kosongkan untuk tetap' : 'password'} />
                            </div>
                        </div>
                    )}
                </div>

                {/* ACS */}
                <div className="space-y-4 p-4 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                    <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">ACS / TR-069</p>
                    <p className="text-xs text-fg-muted">Catatan: C-Data/HSGQ tak mendorong ACS via CLI — URL ini untuk referensi/handoff, disuntik lewat DHCP opt43 atau web ONT.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">ACS URL</label>
                            <Input name="acsUrl" value={formData.acsUrl} onChange={handleChange} placeholder="http://acs:7547/" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">Inform Interval (detik)</label>
                            <Input type="number" name="informInterval" value={formData.informInterval} onChange={handleChange} placeholder="mis. 300" min="1" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">ACS Username</label>
                            <Input name="acsUsername" value={formData.acsUsername} onChange={handleChange} placeholder="opsional" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">ACS Password</label>
                            <Input type="password" name="acsPassword" value={formData.acsPassword} onChange={handleChange} placeholder={preset?.hasAcsPassword ? 'tersimpan — kosongkan untuk tetap' : 'opsional'} />
                        </div>
                    </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Batal</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : preset ? 'Simpan' : 'Buat Preset'}</Button>
                </div>
            </form>
        </Modal>
    );
}

export default function ProvisioningPresets() {
    const { data: presets = [], isLoading, error } = usePresets();
    const { data: olts = [] } = useOlts();
    const deletePreset = useDeletePreset();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);

    const oltName = (id) => olts.find((o) => o.id === id)?.name || '—';

    const openNew = () => { setEditing(null); setModalOpen(true); };
    const openEdit = (p) => { setEditing(p); setModalOpen(true); };
    const closeModal = () => { setModalOpen(false); setEditing(null); };

    const handleDelete = (p) => {
        if (window.confirm(`Hapus preset "${p.name}"?`)) deletePreset.mutate(p.id);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                        <SlidersHorizontal className="w-6 h-6 text-primary" /> Preset Provisioning
                    </h1>
                    <p className="text-fg-muted text-sm">Bundel konfigurasi tervalidasi untuk authorize ONU di OLT (Fase-1).</p>
                </div>
                <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Tambah Preset</Button>
            </div>

            {error && <p className="text-red-400 text-sm">{error.message}</p>}

            <Card>
                <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-border text-left text-xs font-medium text-fg-muted uppercase tracking-wider">
                                <th className="px-4 py-3">Nama</th>
                                <th className="px-4 py-3">Merk</th>
                                <th className="px-4 py-3">OLT</th>
                                <th className="px-4 py-3">VLAN</th>
                                <th className="px-4 py-3">WAN</th>
                                <th className="px-4 py-3">ACS</th>
                                <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted">Memuat…</td></tr>
                            ) : presets.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted">Belum ada preset. Klik “Tambah Preset”.</td></tr>
                            ) : (
                                presets.map((p) => (
                                    <tr key={p.id} className="border-b border-slate-border/50 hover:bg-surface-dark/30">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-fg">{p.name}</div>
                                            {p.description && <div className="text-xs text-fg-muted">{p.description}</div>}
                                        </td>
                                        <td className="px-4 py-3 text-fg-muted">{p.oltType ? p.oltType.toUpperCase() : '—'}</td>
                                        <td className="px-4 py-3 text-fg-muted flex items-center gap-1">
                                            {p.oltId ? (<><Server className="w-3.5 h-3.5" /> {oltName(p.oltId)}</>) : 'Global'}
                                        </td>
                                        <td className="px-4 py-3 text-fg-muted">{p.serviceVlan}{p.mgmtVlan ? ` / ${p.mgmtVlan}` : ''}</td>
                                        <td className="px-4 py-3 text-fg-muted">{p.wanMode}</td>
                                        <td className="px-4 py-3">
                                            {p.acsUrl ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><KeyRound className="w-3.5 h-3.5" /> {p.hasAcsPassword ? 'auth' : 'set'}</span>
                                            ) : <span className="text-fg-muted">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-slate-border text-fg-muted hover:text-blue-400 transition-colors" title="Edit"><Edit className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(p)} className="p-1.5 rounded-md hover:bg-slate-border text-fg-muted hover:text-red-400 transition-colors" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <PresetFormModal key={modalOpen ? (editing?.id || 'new') : 'closed'} isOpen={modalOpen} onClose={closeModal} preset={editing} />
        </div>
    );
}
