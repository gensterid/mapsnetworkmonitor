import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import NetworkMap from '@/components/NetworkMap';
import { useRouters, useAlerts, useSettings, useCurrentUser } from '@/hooks';
import { formatRelativeTime } from '@/lib/timezone';
import {
    Router as RouterIcon,
    Wifi,
    WifiOff,
    AlertTriangle,
    Activity,
    RefreshCw,
    Plus,
    Filter,
    CheckCircle,
    Clock,
    Zap,
    MapPin,
    Settings
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import clsx from 'clsx';

// Stats Card Component
function StatsCard({ icon: Icon, label, value, trend, trendLabel, color, progress }) {
    const colorClasses = {
        success: { bg: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-400' },
        danger: { bg: 'bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/20', text: 'text-red-400', icon: 'text-red-400' },
        warning: { bg: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' },
        primary: { bg: 'bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-400' },
    };
    const colors = colorClasses[color] || colorClasses.primary;

    return (
        <div className="glass-panel rounded-xl p-5 flex flex-col justify-between h-32 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
            <div className={clsx("absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity", colors.text)}>
                <Icon className="w-16 h-16" />
            </div>
            <div className="flex items-center gap-3 z-10">
                <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", colors.bg)}>
                    <Icon className={clsx("w-5 h-5", colors.icon)} />
                </div>
                <span className="text-slate-400 text-sm font-medium">{label}</span>
            </div>
            <div className="flex items-end gap-2 z-10">
                <span className="text-3xl font-bold text-white">{value}</span>
                {trend && (
                    <span className={clsx("text-xs font-medium mb-1.5 flex items-center", colors.text)}>
                        {trend}
                    </span>
                )}
                {trendLabel && (
                    <span className="text-xs font-medium text-slate-500 mb-1.5">{trendLabel}</span>
                )}
            </div>
            {progress !== undefined && (
                <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-dark">
                    <div className={clsx("h-full", colors.bg.replace('/20', ''))} style={{ width: `${progress}%` }} />
                </div>
            )}
        </div>
    );
}


// Active Connections Table
function ActiveConnectionsTable({ routers }) {
    const getStatusBadge = (status, latency) => {
        if (status !== 'online') {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Offline
                </span>
            );
        }
        if (latency > 100) {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    High Latency
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online
            </span>
        );
    };

    return (
        <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-700/30 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Active Connections</h3>
                <Link to="/routers" className="text-xs text-primary hover:text-blue-400 font-medium">View All</Link>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-dark/50 border-b border-slate-700/30 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                            <th className="px-6 py-4">Device Name</th>
                            <th className="px-6 py-4">IP Address</th>
                            <th className="px-6 py-4">Location</th>
                            <th className="px-6 py-4">Latency</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-700/30">
                        {routers.slice(0, 5).map((router) => (
                            <tr key={router.id} className="group hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                    <Link to={`/routers/${router.id}`} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-700/50 flex items-center justify-center text-slate-400">
                                            <RouterIcon className="w-4 h-4" />
                                        </div>
                                        <span className="font-medium text-white hover:text-primary transition-colors">{router.name}</span>
                                    </Link>
                                </td>
                                <td className="px-6 py-4 font-mono text-slate-400">{router.host}</td>
                                <td className="px-6 py-4 text-slate-400">{router.location || 'Unknown'}</td>
                                <td className="px-6 py-4">
                                    <span className={clsx(
                                        "font-medium",
                                        router.status !== 'online' ? "text-slate-500" :
                                            router.latency > 100 ? "text-yellow-500" : "text-emerald-500"
                                    )}>
                                        {router.status === 'online' ? `${router.latency || '--'}ms` : '--'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {getStatusBadge(router.status, router.latency)}
                                </td>
                            </tr>
                        ))}
                        {routers.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                    No devices found. Add your first router to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Recent Alerts Component
function RecentAlerts({ alerts, settings, currentUser }) {
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return { dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-500 border-red-500/20' };
            case 'warning': return { dot: 'bg-yellow-500', badge: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
            case 'info': return { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
            case 'success': return { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
            default: return { dot: 'bg-slate-500', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
        }
    };

    const formatTime = (date) => formatRelativeTime(date, timezone);

    // Limit to 5 most recent alerts for dashboard
    const recentAlerts = alerts.slice(0, 5);

    // Mock alerts if none exist
    const displayAlerts = recentAlerts.length > 0 ? recentAlerts : [
        { id: 1, title: 'System Ready', description: 'All systems are operational and ready for monitoring.', severity: 'success', createdAt: new Date() },
    ];

    return (
        <div className="glass-panel rounded-xl h-full flex flex-col">
            <div className="p-4 border-b border-slate-700/30 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Recent Alerts</h3>
                <Link to="/alerts" className="text-slate-400 hover:text-white">
                    <Filter className="w-5 h-5" />
                </Link>
            </div>
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                <div className="relative pl-2">
                    {/* Timeline line */}
                    <div className="absolute left-[9px] top-2 bottom-0 w-px bg-slate-800" />

                    {displayAlerts.map((alert, idx) => {
                        const colors = getSeverityColor(alert.severity);
                        return (
                            <div key={alert.id} className="relative pl-8 pb-8 group">
                                <div className={clsx(
                                    "absolute left-0 top-1 w-[19px] h-[19px] rounded-full border-[3px] border-background-dark z-10",
                                    colors.dot,
                                    alert.severity === 'critical' && "shadow-[0_0_0_4px_rgba(239,68,68,0.2)]"
                                )} />
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-white">{alert.title}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{formatTime(alert.createdAt)}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">{alert.message || alert.description}</p>
                                    <div className="mt-2">
                                        <span className={clsx(
                                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border capitalize",
                                            colors.badge
                                        )}>
                                            {alert.severity}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="p-4 border-t border-slate-700/30">
                <Link to="/alerts" className="block w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-white text-center transition-colors">
                    View All History
                </Link>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { data: routers = [], isLoading: routersLoading } = useRouters();
    const { data: alerts = [] } = useAlerts();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const [statusFilter, setStatusFilter] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    const userTimezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Update clock every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Apply filter to routers
    const filteredRouters = routers.filter(r => {
        if (statusFilter === 'online') return r.status === 'online';
        if (statusFilter === 'offline') return r.status !== 'online';
        return true;
    });

    const onlineCount = routers.filter(r => r.status === 'online').length;
    const offlineCount = routers.filter(r => r.status !== 'online').length;
    const warningCount = routers.filter(r => r.latency > 100).length;
    const uptime = routers.length > 0 ? ((onlineCount / routers.length) * 100).toFixed(1) : 0;

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* Page Header */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">Network Overview</h2>
                            <p className="text-slate-400 text-sm mt-1">Real-time monitoring of all network devices.</p>
                            <p className="text-primary text-sm font-medium mt-2 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {currentTime.toLocaleDateString('id-ID', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    timeZone: userTimezone
                                })}
                                <span className="text-slate-500">|</span>
                                <span className="text-white font-bold tabular-nums">
                                    {currentTime.toLocaleTimeString('id-ID', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                        hour12: false,
                                        timeZone: userTimezone
                                    })}
                                </span>
                                <span className="text-slate-500 text-xs">
                                    ({userTimezone})
                                </span>
                            </p>
                        </div>
                        <div className="flex gap-2 relative">
                            <Button variant="outline" size="sm" onClick={() => setFilterOpen(!filterOpen)}>
                                <Filter className="w-4 h-4 mr-2" />
                                {statusFilter === 'all' ? 'Filter' : statusFilter === 'online' ? 'Online' : 'Offline'}
                            </Button>
                            {filterOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                                    <div className="absolute right-16 top-full mt-2 z-20 w-40 rounded-lg bg-slate-800 border border-slate-700 shadow-xl overflow-hidden">
                                        <div className="p-1">
                                            {[
                                                { value: 'all', label: 'All Devices' },
                                                { value: 'online', label: 'Online Only' },
                                                { value: 'offline', label: 'Offline Only' },
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => { setStatusFilter(option.value); setFilterOpen(false); }}
                                                    className={clsx(
                                                        "w-full px-3 py-2 rounded-md text-sm text-left transition-colors",
                                                        statusFilter === option.value ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/50"
                                                    )}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <Link to="/routers">
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Device
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatsCard
                            icon={RouterIcon}
                            label="Online Routers"
                            value={onlineCount}
                            trend={onlineCount > 0 ? `+${onlineCount}` : undefined}
                            color="success"
                        />
                        <StatsCard
                            icon={WifiOff}
                            label="Offline Devices"
                            value={offlineCount}
                            trendLabel={offlineCount > 0 ? "Critical" : "All Good"}
                            color="danger"
                        />
                        <StatsCard
                            icon={AlertTriangle}
                            label="Warnings"
                            value={warningCount}
                            trendLabel={warningCount > 0 ? "Needs Attention" : "Clear"}
                            color="warning"
                        />
                        <StatsCard
                            icon={Activity}
                            label="Network Uptime"
                            value={`${uptime}%`}
                            trendLabel={uptime >= 90 ? "Optimal" : "Low"}
                            color="primary"
                            progress={parseFloat(uptime)}
                        />
                    </div>

                    {/* Main Layout Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-[500px]">
                        {/* Left Column: Map & Table */}
                        <div className="xl:col-span-2 flex flex-col gap-6">
                            <div className="glass-panel rounded-xl p-1 flex flex-col h-[400px] relative overflow-hidden">
                                <div className="absolute top-4 left-4 z-[500] bg-slate-900/90 backdrop-blur border border-slate-700/50 px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Live Map</span>
                                </div>
                                <div className="w-full h-full rounded-lg overflow-hidden relative z-0">
                                    <NetworkMap showRoutersOnly={true} />
                                </div>
                            </div>
                            <ActiveConnectionsTable routers={filteredRouters} />
                        </div>

                        {/* Right Column: Alerts Panel */}
                        <div className="xl:col-span-1">
                            <RecentAlerts alerts={alerts} settings={settings} currentUser={currentUser} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
