import React, { useMemo, useState } from 'react';
import { useAlerts, useResolveAlert, useResolveAllAlerts } from '@/hooks';
import { X, RefreshCw, AlertTriangle, Wifi, WifiOff, Clock, CheckCircle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateWithTimezone } from '@/lib/timezone';
import clsx from 'clsx';
import { useCurrentUser, useSettings } from '@/hooks';
import { toast } from 'react-hot-toast';

// Helper to get formatted time
const formatAlertTime = (dateStr, timezone) => {
    return formatDateWithTimezone(dateStr, timezone);
};

export default function AnalyticsDetailModal({ open, type, target, onClose }) {
    if (!open) return null;

    const [filterResolved, setFilterResolved] = useState(type === 'unresolved-alerts' ? false : undefined);
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    const resolveAlertMutation = useResolveAlert();
    const resolveAllMutation = useResolveAllAlerts();

    // Construct query params based on type and target
    const queryParams = useMemo(() => {
        if (!target) return {};

        const baseParams = { limit: 100 }; // Increase limit for audits/history

        if (filterResolved !== undefined) {
            baseParams.resolved = filterResolved;
        }

        switch (type) {
            case 'device-logs':
                return { ...baseParams, search: target.host || target.name };
            case 'router-uptime':
                return { ...baseParams, routerId: target.routerId || target.id };
            case 'issue-logs':
                return { ...baseParams, search: target.title };
            case 'pppoe-logs':
                return { ...baseParams, search: target.name };
            case 'pppoe-down-details':
                if (target) return { ...baseParams, search: target.name };
                return baseParams;
            case 'cpu-peak-details':
                return { ...baseParams, routerId: target.routerId, search: 'CPU' };
            case 'downtime-details':
                return { ...baseParams, search: target.host || target.name };
            case 'capacity-details':
                return { ...baseParams, routerId: target.routerId, search: target.interfaceName };
            case 'heatmap-details':
                return { ...baseParams, search: target.deviceNames?.[0] || '' };
            case 'unresolved-alerts':
            case 'all-alerts':
                return { ...baseParams };
            default:
                return baseParams;
        }
    }, [type, target, filterResolved]);

    // Fetch alerts
    const { data: alerts, isLoading, refetch } = useAlerts(queryParams, { enabled: !!target });

    // Handle array vs paginated response
    const alertList = Array.isArray(alerts) ? alerts : (alerts?.data || []);

    const handleResolve = async (id) => {
        try {
            await resolveAlertMutation.mutateAsync(id);
            toast.success('Alert resolved');
            refetch();
        } catch (error) {
            toast.error('Failed to resolve alert');
        }
    };

    const handleResolveAll = async () => {
        try {
            // Check if we can filter by category for acknowledgement
            const category = type === 'issue-logs' || type === 'cpu-peak-details' ? 'issues' : undefined;
            await resolveAllMutation.mutateAsync(category);
            toast.success('All alerts resolved/acknowledged');
            onClose();
        } catch (error) {
            toast.error('Failed to resolve all alerts');
        }
    };

    const getTitle = () => {
        switch (type) {
            case 'device-logs': return `Riwayat Device: ${target?.name}`;
            case 'router-uptime': return `Riwayat Router: ${target?.name || target?.routerName}`;
            case 'issue-logs': return `Detail Issue: ${target?.title}`;
            case 'pppoe-logs': return `Riwayat Koneksi PPPoE: ${target?.name}`;
            case 'pppoe-down-details': return `Detail PPPoE Down: ${target?.name}`;
            case 'cpu-peak-details': return `Detail High CPU: ${target?.routerName} (Jam ${target?.hour}:00)`;
            case 'downtime-details': return `Detail Downtime: ${target?.name}`;
            case 'capacity-details': return `Riwayat Interface: ${target?.interfaceName}`;
            case 'heatmap-details': return `Insiden Area: ${target?.deviceNames?.[0] || 'Unknown'} ...`;
            case 'unresolved-alerts': return `Unresolved Alerts (${target?.unresolved || 0})`;
            case 'all-alerts': return `Semua Alert (History)`;
            default: return 'Detail';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-900/50">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            {type === 'issue-logs' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> :
                                type === 'device-logs' ? <WifiOff className="w-5 h-5 text-red-500" /> :
                                    <Clock className="w-5 h-5 text-blue-500" />}
                            {getTitle()}
                        </h3>
                        {type === 'all-alerts' && (
                            <div className="flex items-center gap-2 mt-2">
                                <Button
                                    size="xs"
                                    variant={filterResolved === false ? "primary" : "outline"}
                                    onClick={() => setFilterResolved(filterResolved === false ? undefined : false)}
                                    className="text-[10px] h-6"
                                >
                                    <Filter className="w-3 h-3 mr-1" />
                                    {filterResolved === false ? "Showing Unresolved" : "Show Unresolved Only"}
                                </Button>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-0 bg-slate-900/50">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : alertList.length > 0 ? (
                        <div className="divide-y divide-slate-800">
                            {alertList.map((alert) => (
                                <div key={alert.id} className="p-4 hover:bg-slate-800/50 transition-colors group">
                                    <div className="flex items-start gap-3">
                                        <div className={clsx(
                                            "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                            alert.resolved ? 'bg-emerald-500/30' :
                                                alert.severity === 'critical' ? 'bg-red-500' :
                                                    alert.severity === 'warning' ? 'bg-amber-500' :
                                                        'bg-emerald-500'
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className={clsx(
                                                    "text-sm font-medium truncate",
                                                    alert.resolved ? "text-slate-500" : "text-white"
                                                )}>{alert.title}</p>
                                                <span className="text-xs text-slate-500 whitespace-nowrap font-mono">
                                                    {formatAlertTime(alert.createdAt, timezone)}
                                                </span>
                                            </div>
                                            <p className={clsx(
                                                "text-sm leading-relaxed text-wrap break-words",
                                                alert.resolved ? "text-slate-600" : "text-slate-400"
                                            )}>
                                                {alert.message}
                                            </p>
                                            <div className="mt-2 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                                                        alert.resolved ? "bg-slate-800 text-slate-500" :
                                                            alert.type?.includes('down') || alert.type?.includes('disconnect') ? 'bg-red-500/10 text-red-400' :
                                                                alert.type?.includes('up') || alert.type?.includes('connect') ? 'bg-emerald-500/10 text-emerald-400' :
                                                                    'bg-slate-700 text-slate-400'
                                                    )}>
                                                        {alert.type?.replace(/_/g, ' ')}
                                                    </span>
                                                    {alert.routerName && (
                                                        <span className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
                                                            {alert.routerName}
                                                        </span>
                                                    )}
                                                    {alert.resolved && (
                                                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                            <CheckCircle className="w-3 h-3" />
                                                            RESOLVED
                                                        </span>
                                                    )}
                                                </div>

                                                {!alert.resolved && (
                                                    <Button
                                                        size="xs"
                                                        variant="ghost"
                                                        className="h-7 text-[10px] text-primary hover:text-white hover:bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handleResolve(alert.id)}
                                                        disabled={resolveAlertMutation.isLoading}
                                                    >
                                                        {resolveAlertMutation.isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Resolve"}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <AlertTriangle className="w-10 h-10 mb-2 opacity-20" />
                            <p>Tidak ada riwayat alert ditemukan</p>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-4 border-t border-slate-700 flex justify-between items-center bg-slate-900/50">
                    <div className="text-xs text-slate-500">
                        {alertList.length} alert ditampilkan
                    </div>
                    <div className="flex items-center gap-2">
                        {alertList.some(a => !a.resolved) && (
                            <Button variant="outline" size="sm" color="warning" onClick={handleResolveAll} disabled={resolveAllMutation.isLoading}>
                                Resolve All Unresolved
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={onClose}>
                            Tutup
                        </Button>
                    </div>
                </div>
            </div>
        </div >
    );
}
