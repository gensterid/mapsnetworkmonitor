import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Network,
    ShieldCheck,
    RefreshCw,
    Plus,
    Search,
    AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { useRouterNeighbors, useRouterRomonNeighbors, useRouter } from '@/hooks';
import CreateRomonRouterModal from '../modals/CreateRomonRouterModal';

function NeighborsTab({ routerId }) {
    const { data: neighbors = [], isLoading: loadingMndp, isRefetching: refetchingMndp, refetch: refetchMndp } = useRouterNeighbors(routerId);
    const { data: romonNeighbors = [], isLoading: loadingRomon, isRefetching: refetchingRomon, refetch: refetchRomon } = useRouterRomonNeighbors(routerId);

    const [searchQuery, setSearchQuery] = useState('');
    const [subTab, setSubTab] = useState('mndp'); // 'mndp' or 'romon'
    const [addModal, setAddModal] = useState({ open: false, romonId: '' });

    const { data: router } = useRouter(routerId);

    const isLoading = loadingMndp || loadingRomon;
    const isRefetching = refetchingMndp || refetchingRomon;

    const filteredMndp = neighbors.filter(n =>
        !searchQuery ||
        n.identity?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.macAddress?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.model?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRomon = romonNeighbors.filter(n =>
        !searchQuery ||
        n.romonId?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleRefetch = () => {
        refetchMndp();
        refetchRomon();
    };

    if (isLoading && neighbors.length === 0 && romonNeighbors.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSubTab('mndp')}
                        className={clsx(
                            "text-lg font-semibold flex items-center gap-2 transition-colors",
                            subTab === 'mndp' ? "text-white" : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        <Network className="w-5 h-5 text-primary" />
                        MNDP
                        <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                            {neighbors.length}
                        </span>
                    </button>
                    <div className="w-px h-6 bg-slate-700 mx-1" />
                    <button
                        onClick={() => setSubTab('romon')}
                        className={clsx(
                            "text-lg font-semibold flex items-center gap-2 transition-colors",
                            subTab === 'romon' ? "text-white" : "text-slate-500 hover:text-slate-300"
                        )}
                    >
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        RoMON
                        <span className="text-xs bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                            {romonNeighbors.length}
                        </span>
                    </button>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <Button onClick={handleRefetch} variant="outline" size="sm" disabled={isRefetching}>
                        <RefreshCw className={clsx("w-4 h-4", isRefetching && "animate-spin")} />
                    </Button>
                </div>
            </div>

            <Card className="glass-panel overflow-hidden">
                <div className="max-h-[calc(100vh-280px)] min-h-[400px] overflow-auto custom-scrollbar">
                    {subTab === 'mndp' ? (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-slate-800">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Identity</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">IP Address</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">MAC Address</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Model / Version</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Interface</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Uptime</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filteredMndp.length > 0 ? filteredMndp.map((n, i) => (
                                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="text-white font-medium">{n.identity || 'Unknown'}</div>
                                        </td>
                                        <td className="py-3 px-4 font-mono text-slate-300">{n.address || '-'}</td>
                                        <td className="py-3 px-4 font-mono text-slate-300">{n.macAddress || '-'}</td>
                                        <td className="py-3 px-4">
                                            <div className="text-slate-300">{n.model || '-'}</div>
                                            <div className="text-[10px] text-slate-500">{n.version || '-'}</div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-400">{n.interface || '-'}</td>
                                        <td className="py-3 px-4 text-slate-400">{n.uptime || '-'}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center text-slate-500">
                                            No MNDP neighbors discovered
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-slate-800">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Identity / RoMON ID</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Path</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Board / Version</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">MTU</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase bg-slate-900/98 backdrop-blur-sm">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filteredRomon.length > 0 ? filteredRomon.map((n, i) => (
                                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="text-white font-medium">{n.identity || 'Unknown'}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{n.romonId || '-'}</div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-300 font-mono text-xs">{n.path || '-'}</td>
                                        <td className="py-3 px-4">
                                            <div className="text-slate-300">{n.board || '-'}</div>
                                            <div className="text-[10px] text-slate-500">{n.version || '-'}</div>
                                        </td>
                                        <td className="py-3 px-4 text-slate-400">{n.mtu || '-'}</td>
                                        <td className="py-3 px-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs gap-2"
                                                onClick={() => setAddModal({ open: true, romonId: n.romonId })}
                                            >
                                                <Plus className="w-3 h-3 text-primary" />
                                                Add to Monitor
                                            </Button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center">
                                            <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-20" />
                                            <p className="text-slate-500">No RoMON neighbors discovered</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/70 leading-relaxed">
                    {subTab === 'mndp' ? (
                        <>Neighbor discovery (MNDP) allows you to see other MikroTik devices on the same physical network.</>
                    ) : (
                        <>RoMON neighbors are MikroTik devices that have RoMON enabled and are reachable through the RoMON network.</>
                    )}
                </div>
            </div>

            <CreateRomonRouterModal
                isOpen={addModal.open}
                onClose={() => setAddModal({ open: false, romonId: '' })}
                onSuccess={() => {
                    setAddModal({ open: false, romonId: '' });
                }}
                gateway={router}
                romonId={addModal.romonId}
            />
        </div>
    );
}

export default NeighborsTab;
