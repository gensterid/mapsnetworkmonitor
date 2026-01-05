import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { useAuth, useRole } from '@/lib/auth-client';
import {
    useRouters,
    useCreateRouter,
    useUpdateRouter,
    useDeleteRouter,
    useRefreshRouter,
} from '@/hooks';
import { Plus, Router as RouterIcon, Signal, RefreshCw, Trash2, Edit, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// Helper function to format uptime in seconds to human readable format
function formatUptime(seconds) {
    if (!seconds) return '--';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}


import { useQuery } from '@tanstack/react-query';

// Router Form Modal (for Add and Edit)
function RouterFormModal({ isOpen, onClose, onSuccess, router = null }) {
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
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Reset form when router changes
    React.useEffect(() => {
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
            });
        }
        setError('');
    }, [router, isOpen]);

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
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

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">IP Address</label>
                        <Input name="host" value={formData.host} onChange={handleChange} placeholder="192.168.88.1" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Port</label>
                        <Input type="number" name="port" value={formData.port} onChange={handleChange} required />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">
                                Latitude <span className="text-slate-500 text-xs">(or paste lat, long)</span>
                            </label>
                            <Input
                                name="latitude"
                                value={formData.latitude}
                                onChange={handleCoordinateInput}
                                placeholder="0.5309802229475449"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Longitude</label>
                            <Input
                                name="longitude"
                                value={formData.longitude}
                                onChange={handleChange}
                                placeholder="123.0600260859604"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Tip: Paste coordinates in "lat, long" format to auto-fill both fields</p>
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

// Delete Confirmation Modal
function DeleteRouterModal({ isOpen, onClose, router, onSuccess }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await apiClient.delete(`/routers/${router.id}`);
            onSuccess?.();
            onClose();
        } catch (err) {
            alert('Failed to delete: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Delete Router">
            <div className="space-y-4">
                <p className="text-slate-300">
                    Are you sure you want to delete <strong className="text-white">{router?.name}</strong>?
                    This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDelete} loading={isDeleting}>
                        Delete
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function Routers() {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRouter, setEditingRouter] = useState(null);
    const [deletingRouter, setDeletingRouter] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name'); // 'name', 'host', 'status'

    const { data: routers = [], isLoading, error, refetch } = useRouters();
    const refreshRouter = useRefreshRouter();

    // Filter and Sort Routers
    const filteredRouters = React.useMemo(() => {
        return routers
            .filter(router => {
                const query = searchQuery.toLowerCase();
                const name = router.name || '';
                const host = router.host || '';
                const location = router.location || '';

                return (
                    name.toLowerCase().includes(query) ||
                    host.toLowerCase().includes(query) ||
                    location.toLowerCase().includes(query)
                );
            })
            .sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                const hostA = a.host || '';
                const hostB = b.host || '';

                if (sortBy === 'name') return nameA.localeCompare(nameB);
                if (sortBy === 'host') return hostA.localeCompare(hostB);
                if (sortBy === 'status') {
                    // Online first
                    if (a.status === b.status) return nameA.localeCompare(nameB);
                    return a.status === 'online' ? -1 : 1;
                }
                return 0;
            });
    }, [routers, searchQuery, sortBy]);

    const handleSuccess = () => {
        refetch();
    };

    const handleEditClick = (e, router) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingRouter(router);
    };

    const handleDeleteClick = (e, router) => {
        e.preventDefault();
        e.stopPropagation();
        setDeletingRouter(router);
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
                <div className="text-red-400 mb-2">Error loading routers</div>
                <p className="text-slate-500 text-sm">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Devices</h1>
                    <p className="text-slate-400 text-sm">Manage your MikroTik routers</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search devices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-64"
                        />
                    </div>

                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-1 focus:ring-primary focus:border-primary appearance-none cursor-pointer w-full sm:w-auto"
                        >
                            <option value="name">Sort by Name</option>
                            <option value="host">Sort by IP</option>
                            <option value="status">Sort by Status</option>
                        </select>
                        <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>

                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Router
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredRouters.map((router) => (
                        <Link key={router.id} to={`/routers/${router.id}`} className="block">
                            <Card className="group hover:border-slate-600 transition-colors cursor-pointer">
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={clsx(
                                                "p-2.5 rounded-lg",
                                                router.status === 'online' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                            )}>
                                                <RouterIcon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">{router.name}</h3>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                                    <span className={clsx(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        router.status === 'online' ? "bg-emerald-500" : "bg-red-500"
                                                    )} />
                                                    {router.host}:{router.port}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    refreshRouter.mutate(router.id);
                                                }}
                                                disabled={refreshRouter.isPending && refreshRouter.variables === router.id}
                                                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                                                title="Refresh connection"
                                            >
                                                <RefreshCw className={clsx("w-4 h-4", refreshRouter.isPending && refreshRouter.variables === router.id && "animate-spin")} />
                                            </button>
                                            <button
                                                onClick={(e) => handleEditClick(e, router)}
                                                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                                title="Edit router"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(e, router)}
                                                className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                                                title="Delete router"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* CPU, Memory, Uptime, Speed Grid */}
                                    <div className="grid grid-cols-4 gap-2 text-sm">
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">CPU</div>
                                            <div className="text-slate-300 truncate">
                                                {router.latestMetrics?.cpuLoad != null
                                                    ? `${router.latestMetrics.cpuLoad}%`
                                                    : '--'}
                                            </div>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Memory</div>
                                            <div className="text-slate-300 truncate">
                                                {router.latestMetrics?.totalMemory && router.latestMetrics?.usedMemory
                                                    ? `${Math.round((router.latestMetrics.usedMemory / router.latestMetrics.totalMemory) * 100)}%`
                                                    : '--'}
                                            </div>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Uptime</div>
                                            <div className="text-slate-300 truncate">
                                                {router.latestMetrics?.uptime
                                                    ? formatUptime(router.latestMetrics.uptime)
                                                    : '--'}
                                            </div>
                                        </div>
                                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Speed</div>
                                            <div className="text-slate-300 truncate">
                                                {router.maxInterfaceSpeed || '--'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
                                        <div className="text-xs text-slate-500">
                                            {router.model || 'Unknown'} • {router.routerOsVersion || router.version || '-'}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-slate-400">
                                            <Signal className="w-3.5 h-3.5" />
                                            <span>{router.latestMetrics?.uptime ? 'Online' : '--'}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}

                    {routers.length > 0 && filteredRouters.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                            <div className="w-12 h-12 bg-slate-800/50 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-1">No matches found</h3>
                            <p className="text-slate-400">No routers match your search "{searchQuery}"</p>
                            <Button variant="ghost" className="mt-4" onClick={() => setSearchQuery('')}>
                                Clear Search
                            </Button>
                        </div>
                    )}

                    {routers.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                            <div className="w-12 h-12 bg-slate-800/50 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <RouterIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-1">No routers found</h3>
                            <p className="text-slate-400 mb-4">Start monitoring by adding your first MikroTik router</p>
                            <Button onClick={() => setIsAddModalOpen(true)}>
                                Add your first router
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Router Modal */}
            <RouterFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={handleSuccess}
            />

            {/* Edit Router Modal */}
            <RouterFormModal
                isOpen={!!editingRouter}
                onClose={() => setEditingRouter(null)}
                router={editingRouter}
                onSuccess={handleSuccess}
            />

            {/* Delete Confirmation Modal */}
            <DeleteRouterModal
                isOpen={!!deletingRouter}
                onClose={() => setDeletingRouter(null)}
                router={deletingRouter}
                onSuccess={handleSuccess}
            />
        </div>
    );
}
