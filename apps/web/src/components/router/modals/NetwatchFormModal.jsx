import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function NetwatchFormModal({ isOpen, onClose, onSuccess, netwatch = null, routerId }) {
    const [formData, setFormData] = useState({
        host: '',
        interval: '1m',
        timeout: '1s',
        comment: '',
        latitude: '',
        longitude: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (netwatch) {
            setFormData({
                host: netwatch.host || '',
                interval: netwatch.interval || '1m',
                timeout: netwatch.timeout || '1s',
                comment: netwatch.comment || '',
                latitude: netwatch.latitude || '',
                longitude: netwatch.longitude || ''
            });
        } else {
            setFormData({
                host: '',
                interval: '1m',
                timeout: '1s',
                comment: '',
                latitude: '',
                longitude: ''
            });
        }
    }, [netwatch, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
                host: formData.host,
                interval: formData.interval,
                timeout: formData.timeout,
                comment: formData.comment,
                latitude: formData.latitude,
                longitude: formData.longitude,
                routerId: routerId
            };

            if (netwatch) {
                await apiClient.put(`/routers/${routerId}/netwatch/${netwatch.id}`, payload);
                toast.success('Netwatch updated successfully');
            } else {
                await apiClient.post(`/routers/${routerId}/netwatch`, payload);
                toast.success('Netwatch added successfully');
            }
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to save netwatch:', err);
            setError(err.response?.data?.message || err.message || 'Failed to save netwatch');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={netwatch ? 'Edit Netwatch Entry' : 'Add New Netwatch Entry'}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <Input
                    label="Host (IP or Domain)"
                    name="host"
                    value={formData.host}
                    onChange={handleChange}
                    placeholder="e.g. 1.1.1.1 or google.com"
                    required
                />

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Interval"
                        name="interval"
                        value={formData.interval}
                        onChange={handleChange}
                        placeholder="e.g. 1m, 30s"
                        required
                    />
                    <Input
                        label="Timeout"
                        name="timeout"
                        value={formData.timeout}
                        onChange={handleChange}
                        placeholder="e.g. 1s, 500ms"
                        required
                    />
                </div>

                <Input
                    label="Comment / Name"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    placeholder="e.g. Main Fiber Link"
                />

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

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>{netwatch ? 'Update' : 'Add'} Entry</Button>
                </div>
            </form>
        </Modal>
    );
}

export default NetwatchFormModal;
