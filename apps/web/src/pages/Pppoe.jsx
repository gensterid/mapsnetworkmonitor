import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRouters } from '@/hooks';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    PhoneCall,
    RefreshCw,
    Wifi,
    WifiOff,
    Clock,
    Search,
    User,
    Timer,
    Network
} from 'lucide-react';
import clsx from 'clsx';

// Fetch all PPPoE active sessions from all routers
function useAllPppoe() {
    const { data: routers = [] } = useRouters();

    return useQuery({
        queryKey: ['pppoe', 'all', routers.map(r => r.id)],
        queryFn: async () => {
            if (routers.length === 0) return [];

            const results = await Promise.all(
                routers.map(async (router) => {
                    try {
                        const res = await apiClient.get(`/routers/${router.id}/ppp/sessions`);
                        return (res.data?.data || []).map(session => ({
                            ...session,
                            routerName: router.name,
                            routerId: router.id
                        }));
                    } catch (err) {
                        console.error(`Failed to fetch PPPoE sessions for router ${router.id}:`, err);
                        return [];
                    }
                })
            );

            return results.flat();
        },
        enabled: routers.length > 0,
        staleTime: 30000,
        refetchInterval: 30000,
    });
}

export default function Pppoe() {
    const { data: pppoeEntries = [], isLoading, refetch } = useAllPppoe();
    const { data: routers = [] } = useRouters();
    const [searchQuery, setSearchQuery] = useState('');
    const [routerFilter, setRouterFilter] = useState('all');
    const [sortBy, setSortBy] = useState('uptime'); // uptime, name, router

    // Filter entries
    const filteredEntries = pppoeEntries
        .filter(entry => {
            const matchesSearch = !searchQuery ||
                entry.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.callerId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.routerName?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesRouter = routerFilter === 'all' || entry.routerId === routerFilter;

            return matchesSearch && matchesRouter;
        })
        // Sort entries
        .sort((a, b) => {
            switch (sortBy) {
                case 'uptime':
                    // Longest uptime first
                    return (b.uptimeSeconds || 0) - (a.uptimeSeconds || 0);
                case 'name':
                    return (a.name || '').localeCompare(b.name || '');
                case 'router':
                    return (a.routerName || '').localeCompare(b.routerName || '');
                default:
                    return 0;
            }
        });

    // Group by router for stats
    const routerStats = routers.reduce((acc, router) => {
        acc[router.id] = pppoeEntries.filter(e => e.routerId === router.id).length;
        return acc;
    }, {});

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <PhoneCall className="w-6 h-6 text-primary" />
                            PPPoE Sessions
                        </h1>
                        <p className="text-slate-400 text-sm">Monitor active PPPoE connections across all routers</p>
                    </div>
                    <Button onClick={() => refetch()} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <div className="text-2xl font-bold text-white">{pppoeEntries.length}</div>
                        <div className="text-xs text-slate-400">Total Active</div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-emerald-400">{routers.length}</div>
                        <div className="text-xs text-emerald-400/70">Routers</div>
                    </div>
                    <div className="col-span-2 bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Sessions per Router</div>
                        <div className="flex flex-wrap gap-2">
                            {routers.slice(0, 5).map(router => (
                                <span key={router.id} className="text-xs bg-slate-800 px-2 py-1 rounded">
                                    {router.name}: <span className="text-primary font-bold">{routerStats[router.id] || 0}</span>
                                </span>
                            ))}
                            {routers.length > 5 && (
                                <span className="text-xs text-slate-500">+{routers.length - 5} more</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-slate-800 flex gap-3 flex-wrap">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by username, IP, or caller ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                    />
                </div>
                <select
                    value={routerFilter}
                    onChange={(e) => setRouterFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                >
                    <option value="all">All Routers</option>
                    {routers.map(router => (
                        <option key={router.id} value={router.id}>{router.name}</option>
                    ))}
                </select>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                >
                    <option value="uptime">Sort: Longest Online</option>
                    <option value="name">Sort: Username A-Z</option>
                    <option value="router">Sort: Router A-Z</option>
                </select>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {filteredEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <PhoneCall className="w-6 h-6 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">No active PPPoE sessions</h3>
                        <p className="text-slate-400">There are no PPPoE users currently connected</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredEntries.map((entry, index) => (
                            <Card key={`${entry.routerId}-${entry.name}-${index}`} className="border-slate-700/50 hover:border-primary/30 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                                <User className="w-4 h-4 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-white text-sm">{entry.name}</h3>
                                                <p className="text-xs text-slate-500">{entry.service || 'pppoe'}</p>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            <Wifi className="w-3 h-3" /> Online
                                        </span>
                                    </div>

                                    <div className="space-y-2 text-xs text-slate-400">
                                        {entry.address && (
                                            <div className="flex items-center gap-2">
                                                <Network className="w-3 h-3 text-slate-500" />
                                                <span className="font-mono">{entry.address}</span>
                                            </div>
                                        )}
                                        {entry.callerId && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500">MAC:</span>
                                                <span className="font-mono">{entry.callerId}</span>
                                            </div>
                                        )}
                                        {entry.uptime && (
                                            <div className="flex items-center gap-2">
                                                <Timer className="w-3 h-3 text-slate-500" />
                                                <span>{entry.uptime}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                                            <span className="text-slate-500">Router:</span>
                                            <span className="text-primary">{entry.routerName}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
