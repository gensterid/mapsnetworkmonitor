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
    AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import NetwatchFormModal from '../modals/NetwatchFormModal';
import { formatBits } from '../router-utils';
import { apiClient } from '@/lib/api';
import toast from 'react-hot-toast';

function NetwatchTab({ routerId, netwatch = [], onRefresh }) {
    const [formModal, setFormModal] = useState({ open: false, netwatch: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, netwatch: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

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
            await apiClient.post(`/routers/${routerId}/sync-netwatch`);
            toast.success('Netwatch synced with router');
            onRefresh();
        } catch (error) {
            console.error('Failed to sync netwatch:', error);
            toast.error('Sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Eye className="w-5 h-5 text-primary" />
                        Netwatch Monitoring
                    </h2>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                        {netwatch.length} Hosts
                    </span>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="text-slate-400 hover:text-white"
                    >
                        <RefreshCw className={clsx("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                        Sync from Router
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setFormModal({ open: true, netwatch: null })}
                        className="flex-1 sm:flex-none"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Host
                    </Button>
                </div>
            </div>

            <Card className="glass-panel overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-800/50">
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Status</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Host / Name</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Interval</th>
                                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Traffic (Selected)</th>
                                <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {netwatch.length > 0 ? (
                                netwatch.map((nw) => (
                                    <tr key={nw.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {nw.status === 'up' ? (
                                                    <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                                        <CheckCircle className="w-3 h-3" />
                                                        UP
                                                    </div>
                                                ) : nw.status === 'down' ? (
                                                    <div className="flex items-center gap-1.5 text-red-500 bg-red-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-red-500/20">
                                                        <XCircle className="w-3 h-3" />
                                                        DOWN
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-slate-500 bg-slate-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                                        <RefreshCw className="w-3 h-3" />
                                                        UNK
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div>
                                                <div className="text-white font-medium">{nw.comment || nw.host}</div>
                                                <div className="text-[10px] text-slate-500 font-mono">{nw.host}</div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-400 font-mono text-xs">
                                            {nw.interval} / {nw.timeout}
                                        </td>
                                        <td className="py-3 px-4">
                                            {nw.txRate !== undefined ? (
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-1 text-green-400 font-mono text-xs">
                                                        <TrendingUp className="w-3 h-3" />
                                                        {formatBits(nw.txRate)}
                                                    </div>
                                                    <div className="flex items-center gap-1 text-blue-400 font-mono text-xs">
                                                        <TrendingDown className="w-3 h-3" />
                                                        {formatBits(nw.rxRate)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 text-[10px]">No Interface Selected</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-white"
                                                    onClick={() => setFormModal({ open: true, netwatch: nw })}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-400"
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
                                    <td colSpan={5} className="py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <Eye className="w-12 h-12 text-slate-700 mb-2 opacity-20" />
                                            <p className="text-slate-500">No Netwatch entries found</p>
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
