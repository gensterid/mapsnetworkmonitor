import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Activity,
    RefreshCw,
    Eye,
    Plus,
    Trash2,
    Edit,
    CheckCircle,
    XCircle,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    Zap,
    History,
    MapPin,
    Globe,
    Clock,
    Search,
    ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import NetwatchFormModal from '../modals/NetwatchFormModal';
import { formatBits, formatLastSync, formatTimeOnly, formatRelativeTime, formatNetwatchDate } from '../router-utils';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function NetwatchTab({ routerId, netwatch = [], onRefresh }) {
    const [formModal, setFormModal] = useState({ open: false, netwatch: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, netwatch: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('status');

    const handleSuccess = () => {
        onRefresh();
        setFormModal({ open: false, netwatch: null });
    };

    const handleDelete = (nw) => {
        setDeleteModal({ open: true, netwatch: nw });
    };

    const confirmDelete = async (deleteFromMikrotik) => {
        setIsDeleting(true);
        try {
            await apiClient.delete(`/routers/${routerId}/netwatch/${deleteModal.netwatch.id}`, {
                params: { deleteFromMikrotik }
            });
            toast.success('Netwatch entry deleted');
            onRefresh();
            setDeleteModal({ open: false, netwatch: null });
        } catch (error) {
            console.error('Failed to delete netwatch:', error);
            toast.error(error.response?.data?.message || 'Failed to delete');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await apiClient.post(`/routers/${routerId}/netwatch/sync`);
            toast.success('Netwatch synced with router');
            onRefresh();
        } catch (error) {
            console.error('Failed to sync netwatch:', error);
            toast.error('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    // Filter, Search and Sort Logic
    const stats = {
        total: netwatch.length,
        up: netwatch.filter(n => n.status === 'up' && !n.disabled).length,
        down: netwatch.filter(n => n.status === 'down' && !n.disabled).length,
        disabled: netwatch.filter(n => n.disabled).length,
    };

    const getProcessedData = () => {
        let data = [...netwatch];

        // 1. Filter by Status
        if (filter !== 'all') {
            if (filter === 'up') data = data.filter(nw => nw.status === 'up' && !nw.disabled);
            else if (filter === 'down') data = data.filter(nw => nw.status === 'down' && !nw.disabled);
            else if (filter === 'disabled') data = data.filter(nw => nw.disabled);
        }

        // 2. Search by Host/Name
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            data = data.filter(nw =>
                (nw.host && nw.host.toLowerCase().includes(query)) ||
                (nw.name && nw.name.toLowerCase().includes(query)) ||
                (nw.comment && nw.comment.toLowerCase().includes(query))
            );
        }

        // 3. Sort
        data.sort((a, b) => {
            if (sortBy === 'status') {
                const statusOrder = { 'down': 0, 'up': 1, 'unknown': 2 };
                const aStatus = a.disabled ? 'unknown' : a.status;
                const bStatus = b.disabled ? 'unknown' : b.status;
                return statusOrder[aStatus] - statusOrder[bStatus];
            }
            if (sortBy === 'name') {
                const aName = (a.name || a.comment || '').toLowerCase();
                const bName = (b.name || b.comment || '').toLowerCase();
                return aName.localeCompare(bName);
            }
            if (sortBy === 'ip') {
                const ipToNum = (ip) => {
                    if (!ip) return 0;
                    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
                };
                return ipToNum(a.host) - ipToNum(b.host);
            }
            if (sortBy === 'loc') {
                const aLoc = (a.location || '').toLowerCase();
                const bLoc = (b.location || '').toLowerCase();
                return aLoc.localeCompare(bLoc);
            }
            return 0;
        });

        return data;
    };

    const filteredNetwatch = getProcessedData();

    return (
        <div className="space-y-4">
            {/* Header with Stats/Filters — sticky so filters + search stay visible while scrolling */}
            <div className="sticky top-0 z-30 -mx-1 px-1 py-2 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/40 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Button
                        variant={filter === 'all' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('all')}
                        className="h-8 px-4 gap-2 border border-slate-700/50 bg-slate-900/40 text-[11px] font-bold"
                    >
                        <span>TOTAL: {stats.total}</span>
                    </Button>
                    <Button
                        variant={filter === 'up' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('up')}
                        className={clsx(
                            "h-8 px-4 gap-2 border border-slate-700/50 text-[11px] font-bold",
                            filter === 'up' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/20' : 'text-emerald-500 hover:bg-emerald-500/10'
                        )}
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>{stats.up} UP</span>
                    </Button>
                    <Button
                        variant={filter === 'down' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('down')}
                        className={clsx(
                            "h-8 px-4 gap-2 border border-slate-700/50 text-[11px] font-bold",
                            filter === 'down' ? 'bg-red-600/20 text-red-500 border-red-500/20' : 'text-red-500 hover:bg-red-500/10'
                        )}
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>{stats.down} DOWN</span>
                    </Button>
                    <Button
                        variant={filter === 'disabled' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('disabled')}
                        className={clsx(
                            "h-8 px-4 gap-2 border border-slate-700/50 text-[11px] font-bold",
                            filter === 'disabled' ? 'bg-slate-700/40 text-slate-300' : 'text-slate-400 hover:bg-slate-700/20'
                        )}
                    >
                        <span>{stats.disabled} DISABLED</span>
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Search Box */}
                    <div className="relative flex-1 sm:flex-none sm:min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search host, name..."
                            className="w-full h-9 pl-9 pr-4 bg-slate-900/40 border border-slate-700/50 rounded-md text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative flex-1 sm:flex-none min-w-[100px]">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full h-9 pl-3 pr-8 bg-slate-900/40 border border-slate-700/50 rounded-md text-[11px] text-slate-200 font-bold appearance-none cursor-pointer focus:outline-none focus:border-primary/50 transition-colors"
                        >
                            <option value="status">Status</option>
                            <option value="name">Name</option>
                            <option value="ip">IP</option>
                            <option value="loc">Loc</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="text-slate-400 hover:text-white border border-slate-700/50 h-9 px-3"
                    >
                        <RefreshCw className={clsx("w-3.5 h-3.5 mr-2", isSyncing && "animate-spin")} />
                        Sync
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setFormModal({ open: true, netwatch: null })}
                        className="flex-1 sm:flex-none h-9 px-4 bg-primary hover:bg-primary/90 text-white font-bold"
                    >
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        Add Host
                    </Button>
                </div>
            </div>

            <Card className="glass-panel border-slate-800/50 overflow-hidden bg-[#0a0c10]/80">
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                        <thead className="sticky top-[68px] z-20 bg-[#0f1218] shadow-[0_1px_0_rgba(148,163,184,0.12)]">
                            <tr className="border-b border-slate-800">
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">HOST</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">NAME</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">STATUS</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">SINCE</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">LOCATION</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">LATENCY</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">TRAFFIC (IN/OUT)</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">COORDS</th>
                                <th className="text-left py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">LAST CHECK</th>
                                <th className="text-right py-3 px-4 text-slate-500 uppercase font-bold tracking-wider bg-[#0f1218]">ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {filteredNetwatch.length > 0 ? (
                                filteredNetwatch.map((nw) => (
                                    <tr key={nw.id} className={clsx(
                                        "group transition-all duration-150",
                                        nw.disabled ? "bg-slate-900/40 opacity-50" : "hover:bg-slate-800/30"
                                    )}>
                                        <td className="py-2.5 px-4 font-mono text-slate-300">
                                            {nw.host}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="text-slate-400 font-medium max-w-[150px] truncate">
                                                {nw.name || nw.comment || '-'}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex items-center gap-2">
                                                {nw.disabled ? (
                                                    <div className="flex items-center gap-1.5 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                                                        <XCircle className="w-3 h-3" />
                                                        Disabled
                                                    </div>
                                                ) : nw.status === 'up' ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-500/80 font-bold uppercase tracking-wider text-[10px] border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                                        <CheckCircle className="w-3 h-3" />
                                                        Up
                                                    </div>
                                                ) : nw.status === 'down' ? (
                                                    <div className="flex items-center gap-1.5 text-red-500/80 font-bold uppercase tracking-wider text-[10px] border border-red-500/20 px-1.5 py-0.5 rounded-md">
                                                        <XCircle className="w-3 h-3" />
                                                        Down
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                                        <RefreshCw className="w-3 h-3" />
                                                        Unk
                                                    </div>
                                                )}
                                                {nw.hasWebhook && (
                                                    <div className="flex items-center gap-1 bg-[#facc15] text-[#1e1b4b] px-2 py-0.5 rounded-full shadow-sm" title="Real-time Webhook Active">
                                                        <Zap className="w-2.5 h-2.5 fill-[#1e1b4b]" />
                                                        <span className="text-[8px] font-black uppercase tracking-tight">REAL-TIME</span>
                                                    </div>
                                                )}
                                                {nw.isAppOnly && (
                                                    <div className="flex items-center gap-1 bg-indigo-950/60 text-indigo-400 px-2.5 py-0.5 rounded-full border border-indigo-500/20" title="Monitored via App Server">
                                                        <span className="text-[8px] font-bold uppercase tracking-wider">App Only</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 font-bold whitespace-nowrap">
                                                    {formatNetwatchDate(nw.lastUp || nw.lastDown)}
                                                </span>
                                                <span className={clsx(
                                                    "text-[9px] font-medium",
                                                    nw.status === 'up' ? "text-emerald-500/70" : "text-red-500/70"
                                                )}>
                                                    ({formatRelativeTime(nw.lastUp || nw.lastDown)})
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-500">
                                            {nw.location || '-'}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            {nw.latency ? (
                                                <div className={clsx(
                                                    "font-bold text-[10px]",
                                                    nw.latency > 100 ? "text-red-500" : "text-emerald-500"
                                                )}>
                                                    {Math.round(nw.latency)} ms
                                                </div>
                                            ) : (
                                                <span className="text-slate-700">--</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            {nw.txRate !== undefined && !nw.disabled ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                                        <TrendingDown className="w-3 h-3 opacity-70" />
                                                        ~ {formatBits(nw.rxRate)}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-blue-400 font-bold">
                                                        <TrendingUp className="w-3 h-3 opacity-70" />
                                                        ~ {formatBits(nw.txRate)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-700">-</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-500">
                                            {nw.latitude && nw.longitude ? (
                                                <div className="flex items-center gap-1 group/coords cursor-help">
                                                    <Globe className="w-3 h-3 text-slate-600" />
                                                    {parseFloat(nw.latitude).toFixed(3)}, {parseFloat(nw.longitude).toFixed(3)}
                                                </div>
                                            ) : (
                                                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] text-slate-600 hover:text-primary gap-1">
                                                    <MapPin className="w-3 h-3" /> Set
                                                </Button>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4 text-slate-300 font-medium">
                                            {formatTimeOnly(nw.lastCheck)}
                                        </td>
                                        <td className="py-2.5 px-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-500 hover:text-white hover:bg-slate-700/50"
                                                    onClick={() => setFormModal({ open: true, netwatch: nw })}
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-500 hover:text-red-500 hover:bg-red-500/10"
                                                    onClick={() => handleDelete(nw)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={10} className="py-20 text-center">
                                        <div className="flex flex-col items-center">
                                            <Eye className="w-12 h-12 text-slate-800 mb-2 opacity-10" />
                                            <p className="text-slate-600 font-medium">No Netwatch entries found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <NetwatchFormModal
                isOpen={formModal.open}
                onClose={() => setFormModal({ open: false, netwatch: null })}
                onSuccess={handleSuccess}
                netwatch={formModal.netwatch}
                routerId={routerId}
            />

            <DeleteConfirmationModal
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, netwatch: null })}
                onConfirm={confirmDelete}
                title="Delete Netwatch Host"
                message={`Are you sure you want to delete ${deleteModal.netwatch?.host}?`}
                isDeleting={isDeleting}
                showMikrotikOption={true}
            />
        </div>
    );
}

export default NetwatchTab;
