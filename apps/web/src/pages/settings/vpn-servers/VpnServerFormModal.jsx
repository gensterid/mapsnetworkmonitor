import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Toggle from '@/components/ui/Toggle';
import { Save, X, FileText, Lock, AlertCircle } from 'lucide-react';
import { useCreateVpnServer, useUpdateVpnServer } from '@/hooks/useVpnServers';

/**
 * Form modal untuk Add + Edit VPN Server.
 * - editing = null → Add mode (password wajib)
 * - editing = VpnServer → Edit mode (password opsional, kosongkan = jangan ubah)
 */
export function VpnServerFormModal({ isOpen, onClose, editing }) {
    const isEdit = !!editing;
    const createMutation = useCreateVpnServer();
    const updateMutation = useUpdateVpnServer();
    const isPending = createMutation.isPending || updateMutation.isPending;

    const [form, setForm] = useState(getInitialForm());
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setForm(isEdit ? mapServerToForm(editing) : getInitialForm());
            setError(null);
        }
    }, [isOpen, editing, isEdit]);

    const setField = (key, value) => {
        setForm((f) => ({ ...f, [key]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Validate basic
        if (!form.name.trim()) return setError('Nama wajib diisi');
        if (!form.host.trim()) return setError('Host wajib diisi');
        if (!form.username.trim()) return setError('Username wajib diisi');
        if (!isEdit && !form.password.trim()) return setError('Password wajib diisi untuk VPN baru');
        if (!form.clientSubnet.trim()) return setError('Subnet wajib diisi');
        if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(form.clientSubnet)) {
            return setError('Format subnet salah. Pakai CIDR seperti 172.18.19.0/24');
        }

        const payload = {
            name: form.name.trim(),
            region: form.region.trim() || null,
            type: 'openvpn',
            enabled: form.enabled,
            priority: parseInt(form.priority, 10) || 5,
            notes: form.notes.trim() || null,
            host: form.host.trim(),
            port: parseInt(form.port, 10),
            proto: form.proto,
            username: form.username.trim(),
            mode: form.mode,
            cipher: form.cipher.trim(),
            auth: form.auth.trim(),
            caCertPem: form.caCertPem.trim() || null,
            verifyServerCert: form.verifyServerCert,
            extraConfig: form.extraConfig.trim() || null,
            clientSubnet: form.clientSubnet.trim(),
        };

        // Password: hanya kirim kalau ada nilai
        if (form.password) payload.password = form.password;

        try {
            if (isEdit) {
                await updateMutation.mutateAsync({ id: editing.id, data: payload });
            } else {
                await createMutation.mutateAsync(payload);
            }
            onClose();
        } catch (err) {
            // Backend kembalikan error.details untuk validation issues
            setError(err?.message || 'Gagal simpan');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? `Edit VPN: ${editing?.name}` : 'Tambah VPN Server'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                        <p className="text-sm text-danger">{error}</p>
                    </div>
                )}

                {/* Basic info */}
                <Section icon={FileText} title="Info Dasar">
                    <Grid>
                        <Field label="Nama *" hint="Unique identifier">
                            <Input
                                value={form.name}
                                onChange={(e) => setField('name', e.target.value)}
                                placeholder="VPN Jakarta"
                                required
                            />
                        </Field>
                        <Field label="Region/Tag" hint="Opsional">
                            <Input
                                value={form.region}
                                onChange={(e) => setField('region', e.target.value)}
                                placeholder="Jakarta"
                            />
                        </Field>
                        <Field label="Tipe *">
                            <select
                                value={form.type}
                                onChange={(e) => setField('type', e.target.value)}
                                className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full h-10"
                            >
                                <option value="openvpn">OpenVPN</option>
                            </select>
                        </Field>
                        <Field label="Priority (1=tertinggi)">
                            <Input
                                type="number"
                                min={1}
                                max={9}
                                value={form.priority}
                                onChange={(e) => setField('priority', e.target.value)}
                            />
                        </Field>
                        <Field label="Enabled" hint="OFF = tidak auto-connect saat boot">
                            <div className="flex items-center gap-3 h-10">
                                <Toggle
                                    checked={form.enabled}
                                    onChange={(val) => setField('enabled', val)}
                                />
                                <span className="text-sm text-fg-muted">
                                    {form.enabled ? 'Aktif' : 'Nonaktif'}
                                </span>
                            </div>
                        </Field>
                    </Grid>
                </Section>

                {/* Connection */}
                <Section icon={FileText} title="Koneksi">
                    <Grid>
                        <Field label="Host (IP/DDNS) *">
                            <Input
                                value={form.host}
                                onChange={(e) => setField('host', e.target.value)}
                                placeholder="id.genster.net"
                                required
                            />
                        </Field>
                        <Field label="Port *">
                            <Input
                                type="number"
                                min={1}
                                max={65535}
                                value={form.port}
                                onChange={(e) => setField('port', e.target.value)}
                                placeholder="1194"
                                required
                            />
                        </Field>
                        <Field label="Protocol">
                            <select
                                value={form.proto}
                                onChange={(e) => setField('proto', e.target.value)}
                                className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full h-10"
                            >
                                <option value="tcp">TCP</option>
                                <option value="udp">UDP</option>
                            </select>
                        </Field>
                        <Field label="Client Subnet *" hint="CIDR, harus unik antar VPN">
                            <Input
                                value={form.clientSubnet}
                                onChange={(e) => setField('clientSubnet', e.target.value)}
                                placeholder="172.18.19.0/24"
                                required
                            />
                        </Field>
                    </Grid>
                </Section>

                {/* Credentials */}
                <Section icon={Lock} title="Credentials">
                    <Grid>
                        <Field label="Username *">
                            <Input
                                value={form.username}
                                onChange={(e) => setField('username', e.target.value)}
                                placeholder="maps2026"
                                autoComplete="off"
                                required
                            />
                        </Field>
                        <Field
                            label={isEdit ? 'Password (kosongkan = tidak ubah)' : 'Password *'}
                            hint={isEdit && editing?.hasPassword ? 'Password sudah tersimpan' : null}
                        >
                            <Input
                                type="password"
                                value={form.password}
                                onChange={(e) => setField('password', e.target.value)}
                                placeholder={isEdit ? '••••••••' : 'Password VPN'}
                                autoComplete="new-password"
                            />
                        </Field>
                    </Grid>
                </Section>

                {/* OpenVPN options */}
                <Section icon={FileText} title="OpenVPN Options">
                    <Grid>
                        <Field label="Mode">
                            <select
                                value={form.mode}
                                onChange={(e) => setField('mode', e.target.value)}
                                className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full h-10"
                            >
                                <option value="tap">TAP (ethernet/layer 2)</option>
                                <option value="tun">TUN (routed/layer 3)</option>
                            </select>
                        </Field>
                        <Field label="Cipher">
                            <Input
                                value={form.cipher}
                                onChange={(e) => setField('cipher', e.target.value)}
                                placeholder="AES-256-CBC"
                            />
                        </Field>
                        <Field label="Auth">
                            <Input
                                value={form.auth}
                                onChange={(e) => setField('auth', e.target.value)}
                                placeholder="SHA1"
                            />
                        </Field>
                        <Field label="Verify Server Cert" hint="OFF kalau MikroTik OVPN self-signed">
                            <div className="flex items-center gap-3 h-10">
                                <Toggle
                                    checked={form.verifyServerCert}
                                    onChange={(val) => setField('verifyServerCert', val)}
                                />
                                <span className="text-sm text-fg-muted">
                                    {form.verifyServerCert ? 'Verify' : 'Skip'}
                                </span>
                            </div>
                        </Field>
                    </Grid>

                    <Field label="CA Certificate (PEM)" hint="Paste isi cacert dari MikroTik. Wajib untuk OpenVPN 2.5+.">
                        <textarea
                            value={form.caCertPem}
                            onChange={(e) => setField('caCertPem', e.target.value)}
                            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                            rows={6}
                            className="bg-surface-darker border border-slate-border text-fg text-xs font-mono rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full resize-y"
                        />
                    </Field>

                    <Field label="Extra Config (advanced)" hint="OpenVPN directive tambahan, 1 per baris. Whitelist validated di server.">
                        <textarea
                            value={form.extraConfig}
                            onChange={(e) => setField('extraConfig', e.target.value)}
                            placeholder="# Contoh:&#10;tls-version-min 1.0&#10;mute-replay-warnings"
                            rows={4}
                            className="bg-surface-darker border border-slate-border text-fg text-xs font-mono rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full resize-y"
                        />
                    </Field>
                </Section>

                {/* Notes */}
                <Field label="Catatan" hint="Opsional, untuk operator">
                    <textarea
                        value={form.notes}
                        onChange={(e) => setField('notes', e.target.value)}
                        rows={2}
                        className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full resize-y"
                    />
                </Field>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-border">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                        <X className="w-4 h-4 mr-1" />
                        Batal
                    </Button>
                    <Button type="submit" variant="primary" loading={isPending}>
                        <Save className="w-4 h-4 mr-1" />
                        {isEdit ? 'Simpan Perubahan' : 'Tambah VPN'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function Section({ icon: Icon, title, children }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
                <Icon className="w-3.5 h-3.5" />
                {title}
            </div>
            {children}
        </div>
    );
}

function Grid({ children }) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, hint, children }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-fg">{label}</span>
            {children}
            {hint && <span className="text-[10px] text-fg-muted italic">{hint}</span>}
        </label>
    );
}

function getInitialForm() {
    return {
        name: '',
        region: '',
        type: 'openvpn',
        enabled: true,
        priority: 5,
        notes: '',
        host: '',
        port: 1194,
        proto: 'tcp',
        username: '',
        password: '',
        mode: 'tap',
        cipher: 'AES-256-CBC',
        auth: 'SHA1',
        caCertPem: '',
        verifyServerCert: false,
        extraConfig: '',
        clientSubnet: '',
    };
}

function mapServerToForm(server) {
    return {
        name: server.name || '',
        region: server.region || '',
        type: server.type || 'openvpn',
        enabled: server.enabled,
        priority: server.priority || 5,
        notes: server.notes || '',
        host: server.host || '',
        port: server.port || 1194,
        proto: server.proto || 'tcp',
        username: server.username || '',
        password: '',                          // jangan pre-fill password
        mode: server.mode || 'tap',
        cipher: server.cipher || 'AES-256-CBC',
        auth: server.auth || 'SHA1',
        caCertPem: server.caCertPem || '',
        verifyServerCert: server.verifyServerCert,
        extraConfig: server.extraConfig || '',
        clientSubnet: server.clientSubnet || '',
    };
}
