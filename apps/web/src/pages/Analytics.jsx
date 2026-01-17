import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useRouters } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    Line
} from 'recharts';
import {
    BarChart3,
    TrendingUp,
    AlertTriangle,
    Activity,
    Clock,
    Server,
    RefreshCw,
    Calendar,
    ChevronDown,
    Filter,
    Download,
    Users,
    Wifi,
    WifiOff,
    Search,
    Router as RouterIcon,
    X
} from 'lucide-react';
import clsx from 'clsx';

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-800 border border-slate-700 p-2 rounded-lg shadow-xl text-xs">
                <p className="text-slate-300 font-medium mb-1">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-0.5 last:mb-0">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-400 capitalize">{entry.name}:</span>
                        <span className="text-white font-mono font-medium">{entry.value}{entry.unit || ''}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// Simple bar chart component using Recharts
function SimpleBarChart({ data, dataKey = 'total', color = '#3b82f6', height = 200, onClick }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                No data available
            </div>
        );
    }

    // Transform data for display if needed
    const chartData = data.map(item => ({
        ...item,
        displayDate: item.date ? new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : item.label,
        [dataKey]: Number(item[dataKey] || 0)
    }));

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                        dataKey="displayDate"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dx={-10}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.2 }} />
                    <Bar
                        dataKey={dataKey}
                        name="Alerts"
                        fill={color}
                        radius={[4, 4, 0, 0]}
                        barSize={30}
                        onClick={onClick}
                        cursor="pointer"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// ... (TrendChart remains unchanged)

// ... (RouterSelector, DateRangePicker, StatCard remain unchanged)

