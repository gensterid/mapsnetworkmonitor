import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function NetwatchFormModal({ isOpen, onClose, onSuccess, netwatch = null, routerId }) {
    const [formData, setFormData] = useState({
        host: '',
        name: '',
        interval: 60,
        location: '',
        latitude: '',
        longitude: '',
        isAppOnly: false
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (netwatch) {
            setFormData({
                host: netwatch.host || '',
                name: netwatch.name || '',
                interval: netwatch.interval || 60,
                location: netwatch.location || '',
                latitude: netwatch.latitude || '',
                longitude: netwatch.longitude || '',
                isAppOnly: !!netwatch.isAppOnly
            });
        } else {
            setFormData({
                host: '',
                name: '',
                interval: 60,
                location: '',
                latitude: '',
                longitude: '',
                isAppOnly: false
            });
        }
    }, [netwatch, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handlePaste = (e) => {
        const text = e.clipboardData.getData('text');
        if (text.includes(',')) {
            const parts = text.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                e.preventDefault();
                setFormData(prev => ({ ...prev, latitude: parts[0], longitude: parts[1] }));
            }
        }
    };

    const clearField = (field) => {
        setFormData(prev => ({ ...prev, [field]: '' }));
    };

    const clearAllCoords = () => {
        setFormData(prev => ({ ...prev, latitude: '', longitude: '' }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                ...formData,
                interval: parseInt(formData.interval) || 60,
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
            title={netwatch ? 'Edit Netwatch' : 'Add Netwatch'}
        >
            <form onSubmit={handleSubmit} className="space-y-6 pt-2">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Host/IP Address *"
                        name="host"
                        value={formData.host}
                        onChange={handleChange}
                        placeholder="e.g. 192.168.1.1"
                        required
                    />
                    <Input
                        label="Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="e.g. Server Edge"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Check Interval (seconds)"
                        name="interval"
                        type="number"
                        value={formData.interval}
                        onChange={handleChange}
                        placeholder="60"
                        required
                    />
                    <Input
                        label="Location Name"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        placeholder="Data Center"
                    />
                </div>

                <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Map Coordinates (Optional)</span>
                        <button type="button" onClick={clearAllCoords} className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider">Clear All</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                            <Input
                                label="Latitude"
                                name="latitude"
                                value={formData.latitude}
                                onChange={handleChange}
                                onPaste={handlePaste}
                                placeholder="0.0000"
                            />
                            {formData.latitude && (
                                <button type="button" onClick={() => clearField('latitude')} className="absolute right-0 top-0 h-8 px-2 text-[10px] text-slate-500 hover:text-white">Clear</button>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                label="Longitude"
                                name="longitude"
                                value={formData.longitude}
                                onChange={handleChange}
                                onPaste={handlePaste}
                                placeholder="0.0000"
                            />
                            {formData.longitude && (
                                <button type="button" onClick={() => clearField('longitude')} className="absolute right-0 top-0 h-8 px-2 text-[10px] text-slate-500 hover:text-white">Clear</button>
                            )}
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 italic">Tip: Paste "lat, long" format to auto-fill</p>
                </div>

                <div className="pt-2 border-t border-white/5">
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="isAppOnly"
                            name="isAppOnly"
                            checked={formData.isAppOnly}
                            onChange={handleChange}
                            className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary/20"
                        />
                        <div className="space-y-1">
                            <label htmlFor="isAppOnly" className="text-sm font-bold text-slate-200 cursor-pointer">Monitor only via App</label>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                If checked, this device will be pinged directly by the application backend instead of being added to the MikroTik router's native Netwatch list. Useful for monitoring devices on the same subnet without cluttering the router's configuration.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                    <Button type="button" variant="ghost" onClick={onClose} className="text-slate-300">Cancel</Button>
                    <Button type="submit" loading={isSubmitting} className="px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold">
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default NetwatchFormModal;
