import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function AddRouterModal({ isOpen, onClose }) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: 8728,
        topLeftCoord: 150,
        username: '',
        password: '',
    });
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: async (data) => {
            const payload = { ...data, port: parseInt(data.port, 10) };
            const response = await api.post('/routers', payload);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['routers'] });
            setFormData({ name: '', host: '', port: 8728, topLeftCoord: 150, username: '', password: '' });
            onClose();
        },
        onError: (err) => {
            setError(err.response?.data?.message || 'Failed to add router');
        }
    });

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        mutation.mutate(formData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Router">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Name</label>
                    <Input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Main Router"
                        required
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">IP Address</label>
                        <Input
                            name="host"
                            value={formData.host}
                            onChange={handleChange}
                            placeholder="192.168.88.1"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Port</label>
                        <Input
                            type="number"
                            name="port"
                            value={formData.port}
                            onChange={handleChange}
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Top Left Coordinate</label>
                    <Input
                        type="number"
                        name="topLeftCoord"
                        value={formData.topLeftCoord}
                        onChange={handleChange}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Username</label>
                        <Input
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            placeholder="admin"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Password</label>
                        <Input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button type="submit" loading={mutation.isPending}>Add Router</Button>
                </div>
            </form>
        </Modal>
    );
}
