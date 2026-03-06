import React, { useState, useMemo } from 'react';
import {
    useAlerts,
    useAlertTrends,
    useUptimeStats,
    useAppTimezone
} from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import {
    Activity,
    AlertTriangle,
    TrendingUp,
    RefreshCw,
    Clock,
    CheckCircle,
    Server,
    Wifi,
    Zap,
    History,
    Calendar,
} from 'lucide-react';
import clsx from 'clsx';
import { formatShortDateTime } from '@/lib/timezone';
import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/api/services/analytics.service';

// Custom Tooltip for Recharts
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/95 border border-slate-800 p-2.5 rounded-lg shadow-2xl text-[10px] min-w-[140px] backdrop-blur-md">
                <p className="text-slate-400 font-bold mb-2 pb-1 border-b border-slate-800/50">
                    {new Date(label).toLocaleString('id-ID', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        day: '2-digit',
                        month: 'short'
                    })}
                </p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 mb-1.5 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-slate-500 font-medium">{entry.name}:</span>
                        </div>
                        <span className="text-white font-mono font-bold">
                            {entry.value !== null ? `${entry.value}${entry.unit || ''}` : '---'}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const CATEGORIES = [
    { id: 'all', label: 'Semua', icon: History, color: 'text-slate-400' },
    { id: 'issues', label: 'Issues', icon: AlertTriangle, color: 'text-red-500' },
    { id: 'connectivity', label: 'Konektivitas', icon: Zap, color: 'text-amber-500' },
    { id: 'signal', label: 'Signal & Latency', icon: Wifi, color: 'text-blue-500' },
];

