import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import NetworkMap from '@/components/NetworkMap';
import AiNetworkSummary from '@/components/AiNetworkSummary';
import NetworkHealthCard from '@/components/NetworkHealthCard';
import { 
    useRouters, 
    useAlerts, 
    useUnreadAlertCount, 
    useSettings, 
    useCurrentUser, 
    useAppTimezone,
    useDashboardStats,
    useDownItems
} from '@/hooks';
import { formatRelativeTime, formatDateOnly, formatTimeOnly } from '@/lib/timezone';
import {
    Router as RouterIcon,
    Wifi,
    AlertTriangle,
    Activity,
    RefreshCw,
    Plus,
    Filter,
    CheckCircle,
    Clock,
    Zap,
    MapPin,
    Settings,
    Maximize,
    Minimize,
    Monitor,
    ShieldAlert,
    Users,
    ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton, CardSkeleton, ListSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import clsx from 'clsx';

// Stats Card Component
function StatsCard({ icon: Icon, label, value, trend, trendLabel, color, progress, href, onClick }) {
    const colorClasses = {
        success: { 
            bg: 'gradient-emerald opacity-20', 
            border: 'border-emerald-500/30', 
            text: 'text-emerald-400', 
            glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
        },
        danger: { 
            bg: 'gradient-rose opacity-20', 
            border: 'border-red-500/30', 
            text: 'text-red-400', 
            glow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
        },
        warning: { 
            bg: 'gradient-amber opacity-20', 
            border: 'border-amber-500/30', 
            text: 'text-amber-400', 
            glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]' 
        },
        primary: { 
            bg: 'gradient-indigo opacity-20', 
            border: 'border-blue-500/30', 
            text: 'text-blue-400', 
            glow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
        },
    };
    const colors = colorClasses[color] || colorClasses.primary;

    const handleKeyDown = (e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    };

    const cardContent = (
        <>
            <div className={clsx("absolute inset-0 z-0 transition-opacity duration-500", colors.bg)} aria-hidden="true" />
            <div className={clsx("absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-30 transition-all duration-500 group-hover:scale-110", colors.text)} aria-hidden="true">
                <Icon className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-3 z-10">
                <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border backdrop-blur-md", colors.border)} aria-hidden="true">
                    <Icon className={clsx("w-5 h-5", colors.text)} />
                </div>
                <span className="text-fg text-sm font-semibold tracking-tight">{label}</span>
            </div>
            <div className="flex items-end gap-2 z-10">
                <span className={clsx("text-3xl sm:text-4xl font-bold text-fg tracking-tight drop-shadow-lg", colors.text === 'text-emerald-400' && "text-shadow-glow-emerald")}>
                    {value}
                </span>
                {trend && (
                    <span className={clsx("text-xs font-bold mb-2 flex items-center px-1.5 py-0.5 rounded-lg bg-white/5", colors.text)}>
                        {trend}
                    </span>
                )}
                {trendLabel && (
                    <span className="text-[10px] font-bold text-fg-muted mb-2 uppercase tracking-widest">{trendLabel}</span>
                )}
            </div>
            {progress !== undefined && (
                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/20" aria-hidden="true">
                    <div className={clsx("h-full transition-all duration-1000", colors.bg.replace(' opacity-20', ''))} style={{ width: `${progress}%` }} />
                </div>
            )}
        </>
    );

    const cardClassName = clsx(
        "glass-premium rounded-2xl p-6 flex flex-col justify-between h-40 relative overflow-hidden group card-hover-premium cursor-pointer outline-none focus:ring-2 focus:ring-primary/50",
        colors.border
    );

    if (href) {
        return (
            <Link to={href} className={cardClassName} aria-label={`${label}: ${value}. Klik untuk buka ${label}`}>
                {cardContent}
            </Link>
        );
    }

    if (onClick) {
        return (
            <button 
                onClick={onClick} 
                onKeyDown={handleKeyDown}
                className={clsx(cardClassName, "text-left w-full")}
                aria-label={`${label}: ${value}. Klik untuk filter ${label}`}
            >
                {cardContent}
            </button>
        );
    }

    return (
        <div className={cardClassName} role="region" aria-label={label}>
            {cardContent}
        </div>
    );
}

