import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRouter, useRouterInterfaces, useRouterMetrics, useRouterNetwatch, useSettings, useSyncNetwatch, useRefreshRouter, useRouterHotspotActive, useRouterPppActive, usePingLatencies, useCurrentUser } from '@/hooks';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
    ArrowLeft,
    Cpu,
    HardDrive,
    MemoryStick,
    Clock,
    Wifi,
    Activity,
    TrendingUp,
    TrendingDown,
    RefreshCw,
    AlertCircle,
    MapPin,
    Eye,
    Plus,
    Trash2,
    Edit,
    CheckCircle,
    XCircle,
    Server,
    Gauge,
    Users,
    Network,
    PhoneCall,
    Timer,
    Search,
    X
} from 'lucide-react';
import clsx from 'clsx';
import { formatDateWithTimezone } from '@/lib/timezone';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import NetworkMap from '@/components/NetworkMap';

// Tab component
function Tabs({ tabs, activeTab, onTabChange }) {
    return (
        <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                        activeTab === tab.id
                            ? "bg-primary text-white"
                            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

// Stats Card
function StatsCard({ icon: Icon, label, value, color = "blue", subValue }) {
    const colorClasses = {
        blue: "bg-blue-500/10 text-blue-400",
        purple: "bg-purple-500/10 text-purple-400",
        green: "bg-emerald-500/10 text-emerald-400",
        orange: "bg-orange-500/10 text-orange-400",
        red: "bg-red-500/10 text-red-400",
    };

    return (
        <Card className="glass-panel h-full">
            <CardContent className="!p-4 h-full flex items-center">
                <div className="flex items-center gap-3 w-full">
                    <div className={clsx("p-2.5 rounded-lg", colorClasses[color])}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-lg font-semibold text-white truncate">{value}</p>
                        {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Progress Bar
function ProgressBar({ value, color = "blue", label }) {
    const colorClasses = {
        blue: "bg-blue-500",
        purple: "bg-purple-500",
        green: "bg-emerald-500",
        orange: "bg-orange-500",
        red: "bg-red-500",
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-white font-medium">{value}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={clsx("h-full rounded-full transition-all", colorClasses[color])}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
        </div>
    );
}

// Interface Traffic Chart Component
function InterfaceTrafficChart({ routerId, interfaces }) {
    const [selectedInterface, setSelectedInterface] = useState('');
    const [history, setHistory] = useState([]);

    // Find selected interface data
    const currentInterface = interfaces?.find(i => i.name === selectedInterface);

    // Auto-select first interface if current selection is invalid
    useEffect(() => {
        if (interfaces?.length > 0) {
            // If no selection or selected interface not found in list
            if (!selectedInterface || !interfaces.find(i => i.name === selectedInterface)) {
                setSelectedInterface(interfaces[0].name);
            }
        }
    }, [interfaces, selectedInterface]);

    // Update history when interface data changes
    useEffect(() => {
        if (!currentInterface) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setHistory(prev => {
            const newPoint = {
                time: timeLabel,
                tx: currentInterface.txRate || 0,
                rx: currentInterface.rxRate || 0,
            };

            // If history is empty, add a "start" point slightly in the past to create a line immediately
            if (prev.length === 0) {
                return [
                    { ...newPoint, time: '' }, // Ghost point
                    newPoint
                ];
            }

            // Keep last 20 points
            const newHistory = [...prev, newPoint];
            if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
            return newHistory;
        });
    }, [currentInterface?.txRate, currentInterface?.rxRate, currentInterface?.name]); // Listen to specific values

    // Reset history when interface selection actually changes
    useEffect(() => {
        setHistory([]);
    }, [selectedInterface]);

    const formatBits = (bits) => {
        if (!bits || bits === 0) return '0 bps';
        const k = 1000;
        const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
        const i = Math.floor(Math.log(bits) / Math.log(k));
        return parseFloat((bits / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <Card className="glass-panel col-span-1 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Interface Traffic
                </CardTitle>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedInterface}
                        onChange={(e) => setSelectedInterface(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white text-xs rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {interfaces?.map(iface => (
                            <option key={iface.id} value={iface.name}>
                                {iface.name} ({iface.running ? 'up' : 'down'})
                            </option>
                        ))}
                    </select>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={history}>
                            <defs>
                                <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="time"
                                stroke="#475569"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#475569"
                                fontSize={10}
                                tickFormatter={formatBits}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                                domain={[0, 'auto']}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }}
                                itemStyle={{ fontSize: '12px' }}
                                labelStyle={{ color: '#94a3b8', marginBottom: '5px' }}
                                formatter={(value) => [formatBits(value), value === history[history.length - 1]?.tx ? 'TX (Upload)' : 'RX (Download)']}
                            />
                            <Area
                                type="monotone"
                                dataKey="tx"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTx)"
                                name="TX"
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="rx"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRx)"
                                name="RX"
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-xs text-slate-400">TX: {formatBits(currentInterface?.txRate || 0)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-xs text-slate-400">RX: {formatBits(currentInterface?.rxRate || 0)}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Active Users Card Component
function ActiveUsersCard({ routerId }) {
    const { data: hotspotCount } = useRouterHotspotActive(routerId);
    const { data: pppCount } = useRouterPppActive(routerId);

    return (
        <div className="grid grid-cols-2 gap-4">
            <StatsCard
                icon={Wifi}
                label="Hotspot Active"
                value={hotspotCount?.count || 0}
                color="orange"
                subValue="Users"
            />
            <StatsCard
                icon={Network}
                label="PPPoE Active"
                value={pppCount?.count || 0}
                color="blue"
                subValue="Connections"
            />
        </div>
    );
}

// Ping Latency Card Component
function PingLatencyCard({ routerId }) {
    const { data: latencies, isLoading, isFetching, isError, error, refetch } = usePingLatencies(routerId);

    const getLatencyColor = (latency) => {
        if (latency === null) return 'text-slate-500';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getLatencyBg = (latency) => {
        if (latency === null) return 'bg-slate-700';
        if (latency < 50) return 'bg-emerald-500/10';
        if (latency < 100) return 'bg-yellow-500/10';
        return 'bg-red-500/10';
    };

    return (
        <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="w-5 h-5" />
                    Ping Latency
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={clsx("w-3 h-3 text-slate-400", isFetching && "animate-spin")} />
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                    </div>
                ) : isError ? (
                    <div className="text-center py-4 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                        <p>Failed to load latency data</p>
                        <p className="text-xs text-slate-500 mt-1">{error?.message || 'Check logs'}</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                            Try Again
                        </Button>
                    </div>
                ) : !latencies || latencies.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                        No ping targets configured
                        <p className="text-xs mt-1">Configure targets in Settings → General</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {latencies.map((item, idx) => (
                            <div
                                key={idx}
                                className={clsx(
                                    "flex items-center justify-between p-2 rounded-lg",
                                    getLatencyBg(item.latency)
                                )}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm text-white font-medium">{item.label}</span>
                                    <span className="text-xs text-slate-500 font-mono">{item.ip}</span>
                                </div>
                                <span className={clsx("text-lg font-bold font-mono", getLatencyColor(item.latency))}>
                                    {item.latency !== null ? `${item.latency}ms` : '--'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Dashboard Tab Content
function DashboardTab({ router, metrics, interfaces }) {
    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    const formatBits = (bits) => {
        if (!bits) return '0 bps';
        const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
        const i = Math.floor(Math.log(bits) / Math.log(1000));
        return `${(bits / Math.pow(1000, i)).toFixed(1)} ${sizes[i]}`;
    };

    const formatUptime = (seconds) => {
        if (!seconds) return 'N/A';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    };

    const memoryUsage = metrics?.totalMemory && metrics?.usedMemory
        ? ((metrics.usedMemory / metrics.totalMemory) * 100).toFixed(1)
        : 0;

    return (
        <div className="space-y-6">
            {/* System Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard icon={Cpu} label="CPU Usage" value={`${metrics?.cpuLoad || 0}%`} color="blue" />
                <StatsCard icon={MemoryStick} label="Memory" value={`${memoryUsage}%`} subValue={`${formatBytes(metrics?.usedMemory)} / ${formatBytes(metrics?.totalMemory)}`} color="purple" />
                <StatsCard icon={Clock} label="Uptime" value={formatUptime(metrics?.uptime)} color="green" />
                <StatsCard icon={Server} label="Model" value={router?.model || 'Unknown'} subValue={router?.routerOsVersion} color="orange" />
            </div>

            {/* Active Users & Traffic Graph */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <ActiveUsersCard routerId={router.id} />

                    {/* Resource Gauges moved here */}
                    <Card className="glass-panel">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Gauge className="w-5 h-5" />
                                System Resources
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ProgressBar label="CPU Load" value={metrics?.cpuLoad || 0} color={metrics?.cpuLoad > 80 ? "red" : metrics?.cpuLoad > 50 ? "orange" : "blue"} />
                            <ProgressBar label="Memory Usage" value={memoryUsage} color={memoryUsage > 80 ? "red" : memoryUsage > 50 ? "orange" : "purple"} />
                            {metrics?.totalDisk && (
                                <ProgressBar
                                    label="Disk Usage"
                                    value={Math.round((metrics.usedDisk / metrics.totalDisk) * 100)}
                                    color="green"
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* Ping Latency Card */}
                    <PingLatencyCard routerId={router.id} />
                </div>

                {/* Interface Traffic Chart */}
                <InterfaceTrafficChart routerId={router.id} interfaces={interfaces} />
            </div>

            {/* Interfaces Table */}
            <Card className="glass-panel">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="w-5 h-5" />
                        Network Interfaces
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Name</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Type</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Status</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Link</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase">TX Rate</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase">RX Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {interfaces?.length > 0 ? (
                                    interfaces.map((iface) => (
                                        <tr key={iface.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 px-4 text-sm text-white font-medium">
                                                <div className="flex flex-col">
                                                    <span>{iface.name}</span>
                                                    {iface.macAddress && <span className="text-[10px] text-slate-500 font-mono">{iface.macAddress}</span>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-slate-300">{iface.type || 'ethernet'}</td>
                                            <td className="py-3 px-4">
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    iface.running
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-slate-700 text-slate-400"
                                                )}>
                                                    {iface.running ? 'Running' : 'Down'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-slate-300">
                                                {iface.speed || '--'}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center gap-1 text-sm text-green-400 font-mono font-medium">
                                                        <TrendingUp className="w-3 h-3" />
                                                        {formatBits(iface.txRate)}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">{formatBytes(iface.txBytes)} total</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center gap-1 text-sm text-blue-400 font-mono font-medium">
                                                        <TrendingDown className="w-3 h-3" />
                                                        {formatBits(iface.rxRate)}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500">{formatBytes(iface.rxBytes)} total</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-slate-500">
                                            No interfaces found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card >
        </div >
    );
}


// Edit Router Modal
function EditRouterModal({ isOpen, onClose, onSuccess, router }) {
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: '8728',
        username: '',
        password: '', // Leave empty to keep unchanged
        latitude: '',
        longitude: '',
        location: '',
        notes: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (router) {
            setFormData({
                name: router.name || '',
                host: router.host || '',
                port: String(router.port || '8728'),
                username: router.username || '',
                password: '',
                latitude: router.latitude || '',
                longitude: router.longitude || '',
                location: router.location || '',
                notes: router.notes || ''
            });
        }
    }, [router, isOpen]);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleCoordinateInput = (e) => {
        const value = e.target.value;
        if (value.includes(',')) {
            const parts = value.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                setFormData(prev => ({ ...prev, latitude: parts[0], longitude: parts[1] }));
                return;
            }
        }
        setFormData(prev => ({ ...prev, latitude: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                name: formData.name,
                host: formData.host,
                port: parseInt(formData.port, 10),
                username: formData.username,
                latitude: formData.latitude,
                longitude: formData.longitude,
                location: formData.location,
                notes: formData.notes
            };

            if (formData.password) {
                payload.password = formData.password;
            }

            // Remove empty strings for optional fields to rely on backend/schema handling
            Object.keys(payload).forEach(key => {
                if (payload[key] === '') payload[key] = undefined;
            });

            await apiClient.put(`/routers/${router.id}`, payload);
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to update router:', err);
            setError(err.response?.data?.message || err.message || 'Failed to update router');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Router">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Name" name="name" value={formData.name} onChange={handleChange} required />
                    <Input label="Host / IP" name="host" value={formData.host} onChange={handleChange} required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Username" name="username" value={formData.username} onChange={handleChange} required />
                    <Input label="Port" name="port" type="number" value={formData.port} onChange={handleChange} required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <Input
                            label="Password"
                            name="password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Leave empty to keep current password"
                        />
                    </div>
                </div>

                <div className="border-t border-slate-700 pt-4">
                    <h4 className="text-sm font-medium text-slate-300 mb-3 block">Location & Map</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Latitude (or 'lat, lng')"
                            name="latitude"
                            value={formData.latitude}
                            onChange={handleCoordinateInput}
                            placeholder="-6.123456"
                        />
                        <Input
                            label="Longitude"
                            name="longitude"
                            value={formData.longitude}
                            onChange={handleChange}
                            placeholder="106.123456"
                        />
                    </div>
                    <div className="mt-4">
                        <Input label="Location Name" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Server Room A" />
                    </div>
                </div>

                <div>
                    <label className="text-sm font-medium text-slate-300 mb-1.5 block">Notes</label>
                    <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm h-20"
                        placeholder="Additional notes..."
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>Save Changes</Button>
                </div>
            </form>
        </Modal>
    );
}
// Netwatch Form Modal
function NetwatchFormModal({ isOpen, onClose, onSuccess, netwatch = null, routerId }) {
    const isEditing = !!netwatch;
    const [formData, setFormData] = useState({
        host: '',
        name: '',
        interval: '30',
        latitude: '',
        longitude: '',
        location: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (netwatch) {
            setFormData({
                host: netwatch.host || '',
                name: netwatch.name || '',
                interval: String(netwatch.interval || 30),
                latitude: netwatch.latitude || '',
                longitude: netwatch.longitude || '',
                location: netwatch.location || '',
            });
        } else {
            setFormData({
                host: '',
                name: '',
                interval: '30',
                latitude: '',
                longitude: '',
                location: '',
            });
        }
        setError('');
    }, [netwatch, isOpen]);

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleCoordinateInput = (e) => {
        const value = e.target.value;
        if (value.includes(',')) {
            const parts = value.split(',').map(p => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                setFormData(prev => ({ ...prev, latitude: parts[0], longitude: parts[1] }));
                return;
            }
        }
        setFormData(prev => ({ ...prev, latitude: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const payload = {
                host: formData.host,
                name: formData.name,
                interval: parseInt(formData.interval, 10),
            };

            // Only add optional fields if they have values
            if (formData.latitude) payload.latitude = formData.latitude;
            if (formData.longitude) payload.longitude = formData.longitude;
            if (formData.location) payload.location = formData.location;

            if (isEditing) {
                await apiClient.put(`/routers/${routerId}/netwatch/${netwatch.id}`, payload);
            } else {
                await apiClient.post(`/routers/${routerId}/netwatch`, payload);
            }

            onSuccess?.();
            onClose();
        } catch (err) {
            console.error('Netwatch form error:', err);
            setError(err.response?.data?.message || `Failed to ${isEditing ? 'update' : 'add'} netwatch`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Edit Netwatch" : "Add Netwatch Host"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Host/IP Address *</label>
                        <Input name="host" value={formData.host} onChange={handleChange} placeholder="8.8.8.8" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Name</label>
                        <Input name="name" value={formData.name} onChange={handleChange} placeholder="Google DNS" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Check Interval (seconds)</label>
                        <Input type="number" name="interval" value={formData.interval} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Location Name</label>
                        <Input name="location" value={formData.location} onChange={handleChange} placeholder="Data Center" />
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-700/50">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Map Coordinates (Optional)</div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Latitude</label>
                            <Input name="latitude" value={formData.latitude} onChange={handleCoordinateInput} placeholder="0.5309802" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Longitude</label>
                            <Input name="longitude" value={formData.longitude} onChange={handleChange} placeholder="123.0600260" />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Tip: Paste "lat, long" format to auto-fill</p>
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>
                        {isEditing ? 'Save Changes' : 'Add Host'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// Netwatch Tab Content
function NetwatchTab({ routerId, netwatch = [], refetch }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingNetwatch, setEditingNetwatch] = useState(null);
    const [syncStatus, setSyncStatus] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'up', 'down'
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('status'); // 'status', 'name', 'host', 'location'
    const queryClient = useQueryClient();
    const syncMutation = useSyncNetwatch();
    const { data: currentUser } = useCurrentUser();
    const { data: settings } = useSettings();
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Count up and down hosts
    const upCount = netwatch.filter(n => n.status === 'up').length;
    const downCount = netwatch.filter(n => n.status === 'down' || n.status === 'unknown').length;

    // Filter and sort netwatch
    const filteredNetwatch = (statusFilter === 'all'
        ? netwatch
        : statusFilter === 'up'
            ? netwatch.filter(n => n.status === 'up')
            : netwatch.filter(n => n.status === 'down' || n.status === 'unknown')
    ).filter(n =>
        !searchQuery ||
        n.host?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.location?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
        switch (sortBy) {
            case 'status':
                // Down first, then up
                const statusOrder = { down: 0, unknown: 1, up: 2 };
                return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
            case 'name':
                return (a.name || a.host || '').localeCompare(b.name || b.host || '');
            case 'host':
                return (a.host || '').localeCompare(b.host || '');
            case 'location':
                return (a.location || '').localeCompare(b.location || '');
            default:
                return 0;
        }
    });

    const handleSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ['router-netwatch', routerId] });
        refetch?.();
    };

    const handleDelete = async (nw) => {
        if (!confirm(`Delete netwatch for ${nw.host}?`)) return;
        try {
            await apiClient.delete(`/routers/${routerId}/netwatch/${nw.id}`);
            handleSuccess();
        } catch (err) {
            alert('Failed to delete: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleSync = async () => {
        setSyncStatus('Syncing...');
        try {
            const result = await syncMutation.mutateAsync(routerId);
            if (result.success) {
                setSyncStatus(`Synced ${result.synced} entries from router`);
            } else {
                setSyncStatus(`Synced with errors: ${result.errors.join(', ')}`);
            }
            setTimeout(() => setSyncStatus(''), 5000);
        } catch (err) {
            setSyncStatus('Sync failed: ' + (err.message || 'Unknown error'));
            setTimeout(() => setSyncStatus(''), 5000);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header with counters */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-white">Netwatch Hosts</h3>
                    {/* Status counters - clickable to filter */}
                    <div className="flex gap-2">
                        <div className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-700 text-slate-300">
                            Total: {netwatch.length}
                        </div>
                        <button
                            onClick={() => setStatusFilter(statusFilter === 'up' ? 'all' : 'up')}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                statusFilter === 'up'
                                    ? "bg-emerald-500 text-white"
                                    : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            )}
                        >
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {upCount} Up
                        </button>
                        <button
                            onClick={() => setStatusFilter(statusFilter === 'down' ? 'all' : 'down')}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                statusFilter === 'down'
                                    ? "bg-red-500 text-white"
                                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            )}
                        >
                            <span className="w-2 h-2 rounded-full bg-current" />
                            {downCount} Down
                        </button>
                        {statusFilter !== 'all' && (
                            <button
                                onClick={() => setStatusFilter('all')}
                                className="text-xs text-slate-400 hover:text-white px-2"
                            >
                                Clear filter
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search host, name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary max-w-[120px] sm:max-w-none"
                        >
                            <option value="status">Status</option>
                            <option value="name">Name</option>
                            <option value="host">IP</option>
                            <option value="location">Loc</option>
                        </select>
                        <Button variant="outline" onClick={handleSync} loading={syncMutation.isPending} title="Sync from Router">
                            <RefreshCw className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Sync</span>
                        </Button>
                        <Button onClick={() => setIsAddModalOpen(true)} title="Add Host">
                            <Plus className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Add Host</span>
                        </Button>
                    </div>
                </div>
            </div>

            {syncStatus && (
                <div className={`p-3 rounded-lg text-sm ${syncStatus.includes('failed') || syncStatus.includes('errors')
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}>
                    {syncStatus}
                </div>
            )}

            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-3">
                {filteredNetwatch.length > 0 ? (
                    filteredNetwatch.map((nw) => (
                        <Card key={nw.id} className="glass-panel">
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-white font-mono font-medium">{nw.host}</div>
                                        {nw.name && <div className="text-sm text-slate-400">{nw.name}</div>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={clsx(
                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                            nw.status === 'up'
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "bg-red-500/10 text-red-400"
                                        )}>
                                            {nw.status === 'up' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                            {nw.status === 'up' ? 'Up' : 'Down'}
                                        </span>
                                        {nw.name?.startsWith('[DISABLED]') && (
                                            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Disabled</span>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 mb-3 border-t border-slate-800/50 pt-2">
                                    <div>
                                        <div className="text-slate-600">Location</div>
                                        <div className="text-slate-400 truncate">{nw.location || '-'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-slate-600">Last Check</div>
                                        <div className="text-slate-400">{nw.lastCheck ? new Date(nw.lastCheck).toLocaleTimeString() : '-'}</div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-slate-800/50">
                                    <div className="text-xs">
                                        {nw.status === 'up' && nw.lastUp && (
                                            <span className="text-emerald-500/70">Up since {new Date(nw.lastUp).toLocaleTimeString()}</span>
                                        )}
                                        {nw.status !== 'up' && nw.lastDown && (
                                            <span className="text-red-500/70">Down since {new Date(nw.lastDown).toLocaleTimeString()}</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingNetwatch(nw)}
                                            className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(nw)}
                                            className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-red-400"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="py-8 text-center bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
                        <Eye className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">No hosts found</p>
                    </div>
                )}
            </div>

            {/* Desktop Table View */}
            <Card className="glass-panel hidden sm:block">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700 bg-slate-800/50">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Host</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Name</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Status</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Since</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Location</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Latency</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Coords</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Last Check</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredNetwatch.length > 0 ? filteredNetwatch.map((nw) => (
                                    <tr key={nw.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                        <td className="py-3 px-4 text-sm text-white font-mono">{nw.host}</td>
                                        <td className="py-3 px-4 text-sm text-slate-300">{nw.name || '-'}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex gap-2">
                                                <span className={clsx(
                                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
                                                    nw.status === 'up'
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-red-500/10 text-red-400"
                                                )}>
                                                    {nw.status === 'up' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {nw.status === 'up' ? 'Up' : 'Down'}
                                                </span>
                                                {nw.name?.startsWith('[DISABLED]') && (
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
                                                        Disabled
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm">
                                            {(() => {
                                                const since = nw.status === 'up' ? nw.lastUp : nw.lastDown;
                                                if (!since) return <span className="text-slate-500">-</span>;
                                                const now = new Date();
                                                const sinceDate = new Date(since);
                                                const diffMs = now - sinceDate;
                                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                                const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                                let display = '';
                                                if (diffDays > 0) display = `${diffDays}d ${diffHours}h`;
                                                else if (diffHours > 0) display = `${diffHours}h ${diffMins}m`;
                                                else display = `${diffMins}m`;
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className="text-white font-medium">{formatDateWithTimezone(since, timezone)}</span>
                                                        <span className={clsx("text-xs", nw.status === 'up' ? 'text-emerald-400' : 'text-red-400')}>
                                                            ({display})
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-400">{nw.location || '-'}</td>
                                        <td className="py-3 px-4 text-sm">
                                            {(nw.latency !== undefined && nw.latency !== null) ? (
                                                <div className="flex flex-col">
                                                    <span className={clsx("font-mono font-bold",
                                                        Number(nw.latency) < 20 ? 'text-emerald-400' :
                                                            Number(nw.latency) < 100 ? 'text-yellow-400' : 'text-red-400'
                                                    )}>
                                                        {nw.latency} ms
                                                    </span>
                                                    {nw.packetLoss > 0 && (
                                                        <span className="text-xs text-red-400 font-bold">
                                                            Loss: {nw.packetLoss}%
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {nw.latitude && nw.longitude ? (
                                                <span className="flex items-center gap-1 text-xs text-purple-400">
                                                    <MapPin className="w-3 h-3" />
                                                    Set
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-500">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-400">
                                            {nw.lastCheck ? new Date(nw.lastCheck).toLocaleTimeString() : '-'}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => setEditingNetwatch(nw)}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(nw)}
                                                    className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center">
                                            <Eye className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                                            <p className="text-slate-400 mb-2">No netwatch hosts configured</p>
                                            <p className="text-sm text-slate-500 mb-4">Add hosts to monitor their availability</p>
                                            <Button onClick={() => setIsAddModalOpen(true)}>
                                                Add your first host
                                            </Button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <NetwatchFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSuccess={handleSuccess}
                routerId={routerId}
            />

            <NetwatchFormModal
                isOpen={!!editingNetwatch}
                onClose={() => setEditingNetwatch(null)}
                netwatch={editingNetwatch}
                onSuccess={handleSuccess}
                routerId={routerId}
            />
        </div>
    );
}

// Map Tab Content - Reuses the main NetworkMap component with a router filter
function MapTab({ router }) {
    if (!router) return null;
    return ( // Optimized for mobile: 50vh height on small screens, fixed 600px on desktop
        <div className="h-[50vh] min-h-[400px] sm:h-[600px] w-full rounded-xl overflow-hidden border border-slate-700 relative">
            <NetworkMap routerId={router.id} />
        </div>
    );
}

// PPPoE Coordinates Modal
function PppoeCoordinatesModal({ session, onClose, onSave, isSaving }) {
    const [latitude, setLatitude] = React.useState(session?.latitude || '');
    const [longitude, setLongitude] = React.useState(session?.longitude || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ latitude, longitude });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-primary" />
                        Set Lokasi PPPoE
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                    <div className="text-sm text-slate-400">Username</div>
                    <div className="font-medium text-white">{session?.name}</div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Latitude</label>
                        <input
                            type="text"
                            value={latitude}
                            onChange={(e) => setLatitude(e.target.value)}
                            placeholder="-6.2088"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Longitude</label>
                        <input
                            type="text"
                            value={longitude}
                            onChange={(e) => setLongitude(e.target.value)}
                            placeholder="106.8456"
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                        />
                    </div>
                    <p className="text-xs text-slate-500">
                        Tips: Klik kanan di Google Maps untuk menyalin koordinat
                    </p>
                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
                        <Button type="submit" disabled={isSaving} className="flex-1">
                            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// PPPoE Tab Content
function PppoeTab({ routerId }) {
    const [sessions, setSessions] = React.useState([]);
    const [dbSessions, setDbSessions] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedSession, setSelectedSession] = React.useState(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const fetchSessions = async () => {
        // isLoading handled by useEffect for initial load, keep existing data during refresh
        setIsRefreshing(true);

        try {
            const [liveRes, dbRes] = await Promise.all([
                apiClient.get(`/routers/${routerId}/ppp/sessions`),
                apiClient.get(`/pppoe?routerId=${routerId}`)
            ]);
            setSessions(liveRes.data?.data || []);
            setDbSessions(dbRes.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch PPPoE sessions:', err);
            setSessions([]);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    React.useEffect(() => {
        setSessions([]);
        setIsLoading(true);
        fetchSessions();
        const interval = setInterval(fetchSessions, 30000);
        return () => clearInterval(interval);
    }, [routerId]);

    // Merge live sessions with DB coordinates
    const mergedSessions = React.useMemo(() => {
        const dbMap = new Map(dbSessions.map(s => [s.name, s]));
        return sessions.map(s => ({
            ...s,
            dbId: dbMap.get(s.name)?.id,
            latitude: dbMap.get(s.name)?.latitude,
            longitude: dbMap.get(s.name)?.longitude,
        }));
    }, [sessions, dbSessions]);

    const filteredSessions = mergedSessions.filter(s =>
        !searchQuery ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.callerId?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSaveCoordinates = async (coords) => {
        if (!selectedSession?.dbId) {
            alert('Session belum tersimpan di database. Tunggu beberapa saat.');
            return;
        }
        setIsSaving(true);
        try {
            await apiClient.patch(`/pppoe/${selectedSession.dbId}/coordinates`, {
                latitude: coords.latitude || null,
                longitude: coords.longitude || null,
            });
            setSelectedSession(null);
            fetchSessions();
        } catch (err) {
            console.error('Failed to save coordinates:', err);
            alert('Gagal menyimpan koordinat');
        } finally {
            setIsSaving(false);
        }
    };

    // Count sessions with location
    const withLocation = mergedSessions.filter(s => s.latitude && s.longitude).length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <PhoneCall className="w-5 h-5 text-primary" />
                        Active PPPoE Sessions
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {sessions.length} users connected
                        {withLocation > 0 && <span className="text-primary ml-2">• {withLocation} with location</span>}
                    </p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search username, IP, MAC..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                        />
                    </div>
                    <Button onClick={fetchSessions} variant="outline" size="sm" disabled={isRefreshing}>
                        <RefreshCw className={clsx("w-4 h-4", isRefreshing && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Sessions Grid */}
            {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <PhoneCall className="w-6 h-6 text-slate-500" />
                    </div>
                    <h3 className="text-lg font-medium text-white mb-1">No active PPPoE sessions</h3>
                    <p className="text-slate-400">There are no PPPoE users currently connected to this router</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSessions.map((session, index) => (
                        <Card key={`${session.name}-${index}`} className="glass-panel border-slate-700/50 hover:border-primary/30 transition-colors">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                            <Users className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-white text-sm">{session.name}</h3>
                                            <p className="text-xs text-slate-500">{session.service || 'pppoe'}</p>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        <Wifi className="w-3 h-3" /> Online
                                    </span>
                                </div>

                                <div className="space-y-2 text-xs text-slate-400">
                                    {session.address && (
                                        <div className="flex items-center gap-2">
                                            <Network className="w-3 h-3 text-slate-500" />
                                            <span className="font-mono">{session.address}</span>
                                        </div>
                                    )}
                                    {session.callerId && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">MAC:</span>
                                            <span className="font-mono text-xs">{session.callerId}</span>
                                        </div>
                                    )}
                                    {session.uptime && (
                                        <div className="flex items-center gap-2">
                                            <Timer className="w-3 h-3 text-slate-500" />
                                            <span>{session.uptime}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Set Lokasi Button */}
                                <div className="mt-3 pt-3 border-t border-slate-800">
                                    <button
                                        onClick={() => setSelectedSession(session)}
                                        className={clsx(
                                            "w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors",
                                            session.latitude && session.longitude
                                                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                        )}
                                    >
                                        <MapPin className="w-3 h-3" />
                                        {session.latitude && session.longitude
                                            ? `📍 ${parseFloat(session.latitude).toFixed(4)}, ${parseFloat(session.longitude).toFixed(4)}`
                                            : 'Set Lokasi'
                                        }
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Coordinates Modal */}
            {selectedSession && (
                <PppoeCoordinatesModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                    onSave={handleSaveCoordinates}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
}


export default function RouterDetails() {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const { data: router, isLoading, error, refetch } = useRouter(id);
    const { data: interfaces = [] } = useRouterInterfaces(id);
    const { data: metrics } = useRouterMetrics(id);
    const { data: netwatch = [], refetch: refetchNetwatch } = useRouterNetwatch(id);
    const { data: settings } = useSettings();
    const syncMutation = useSyncNetwatch();

    // Auto-sync netwatch every 30 seconds
    useEffect(() => {
        if (!id) return;

        // Initial sync when entering the page
        syncMutation.mutate(id);

        // Set up interval for auto-sync every 30 seconds
        const intervalId = setInterval(() => {
            syncMutation.mutate(id);
        }, 30000);

        // Cleanup interval on unmount
        return () => clearInterval(intervalId);
    }, [id]);

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <Gauge className="w-4 h-4" /> },
        { id: 'netwatch', label: 'Netwatch', icon: <Eye className="w-4 h-4" /> },
        { id: 'pppoe', label: 'PPPoE', icon: <PhoneCall className="w-4 h-4" /> },
        { id: 'map', label: 'Map', icon: <MapPin className="w-4 h-4" /> },
    ];

    const refreshMutation = useRefreshRouter();

    const handleRefresh = async () => {
        try {
            await refreshMutation.mutateAsync(id);
            // The mutation invalidation will trigger refetch of queries
        } catch (error) {
            console.error('Failed to refresh router:', error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-red-400">Failed to load router details</p>
                <Link to="/routers">
                    <Button variant="outline">Back to Devices</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/routers">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl sm:text-2xl font-bold text-white">{router?.name}</h1>
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                    router?.status === 'online'
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-red-500/10 text-red-400"
                                )}>
                                    {router?.status || 'unknown'}
                                </span>
                            </div>
                            <p className="text-slate-400 text-sm">{router?.host}:{router?.port}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button onClick={() => setIsEditModalOpen(true)} variant="outline" title="Edit Config">
                            <Edit className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Edit Config</span>
                        </Button>
                        <Button onClick={handleRefresh} variant="outline" disabled={refreshMutation.isPending} title="Refresh">
                            <RefreshCw className={clsx("w-4 h-4 sm:mr-2", refreshMutation.isPending && "animate-spin")} />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'dashboard' && <DashboardTab router={router} metrics={metrics} interfaces={interfaces} />}
                {activeTab === 'netwatch' && <NetwatchTab routerId={id} netwatch={netwatch} refetch={refetchNetwatch} />}
                {activeTab === 'pppoe' && <PppoeTab routerId={id} />}
                {activeTab === 'map' && <MapTab router={router} netwatch={netwatch} apiKey={settings?.googleMapsApiKey} />}
            </div>

            <EditRouterModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSuccess={() => {
                    refetch();
                    setIsEditModalOpen(false);
                }}
                router={router}
            />
        </div>
    );
}