export default function Analytics() {
    // Get routers list (respects user role permissions via the hook)
    const { data: routers = [] } = useRouters();

    // Selected router filter
    const [selectedRouterId, setSelectedRouterId] = useState(null);

    // Selected date for drill-down (chart click)
    const [selectedDate, setSelectedDate] = useState(null);

    // Default to last 30 days
    const [dateRange, setDateRange] = useState(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            label: '30 Hari',
        };
    });

    const queryParams = useMemo(() => ({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        ...(selectedRouterId && { routerId: selectedRouterId }),
    }), [dateRange.startDate, dateRange.endDate, selectedRouterId]);

    // Query for selected date alerts (Filtered alerts)
    const filteredStatsParams = useMemo(() => {
        if (!selectedDate) return null;
        // Construct start/end for the full selected day
        const start = new Date(selectedDate);
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);

        return {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            ...(selectedRouterId && { routerId: selectedRouterId }),
            limit: 50
        };
    }, [selectedDate, selectedRouterId]);

    const { data: dailyAlerts, isLoading: dailyAlertsLoading } = useQuery({
        queryKey: ['analytics-daily-alerts', filteredStatsParams],
        queryFn: async () => {
            if (!filteredStatsParams) return [];
            const res = await apiClient.get('/analytics/alerts/list', { params: filteredStatsParams });
            return res.data.data;
        },
        enabled: !!filteredStatsParams
    });

    // API Queries
    const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
        queryKey: ['analytics-overview', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/overview', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: alertTrends, isLoading: trendsLoading } = useQuery({
        queryKey: ['analytics-alert-trends', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/alerts/trends', { params: queryParams });
            return res.data.data;
        },
    });

    // ... (Other queries remain unchanged)

    const { data: uptimeStats, isLoading: uptimeLoading } = useQuery({
        queryKey: ['analytics-uptime', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/uptime', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: performance, isLoading: perfLoading } = useQuery({
        queryKey: ['analytics-performance', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/performance', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: topDownDevices } = useQuery({
        queryKey: ['analytics-top-down', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/top-down-devices', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: auditLogs } = useQuery({
        queryKey: ['analytics-audit-logs', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/audit-logs', { params: { ...queryParams, limit: 10 } });
            return res.data.data;
        },
    });

    const handleRefresh = () => {
        refetchOverview();
        if (selectedDate) {
            // Refetch daily alerts if active
        }
    };

    const handleBarClick = (data) => {
        if (data && data.date) {
            setSelectedDate(data.date);
            // Optional: scroll to alerts section
            setTimeout(() => {
                document.getElementById('daily-alerts-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    };

    const isLoading = overviewLoading || trendsLoading || uptimeLoading || perfLoading;

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                <BarChart3 className="w-7 h-7 text-primary" />
                                Analytics Dashboard
                            </h1>
                            <p className="text-slate-400 text-sm mt-1">
                                Statistik dan analisis data monitoring jaringan
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <RouterSelector routers={routers} value={selectedRouterId} onChange={setSelectedRouterId} />
                            <DateRangePicker value={dateRange} onChange={setDateRange} />
                            <Button variant="outline" size="sm" onClick={handleRefresh}>
                                <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>

                    {/* Overview Stats */}
                    {/* ... (StatCards remain unchanged) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            icon={AlertTriangle}
                            label="Total Alerts"
                            value={overview?.totalAlerts || 0}
                            subvalue={`${overview?.unresolvedAlerts || 0} unresolved`}
                            color="warning"
                        />
                        <StatCard
                            icon={Activity}
                            label="Uptime Rata-rata"
                            value={`${overview?.averageUptime || 0}%`}
                            subvalue={`${overview?.onlineRouters || 0}/${overview?.totalRouters || 0} online`}
                            color="success"
                        />
                        <StatCard
                            icon={Server}
                            label="Total Routers"
                            value={overview?.totalRouters || 0}
                            subvalue={`${overview?.offlineRouters || 0} offline`}
                            color="primary"
                        />
                        <StatCard
                            icon={Users}
                            label="Total Devices"
                            value={overview?.totalDevices || 0}
                            subvalue="Netwatch hosts"
                            color="primary"
                        />
                    </div>

                    {/* Main Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Alert Trend */}
                        <Card className="glass-panel">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-primary" />
                                    Trend Alert
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {trendsLoading ? (
                                    <div className="flex items-center justify-center h-48">
                                        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                ) : (
                                    <SimpleBarChart
                                        data={alertTrends?.slice(-14) || []}
                                        dataKey="total"
                                        color="warning"
                                        height={180}
                                        onClick={handleBarClick}
                                    />
                                )}
                            </CardContent>
                        </Card>
                        {/* ... (TrendChart Card remains unchanged) */}
                        <Card className="glass-panel">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary" />
                                    CPU & Memory Trend
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {perfLoading ? (
                                    <div className="flex items-center justify-center h-48">
                                        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                ) : (
                                    <TrendChart data={performance?.slice(-24) || []} height={180} />
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Daily Alerts Drill-down Section */}
                    {selectedDate && (
                        <Card className="glass-panel border-primary/30" id="daily-alerts-section">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-warning" />
                                    Alerts pada {new Date(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </CardTitle>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {dailyAlertsLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                        {dailyAlerts?.length > 0 ? (
                                            dailyAlerts.map((alert, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={clsx(
                                                            "w-2 h-2 rounded-full",
                                                            alert.severity === 'critical' ? 'bg-red-500' :
                                                                alert.severity === 'warning' ? 'bg-amber-500' :
                                                                    'bg-blue-500'
                                                        )} />
                                                        <div>
                                                            <p className="text-sm text-white font-medium">{alert.title}</p>
                                                            <p className="text-xs text-slate-500">{alert.message}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-slate-400 font-mono">
                                                            {new Date(alert.createdAt).toLocaleTimeString('id-ID')}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500">{alert.routerName}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-center text-slate-500 py-4">Tidak ada alert pada tanggal ini</p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Bottom Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* ... (Existing bottom cards) */}
                        <Card className="glass-panel">
                            {/* ... Top Down Devices ... */}
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <WifiOff className="w-4 h-4 text-red-400" />
                                    Device Sering Down
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {topDownDevices?.length > 0 ? (
                                        topDownDevices.slice(0, 5).map((device, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50"
                                            >
                                                <div>
                                                    <p className="text-sm text-white font-medium">{device.name}</p>
                                                    <p className="text-xs text-slate-500 font-mono">{device.host}</p>
                                                </div>
                                                <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-medium">
                                                    {device.incidents}x down
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-slate-500 py-4">Tidak ada data</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-panel">
                            {/* ... Uptime Stats ... */}
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Wifi className="w-4 h-4 text-emerald-400" />
                                    Uptime per Router
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {uptimeStats?.length > 0 ? (
                                        uptimeStats.slice(0, 5).map((router, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50"
                                            >
                                                <p className="text-sm text-white font-medium">{router.routerName}</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-emerald-500 rounded-full"
                                                            style={{ width: `${router.uptimePercentage}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-slate-400 w-12 text-right">
                                                        {router.uptimePercentage}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-slate-500 py-4">Tidak ada data</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="glass-panel">
                            {/* ... Audit Logs ... */}
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-primary" />
                                    Aktivitas Terakhir
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {auditLogs?.logs?.length > 0 ? (
                                        auditLogs.logs.slice(0, 5).map((log, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50"
                                            >
                                                <div>
                                                    <p className="text-sm text-white capitalize">
                                                        {log.action} {log.entity}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {new Date(log.createdAt).toLocaleString('id-ID')}
                                                    </p>
                                                </div>
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded text-[10px] font-medium",
                                                    log.action === 'create' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        log.action === 'delete' ? 'bg-red-500/10 text-red-400' :
                                                            log.action === 'update' ? 'bg-blue-500/10 text-blue-400' :
                                                                'bg-slate-500/10 text-slate-400'
                                                )}>
                                                    {log.action}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-slate-500 py-4">Tidak ada aktivitas</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
