import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    useOlt,
    useOltOnus,
    useRefreshOlt,
    useUpdateOnu,
    useRouterNetwatch,
    useRebootOnu,
    useArchiveOnu,
    useAppTimezone
} from '@/hooks';
import { formatRelativeTime, formatShortDateTime } from '@/lib/timezone';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatsCard } from '@/components/ui/StatsCard';
import { Badge } from '@/components/ui/Badge';
import {
    ArrowLeft,
    RefreshCw,
    Activity,
    Layers,
    CheckCircle,
    XCircle,
    Zap,
    AlertCircle,
    Info,
    Database,
    Clock,
    Shield
} from 'lucide-react';
import clsx from 'clsx';

// Components
import OnuTable from './olt/components/OnuTable';
import EditOnuModal from './olt/components/EditOnuModal';
import RebootOnuModal from './olt/components/RebootOnuModal';
import MoveOltModal from './olt/components/MoveOltModal';

// Helper to format date to local string or relative time
function formatLastSync(date) {
    if (!date) return '--';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--';

    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return formatShortDateTime(date);
}

export default function OltDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const timezone = useAppTimezone();
    const { data: olt, isLoading: isLoadingOlt, error: oltError } = useOlt(id);
    const { data: onus = [], isLoading: isLoadingOnus, error: onusError, refetch: refetchOnus } = useOltOnus(id);
    const { data: netwatchEntries = [] } = useRouterNetwatch(olt?.parentId, { enabled: !!olt?.parentId });

    const refreshMutation = useRefreshOlt();
    const updateOnuMutation = useUpdateOnu();
    const rebootOnuMutation = useRebootOnu();
    const archiveOnuMutation = useArchiveOnu();

    const [searchTerm, setSearchTerm] = useState('');
    const [editingOnu, setEditingOnu] = useState(null);
    const [rebootingOnu, setRebootingOnu] = useState(null);
    const [movingOnu, setMovingOnu] = useState(null);

    const handleArchiveOnu = (onu) => {
        const confirmed = window.confirm(
            `Hapus ONU "${onu.name || onu.sn}" dari aplikasi?\n\n` +
            `ONU akan disembunyikan dari peta. Data koordinat tetap tersimpan dan akan otomatis kembali jika ONU muncul lagi di polling OLT. ` +
            `Setelah 60 hari tidak muncul, data akan dihapus permanen.`
        );
        if (!confirmed) return;
        archiveOnuMutation.mutate({ id, onuId: onu.id });
    };

    // Create a lookup for netwatch by SN/Host to identify linked devices
    const netwatchLookup = useMemo(() => {
        const map = new Map();
        (netwatchEntries || []).forEach(entry => {
            if (entry.sn) map.set(entry.sn, entry);
            if (entry.host) map.set(entry.host, entry);
        });
        return map;
    }, [netwatchEntries]);

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

    const handleUpdateOnu = (data) => {
        updateOnuMutation.mutate({
            id: id, // OLT ID
            onuId: editingOnu.id,
            data
        }, {
            onSuccess: () => setEditingOnu(null)
        });
    };

    const handleRebootOnu = async () => {
        if (!rebootingOnu) return;
        try {
            await rebootOnuMutation.mutateAsync({
                id: id,
                onuId: rebootingOnu.onuId,
                ponId: rebootingOnu.ponId
            });
            setRebootingOnu(null);
        } catch (e) {
            // Error managed by hook
        }
    };

    if (isLoadingOlt) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-darker">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                        <Activity className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-fg uppercase tracking-widest">Loading OLT</p>
                        <p className="text-[10px] text-fg-muted uppercase tracking-tight">Synchronizing data...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (oltError || !olt) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-darker p-6">
                <Card className="max-w-md w-full glass-panel border-red-500/20 bg-surface-dark/60 backdrop-blur-xl transition-all hover:scale-[1.01] duration-500">
                    <CardContent className="pt-8 text-center px-8">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-xl font-bold text-fg mb-2 uppercase tracking-tight">OLT Access Failed</h2>
                        <p className="text-fg-muted text-sm mb-8 leading-relaxed">The OLT you're looking for doesn't exist or has been disconnected from the network infrastructure.</p>
                        <Button 
                            onClick={() => navigate('/olts')}
                            className="w-full bg-slate-surface hover:bg-slate-700 text-fg font-bold py-6 rounded-xl transition-all shadow-lg"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Return to OLT List
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-surface-dark/40 p-6 rounded-2xl border border-slate-border/50 backdrop-blur-md shadow-2xl">
                <div className="flex items-center gap-5">
                    <Link to="/olts" className="p-3 bg-surface-darker/50 border border-slate-border hover:bg-slate-surface rounded-xl transition-all group shadow-inner">
                        <ArrowLeft className="w-5 h-5 text-fg-muted group-hover:text-fg transition-colors" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-fg tracking-tight break-all leading-tight">{olt.name}</h1>
                            <Badge variant={olt.status === 'online' ? 'success' : 'destructive'} size="md" className="font-black px-4 animate-pulse">
                                {olt.status}
                            </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-[10px] font-black uppercase tracking-[0.1em] text-fg-muted">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-darker/50 border border-slate-border rounded-md">
                                <span className="text-fg font-mono">{olt.host}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-darker/50 border border-slate-border rounded-md">
                                <span className={clsx("text-primary")}>{olt.type || 'Generic'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-fg-muted">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Sync: {formatLastSync(olt.updatedAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="md"
                        onClick={handleRefresh}
                        disabled={refreshMutation.isPending || isLoadingOnus}
                        className="bg-surface-darker/50 border-slate-border hover:bg-slate-surface text-fg font-black uppercase tracking-widest text-[10px] h-11 px-6 rounded-xl transition-all shadow-lg hover:border-primary/50 group"
                    >
                        <RefreshCw className={clsx("w-4 h-4 mr-2 transition-all", (refreshMutation.isPending || isLoadingOnus) ? "animate-spin" : "group-hover:rotate-180")} />
                        Refresh Drive
                    </Button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <StatsCard
                    icon={Layers}
                    label="Total Discovery"
                    value={stats.total}
                    color="blue"
                    className="shadow-xl shadow-blue-900/5 hover:scale-[1.02] transition-transform"
                />
                <StatsCard
                    icon={CheckCircle}
                    label="Active / Online"
                    value={stats.online}
                    color="emerald"
                    subValue={`${((stats.online / stats.total) * 100 || 0).toFixed(1)}% success rate`}
                    className="shadow-xl shadow-emerald-900/5 hover:scale-[1.02] transition-transform"
                />
                <StatsCard
                    icon={XCircle}
                    label="Offline Devices"
                    value={stats.offline}
                    color="red"
                    className="shadow-xl shadow-red-900/5 hover:scale-[1.02] transition-transform"
                />
                <StatsCard
                    icon={Zap}
                    label="Power Outage"
                    value={stats.powerDown}
                    color="amber"
                    subValue="Dying Gasp Alerts"
                    className="shadow-xl shadow-amber-900/5 hover:scale-[1.02] transition-transform"
                />
                <StatsCard
                    icon={Activity}
                    label="Signal Faults"
                    value={stats.opticalLoss}
                    color="orange"
                    subValue="LOS Anomalies"
                    className="shadow-xl shadow-orange-900/5 hover:scale-[1.02] transition-transform"
                />
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* OLT Info Sidebar */}
                <div className="xl:col-span-1 space-y-6">
                    <Card className="glass-panel border-slate-border/50 bg-surface-dark/40 divide-y divide-slate-800/50 overflow-hidden shadow-2xl">
                        <CardHeader className="bg-surface-darker/30">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-fg-muted flex items-center gap-2">
                                <Info className="w-4 h-4 text-primary" />
                                Hardware Telemetry
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0 p-0">
                            {[
                                { label: 'Host Identifier', value: olt.host, mono: true },
                                { label: 'Chassis Type', value: olt.type, capitalize: true },
                                { label: 'Hardware Uptime', value: olt.uptime ? `${Math.floor(olt.uptime / 3600)}h ${Math.floor((olt.uptime % 3600) / 60)}m` : '--' },
                                { label: 'Cloud Sync Time', value: olt.updatedAt ? formatShortDateTime(olt.updatedAt, timezone) : 'Never' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center px-6 py-4 hover:bg-slate-surface/10 transition-colors">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{item.label}</span>
                                    <span className={clsx(
                                        "text-xs font-bold text-fg",
                                        item.mono && "font-mono tracking-tight text-primary",
                                        item.capitalize && "capitalize"
                                    )}>{item.value || '--'}</span>
                                </div>
                            ))}

                            {olt.statusReason && (
                                <div className="m-6 p-4 bg-red-500/5 border border-red-500/10 rounded-xl shadow-inner">
                                    <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                        <AlertCircle className="w-3 h-3" />
                                        Diagnostic Fault
                                    </p>
                                    <p className="text-xs text-red-200/80 leading-relaxed font-medium">{olt.statusReason}</p>
                                </div>
                            )}

                            <div className="p-6 bg-surface-darker/20">
                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Port Connectivity Status</p>
                                <div className="space-y-4">
                                    {olt.useSnmp && (
                                        <div className="flex items-center justify-between p-3.5 bg-surface-dark/60 rounded-xl border border-slate-border/50 hover:border-blue-500/30 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-blue-500/10 rounded-lg">
                                                    <Database className="w-4 h-4 text-blue-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-fg uppercase tracking-tight">SNMP Layer</span>
                                                    <span className="text-[9px] text-fg-muted font-bold uppercase">Port {olt.snmpPort}</span>
                                                </div>
                                            </div>
                                            <Badge variant={olt.lastSnmpStatus === 'online' ? 'success' : 'destructive'} size="xs" className="font-black px-2">
                                                {olt.lastSnmpStatus || 'OFF'}
                                            </Badge>
                                        </div>
                                    )}
                                    {olt.useWeb && (
                                        <div className="flex items-center justify-between p-3.5 bg-surface-dark/60 rounded-xl border border-slate-border/50 hover:border-purple-500/30 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-purple-500/10 rounded-lg">
                                                    <Shield className="w-4 h-4 text-purple-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-fg uppercase tracking-tight">Management API</span>
                                                    <span className="text-[9px] text-fg-muted font-bold uppercase">{olt.webProtocol} Access</span>
                                                </div>
                                            </div>
                                            <Badge variant={olt.lastWebStatus === 'online' ? 'success' : 'destructive'} size="xs" className="font-black px-2">
                                                {olt.lastWebStatus || 'OFF'}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {olt.description && (
                                <div className="p-6 border-t border-slate-border/50 bg-surface-darker/10">
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Administrator Notes</p>
                                    <div className="p-4 bg-surface-darker/40 rounded-xl border border-slate-border/50 text-xs text-fg-muted leading-relaxed font-medium italic">
                                        "{olt.description}"
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ONU List Table Area */}
                <div className="xl:col-span-2">
                    <OnuTable
                        onus={onus}
                        isLoading={isLoadingOnus}
                        error={onusError}
                        refetch={refetchOnus}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        onEdit={(onu) => setEditingOnu(onu)}
                        onReboot={(onu) => setRebootingOnu(onu)}
                        onArchive={handleArchiveOnu}
                        onMove={(onu) => setMovingOnu(onu)}
                        netwatchLookup={netwatchLookup}
                        oltType={olt.type}
                    />
                </div>
            </div>

            {/* Modals */}
            <EditOnuModal 
                isOpen={!!editingOnu}
                onClose={() => setEditingOnu(null)}
                onu={editingOnu}
                isSubmitting={updateOnuMutation.isPending}
                onSubmit={handleUpdateOnu}
            />

            <RebootOnuModal
                isOpen={!!rebootingOnu}
                onClose={() => setRebootingOnu(null)}
                onu={rebootingOnu}
                isSubmitting={rebootOnuMutation.isPending}
                onConfirm={handleRebootOnu}
            />

            <MoveOltModal
                isOpen={!!movingOnu}
                onClose={() => setMovingOnu(null)}
                onu={movingOnu}
                currentOltId={id}
            />
        </div>
    );
}
