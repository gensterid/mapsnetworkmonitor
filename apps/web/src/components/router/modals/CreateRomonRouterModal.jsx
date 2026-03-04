import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function CreateRomonRouterModal({ isOpen, onClose, onSuccess, gateway, romonId }) {
    const [formData, setFormData] = useState({
        name: '',
        username: 'admin',
        password: '',
        location: '',
        notificationGroupId: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                name: formData.name,
                host: gateway.host,
                port: gateway.port || 8728,
                username: formData.username,
                password: formData.password,
                location: formData.location || undefined,
                notificationGroupId: formData.notificationGroupId || null,
                gatewayId: gateway.id,
                romonMac: romonId,
            };

            await apiClient.post('/routers', payload);
            toast.success('Router added successfully via RoMON');
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to create RoMON router:', err);
            setError(err.response?.data?.message || err.message || 'Failed to create router');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add RoMON Device to Monitoring">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="p-3 bg-slate-800 rounded-lg space-y-2 mb-4 border border-slate-700">
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Gateway:</span>
                        <span className="text-white font-medium">{gateway?.name} ({gateway?.host})</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-500">RoMON ID:</span>
                        <span className="text-primary font-mono font-bold">{romonId}</span>
                    </div>
                </div>

                <Input label="Device Name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Remote Client Router" required />

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Username" name="username" value={formData.username} onChange={handleChange} required />
                    <Input label="Password" name="password" type="password" value={formData.password} onChange={handleChange} required />
                </div>

                <Input label="Location (Optional)" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Site B" />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>Add to Monitoring</Button>
                </div>
            </form>
        </Modal>
    );
}

export default CreateRomonRouterModal;
