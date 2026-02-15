import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    useOlt,
    useOltOnus,
    useRefreshOlt
} from '@/hooks';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
    ArrowLeft,
    Server,
    RefreshCw,
    Activity,
    Layers,
    CheckCircle,
    XCircle,
    Zap,
    Search,
    AlertCircle,
    Info,
    Database,
    Clock,
    Shield
} from 'lucide-react';
import clsx from 'clsx';

// Stats Card Component
function StatsCard({ icon: Icon, label, value, color = "blue", subValue }) {
    const colorClasses = {
        blue: "bg-blue-500/10 text-blue-400",
        emerald: "bg-emerald-500/10 text-emerald-400",
        amber: "bg-amber-500/10 text-amber-400",
        orange: "bg-orange-500/10 text-orange-400",
        red: "bg-red-500/10 text-red-400",
        slate: "bg-slate-500/10 text-slate-400",
    };

    return (
        <Card className="glass-panel h-full">
            <CardContent className="!p-4 h-full flex items-center">
                <div className="flex items-center gap-3 w-full">
                    <div className={clsx("p-2.5 rounded-lg", colorClasses[color])}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-xl font-semibold text-white truncate">{value}</p>
                        {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function OltDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: olt, isLoading: isLoadingOlt, error: oltError } = useOlt(id);
    const { data: onus = [], isLoading: isLoadingOnus, error: onusError, refetch: refetchOnus } = useOltOnus(id);
    const refreshMutation = useRefreshOlt();
    const [searchTerm, setSearchTerm] = useState('');

    const handleRefresh = async () => {
        try {
            await refreshMutation.mutateAsync(id);
            refetchOnus();
        } catch (error) {
            // Error toast handled by hook
        }
    };

    // Calculate ONU stats
    const stats = useMemo(() => {
        if (!Array.isArray(onus)) return { online: 0, offline: 0, powerDown: 0, opticalLoss: 0, total: 0 };

        return onus.reduce((acc, onu) => {
            acc.total++;
            if (onu.status === 'online') {
                acc.online++;
            } else {
                acc.offline++;
                if (onu.lastDownReason === 'Power Down') acc.powerDown++;
                if (onu.lastDownReason === 'Optical Loss') acc.opticalLoss++;
            }
            return acc;
        }, { online: 0, offline: 0, powerDown: 0, opticalLoss: 0, total: 0 });
    }, [onus]);

    // Filtered ONUs
    const filteredOnus = useMemo(() => {
        if (!Array.isArray(onus)) return [];
        return onus.filter(onu =>
            onu.sn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            onu.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            onu.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            onu.onuId?.includes(searchTerm) ||
            onu.ponId?.includes(searchTerm)
        );
    }, [onus, searchTerm]);

    if (isLoadingOlt) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-slate-400">Loading OLT details...</p>
                </div>
            </div>
        );
    }

    if (oltError || !olt) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
                <Card className="max-w-md w-full glass-panel border-red-500/20">
                    <CardContent className="pt-6 text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">OLT Not Found</h2>
                        <p className="text-slate-400 mb-6">The OLT you're looking for doesn't exist or you don't have permission to view it.</p>
                        <Button onClick={() => navigate('/olts')}>
                            Back to OLT List
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/olts" className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-white">{olt.name}</h1>
                            <span className={clsx(
                                "px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider",
                                olt.status === 'online' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                            )}>
                                {olt.status}
                            </span>
                        </div>
                        <p className="text-sm text-slate-400">{olt.host} • {olt.type || 'Generic'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={refreshMutation.isPending || isLoadingOnus}
                    >
                        <RefreshCw className={clsx("w-4 h-4 mr-2", (refreshMutation.isPending || isLoadingOnus) && "animate-spin")} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatsCard
                    icon={Layers}
                    label="Total ONUs"
                    value={stats.total}
                    color="blue"
                />
                <StatsCard
                    icon={CheckCircle}
                    label="Online"
                    value={stats.online}
                    color="emerald"
                    subValue={`${((stats.online / stats.total) * 100 || 0).toFixed(1)}% availability`}
                />
                <StatsCard
                    icon={XCircle}
                    label="Offline"
                    value={stats.offline}
                    color="red"
                />
                <StatsCard
                    icon={Zap}
                    label="Power Down"
                    value={stats.powerDown}
                    color="amber"
                    subValue="Dying Gasp detected"
                />
                <StatsCard
                    icon={Activity}
                    label="Optical Loss"
                    value={stats.opticalLoss}
                    color="orange"
                    subValue="LOS detected"
                />
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* OLT Info Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    <Card className="glass-panel">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Info className="w-4 h-4 text-primary" />
                                Device Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-sm text-slate-400">Host / IP</span>
                                <span className="text-sm text-white font-mono">{olt.host}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-sm text-slate-400">Type</span>
                                <span className="text-sm text-white capitalize">{olt.type || 'Generic'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-sm text-slate-400">Uptime</span>
                                <span className="text-sm text-white">
                                    {olt.uptime ? `${Math.floor(olt.uptime / 3600)}h ${Math.floor((olt.uptime % 3600) / 60)}m` : '--'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-800">
                                <span className="text-sm text-slate-400">Last Synced</span>
                                <span className="text-sm text-white">
                                    {olt.updatedAt ? new Date(olt.updatedAt).toLocaleTimeString() : 'Never'}
                                </span>
                            </div>

                            <div className="pt-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Protocol Health</p>
                                <div className="space-y-3">
                                    {olt.useSnmp && (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Database className="w-4 h-4 text-blue-400" />
                                                <span className="text-sm text-slate-300">SNMP (Port {olt.snmpPort})</span>
                                            </div>
                                            <span className={clsx(
                                                "text-xs px-1.5 py-0.5 rounded",
                                                olt.lastSnmpStatus === 'online' ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                                            )}>
                                                {olt.lastSnmpStatus || 'unchecked'}
                                            </span>
                                        </div>
                                    )}
                                    {olt.useWeb && (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Shield className="w-4 h-4 text-purple-400" />
                                                <span className="text-sm text-slate-300">Web/API ({olt.webProtocol})</span>
                                            </div>
                                            <span className={clsx(
                                                "text-xs px-1.5 py-0.5 rounded",
                                                olt.lastWebStatus === 'online' ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                                            )}>
                                                {olt.lastWebStatus || 'unchecked'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {olt.description && (
                                <div className="pt-4 mt-4 border-t border-slate-800">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notes / Description</p>
                                    <p className="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                        {olt.description}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ONU List Table Area */}
                <div className="xl:col-span-2 space-y-6">
                    <Card className="glass-panel overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Layers className="w-4 h-4 text-primary" />
                                ONU Table
                            </CardTitle>
                            <div className="relative w-full max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Search by SN, Name, ID..."
                                    className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="!p-0">
                            {isLoadingOnus ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <RefreshCw className="w-8 h-8 animate-spin text-primary/50" />
                                    <p className="text-sm text-slate-500">Fetching ONU data from device...</p>
                                </div>
                            ) : onusError ? (
                                <div className="py-12 px-6 text-center">
                                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3 opacity-50" />
                                    <p className="text-slate-400 text-sm mb-4">Failed to fetch ONUs from the driver.</p>
                                    <p className="text-xs text-slate-600 font-mono mb-4 break-all max-w-md mx-auto">{onusError.message}</p>
                                    <Button size="sm" variant="outline" onClick={() => refetchOnus()}>
                                        Retry Connection
                                    </Button>
                                </div>
                            ) : filteredOnus.length === 0 ? (
                                <div className="py-20 text-center text-slate-500">
                                    {searchTerm ? `No matches found for "${searchTerm}"` : 'No ONUs discovered on this device.'}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-900/50 border-b border-slate-800">
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">PON / ID</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">SN / Alias</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Down</th>
                                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Signal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {filteredOnus.map((onu, index) => (
                                                <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-white">{onu.ponId}-{onu.onuId}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm text-white font-mono">{onu.sn}</span>
                                                            {onu.name && <span className="text-[10px] text-slate-300 font-medium">{onu.name}</span>}
                                                            {onu.description && onu.description !== onu.name && (
                                                                <span className="text-[10px] text-slate-500 italic">{onu.description}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={clsx(
                                                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                            onu.status === 'online' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                                        )}>
                                                            {onu.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        {onu.lastDownReason ? (
                                                            <span className={clsx(
                                                                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                                                                onu.lastDownReason === 'Power Down' ? "bg-amber-500/10 text-amber-500" :
                                                                    onu.lastDownReason === 'Optical Loss' ? "bg-orange-500/10 text-orange-500" :
                                                                        "bg-slate-800 text-slate-400"
                                                            )}>
                                                                {onu.lastDownReason}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <div className="flex flex-col text-xs">
                                                            <span className="text-slate-300">{onu.lastDownTime || '-'}</span>
                                                            {onu.status === 'online' && onu.lastUpTime && (
                                                                <span className="text-slate-500 text-[9px]">Up: {onu.lastUpTime}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                                        <span className={clsx(
                                                            "text-sm font-mono font-medium",
                                                            onu.status === 'online' ? "text-blue-400" : "text-slate-600"
                                                        )}>
                                                            {onu.signal || '--'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
