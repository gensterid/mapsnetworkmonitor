import { useState } from 'react';
import { useAlerts, useAcknowledgeAlert, useSettings, useAcknowledgeAllAlerts, useCurrentUser, useDebounce } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Bell, CheckCircle, AlertTriangle, RefreshCw, Clock, CheckCheck, ArrowDown, ArrowUp, Wifi, WifiOff, Search, X } from 'lucide-react';
import { formatDateWithTimezone } from '@/lib/timezone';
import clsx from 'clsx';

export default function Alerts() {
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [sortOrder, setSortOrder] = useState('desc');
    const [dateFilter, setDateFilter] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 500);

    // Construct start and end dates based on filter
    const getDateRange = () => {
        if (!dateFilter) return {};

        try {
            const [year, month, day] = dateFilter.split('-').map(Number);
            const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
            return { startDate, endDate };
        } catch (e) {
            console.error("Invalid date format", e);
            return {};
        }
    };

    const { startDate, endDate } = getDateRange();

    // Pass pagination params
    const { data: result, isLoading, error, refetch } = useAlerts({
        page,
        limit: startDate ? 10000 : 50, // Default 50, show all (high limit) if filtering by date
        sortOrder,
        startDate: startDate ? startDate.toISOString() : undefined,
        sortOrder,
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
        search: debouncedSearch
    });

    // Handle both new (paginated) and old (array) response formats for safety during transition
    const alerts = Array.isArray(result) ? result : (result?.data || []);
    const meta = result?.meta;
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const acknowledgeMutation = useAcknowledgeAlert();
    const acknowledgeAllMutation = useAcknowledgeAllAlerts();

    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Connectivity types (Up/Down/Reboot/Interface)
    const connectivityTypes = [
        'status_change',
        'interface_down',
        'netwatch_down',
        'reboot',
        'pppoe_connect',
        'pppoe_disconnect'
    ];

    // Filter alerts: Connectivity only
    const filteredAlerts = alerts.filter(alert => {
        // 1. Must be a connectivity type
        // Basic connectivity types + fallback for any other types NOT in the "issues" category
        // Helper to determine if it IS an issue (Logic must match Issues.jsx and Backend)
        const isIssue = (alert) => {
            const issueTypes = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system'];
            if (issueTypes.includes(alert.type)) return true;
            if (alert.type === 'threshold') return true;

            // Warnings that are NOT connectivity related are issues
            if (alert.severity === 'warning' &&
                !alert.type?.includes('status_change') &&
                !alert.type?.includes('down') &&
                !alert.type?.includes('offline') &&
                !alert.type?.includes('pppoe') &&
                !alert.type?.includes('interface') &&
                !alert.type?.includes('netwatch')) {
                return true;
            }
            return false;
        };

        if (isIssue(alert)) return false;

        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            alert.title?.toLowerCase().includes(query) ||
            alert.message?.toLowerCase().includes(query) ||
            alert.type?.toLowerCase().includes(query) ||
            alert.severity?.toLowerCase().includes(query)
        );
    });

    const formatAlertTime = (dateStr) => {
        return formatDateWithTimezone(dateStr, timezone);
    };

    const acknowledgeAlert = async (alertId) => {
        try {
            await acknowledgeMutation.mutateAsync(alertId);
        } catch (err) {
            console.error('Failed to acknowledge alert:', err);
        }
    };

    const handleAcknowledgeAll = async () => {
        try {
            // Acknowledge all "alerts" (connectivity) only
            await acknowledgeAllMutation.mutateAsync('alerts');
        } catch (err) {
            console.error('Failed to acknowledge all alerts:', err);
        }
    };

    // Check if there are any unacknowledged alerts
    const hasUnacknowledged = alerts.some(a => !a.acknowledged);

    // Get appropriate icon based on alert type and severity
    const getAlertIcon = (alert) => {
        const { type, severity, title } = alert;

        // Check if it's a PPPoE connect alert
        if (type === 'pppoe_connect') {
            return <Wifi className="w-5 h-5 mt-0.5 text-emerald-500" />;
        }

        // Check if it's a PPPoE disconnect alert
        if (type === 'pppoe_disconnect') {
            return <WifiOff className="w-5 h-5 mt-0.5 text-yellow-500" />;
        }

        // Check if it's a "device up" alert (info severity with "up" or "online" in title)
        const isDeviceUp = severity === 'info' && (
            title?.toLowerCase().includes(' is up') ||
            title?.toLowerCase().includes(' is online') ||
            title?.toLowerCase().includes('is now up') ||
            title?.toLowerCase().includes('is now online')
        );

        // Check if it's a "device down" alert
        const isDeviceDown =
            title?.toLowerCase().includes(' is down') ||
            title?.toLowerCase().includes(' is offline') ||
            title?.toLowerCase().includes('is now down') ||
            title?.toLowerCase().includes('is now offline') ||
            type === 'netwatch_down';

        if (isDeviceUp) {
            // Green icon for device up
            return <Wifi className="w-5 h-5 mt-0.5 text-emerald-500" />;
        } else if (isDeviceDown) {
            // Red icon for device down (regardless of severity)
            return <WifiOff className="w-5 h-5 mt-0.5 text-red-500" />;
        } else if (severity === 'critical') {
            // Red icon for critical
            return <AlertTriangle className="w-5 h-5 mt-0.5 text-red-500" />;
        } else if (severity === 'warning') {
            // Yellow icon for warning
            return <AlertTriangle className="w-5 h-5 mt-0.5 text-yellow-500" />;
        } else if (severity === 'info') {
            // Green icon for info
            return <Wifi className="w-5 h-5 mt-0.5 text-emerald-500" />;
        } else {
            // Default
            return <AlertTriangle className="w-5 h-5 mt-0.5" />;
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950 text-red-400">
                Error loading alerts: {error.message}
            </div>
        );
    }

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'warning': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'info': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            default: return 'bg-slate-700 text-slate-300';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Alerts</h1>
                    <p className="text-slate-400 text-sm">Monitor system alerts and notifications</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="flex-1 sm:flex-none justify-center"
                    >
                        {sortOrder === 'desc' ? <ArrowDown className="w-4 h-4 mr-2" /> : <ArrowUp className="w-4 h-4 mr-2" />}
                        Sort Date
                    </Button>
                    <Button onClick={() => refetch()} variant="outline" className="flex-1 sm:flex-none justify-center">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    {hasUnacknowledged && (
                        <Button
                            onClick={handleAcknowledgeAll}
                            variant="primary"
                            loading={acknowledgeAllMutation.isPending}
                            className="ml-0 flex-1 sm:flex-none justify-center"
                        >
                            <CheckCheck className="w-4 h-4 mr-2" />
                            Ack All
                        </Button>
                    )}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg p-2 focus:ring-primary focus:border-primary w-32 sm:w-auto"
                        />
                        {dateFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDateFilter('')}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="px-6 pt-4 flex flex-col gap-3">

                {/* Search Input */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search alerts by title, message, type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>




                {searchQuery && (
                    <p className="text-xs text-slate-500 mt-2">
                        Showing {filteredAlerts.length} of {alerts.length} alerts
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {filteredAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">
                            {searchQuery ? 'No matching alerts' : 'No active alerts'}
                        </h3>
                        <p className="text-slate-400">
                            {searchQuery ? 'Try a different search term' : 'All systems are operating normally'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredAlerts.map((alert) => (
                            <Card key={alert.id} className={clsx("border", getSeverityColor(alert.severity))}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            {getAlertIcon(alert)}
                                            <div>
                                                <h3 className="font-medium text-white">{alert.title}</h3>
                                                <p className="text-sm text-slate-400 mt-1">{alert.message || alert.description}</p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatAlertTime(alert.createdAt)}
                                                    </span>
                                                    {alert.routerName && <span>Router: {alert.routerName}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {!alert.acknowledged ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => acknowledgeAlert(alert.id)}
                                                loading={acknowledgeMutation.isPending}
                                            >
                                                Acknowledge
                                            </Button>
                                        ) : (
                                            <div className="text-xs text-slate-500 text-right">
                                                <div className="flex items-center justify-end gap-1 text-emerald-500 mb-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span>Acknowledged</span>
                                                </div>
                                                {alert.acknowledgedByName && (
                                                    <div>by {alert.acknowledgedByName}</div>
                                                )}
                                                <div>{formatAlertTime(alert.acknowledgedAt)}</div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {
                meta && meta.totalPages > 1 && (
                    <div className="p-4 border-t border-slate-800 flex items-center justify-between">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>
                        <span className="text-sm text-slate-400">
                            Page {meta.page} of {meta.totalPages} (Total {meta.total})
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= meta.totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                )
            }

        </div >
    );
}

