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
    Clock
} from 'lucide-react';
import clsx from 'clsx';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import NetwatchFormModal from '../modals/NetwatchFormModal';
import { formatBits, formatLastSync } from '../router-utils';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function NetwatchTab({ routerId, netwatch = [], onRefresh }) {
    const [formModal, setFormModal] = useState({ open: false, netwatch: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, netwatch: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [filter, setFilter] = useState('all');

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

    // Filter Logic
    const stats = {
        total: netwatch.length,
        up: netwatch.filter(n => n.status === 'up' && !n.disabled).length,
        down: netwatch.filter(n => n.status === 'down' && !n.disabled).length,
        disabled: netwatch.filter(n => n.disabled).length,
    };

    const filteredNetwatch = netwatch.filter(nw => {
        if (filter === 'all') return true;
        if (filter === 'up') return nw.status === 'up' && !nw.disabled;
        if (filter === 'down') return nw.status === 'down' && !nw.disabled;
        if (filter === 'disabled') return nw.disabled;
        return true;
    });

    return (
        <div className="space-y-4">
            {/* Header with Stats/Filters */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={filter === 'all' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('all')}
                        className="h-9 px-4 gap-2 border border-slate-700/50"
                    >
                        <Activity className="w-4 h-4" />
                        <span>Total</span>
                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-bold">{stats.total}</span>
                    </Button>
                    <Button
                        variant={filter === 'up' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('up')}
                        className={clsx("h-9 px-4 gap-2 border border-slate-700/50", filter === 'up' ? 'bg-emerald-600 hover:bg-emerald-700' : 'text-emerald-500 hover:bg-emerald-500/10')}
                    >
                        <CheckCircle className="w-4 h-4" />
                        <span>Up</span>
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{stats.up}</span>
                    </Button>
                    <Button
                        variant={filter === 'down' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('down')}
                        className={clsx("h-9 px-4 gap-2 border border-slate-700/50", filter === 'down' ? 'bg-red-600 hover:bg-red-700' : 'text-red-500 hover:bg-red-500/10')}
                    >
                        <XCircle className="w-4 h-4" />
                        <span>Down</span>
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{stats.down}</span>
                    </Button>
                    <Button
                        variant={filter === 'disabled' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setFilter('disabled')}
                        className="h-9 px-4 gap-2 border border-slate-700/50 text-slate-400"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Disabled</span>
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-bold">{stats.disabled}</span>
                    </Button>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="text-slate-400 hover:text-white border border-slate-700/50"
                    >
                        <RefreshCw className={clsx("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                        Sync from Router
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setFormModal({ open: true, netwatch: null })}
                        className="flex-1 sm:flex-none shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Host
                    </Button>
                </div>
            </div>

            <Card className="glass-panel border-slate-800/50 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-800/80 backdrop-blur-md">
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Host / Name</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Since</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Latency</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Traffic</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Location</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Coords</th>
                                <th className="text-left py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last Check</th>
                                <th className="text-right py-3.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredNetwatch.length > 0 ? (
                                filteredNetwatch.map((nw) => (
                                    <tr key={nw.id} className={clsx(
                                        "group transition-all duration-200",
                                        nw.disabled ? "bg-slate-900/40 opacity-60" : "hover:bg-slate-800/40"
                                    )}>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {nw.disabled ? (
                                                    <div className="flex items-center gap-1.5 text-slate-500 bg-slate-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-slate-500/20">
                                                        DISABLED
                                                    </div>
                                                ) : nw.status === 'up' ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                                                        <CheckCircle className="w-3 h-3 animate-pulse-slow" />
                                                        UP
                                                    </div>
                                                ) : nw.status === 'down' ? (
                                                    <div className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-red-500/20 shadow-sm shadow-red-500/10">
                                                        <XCircle className="w-3 h-3" />
                                                        DOWN
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-slate-500 bg-slate-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                                        <RefreshCw className="w-3 h-3" />
                                                        UNK
                                                    </div>
                                                )}
                                                {nw.hasWebhook && (
                                                    <div className="flex items-center gap-1 text-primary animate-pulse" title="Real-time Webhook Active">
                                                        <Zap className="w-3.5 h-3.5 fill-primary/20" />
                                                        <span className="text-[9px] font-black uppercase tracking-tighter">LIVE</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="max-w-[200px]">
                                                <div className="text-white font-semibold truncate group-hover:text-primary transition-colors">{nw.name || nw.host}</div>
                                                <div className="text-[10px] text-slate-500 font-mono truncate">{nw.host}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2 text-slate-300">
                                                <History className="w-3.5 h-3.5 text-slate-500" />
                                                <span className="text-xs font-medium">
                                                    {nw.status === 'up' ? formatLastSync(nw.lastUp) : formatLastSync(nw.lastDown)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            {nw.latency ? (
                                                <div className={clsx(
                                                    "font-mono text-xs font-bold px-2 py-0.5 rounded inline-flex items-center gap-1",
                                                    nw.latency > 100 ? "text-amber-500 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10"
                                                )}>
                                                    <Activity className="w-3 h-3" />
                                                    {Math.round(nw.latency)}ms
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 text-[10px]">--</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {nw.txRate !== undefined && nw.txRate > 0 ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-1 text-green-400 font-mono text-[10px] font-bold">
                                                        <TrendingUp className="w-3 h-3" />
                                                        {formatBits(nw.txRate)}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-blue-400 font-mono text-[10px] font-bold">
                                                        <TrendingDown className="w-3 h-3" />
                                                        {formatBits(nw.rxRate)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 text-[10px]">Silent</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2 text-slate-400 min-w-[80px]">
                                                <MapPin className="w-3.5 h-3.5" />
                                                <span className="text-xs truncate max-w-[120px]">{nw.location || 'Not set'}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            {nw.latitude && nw.longitude ? (
                                                <div className="flex items-center gap-1 text-slate-500 font-mono text-[10px] hover:text-primary transition-colors cursor-help" title={`${nw.latitude}, ${nw.longitude}`}>
                                                    <Globe className="w-3 h-3" />
                                                    {parseFloat(nw.latitude).toFixed(3)}, {parseFloat(nw.longitude).toFixed(3)}
                                                </div>
                                            ) : (
                                                <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] text-slate-600 hover:text-primary gap-1">
                                                    <Plus className="w-3 h-3" /> SET
                                                </Button>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px]">
                                                <Clock className="w-3 h-3" />
                                                {formatLastSync(nw.lastCheck)}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700/50"
                                                    onClick={() => setFormModal({ open: true, netwatch: nw })}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                                    onClick={() => handleDelete(nw)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="py-20 text-center">
                                        <div className="flex flex-col items-center">
                                            <Eye className="w-16 h-16 text-slate-800 mb-4 opacity-10" />
                                            <p className="text-slate-500 font-medium">No Netwatch entries found for this filter</p>
                                            <Button variant="link" size="sm" onClick={() => setFilter('all')} className="text-primary mt-2">
                                                Clear all filters
                                            </Button>
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
