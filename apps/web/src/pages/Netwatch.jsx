import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRouters } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Globe, RefreshCw, Wifi, WifiOff, MapPin, Clock, Search, Filter, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// Fetch all netwatch entries from all routers
function useAllNetwatch() {
    const { data: routers = [] } = useRouters();

    return useQuery({
        queryKey: ['netwatch', 'all', routers.map(r => r.id)],
        queryFn: async () => {
            if (routers.length === 0) return [];

            const results = await Promise.all(
                routers.map(async (router) => {
                    try {
                        const res = await apiClient.get(`/routers/${router.id}/netwatch`);
                        return (res.data?.data || []).map(entry => ({
                            ...entry,
                            routerName: router.name,
                            routerId: router.id
                        }));
                    } catch (err) {
                        console.error(`Failed to fetch netwatch for router ${router.id}:`, err);
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

export default function Netwatch() {
    const { data: netwatchEntries = [], isLoading, refetch } = useAllNetwatch();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('status'); // status, name, router, host

    // Filter entries
    const filteredEntries = netwatchEntries
        .filter(entry => {
            const matchesSearch = !searchQuery ||
                entry.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.host?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                entry.routerName?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'up' && entry.status === 'up') ||
                (statusFilter === 'down' && entry.status === 'down');

            return matchesSearch && matchesStatus;
        })
        // Sort entries
        .sort((a, b) => {
            switch (sortBy) {
                case 'status':
                    // Down first, then up, then unknown
                    const statusOrder = { down: 0, up: 1, unknown: 2 };
                    return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2);
                case 'name':
                    return (a.name || a.host || '').localeCompare(b.name || b.host || '');
                case 'router':
                    return (a.routerName || '').localeCompare(b.routerName || '');
                case 'host':
                    return (a.host || '').localeCompare(b.host || '');
                default:
                    return 0;
            }
        });

    const upCount = netwatchEntries.filter(e => e.status === 'up').length;
    const downCount = netwatchEntries.filter(e => e.status === 'down').length;
    const unknownCount = netwatchEntries.filter(e => e.status === 'unknown' || !e.status).length;

    const getStatusBadge = (status) => {
        switch (status) {
            case 'up':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Wifi className="w-3 h-3" /> Up
                </span>;
            case 'down':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                    <WifiOff className="w-3 h-3" /> Down
                </span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    <Clock className="w-3 h-3" /> Unknown
                </span>;
        }
    };

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
                            <Globe className="w-6 h-6 text-primary" />
                            Netwatch Monitor
                        </h1>
                        <p className="text-slate-400 text-sm">Monitor network reachability across all routers</p>
                    </div>
                    <Button onClick={() => refetch()} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <div className="text-2xl font-bold text-white">{netwatchEntries.length}</div>
                        <div className="text-xs text-slate-400">Total Hosts</div>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-emerald-400">{upCount}</div>
                        <div className="text-xs text-emerald-400/70">Online</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <div className="text-2xl font-bold text-red-400">{downCount}</div>
                        <div className="text-xs text-red-400/70">Offline</div>
                    </div>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                        <div className="text-2xl font-bold text-slate-400">{unknownCount}</div>
                        <div className="text-xs text-slate-500">Unknown</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-slate-800 flex gap-3 flex-wrap">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by name, host, or router..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                >
                    <option value="all">All Status</option>
                    <option value="up">Online Only</option>
                    <option value="down">Offline Only</option>
                </select>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                >
                    <option value="status">Sort: Status (Down First)</option>
                    <option value="name">Sort: Name A-Z</option>
                    <option value="router">Sort: Router A-Z</option>
                    <option value="host">Sort: Host/IP A-Z</option>
                </select>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {filteredEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <Globe className="w-6 h-6 text-slate-500" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">No netwatch entries found</h3>
                        <p className="text-slate-400">Add netwatch entries to your routers to monitor them here</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEntries.map((entry) => (
                            <Card key={entry.id} className={clsx(
                                "transition-colors",
                                entry.status === 'down' && "border-red-500/30",
                                entry.status === 'up' && "border-emerald-500/20"
                            )}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-medium text-white">{entry.name || entry.host}</h3>
                                            <p className="text-xs text-slate-500">{entry.host}</p>
                                        </div>
                                        {getStatusBadge(entry.status)}
                                    </div>

                                    <div className="space-y-1 text-xs text-slate-400">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Router:</span>
                                            <span>{entry.routerName}</span>
                                        </div>
                                        {entry.location && (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-3 h-3 text-slate-500" />
                                                <span>{entry.location}</span>
                                            </div>
                                        )}
                                        {entry.deviceType && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500">Type:</span>
                                                <span className="uppercase">{entry.deviceType}</span>
                                            </div>
                                        )}
                                        {(entry.latency !== undefined && entry.latency !== null) && (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-500">Latency:</span>
                                                    <span className={`font-mono font-bold ${Number(entry.latency) < 20 ? 'text-emerald-400' :
                                                        Number(entry.latency) < 100 ? 'text-yellow-400' : 'text-red-400'
                                                        }`}>
                                                        {entry.latency} ms
                                                    </span>
                                                </div>
                                                {entry.packetLoss > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-500">Packet Loss:</span>
                                                        <span className="font-mono font-bold text-red-400">
                                                            {entry.packetLoss}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