export default function HistoryTab({ routerId, deviceName, deviceHost, onuId }) {
    const timezone = useAppTimezone();
    const [page, setPage] = useState(1);
    const [category, setCategory] = useState('all');
    const [timeframe, setTimeframe] = useState('7d');
    const limit = 15;

    // Date range for charts (last 14 days)
    const chartParams = useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 14);
        return {
            routerId,
            search: deviceHost || deviceName, // Filter chart by device
            startDate: start.toISOString(),
            endDate: end.toISOString()
        };
    }, [routerId, deviceHost, deviceName]);

    // Construct query filters based on category
    const alertFilters = useMemo(() => {
        const filters = { routerId, page, limit, sortOrder: 'desc' };

        if (deviceHost || deviceName) {
            filters.search = deviceHost || deviceName;
        }

        if (category === 'issues') {
            filters.category = 'issues';
        } else if (category === 'connectivity') {
            filters.category = 'alerts'; // Backend 'alerts' category maps to connectivity
        } else if (category === 'signal') {
            // Signal & Latency specifically uses high_latency, packet_loss, and threshold types
            filters.type = ['high_latency', 'packet_loss', 'threshold'];
        }

        return filters;
    }, [routerId, page, category, limit, deviceHost, deviceName]);

    // Queries
    const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useAlerts(alertFilters, { enabled: !!routerId });

    const { data: alertTrends, isLoading: trendsLoading } = useAlertTrends({
        routerId,
        search: deviceHost || deviceName,
        startDate: chartParams.startDate,
        endDate: chartParams.endDate
    }, { enabled: !!routerId });

    // Performance trends date range
    const perfRange = useMemo(() => {
        const end = new Date();
        const start = new Date();
        const days = timeframe === '30d' ? 30 : 7;
        start.setDate(start.getDate() - days);
        return { start, end };
    }, [timeframe]);

    const { data: perfTrends, isLoading: perfLoading } = useQuery({
        queryKey: ['device_perf_trends', routerId, deviceHost, onuId, timeframe],
        queryFn: () => analyticsService.getDevicePerformanceTrends({
            routerId,
            host: deviceHost,
            onuId,
            startDate: perfRange.start.toISOString(),
            endDate: perfRange.end.toISOString()
        }),
        enabled: !!(deviceHost || onuId)
    });

    const uptimeDataResult = useUptimeStats({
        routerId,
        search: deviceHost || deviceName
    }, { enabled: !!routerId });
    const uptimeData = uptimeDataResult.data;
    const uptimeLoading = uptimeDataResult.isLoading;

    const alerts = Array.isArray(alertsData) ? alertsData : (alertsData?.data || []);
    const meta = alertsData?.meta || {};
    const totalAlerts = meta.total || alerts.length;

    const handleRefresh = () => {
        refetchAlerts();
    };

    // Format Alert Trends for chart
    const alertChartData = useMemo(() => {
        if (!alertTrends) return [];
        return alertTrends.map(item => ({
            ...item,
            displayDate: new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
            total: Number(item.total || 0)
        }));
    }, [alertTrends]);

    return (
        <div className="space-y-6">
            {/* Header Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Total Insiden</p>
                            <p className="text-xl font-bold text-white">{totalAlerts}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Uptime Rate</p>
                            <p className="text-xl font-bold text-white">
                                {uptimeData?.[0] ? `${uptimeData[0].uptimePercentage}%` : '---'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Wifi className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Latency Avg</p>
                            <p className="text-xl font-bold text-white">
                                {perfTrends?.length > 0
                                    ? `${Math.round(perfTrends.reduce((acc, curr) => acc + (curr.latency || 0), 0) / perfTrends.length)} ms`
                                    : '--- ms'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Timeframe</p>
                            <div className="flex bg-slate-800/50 p-0.5 rounded-lg">
                                {['7d', '30d'].map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTimeframe(t)}
                                        className={clsx(
                                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all",
                                            timeframe === t ? "bg-primary text-white" : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Performance Charts (Latency & Signal Combined) */}
            {category === 'signal' && (
                <Card className="bg-slate-950 border-slate-800 overflow-hidden shadow-2xl">
                    <CardHeader className="p-5 border-b border-slate-900 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-black text-slate-400 flex items-center gap-2.5 uppercase tracking-[0.1em]">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            ONU Performance History: Latency & Rx Power ({timeframe})
                        </CardTitle>
                        <div className="flex items-center gap-4 text-[10px] font-bold">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-slate-500">LATENCY (ms)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-purple-500" />
                                <span className="text-slate-500">RX ONU (dBm)</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 h-[320px] relative">
                        {perfLoading ? (
                            <div className="h-full flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 animate-spin text-slate-800" />
                            </div>
                        ) : perfTrends?.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={perfTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorSignal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                                    <XAxis
                                        dataKey="timestamp"
                                        stroke="#475569"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                        tickFormatter={(val) => {
                                            const date = new Date(val);
                                            return date.getHours().toString().padStart(2, '0') + ':00';
                                        }}
                                    />
                                    {/* Left Axis: Latency */}
                                    <YAxis
                                        yAxisId="left"
                                        orientation="left"
                                        stroke="#3b82f6"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[0, 'auto']}
                                        unit="ms"
                                        dx={-5}
                                    />
                                    {/* Right Axis: Signal */}
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        stroke="#a855f7"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        domain={[-35, -5]}
                                        unit="dBm"
                                        dx={5}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    
                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="latency"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorLatency)"
                                        name="Latency"
                                        unit="ms"
                                        animationDuration={1500}
                                    />
                                    <Area
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="signal"
                                        stroke="#a855f7"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorSignal)"
                                        name="Rx Power"
                                        unit="dBm"
                                        animationDuration={2000}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                <Activity className="w-12 h-12 mb-4 opacity-10" />
                                <p className="text-xs font-bold uppercase tracking-widest opacity-40 italic">Data Performa Tidak Tersedia</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Alert Trends Chart (Show only in overall or issues view) */}
            {(category === 'all' || category === 'issues') && (
                <Card className="bg-slate-950 border-slate-800 overflow-hidden">
                    <CardHeader className="p-4 border-b border-slate-800">
                        <CardTitle className="text-xs font-bold text-slate-400 flex items-center gap-2 uppercase tracking-tight">
                            <TrendingUp className="w-3.5 h-3.5 text-primary" />
                            Grafik Efektivitas Respon & Kejadian (14 Hari)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 h-[180px]">
                        {trendsLoading ? (
                            <div className="h-full flex items-center justify-center">
                                <RefreshCw className="w-6 h-6 animate-spin text-slate-700" />
                            </div>
                        ) : alertChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={alertChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis
                                        dataKey="displayDate"
                                        stroke="#475569"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="#475569"
                                        fontSize={9}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                                    <Bar
                                        dataKey="total"
                                        fill="#3b82f6"
                                        radius={[4, 4, 0, 0]}
                                        name="Total Kejadian"
                                        barSize={24}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600">
                                <AlertTriangle className="w-8 h-8 mb-2 opacity-20" />
                                <p className="text-xs italic">Data tren tidak tersedia</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Content Filters & List */}
            <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="p-3 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto no-scrollbar">
                        {CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setCategory(cat.id);
                                        setPage(1);
                                    }}
                                    className={clsx(
                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap",
                                        category === cat.id
                                            ? "bg-primary text-white shadow-lg shadow-primary/20"
                                            : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                    )}
                                >
                                    <Icon className={clsx("w-3.5 h-3.5", category === cat.id ? "text-white" : cat.color)} />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                            className="h-8 w-8 p-0 hover:bg-slate-800"
                        >
                            <RefreshCw className={clsx("w-4 h-4 text-slate-500", alertsLoading && "animate-spin")} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-800/50">
                        {alertsLoading && page === 1 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="p-3 rounded-full bg-slate-800 animate-pulse">
                                    <RefreshCw className="w-6 h-6 animate-spin text-primary/40" />
                                </div>
                                <p className="text-[11px] text-slate-500 font-medium">Sinkronisasi data riwayat...</p>
                            </div>
                        ) : alerts.length > 0 ? (
                            <>
                                {alerts.map((alert) => (
                                    <div key={alert.id} className="p-4 hover:bg-slate-800/20 transition-colors">
                                        <div className="flex items-start gap-4">
                                            <div className={clsx(
                                                "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                                alert.resolved ? 'bg-slate-700 shadow-none' :
                                                    alert.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse' :
                                                        alert.severity === 'warning' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
                                                            'bg-blue-500'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-4 mb-0.5">
                                                    <h4 className={clsx(
                                                        "text-[13px] font-bold truncate leading-tight",
                                                        alert.resolved ? "text-slate-500" : "text-slate-100"
                                                    )}>
                                                        {alert.title}
                                                    </h4>
                                                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap bg-slate-900 px-1.5 py-0.5 rounded">
                                                        {formatShortDateTime(alert.createdAt, timezone)}
                                                    </span>
                                                </div>
                                                <p className={clsx(
                                                    "text-[11px] leading-relaxed line-clamp-2 mb-2",
                                                    alert.resolved ? "text-slate-600" : "text-slate-400"
                                                )}>
                                                    {alert.message}
                                                </p>

                                                <div className="flex items-center gap-2">
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded-[4px] text-[9px] font-black uppercase tracking-wider border",
                                                        alert.resolved ? "bg-slate-800/40 text-slate-600 border-slate-700/30" :
                                                            alert.severity === 'critical' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                                alert.severity === 'warning' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                                                    "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                                    )}>
                                                        {alert.type?.replace(/_/g, ' ') || 'SYSTEM'}
                                                    </span>

                                                    {/* Contextual icons for signal/latency */}
                                                    {alert.type === 'high_latency' && (
                                                        <span className="flex items-center gap-1 text-[9px] text-amber-400 font-bold">
                                                            <Activity className="w-3 h-3" />
                                                            LATENCY
                                                        </span>
                                                    )}
                                                    {alert.type === 'packet_loss' && (
                                                        <span className="flex items-center gap-1 text-[9px] text-red-400 font-bold">
                                                            <Zap className="w-3 h-3" />
                                                            DROPPED
                                                        </span>
                                                    )}

                                                    {alert.resolved && (
                                                        <span className="flex items-center gap-1 text-[9px] text-emerald-500/80 bg-emerald-500/5 px-1.5 py-0.5 rounded font-bold italic">
                                                            <CheckCircle className="w-3 h-3" />
                                                            SOLVED AT {formatShortDateTime(alert.resolvedAt, timezone)?.split(',')[1]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Pagination */}
                                <div className="p-3 border-t border-slate-800/50 flex items-center justify-between bg-slate-900/20">
                                    <button
                                        className="px-3 py-1 text-[10px] font-bold bg-slate-800 text-slate-400 rounded hover:bg-slate-750 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center gap-1"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                                        LAMA
                                    </button>
                                    <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                                        HLM <span className="text-primary">{page}</span> / {meta.totalPages || '?'}
                                    </div>
                                    <button
                                        className="px-3 py-1 text-[10px] font-bold bg-slate-800 text-slate-400 rounded hover:bg-slate-750 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all flex items-center gap-1"
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={page >= (meta.totalPages || 1)}
                                    >
                                        BARU
                                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                                <History className="w-12 h-12 mb-3 opacity-5" />
                                <p className="text-xs font-bold tracking-tight uppercase">Riwayat Bersih</p>
                                <p className="text-[10px] mt-1 opacity-60">Tidak ada catatan dalam kategori ini.</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
