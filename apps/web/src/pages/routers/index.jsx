import React, { useState, useMemo } from 'react';
import { Plus, RefreshCw, Search, ArrowUpDown, LayoutGrid, List, Router as RouterIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import clsx from 'clsx';
import { useRouters, useRefreshRouter } from '@/hooks';

// Components
import RouterCard from './components/RouterCard';
import RouterList from './components/RouterList';
import RouterFormModal from './components/RouterFormModal';
import DeleteRouterModal from './components/DeleteRouterModal';

export default function Routers() {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRouter, setEditingRouter] = useState(null);
    const [deletingRouter, setDeletingRouter] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name'); // 'name', 'host', 'status'
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('routers-view-mode') || 'grid';
    });

    const { data: routers = [], isLoading, error, refetch } = useRouters();
    const refreshRouter = useRefreshRouter();

    // Filter and Sort Routers
    const filteredRouters = useMemo(() => {
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

                if (sortBy === 'name') return nameA.localeCompare(nameB);
                if (sortBy === 'host') return (a.host || '').localeCompare(b.host || '');
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
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark p-8 text-center">
                <div className="text-red-400 mb-2">Error loading routers</div>
                <p className="text-slate-500 text-sm">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white">Devices</h1>
                    <p className="text-slate-400 text-xs md:sm">Manage your MikroTik routers</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
                    <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search devices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-64"
                        />
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-1 focus:ring-primary focus:border-primary appearance-none cursor-pointer w-full"
                            >
                                <option value="name">Sort by Name</option>
                                <option value="host">Sort by IP</option>
                                <option value="status">Status</option>
                            </select>
                            <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>

                        <div className="hidden md:flex bg-slate-900 border border-slate-700 rounded-lg p-1">
                            <button
                                onClick={() => {
                                    setViewMode('grid');
                                    localStorage.setItem('routers-view-mode', 'grid');
                                }}
                                className={clsx(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === 'grid' ? "bg-primary text-[var(--on-primary)]" : "text-slate-400 hover:text-white"
                                )}
                                title="Grid View"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setViewMode('list');
                                    localStorage.setItem('routers-view-mode', 'list');
                                }}
                                className={clsx(
                                    "p-1.5 rounded-md transition-colors",
                                    viewMode === 'list' ? "bg-primary text-[var(--on-primary)]" : "text-slate-400 hover:text-white"
                                )}
                                title="List View"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>

                        <Button onClick={() => setIsAddModalOpen(true)} className="flex-1 sm:flex-none">
                            <Plus className="w-4 h-4 mr-2" />
                            <span className="hidden sm:inline">Add Router</span>
                            <span className="sm:hidden">Add</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="space-y-4">
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredRouters.map((router) => (
                                <RouterCard 
                                    key={router.id} 
                                    router={router} 
                                    onEdit={(r) => setEditingRouter(r)}
                                    onDelete={(r) => setDeletingRouter(r)}
                                    onRefresh={(id) => refreshRouter.mutate(id)}
                                    isRefreshing={refreshRouter.isPending && refreshRouter.variables === router.id}
                                />
                            ))}
                        </div>
                    ) : (
                        <RouterList 
                            routers={filteredRouters}
                            onEdit={handleEditClick}
                            onDelete={handleDeleteClick}
                            onRefresh={(id) => refreshRouter.mutate(id)}
                            refreshingId={refreshRouter.isPending ? refreshRouter.variables : null}
                        />
                    )}
                </div>

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

            {/* Modals */}
            <RouterFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={handleSuccess}
            />

            <RouterFormModal
                isOpen={!!editingRouter}
                onClose={() => setEditingRouter(null)}
                router={editingRouter}
                onSuccess={handleSuccess}
            />

            <DeleteRouterModal
                isOpen={!!deletingRouter}
                onClose={() => setDeletingRouter(null)}
                router={deletingRouter}
                onSuccess={handleSuccess}
            />
        </div>
    );
}
