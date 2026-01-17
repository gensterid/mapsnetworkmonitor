import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useRouters } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    Router as RouterIcon
} from 'lucide-react';
import clsx from 'clsx';

// Simple bar chart component
function SimpleBarChart({ data, dataKey, color = 'primary', height = 200 }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                No data available
            </div>
        );
    }

    const maxValue = Math.max(...data.map(d => d[dataKey] || 0), 1);

    return (
        <div className="relative" style={{ height }}>
            <div className="flex items-end justify-between gap-1 h-full">
                {data.map((item, index) => {
                    const value = item[dataKey] || 0;
                    const heightPercent = (value / maxValue) * 100;
                    return (
                        <div
                            key={index}
                            className="flex-1 flex flex-col items-center gap-1"
                        >
                            <span className="text-[10px] text-slate-400">{value}</span>
                            <div
                                className={clsx(
                                    "w-full rounded-t transition-all",
                                    color === 'danger' ? 'bg-red-500' :
                                        color === 'warning' ? 'bg-amber-500' :
                                            color === 'success' ? 'bg-emerald-500' :
                                                'bg-primary'
                                )}
                                style={{ height: `${Math.max(heightPercent, 2)}%` }}
                            />
                            <span className="text-[9px] text-slate-500 truncate w-full text-center">
                                {item.label || item.date?.slice(5) || index + 1}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Multi-line trend chart
function TrendChart({ data, height = 200 }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                No data available
            </div>
        );
    }

    const maxCpu = Math.max(...data.map(d => d.avgCpu || 0), 1);
    const maxMem = Math.max(...data.map(d => d.avgMemory || 0), 1);
    const maxValue = Math.max(maxCpu, maxMem, 100);

    return (
        <div className="relative" style={{ height }}>
            <svg className="w-full h-full" viewBox={`0 0 ${data.length * 20} ${height}`} preserveAspectRatio="none">
                {/* CPU Line */}
                <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    points={data.map((d, i) => `${i * 20 + 10},${height - (d.avgCpu / maxValue) * height}`).join(' ')}
                />
                {/* Memory Line */}
                <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    points={data.map((d, i) => `${i * 20 + 10},${height - (d.avgMemory / maxValue) * height}`).join(' ')}
                />
            </svg>
            <div className="absolute bottom-0 left-0 flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 bg-blue-500 rounded" /> CPU
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-1 bg-emerald-500 rounded" /> Memory
                </span>
            </div>
        </div>
    );
}

// Router Selector with search
function RouterSelector({ routers, value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredRouters = useMemo(() => {
        if (!searchQuery) return routers;
        return routers.filter(r =>
            r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.host.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [routers, searchQuery]);

    const selectedRouter = routers.find(r => r.id === value);

    return (
        <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)}>
                <RouterIcon className="w-4 h-4 mr-2" />
                {selectedRouter?.name || 'Semua Router'}
                <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-20 w-72 rounded-lg bg-slate-800 border border-slate-700 shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Cari router..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            <button
                                onClick={() => {
                                    onChange(null);
                                    setIsOpen(false);
                                    setSearchQuery('');
                                }}
                                className={clsx(
                                    "w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2",
                                    !value ? "bg-primary/10 text-primary" : "text-slate-300 hover:bg-slate-700"
                                )}
                            >
                                <Server className="w-4 h-4" />
                                Semua Router
                            </button>
                            {filteredRouters.map((router) => (
                                <button
                                    key={router.id}
                                    onClick={() => {
                                        onChange(router.id);
                                        setIsOpen(false);
                                        setSearchQuery('');
                                    }}
                                    className={clsx(
                                        "w-full px-4 py-2.5 text-left text-sm transition-colors",
                                        value === router.id ? "bg-primary/10 text-primary" : "text-slate-300 hover:bg-slate-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{router.name}</span>
                                        <span className={clsx(
                                            "w-2 h-2 rounded-full",
                                            router.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                                        )} />
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">{router.host}</span>
                                </button>
                            ))}
                            {filteredRouters.length === 0 && (
                                <p className="text-center text-slate-500 py-4 text-sm">Tidak ada router ditemukan</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Date range picker
function DateRangePicker({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const presets = [
        { label: '7 Hari', days: 7 },
        { label: '30 Hari', days: 30 },
        { label: '90 Hari', days: 90 },
    ];

    return (
        <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)}>
                <Calendar className="w-4 h-4 mr-2" />
                {value.label || 'Pilih Periode'}
                <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-20 w-72 rounded-lg bg-slate-800 border border-slate-700 shadow-xl p-4">
                        <div className="flex gap-2 mb-4">
                            {presets.map((preset) => (
                                <button
                                    key={preset.days}
                                    onClick={() => {
                                        const end = new Date();
                                        const start = new Date();
                                        start.setDate(start.getDate() - preset.days);
                                        onChange({
                                            startDate: start.toISOString().split('T')[0],
                                            endDate: end.toISOString().split('T')[0],
                                            label: preset.label,
                                        });
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "flex-1 px-3 py-2 rounded-lg text-sm transition-colors",
                                        value.label === preset.label
                                            ? "bg-primary text-white"
                                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                    )}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Dari Tanggal</label>
                                <input
                                    type="date"
                                    value={value.startDate}
                                    onChange={(e) => onChange({ ...value, startDate: e.target.value, label: 'Custom' })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Sampai Tanggal</label>
                                <input
                                    type="date"
                                    value={value.endDate}
                                    onChange={(e) => onChange({ ...value, endDate: e.target.value, label: 'Custom' })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Stat Card
function StatCard({ icon: Icon, label, value, subvalue, color = 'primary' }) {
    const colorClasses = {
        success: 'text-emerald-400 bg-emerald-500/10',
        danger: 'text-red-400 bg-red-500/10',
        warning: 'text-amber-400 bg-amber-500/10',
        primary: 'text-blue-400 bg-blue-500/10',
    };

    return (
        <Card className="glass-panel">
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
                    <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", colorClasses[color])}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs">{label}</p>
                        <p className="text-xl font-bold text-white">{value}</p>
                        {subvalue && <p className="text-xs text-slate-500">{subvalue}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function Analytics() {
    // Get routers list (respects user role permissions via the hook)
    const { data: routers = [] } = useRouters();

    // Selected router filter
    const [selectedRouterId, setSelectedRouterId] = useState(null);

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
                                    />
                                )}
                            </CardContent>
                        </Card>

                        {/* Performance Trend */}
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

                    {/* Bottom Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Top Down Devices */}
                        <Card className="glass-panel">
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

                        {/* Uptime Stats */}
                        <Card className="glass-panel">
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

                        {/* Recent Activity */}
                        <Card className="glass-panel">
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
