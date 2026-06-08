import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRole } from '@/lib/auth-client';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import Toggle from '@/components/ui/Toggle';
import clsx from 'clsx';

const toEvent = (name, checked) => ({ target: { name, type: 'checkbox', checked, value: checked } });

// Router Form Modal (for Add and Edit)
export function RouterFormModal({ isOpen, onClose, onSuccess, router = null }) {
    const { isAdmin } = useRole();
    // Fetch Notification Groups
    const { data: notificationGroups = [] } = useQuery({
        queryKey: ['notification-groups'],
        queryFn: async () => {
            try {
                const res = await apiClient.get('/notification-groups');
                return res.data?.data || res.data || [];
            } catch (e) {
                console.error('Failed to fetch notification groups:', e);
                return [];
            }
        },
        enabled: isOpen // Only fetch when modal is open
    });

    const isEditing = !!router;
    const [formData, setFormData] = useState({
        name: router?.name || '',
        host: router?.host || '',
        port: String(router?.port || 8728),
        username: router?.username || '',
        password: '',
        latitude: router?.latitude || '',
        longitude: router?.longitude || '',
        location: router?.location || '',
        notificationGroupId: router?.notificationGroupId || '',
        snmpCommunity: router?.snmpCommunity || 'public',
        snmpPort: String(router?.snmpPort || 161),
        snmpHost: router?.snmpHost || '',
        useSnmp: router?.useSnmp !== undefined ? router.useSnmp : true,
        useGenieAcs: router?.useGenieAcs || false,
        genieacsUrl: router?.genieacsUrl || '',
        genieacsUsername: router?.genieacsUsername || '',
        genieacsPassword: '',
        useWebhook: router?.useWebhook || false,
        pollingIntervalMetrics: router?.pollingIntervalMetrics ? String(router.pollingIntervalMetrics) : '300',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [connStatus, setConnStatus] = useState({ state: 'idle', message: '' });

    const handleTestConnection = async () => {
        setConnStatus({ state: 'testing', message: 'Testing...' });
        try {
            // Test connection using the current router ID if editing
            const url = isEditing
                ? `/genieacs/test-connection?routerId=${router.id}`
                : '/genieacs/test-connection';

            const res = await apiClient.get(url);
            if (res.data.success) {
                setConnStatus({ state: 'success', message: 'Connected' });
                toast.success('GenieACS Connected Successfully');
            } else {
                setConnStatus({ state: 'error', message: res.data.error || 'Connection failed' });
                toast.error(`GenieACS Error: ${res.data.error || 'Connection failed'}`);
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            setConnStatus({ state: 'error', message: msg });
            toast.error(`Connection Error: ${msg}`);
        }
    };

    // Reset form when router changes
    useEffect(() => {
        if (router) {
            setFormData({
                name: router.name || '',
                host: router.host || '',
                port: String(router.port || 8728),
                username: router.username || '',
                password: '',
                latitude: router.latitude || '',
                longitude: router.longitude || '',
                location: router.location || '',
                notificationGroupId: router.notificationGroupId || '',
                snmpCommunity: router.snmpCommunity || 'public',
                snmpPort: String(router.snmpPort || 161),
                snmpHost: router.snmpHost || '',
                useSnmp: router.useSnmp !== undefined ? router.useSnmp : true,
                useGenieAcs: router.useGenieAcs || false,
                genieacsUrl: router.genieacsUrl || '',
                genieacsUsername: router.genieacsUsername || '',
                genieacsPassword: '',
                useWebhook: router.useWebhook || false,
                pollingIntervalMetrics: router.pollingIntervalMetrics ? String(router.pollingIntervalMetrics) : '300',
            });
        } else {
            setFormData({
                name: '',
                host: '',
                port: '8728',
                username: '',
                password: '',
                latitude: '',
                longitude: '',
                location: '',
                notificationGroupId: '',
                snmpCommunity: 'public',
                snmpPort: '161',
                snmpHost: '',
                useSnmp: true,
                useGenieAcs: false,
                genieacsUrl: '',
                genieacsUsername: '',
                genieacsPassword: '',
                useWebhook: false,
                pollingIntervalMetrics: '300',
            });
        }
        setError('');
    }, [router, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Parse coordinate input (supports "lat, long" format)
    const handleCoordinateInput = (e) => {
        const value = e.target.value;
        // Check if it's a comma-separated coordinate pair
        if (value.includes(',')) {
            const parts = value.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                setFormData(prev => ({
                    ...prev,
                    latitude: parts[0],
                    longitude: parts[1],
                }));
                return;
            }
        }
        // Otherwise just update the latitude field
        setFormData(prev => ({
            ...prev,
            latitude: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                name: formData.name,
                host: formData.host,
                port: parseInt(formData.port, 10),
                username: formData.username,
                latitude: formData.latitude || undefined,
                longitude: formData.longitude || undefined,
                location: formData.location || undefined,
                notificationGroupId: formData.notificationGroupId || null,
                snmpCommunity: formData.snmpCommunity || 'public',
                snmpPort: parseInt(formData.snmpPort, 10) || 161,
                snmpHost: formData.snmpHost || undefined,
                useSnmp: formData.useSnmp,
                useGenieAcs: formData.useGenieAcs,
                genieacsUrl: formData.genieacsUrl || undefined,
                genieacsUsername: formData.genieacsUsername || undefined,
                genieacsPassword: formData.genieacsPassword || undefined,
                useWebhook: formData.useWebhook,
                pollingIntervalMetrics: parseInt(formData.pollingIntervalMetrics, 10) || 300,
            };

            // Only include password if provided (for edit, password is optional)
            if (formData.password) {
                payload.password = formData.password;
            }

            if (isEditing) {
                await apiClient.put(`/routers/${router.id}`, payload);
            } else {
                payload.password = formData.password; // Required for new routers
                await apiClient.post('/routers', payload);
            }

            if (!isAdmin) {
                toast.success('Router berhasil di simpan dan silahkan menghubungi admin', {
                    duration: 5000,
                    icon: '🔒',
                });
            } else {
                toast.success(isEditing ? 'Router updated successfully' : 'Router added successfully');
            }

            onSuccess?.();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'add'} router`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Router" : "Add New Router"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Name</label>
                    <Input name="name" value={formData.name} onChange={handleChange} placeholder="Main Router" required />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">IP Address</label>
                        <Input name="host" value={formData.host} onChange={handleChange} placeholder="192.168.88.1" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Port</label>
                        <Input type="number" name="port" value={formData.port} onChange={handleChange} required />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Username</label>
                        <Input name="username" value={formData.username} onChange={handleChange} placeholder="admin" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">
                            Password {isEditing && <span className="text-slate-500">(leave blank to keep)</span>}
                        </label>
                        <Input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
                            required={!isEditing}
                        />
                    </div>
                </div>

                {isAdmin && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Notification Group</label>
                        <select
                            name="notificationGroupId"
                            value={formData.notificationGroupId}
                            onChange={handleChange}
                            className="w-full bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                        >
                            <option value="">-- No Notifications --</option>
                            {notificationGroups.map(group => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Location Section */}
                <div className="pt-2 border-t border-slate-700/50">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Location (Optional)</div>

                    <div className="space-y-2 mb-4">
                        <label className="text-sm font-medium text-slate-300">Location Name</label>
                        <Input name="location" value={formData.location} onChange={handleChange} placeholder="Data Center A, Building 2" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">
                                Latitude <span className="text-slate-500 text-xs">(or paste lat, long)</span>
                            </label>
                            <Input
                                name="latitude"
                                value={formData.latitude}
                                onChange={handleCoordinateInput}
                                placeholder="0.5309802229475449"
                                inputMode="decimal"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Longitude</label>
                            <Input
                                name="longitude"
                                value={formData.longitude}
                                onChange={handleChange}
                                placeholder="123.0600260859604"
                                inputMode="decimal"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Tip: Paste coordinates in "lat, long" format to auto-fill both fields</p>
                </div>

                {/* Webhook Settings Section */}
                <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Monitoring Webhooks</div>
                        <Toggle
                            checked={formData.useWebhook}
                            onChange={(v) => handleChange(toEvent('useWebhook', v))}
                            ariaLabel="Monitoring webhooks"
                            size="sm"
                        />
                    </div>

                    {formData.useWebhook && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Metrics Polling Interval</label>
                                <Input
                                    type="number"
                                    name="pollingIntervalMetrics"
                                    value={formData.pollingIntervalMetrics}
                                    onChange={handleChange}
                                    placeholder="300"
                                    min="60"
                                />
                                <p className="text-[10px] text-slate-500">
                                    Refresh interval in seconds for traffic metrics when webhooks handles Up/Down status.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* GenieACS Section */}
                <div className="pt-2 border-t border-slate-700/50">

                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">GenieACS Integration</div>
                        <Toggle
                            checked={formData.useGenieAcs}
                            onChange={(v) => setFormData(prev => ({ ...prev, useGenieAcs: v }))}
                            ariaLabel="GenieACS integration"
                            size="sm"
                        />
                    </div>

                    {formData.useGenieAcs && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-slate-300">GenieACS URL</label>
                                    {isEditing && (
                                        <div className="flex items-center gap-2">
                                            {connStatus.state !== 'idle' && (
                                                <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                                                    connStatus.state === 'testing' && "bg-blue-500/10 text-blue-400 animate-pulse",
                                                    connStatus.state === 'success' && "bg-emerald-500/10 text-emerald-400",
                                                    connStatus.state === 'error' && "bg-red-500/10 text-red-400"
                                                )}>
                                                    <span className={clsx(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        connStatus.state === 'testing' && "bg-blue-400",
                                                        connStatus.state === 'success' && "bg-emerald-400",
                                                        connStatus.state === 'error' && "bg-red-400"
                                                    )} />
                                                    {connStatus.state === 'testing' ? 'Testing...' : connStatus.state === 'success' ? 'Connected' : 'Failed'}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleTestConnection}
                                                disabled={connStatus.state === 'testing'}
                                                className="text-[10px] font-bold text-primary hover:text-primary-light transition-colors disabled:opacity-50"
                                            >
                                                Test Connection
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <Input
                                    name="genieacsUrl"
                                    value={formData.genieacsUrl}
                                    onChange={handleChange}
                                    placeholder="http://192.168.1.10:7557"
                                />
                                <p className="text-[10px] text-slate-500">
                                    Specific GenieACS URL for this router. If left blank, it will use the global URL.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">ACS Username</label>
                                    <Input
                                        name="genieacsUsername"
                                        value={formData.genieacsUsername}
                                        onChange={handleChange}
                                        placeholder="admin"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">ACS Password</label>
                                    <Input
                                        type="password"
                                        name="genieacsPassword"
                                        value={formData.genieacsPassword}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SNMP Section */}
                <div className="pt-2 border-t border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">SNMP Configuration (Live Traffic)</div>
                        <Toggle
                            checked={formData.useSnmp}
                            onChange={(v) => setFormData(prev => ({ ...prev, useSnmp: v }))}
                            ariaLabel="SNMP configuration"
                            size="sm"
                        />
                    </div>

                    {formData.useSnmp && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">SNMP Community</label>
                                    <Input
                                        name="snmpCommunity"
                                        value={formData.snmpCommunity}
                                        onChange={handleChange}
                                        placeholder="public"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">SNMP Port</label>
                                    <Input
                                        type="number"
                                        name="snmpPort"
                                        value={formData.snmpPort}
                                        onChange={handleChange}
                                        placeholder="161"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">SNMP Host (Optional)</label>
                                <Input
                                    name="snmpHost"
                                    value={formData.snmpHost}
                                    onChange={handleChange}
                                    placeholder="Leave blank to use main IP"
                                />
                                <p className="text-[10px] text-slate-500">
                                    Use this if SNMP needs to connect via a different IP/VPN than the main management IP.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>
                        {isEditing ? 'Save Changes' : 'Add Router'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default RouterFormModal;
