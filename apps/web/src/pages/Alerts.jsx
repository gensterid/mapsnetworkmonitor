import { useState } from 'react';
import { useAlerts, useAcknowledgeAlert, useSettings, useAcknowledgeAllAlerts, useCurrentUser, useDebounce, useAppTimezone } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Bell, CheckCircle, AlertTriangle, RefreshCw, Clock, CheckCheck, ArrowDown, ArrowUp, Wifi, WifiOff, Search, X, Sparkles } from 'lucide-react';
import { formatShortDateTime, formatFullDateTime } from '@/lib/timezone';
import AiDiagnosis from '@/components/AiDiagnosis';
import clsx from 'clsx';

export default function Alerts() {
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [sortOrder, setSortOrder] = useState('desc');
    const [dateFilter, setDateFilter] = useState('');
    const [showResolved, setShowResolved] = useState(false);
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
        endDate: endDate ? endDate.toISOString() : undefined,
        search: debouncedSearch,
        category: 'alerts', // Server-side filtering to fix pagination
        resolved: showResolved ? undefined : false
    });

    // Handle both new (paginated) and old (array) response formats for safety during transition
    const alerts = Array.isArray(result) ? result : (result?.data || []);
    const meta = result?.meta;
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const acknowledgeMutation = useAcknowledgeAlert();
    const acknowledgeAllMutation = useAcknowledgeAllAlerts();

    const timezone = useAppTimezone();

    // Connectivity types (Up/Down/Reboot/Interface)
    const connectivityTypes = [
        'status_change',
        'interface_down',
        'netwatch_down',
        'reboot',
        'pppoe_connect',
        'pppoe_disconnect'
    ];

    // The API already filters by category and search
    const filteredAlerts = alerts;

    const formatAlertTime = (dateStr) => {
        return formatShortDateTime(dateStr, timezone);
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
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark text-red-400">
                Error loading alerts: {error.message}
            </div>
        );
    }

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'warning': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'info': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            default: return 'bg-slate-700 text-fg';
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            <div className="p-4 border-b border-slate-border flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-2xl font-bold text-fg tracking-tight">Alerts</h1>
                        <p className="text-fg-muted text-xs md:sm">Monitor connectivity events</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={showResolved ? "primary" : "outline"}
                        size="sm"
                        onClick={() => setShowResolved(!showResolved)}
                        className="flex-1 sm:flex-none justify-center min-w-[120px]"
                    >
                        <Clock className="w-4 h-4 mr-2" />
                        {showResolved ? "Showing All" : "Active Only"}
                    </Button>
                    <Button onClick={() => refetch()} variant="outline" size="sm" className="flex-1 sm:flex-none justify-center min-w-[100px]">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    {hasUnacknowledged && (
                        <Button
                            onClick={handleAcknowledgeAll}
                            variant="primary"
                            size="sm"
                            loading={acknowledgeAllMutation.isPending}
                            className="flex-1 sm:flex-none justify-center min-w-[100px]"
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
                            className="bg-surface-dark border border-slate-700 text-fg text-sm rounded-lg p-2 focus:ring-primary focus:border-primary flex-1 sm:w-auto font-mono"
                        />
                        {dateFilter && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDateFilter('')}
                                className="text-fg-muted hover:text-fg shrink-0"
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                    <input
                        type="text"
                        placeholder="Search alerts by title, message, type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 bg-surface-dark border border-slate-700 rounded-lg text-fg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>




                {searchQuery && (
                    <p className="text-xs text-fg-muted mt-2">
                        Showing {filteredAlerts.length} of {alerts.length} alerts
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {filteredAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-border rounded-xl">
                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-fg mb-1">
                            {searchQuery ? 'No matching alerts' : 'No active alerts'}
                        </h3>
                        <p className="text-fg-muted">
                            {searchQuery ? 'Try a different search term' : 'All systems are operating normally'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2 sm:space-y-3">
                        {filteredAlerts.map((alert) => (
                            <Card key={alert.id} className={clsx("border", getSeverityColor(alert.severity))}>
                                <CardContent className="p-2.5 sm:p-4">
                                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                                        <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                                            <div className="shrink-0 mt-0.5">{getAlertIcon(alert)}</div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-medium text-fg text-sm sm:text-base leading-snug break-words">{alert.title}</h3>
                                                <p className="text-xs sm:text-sm text-fg-muted mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-none">{alert.message || alert.description}</p>
                                                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 sm:mt-2 text-[10px] sm:text-xs text-fg-muted">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatAlertTime(alert.createdAt)}
                                                    </span>
                                                    {alert.routerName && <span className="truncate">Router: {alert.routerName}</span>}
                                                </div>

                                                {/* AI Diagnosis — hide on mobile, expand on tap (kept for desktop) */}
                                                <div className="hidden sm:block">
                                                    <AiDiagnosis
                                                        alertId={alert.id}
                                                        initialAnalysis={alert.aiAnalysis}
                                                        severity={alert.severity}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        {!alert.acknowledged ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => acknowledgeAlert(alert.id)}
                                                loading={acknowledgeMutation.isPending}
                                                aria-label="Acknowledge alert"
                                                className="shrink-0 h-8 sm:h-auto px-2 sm:px-3 text-[11px] sm:text-sm flex items-center gap-1"
                                            >
                                                <CheckCheck className="w-3.5 h-3.5" />
                                                <span className="sm:hidden">OK</span>
                                                <span className="hidden sm:inline">Acknowledge</span>
                                            </Button>
                                        ) : (
                                            <div className="text-[10px] sm:text-xs text-fg-muted text-right shrink-0">
                                                <div className="flex items-center justify-end gap-1 text-emerald-500 mb-0.5 sm:mb-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span className="hidden sm:inline">Acknowledged</span>
                                                    <span className="sm:hidden">Ack'd</span>
                                                </div>
                                                {alert.acknowledgedByName && (
                                                    <div className="hidden sm:block">by {alert.acknowledgedByName}</div>
                                                )}
                                                <div className="hidden sm:block">{formatFullDateTime(alert.acknowledgedAt, timezone)}</div>
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
                    <div className="p-4 border-t border-slate-border flex items-center justify-between">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >
                            Previous
                        </Button>
                        <span className="text-sm text-fg-muted">
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

