import React, { useMemo } from 'react';
import { useAlerts } from '@/hooks';
import { X, RefreshCw, AlertTriangle, Wifi, WifiOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateWithTimezone } from '@/lib/timezone';
import clsx from 'clsx';
import { useCurrentUser, useSettings } from '@/hooks';

// Helper to get formatted time
const formatAlertTime = (dateStr, timezone) => {
    return formatDateWithTimezone(dateStr, timezone);
};

export default function AnalyticsDetailModal({ open, type, target, onClose }) {
    if (!open) return null;

    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Construct query params based on type and target
    const queryParams = useMemo(() => {
        if (!target) return {};

        const baseParams = { limit: 50 }; // Fetch last 50 events

        switch (type) {
            case 'device-logs':
                // Search for alerts related to this device (by name or host)
                // We prefer name as it's more specific in title "Device [router] NAME is down"
                return { ...baseParams, search: target.name };
            case 'router-uptime':
                // Alerts for specific router
                return { ...baseParams, routerId: target.routerId || target.id };
            case 'issue-logs':
                // Search by issue title (e.g. "High CPU")
                // If target.type is available (e.g. 'high_cpu'), use that? 
                // The backend supports 'type' param filter if we implemented it, but search is safer for now.
                return { ...baseParams, search: target.title }; // Search for the specific issue title
            case 'pppoe-logs':
                // Search by client name
                return { ...baseParams, search: target.name };
            case 'pppoe-down-details':
                // Show all currently down PPPoE? Or logs for specific?
                // If target is passed, show logs for that user.
                if (target) return { ...baseParams, search: target.name };
                return baseParams;
            default:
                return baseParams;
        }
    }, [type, target]);

    // Fetch alerts
    const { data: alerts, isLoading } = useAlerts(queryParams, { enabled: !!target });

    // Handle array vs paginated response
    const alertList = Array.isArray(alerts) ? alerts : (alerts?.data || []);

    const getTitle = () => {
        switch (type) {
            case 'device-logs': return `Riwayat Device: ${target?.name}`;
            case 'router-uptime': return `Riwayat Router: ${target?.name || target?.routerName}`;
            case 'issue-logs': return `Detail Issue: ${target?.title}`;
            case 'pppoe-logs': return `Riwayat Koneksi PPPoE: ${target?.name}`;
            case 'pppoe-down-details': return `Detail PPPoE Down: ${target?.name}`;
            default: return 'Detail';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-900/50">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        {type === 'issue-logs' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> :
                            type === 'device-logs' ? <WifiOff className="w-5 h-5 text-red-500" /> :
                                <Clock className="w-5 h-5 text-blue-500" />}
                        {getTitle()}
                    </h3>
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
                                <div key={alert.id} className="p-4 hover:bg-slate-800/50 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className={clsx(
                                            "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                            alert.severity === 'critical' ? 'bg-red-500' :
                                                alert.severity === 'warning' ? 'bg-amber-500' :
                                                    'bg-emerald-500'
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className="text-sm font-medium text-white truncate">{alert.title}</p>
                                                <span className="text-xs text-slate-500 whitespace-nowrap font-mono">
                                                    {formatAlertTime(alert.createdAt, timezone)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-400 leading-relaxed text-wrap break-words">
                                                {alert.message}
                                            </p>
                                            {
                                                (type === 'device-logs' || type === 'pppoe-logs' || type === 'pppoe-down-details') && (
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <span className={clsx(
                                                            "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                                                            alert.type.includes('down') || alert.type.includes('disconnect') ? 'bg-red-500/10 text-red-400' :
                                                                alert.type.includes('up') || alert.type.includes('connect') ? 'bg-emerald-500/10 text-emerald-400' :
                                                                    'bg-slate-700 text-slate-400'
                                                        )}>
                                                            {alert.type.replace(/_/g, ' ')}
                                                        </span>
                                                        {alert.routerName && (
                                                            <span className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
                                                                {alert.routerName}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            }
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
                <div className="px-5 py-4 border-t border-slate-700 flex justify-end bg-slate-900/50">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Tutup
                    </Button>
                </div>
            </div>
        </div>
    );
}
