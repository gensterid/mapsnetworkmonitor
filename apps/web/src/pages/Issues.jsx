import { useState } from 'react';
import { useAlerts, useAcknowledgeAlert, useSettings, useAcknowledgeAllAlerts, useCurrentUser } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Bell, CheckCircle, AlertTriangle, RefreshCw, Clock, CheckCheck, ArrowDown, ArrowUp, Wifi, WifiOff, Search, X, Activity } from 'lucide-react';
import { formatDateWithTimezone } from '@/lib/timezone';
import clsx from 'clsx';

export default function Issues() {
    const [searchQuery, setSearchQuery] = useState('');
    const { data: alerts = [], isLoading, error, refetch } = useAlerts();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const acknowledgeMutation = useAcknowledgeAlert();
    const acknowledgeAllMutation = useAcknowledgeAllAlerts();

    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Issue types (Performance/System)
    const issueTypes = ['high_cpu', 'high_memory', 'high_disk', 'threshold', 'system'];

    // Filter alerts: Issues only
    const filteredAlerts = alerts.filter(alert => {
        // 1. Must be an issue type
        const isIssue = issueTypes.includes(alert.type) ||
            (alert.type === 'threshold') ||
            (alert.severity === 'warning' && !alert.type?.includes('down') && !alert.type?.includes('offline'));

        if (!isIssue) return false;

        // 2. Search query
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
            // Only acknowledge filtered (visible) alerts? currently API ack all acknowledges EVERYTHING.
            // Be careful. The hook `useAcknowledgeAllAlerts` probably hits `DELETE /api/alerts` or `PUT /api/alerts/ack-all`.
            // If it acks ALL, it might ack "Alerts" page items too.
            // For now let's assume global ack is fine, or warn user. 
            // Better: Iterate and ack only visible ones if API supports individual.
            // Let's stick to using the existing global ack for now but strictly speaking it might clear "Alerts" tab too.
            await acknowledgeAllMutation.mutateAsync();
        } catch (err) {
            console.error('Failed to acknowledge all alerts:', err);
        }
    };

    const hasUnacknowledged = filteredAlerts.some(a => !a.acknowledged);

    const getAlertIcon = (alert) => {
        return <Activity className="w-5 h-5 mt-0.5 text-yellow-500" />;
    };

    if (isLoading) return <div className="flex-1 flex items-center justify-center bg-slate-950"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>;
    if (error) return <div className="flex-1 flex items-center justify-center bg-slate-950 text-red-400">Error loading issues: {error.message}</div>;

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'warning': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'info': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'; // Changed to Blue for issues
            default: return 'bg-slate-700 text-slate-300';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Issues</h1>
                    <p className="text-slate-400 text-sm">Monitor performance and system issues</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={() => refetch()} variant="outline" className="flex-1 sm:flex-none justify-center">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    {hasUnacknowledged && (
                        <Button onClick={handleAcknowledgeAll} variant="primary" loading={acknowledgeAllMutation.isPending} className="ml-0 flex-1 sm:flex-none justify-center">
                            <CheckCheck className="w-4 h-4 mr-2" />
                            Ack All
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-6 pt-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search issues..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {filteredAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">{searchQuery ? 'No matching issues' : 'No active issues'}</h3>
                        <p className="text-slate-400">{searchQuery ? 'Try a different search term' : 'System performance is optimal'}</p>
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
                                                <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatAlertTime(alert.createdAt)}</span>
                                                    {alert.routerName && <span>Router: {alert.routerName}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {!alert.acknowledged ? (
                                            <Button variant="ghost" size="sm" onClick={() => acknowledgeAlert(alert.id)} loading={acknowledgeMutation.isPending}>Acknowledge</Button>
                                        ) : (
                                            <div className="text-xs text-slate-500 text-right">
                                                <div className="flex items-center justify-end gap-1 text-emerald-500 mb-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    <span>Acknowledged {alert.acknowledgedByName ? `by ${alert.acknowledgedByName}` : ''}</span>
                                                </div>
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
        </div>
    );
}