// Enhanced Status Card with Total/Up/Down breakdown
function MultiStatsCard({ icon: Icon, label, total, up, down, color, onClickDown }) {
    const isClickable = down > 0 && onClickDown;
    
    return (
        <div className="glass-premium rounded-2xl p-6 flex flex-col justify-between h-40 relative overflow-hidden group card-hover-premium border-white/5">
            <div className="absolute inset-0 z-0 gradient-indigo opacity-5" aria-hidden="true" />
            <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-all duration-500" aria-hidden="true">
                <Icon className="w-20 h-20" />
            </div>
            
            <div className="flex items-center gap-3 relative z-10">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-fg-muted">
                    <Icon className="w-5 h-5" />
                </div>
                <span className="text-fg-muted text-xs font-bold tracking-widest uppercase">{label}</span>
            </div>

            <div className="flex items-end justify-between z-10 mt-2 relative">
                <div className="flex flex-col">
                    <span className="text-3xl sm:text-4xl font-black text-fg tracking-tighter drop-shadow-lg">{total}</span>
                    <span className="text-[10px] text-fg-muted font-bold uppercase tracking-widest opacity-80">Total Nodes</span>
                </div>
                
                <div className="flex items-center gap-5">
                    <div className="flex flex-col items-end">
                        <span className="text-emerald-400 text-xl font-black">{up}</span>
                        <span className="text-[9px] text-fg-muted uppercase font-black tracking-tighter">Active</span>
                    </div>
                    
                    <button 
                        onClick={() => isClickable && onClickDown()}
                        disabled={!isClickable}
                        className={clsx(
                            "flex flex-col items-end transition-all outline-none relative",
                            isClickable ? "hover:scale-110 cursor-pointer" : "opacity-30 cursor-default"
                        )}
                    >
                        {down > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                        )}
                        <span className={clsx(
                            "text-xl font-black transition-colors duration-300",
                            down > 0 ? "text-red-400" : "text-slate-600"
                        )}>{down}</span>
                        <span className="text-[9px] text-fg-muted uppercase font-black tracking-tighter">Critical</span>
                    </button>
                </div>
            </div>
            
            {/* Health Bar (Premium) */}
            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/20" aria-hidden="true">
                <div 
                    className={clsx(
                        "h-full transition-all duration-1000 relative",
                        down === 0 ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-red-500 shadow-[0_0_10px_#ef4444]"
                    )} 
                    style={{ width: `${total > 0 ? (up / total) * 100 : 100}%` }} 
                >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

// Component to show list of down items
function StatusDetailsModal({ type, isOpen, onClose }) {
    const { data: items = [], isLoading } = useDownItems(type, { enabled: isOpen });
    const timezone = useAppTimezone();

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={type === 'netwatch' ? 'Netwatch Down List' : 'PPPoE Disconnected List'}
            maxWidth="max-w-2xl"
        >
            <div className="flex flex-col gap-4">
                {isLoading ? (
                    <ListSkeleton rows={5} />
                ) : items.length > 0 ? (
                    <div className="divide-y divide-slate-800">
                        {items.map((item) => (
                            <div key={item.id} className="py-3 flex items-center justify-between group">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-fg tracking-tight">{item.name || 'Unnamed'}</span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
                                            {item.host || 'No IP'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-fg-muted">
                                        <RouterIcon className="w-3 h-3" />
                                        <span>{item.routerName}</span>
                                        <span>•</span>
                                        <span>Down since: {item.lastDown ? formatRelativeTime(item.lastDown, timezone) : 'N/A'}</span>
                                    </div>
                                </div>
                                <Link 
                                    to={`/routers/${item.routerId}`} 
                                    className="p-2 rounded-lg bg-slate-surface text-fg-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-slate-border hover:text-fg"
                                >
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center text-center">
                        <CheckCircle className="w-12 h-12 text-emerald-500/20 mb-3" />
                        <p className="text-fg font-medium tracking-tight">No items are currently down</p>
                        <p className="text-fg-muted text-xs mt-1 italic">Everything looking healthy!</p>
                    </div>
                )}
            </div>
        </Modal>
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
            <div className="p-4 border-b border-slate-border/30 flex items-center justify-between">
                <h3 className="text-base font-semibold text-fg">Active Connections</h3>
                <Link to="/routers" className="text-xs text-primary hover:text-blue-400 font-medium tracking-wider uppercase">View All</Link>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-800/50">
                {routers.slice(0, 5).map((router) => (
                    <Link
                        key={router.id}
                        to={`/routers/${router.id}`}
                        className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-surface flex items-center justify-center text-fg-muted shadow-inner">
                                <RouterIcon className="w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-fg text-sm">{router.name}</span>
                                <span className="text-[10px] text-fg-muted font-mono tracking-tighter">{router.host}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                            {getStatusBadge(router.status, router.latency)}
                            <span className={clsx(
                                "text-[10px] font-black uppercase tracking-widest",
                                router.status !== 'online' ? "text-slate-600" :
                                    router.latency > 100 ? "text-yellow-500" : "text-emerald-500"
                            )}>
                                {router.status === 'online' ? `${router.latency || '--'}ms` : '--'}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-dark/50 border-b border-slate-border/30 text-xs uppercase text-fg-muted font-semibold tracking-wider">
                            <th className="px-6 py-4">Device Name</th>
                            <th className="px-6 py-4 hidden md:table-cell">IP Address</th>
                            <th className="px-6 py-4 hidden lg:table-cell">Location</th>
                            <th className="px-6 py-4">Latency</th>
                            <th className="px-6 py-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-700/30">
                        {routers.slice(0, 5).map((router) => (
                            <tr key={router.id} className="group hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                    <Link to={`/routers/${router.id}`} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-border/50 flex items-center justify-center text-fg-muted">
                                            <RouterIcon className="w-4 h-4" />
                                        </div>
                                        <span className="font-medium text-fg hover:text-primary transition-colors">{router.name}</span>
                                    </Link>
                                </td>
                                <td className="px-6 py-4 font-mono text-fg-muted hidden md:table-cell">{router.host}</td>
                                <td className="px-6 py-4 text-fg-muted hidden lg:table-cell">{router.location || 'Unknown'}</td>
                                <td className="px-6 py-4">
                                    <span className={clsx(
                                        "font-medium",
                                        router.status !== 'online' ? "text-fg-muted" :
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
                    </tbody>
                </table>
            </div>

            {routers.length === 0 && (
                <div className="px-6 py-12 text-center flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-surface/50 flex items-center justify-center">
                        <RouterIcon className="w-6 h-6 text-slate-600" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-fg-muted">No devices found</p>
                        <p className="text-xs text-fg-muted mt-1 italic">Add your first router to get started.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Dashboard() {
    const { data: routers = [], isLoading: routersLoading } = useRouters();
    const { data: alertCountData } = useUnreadAlertCount();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const [statusFilter, setStatusFilter] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [downListModal, setDownListModal] = useState({ open: false, type: null });

    const { data: stats, isLoading: statsLoading } = useDashboardStats();

    const userTimezone = useAppTimezone();

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
    
    // Use alert counts if available to include more comprehensive monitoring data (Netwatch, Packet Loss, etc.)
    // alertCountData.connectivity matches the "Alerts" badge in the sidebar
    // alertCountData.issues matches the "Issues" badge in the sidebar
    const offlineCount = alertCountData ? alertCountData.connectivity : routers.filter(r => r.status !== 'online').length;
    const warningCount = alertCountData ? alertCountData.issues : routers.filter(r => r.latency > 100).length;
    const uptime = routers.length > 0 ? ((onlineCount / routers.length) * 100).toFixed(1) : 0;

    return (
        <main className="flex flex-col h-full bg-background-dark overflow-hidden" aria-label="Dashboard Monitoring Jaringan">
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* AI Network Summary */}
                    <AiNetworkSummary />

                    {/* Page Header */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-fg tracking-tight">Network Overview</h2>
                            <p className="text-fg-muted text-sm mt-1">Real-time monitoring of all network devices.</p>
                            <p className="text-primary text-sm font-medium mt-2 flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {formatDateOnly(currentTime, userTimezone)}
                                <span className="text-fg-muted">|</span>
                                <span className="text-fg font-bold tabular-nums">
                                    {formatTimeOnly(currentTime, userTimezone)}
                                </span>
                                <span className="text-fg-muted text-xs">
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
                                    <div className="absolute right-16 top-full mt-2 z-20 w-40 rounded-lg bg-surface-dark border border-slate-border shadow-xl overflow-hidden">
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
                                                        statusFilter === option.value ? "bg-slate-surface text-fg" : "text-fg hover:bg-slate-surface/60"
                                                    )}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <Link to="/kiosk">
                                <Button variant="outline" size="sm" className="hidden lg:flex border-primary/30 text-primary hover:bg-primary/10">
                                    <Monitor className="w-4 h-4 mr-2" />
                                    NOC View
                                </Button>
                            </Link>
                            <Link to="/routers">
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Device
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-labelledby="stats-heading">
                        <h2 id="stats-heading" className="sr-only">Statistik Real-time</h2>
                        {routersLoading || statsLoading ? (
                            <>
                                <CardSkeleton />
                                <CardSkeleton />
                                <CardSkeleton />
                                <CardSkeleton />
                            </>
                        ) : (
                            <>
                                <StatsCard
                                    icon={RouterIcon}
                                    label="Online Routers"
                                    value={stats?.routers?.online || onlineCount}
                                    trend={onlineCount > 0 ? `+${onlineCount}` : undefined}
                                    color="success"
                                    onClick={() => setStatusFilter('online')}
                                />
                                <MultiStatsCard
                                    icon={ShieldAlert}
                                    label="Netwatch Status"
                                    total={stats?.netwatch?.total || 0}
                                    up={stats?.netwatch?.up || 0}
                                    down={stats?.netwatch?.down || 0}
                                    onClickDown={() => setDownListModal({ open: true, type: 'netwatch' })}
                                />
                                <MultiStatsCard
                                    icon={Users}
                                    label="PPPoE Sessions"
                                    total={stats?.pppoe?.total || 0}
                                    up={stats?.pppoe?.up || 0}
                                    down={stats?.pppoe?.down || 0}
                                    onClickDown={() => setDownListModal({ open: true, type: 'pppoe' })}
                                />
                                <StatsCard
                                    icon={Activity}
                                    label="Network Uptime"
                                    value={`${uptime}%`}
                                    color="primary"
                                    progress={parseFloat(uptime)}
                                    onClick={() => setStatusFilter('all')}
                                />
                            </>
                        )}
                    </section>

                    {/* Main Layout Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-[500px]">
                        {/* Left Column: Map & Table */}
                        <div className="xl:col-span-2 flex flex-col gap-6">
                            <div className={clsx(
                                "glass-panel p-1 flex flex-col relative overflow-hidden transition-all duration-300",
                                isFullscreen ? "fixed inset-4 z-[60] h-[calc(100vh-2rem)] rounded-xl shadow-2xl shadow-black/50 ring-1 ring-slate-700/50 bg-background-dark/95 backdrop-blur" : "rounded-xl h-[400px]"
                            )}>
                                {/* Overlay badge selalu dark (kontras dengan map tile terang).
                                    Teks tetap literal slate-100/slate-400 — bukan text-fg —
                                    karena bg-nya fixed dark, text-fg (slate-900 di Daylight)
                                    akan jadi dark-on-dark. */}
                                <div className="absolute top-4 left-4 z-[500] bg-slate-900/90 backdrop-blur border border-slate-border/50 px-3 py-1.5 rounded-lg shadow-lg flex items-center justify-between gap-2 pointer-events-auto">
                                    <div className="flex items-center gap-2 pointer-events-none">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Live Map</span>
                                    </div>
                                    <div className="w-px h-4 bg-slate-border mx-2"></div>
                                    <button
                                        onClick={() => setIsFullscreen(!isFullscreen)}
                                        className="text-slate-400 hover:text-slate-100 transition-colors"
                                        title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                                    >
                                        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="w-full h-full rounded-lg overflow-hidden relative z-0">
                                    <NetworkMap showRoutersOnly={true} disableScaling={true} />
                                </div>
                            </div>
                            {routersLoading ? (
                                <div className="glass-panel p-6 rounded-xl h-64">
                                    <ListSkeleton rows={5} />
                                </div>
                            ) : (
                                <ActiveConnectionsTable routers={filteredRouters} />
                            )}
                        </div>

                        {/* Right Column: Health & Alerts Panel */}
                        <div className="xl:col-span-1 flex flex-col gap-6">
                            <NetworkHealthCard />
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Down List */}
            <StatusDetailsModal 
                isOpen={downListModal.open} 
                type={downListModal.type} 
                onClose={() => setDownListModal({ ...downListModal, open: false })} 
            />
        </main>
    );
}
