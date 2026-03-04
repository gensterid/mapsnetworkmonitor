import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import { useRouters } from '@/hooks';
import toast from 'react-hot-toast';

function EditRouterModal({ isOpen, onClose, onSuccess, router }) {
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: '8728',
        username: '',
        password: '',
        latitude: '',
        longitude: '',
        location: '',
        notes: '',
        snmpCommunity: 'public',
        snmpPort: 161,
        useWebhook: false,
        pollingIntervalMetrics: '300',
        gatewayId: '',
        romonMac: '',
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (router) {
            setFormData({
                name: router.name || '',
                host: router.host || '',
                port: String(router.port || '8728'),
                username: router.username || '',
                password: '',
                latitude: router.latitude || '',
                longitude: router.longitude || '',
                location: router.location || '',
                notes: router.notes || '',
                snmpCommunity: router.snmpCommunity || 'public',
                snmpPort: router.snmpPort || 161,
                useWebhook: router.useWebhook || false,
                pollingIntervalMetrics: router.pollingIntervalMetrics ? String(router.pollingIntervalMetrics) : '300',
                gatewayId: router.gatewayId || '',
                romonMac: router.romonMac || '',
            });
        }
    }, [router, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleCoordinateInput = (e) => {
        const value = e.target.value;
        if (value.includes(',')) {
            const parts = value.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                setFormData(prev => ({ ...prev, latitude: parts[0], longitude: parts[1] }));
                return;
            }
        }
        setFormData(prev => ({ ...prev, latitude: value }));
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
                latitude: formData.latitude,
                longitude: formData.longitude,
                location: formData.location,
                notes: formData.notes,
                snmpCommunity: formData.snmpCommunity,
                snmpPort: parseInt(formData.snmpPort, 10),
                useWebhook: formData.useWebhook,
                pollingIntervalMetrics: parseInt(formData.pollingIntervalMetrics, 10) || 300,
                gatewayId: formData.gatewayId || null,
                romonMac: formData.romonMac || null,
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            ['latitude', 'longitude', 'location', 'notes'].forEach(key => {
                if (payload[key] === '') payload[key] = null;
            });

            Object.keys(payload).forEach(key => {
                if (payload[key] === '' && !['latitude', 'longitude', 'location', 'notes'].includes(key)) {
                    payload[key] = undefined;
                }
            });

            await apiClient.put(`/routers/${router.id}`, payload);
            toast.success('Router updated successfully');
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to update router:', err);
            setError(err.response?.data?.message || err.message || 'Failed to update router');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Router Settings" size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Name" name="name" value={formData.name} onChange={handleChange} required />
                    <Input label="Host IP/Domain" name="host" value={formData.host} onChange={handleChange} required />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="API Port" name="port" type="number" value={formData.port} onChange={handleChange} required />
                    <Input label="Username" name="username" value={formData.username} onChange={handleChange} required />
                    <Input label="Password" name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Leave empty to keep current" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Input
                            label="Coordinates (Lat, Lng)"
                            name="latitude"
                            value={formData.latitude && formData.longitude ? `${formData.latitude}, ${formData.longitude}` : formData.latitude}
                            onChange={handleCoordinateInput}
                            placeholder="e.g. -6.123, 106.123"
                        />
                        <p className="text-[10px] text-slate-500">Paste "lat, lng" to auto-split</p>
                    </div>
                    <Input label="Location Name" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Jakarta Data Center" />
                </div>

                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <h4 className="text-sm font-medium text-slate-300">Advanced Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label="SNMP Community" name="snmpCommunity" value={formData.snmpCommunity} onChange={handleChange} />
                        <Input label="SNMP Port" name="snmpPort" type="number" value={formData.snmpPort} onChange={handleChange} />
                        <Input label="Poll Interval (sec)" name="pollingIntervalMetrics" type="number" value={formData.pollingIntervalMetrics} onChange={handleChange} />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="useWebhook" name="useWebhook" checked={formData.useWebhook} onChange={handleChange} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary" />
                        <label htmlFor="useWebhook" className="text-sm text-slate-300">Enable Webhook for this router</label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>Save Changes</Button>
                </div>
            </form>
        </Modal>
    );
}

export default EditRouterModal;
