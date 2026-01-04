import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Check, Search, Router as RouterIcon } from 'lucide-react';
import { apiClient } from '@/lib/api';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function AssignRouterModal({ user, isOpen, onClose }) {
    const [selectedRouters, setSelectedRouters] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const queryClient = useQueryClient();

    // Fetch all routers (as admin)
    const { data: allRouters = [], isLoading: isLoadingRouters } = useQuery({
        queryKey: ['routers', 'admin-list'],
        queryFn: async () => {
            // We need to fetch ALL routers regardless of assignment to assign them
            // Ideally we need an endpoint that returns all routers for admin assignment usage
            // But existing /api/routers returns all for admin.
            const res = await apiClient.get('/routers');
            return res.data.data;
        },
        enabled: isOpen,
    });

    // Fetch currently assigned routers for this user
    const { data: assignedRouters = [], isLoading: isLoadingAssigned } = useQuery({
        queryKey: ['user-routers', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const res = await apiClient.get(`/users/${user.id}/routers`);
            return res.data.data;
        },
        enabled: isOpen && !!user?.id,
    });

    const isInitialized = useRef(false);

    // Reset when modal opens/closes or user changes
    useEffect(() => {
        if (!isOpen) {
            isInitialized.current = false;
            setSelectedRouters(new Set());
        }
    }, [isOpen, user?.id]);

    // Update form state when data loads
    useEffect(() => {
        if (assignedRouters && isOpen && !isInitialized.current && !isLoadingAssigned) {
            const initialIds = new Set(assignedRouters.map(r => r.id));
            setSelectedRouters(initialIds);
            isInitialized.current = true;
        }
    }, [assignedRouters, isOpen, isLoadingAssigned]);

    // Mutation to save changes
    const assignMutation = useMutation({
        mutationFn: async (routerIds) => {
            await apiClient.post(`/users/${user.id}/routers`, { routerIds });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['user-routers', user.id]);
            onClose();
        },
    });

    const handleToggle = (routerId) => {
        const next = new Set(selectedRouters);
        if (next.has(routerId)) {
            next.delete(routerId);
        } else {
            next.add(routerId);
        }
        setSelectedRouters(next);
    };

    const handleSelectAll = () => {
        if (selectedRouters.size === filteredRouters.length) {
            setSelectedRouters(new Set());
        } else {
            const allIds = filteredRouters.map(r => r.id);
            setSelectedRouters(new Set(allIds));
        }
    };

    const isLoading = isLoadingRouters || isLoadingAssigned;

    const safeAllRouters = Array.isArray(allRouters) ? allRouters : [];
    if (allRouters && !Array.isArray(allRouters)) {
        console.error('Expected allRouters to be array, got:', allRouters);
    }

    const filteredRouters = safeAllRouters.filter(router =>
        router.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        router.host.includes(searchQuery)
    );

    const handleSubmit = async () => {
        try {
            await assignMutation.mutateAsync(Array.from(selectedRouters));
        } catch (error) {
            alert('Failed to save assignments: ' + (error.message || 'Unknown error'));
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Assign Routers to ${user?.name}`} maxWidth="max-w-2xl">
            <div className="space-y-4">
                {/* Search and Filter */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search routers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50">
                        {/* Header */}
                        <div className="p-3 bg-slate-800/50 border-b border-slate-700 flex items-center justify-between">
                            <span className="text-sm text-slate-400">
                                Selected: <span className="text-white font-medium">{selectedRouters.size}</span> routers
                            </span>
                            <button
                                onClick={handleSelectAll}
                                className="text-xs text-primary hover:text-primary-400 font-medium"
                            >
                                {selectedRouters.size === filteredRouters.length && filteredRouters.length > 0 ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        {/* List */}
                        <div className="max-h-[400px] overflow-y-auto">
                            {filteredRouters.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    No routers found
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800">
                                    {filteredRouters.map(router => {
                                        const isSelected = selectedRouters.has(router.id);
                                        return (
                                            <div
                                                key={router.id}
                                                onClick={() => handleToggle(router.id)}
                                                className={clsx(
                                                    "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                                                    isSelected ? "bg-primary/5" : "hover:bg-slate-800"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                                    isSelected ? "bg-primary border-primary text-slate-950" : "border-slate-600 bg-slate-900"
                                                )}>
                                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                                </div>

                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <RouterIcon className="w-4 h-4 text-slate-500" />
                                                        <span className="font-medium text-white">{router.name}</span>
                                                        <span className={clsx(
                                                            "text-[10px] px-1.5 py-0.5 rounded uppercase font-bold",
                                                            router.status === 'online' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                                        )}>
                                                            {router.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5 ml-6">
                                                        {router.host}:{router.port}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={assignMutation.isPending}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} loading={assignMutation.isPending}>
                        Save Assignments
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
