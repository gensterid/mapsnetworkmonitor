import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useRouter, useRouterInterfaces, useRouterMetrics, useRouterNetwatch, useSettings, useSyncNetwatch, useRefreshRouter, useRouterHotspotActive, useRouterPppActive } from '@/hooks';
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
    Network
} from 'lucide-react';
import clsx from 'clsx';
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
        <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg">
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
        <Card className="glass-panel">
            <CardContent className="p-4">
                <div className="flex items-center gap-3">
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
    const [selectedInterface, setSelectedInterface] = useState('ether1');
    const [history, setHistory] = useState([]);

    // Find selected interface data
    const currentInterface = interfaces?.find(i => i.name === selectedInterface);

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

            // Keep last 20 points (approx 3-5 mins depending on poll rate)
            const newHistory = [...prev, newPoint];
            if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
            return newHistory;
        });
    }, [currentInterface, selectedInterface]);

    // Reset history when interface selection changes
    useEffect(() => {
        setHistory([]);
    }, [selectedInterface]);

    const formatBits = (bits) => {
        if (bits === 0) return '0 bps';
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
        ? Math.round((metrics.usedMemory / metrics.totalMemory) * 100)
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
    const [sortBy, setSortBy] = useState('status'); // 'status', 'name', 'host', 'location'
    const queryClient = useQueryClient();
    const syncMutation = useSyncNetwatch();

    // Count up and down hosts
    const upCount = netwatch.filter(n => n.status === 'up').length;
    const downCount = netwatch.filter(n => n.status === 'down' || n.status === 'unknown').length;

    // Filter and sort netwatch
    const filteredNetwatch = (statusFilter === 'all'
        ? netwatch
        : statusFilter === 'up'
            ? netwatch.filter(n => n.status === 'up')
            : netwatch.filter(n => n.status === 'down' || n.status === 'unknown')
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
                <div className="flex gap-2 items-center">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                    >
                        <option value="status">Down First</option>
                        <option value="name">Name A-Z</option>
                        <option value="host">Host A-Z</option>
                        <option value="location">Location</option>
                    </select>
                    <Button variant="outline" onClick={handleSync} loading={syncMutation.isPending}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync from Router
                    </Button>
                    <Button onClick={() => setIsAddModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Host
                    </Button>
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

            <Card className="glass-panel">
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
                                                        <span className="text-white font-medium">{sinceDate.toLocaleString('id-ID')}</span>
                                                        <span className={clsx("text-xs", nw.status === 'up' ? 'text-emerald-400' : 'text-red-400')}>
                                                            ({display})
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-slate-400">{nw.location || '-'}</td>
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
    return (
        <div className="h-[600px] w-full rounded-xl overflow-hidden border border-slate-700 relative">
            <NetworkMap routerId={router.id} />
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
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <Link to="/routers">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-white">{router?.name}</h1>
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
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setIsEditModalOpen(true)} variant="outline">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Config
                        </Button>
                        <Button onClick={handleRefresh} variant="outline" disabled={refreshMutation.isPending}>
                            <RefreshCw className={clsx("w-4 h-4 mr-2", refreshMutation.isPending && "animate-spin")} />
                            Refresh
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
