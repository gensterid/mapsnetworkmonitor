import React, { useState, useEffect } from 'react';
import {
    Monitor,
    Wifi,
    WifiOff,
    Activity,
    Cpu,
    Database,
    Clock,
    Server,
    ChevronRight,
    Signal,
    Thermometer,
    Smartphone
} from 'lucide-react';
import { useGenieACSDashboardStats, useRouters, useAppTimezone } from '@/hooks';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDateWithTimezone } from '@/lib/timezone';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import clsx from 'clsx';

function StatCard({ icon: Icon, label, value, color, delay }) {
    const colors = {
        primary: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        success: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        danger: 'text-red-500 bg-red-500/10 border-red-500/20',
        warning: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    };

    return (
        <Card className={clsx("animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both", delay)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-slate-400 mb-1">{label}</p>
                        <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
                    </div>
                    <div className={clsx("p-3 rounded-xl border", colors[color] || colors.primary)}>
                        <Icon className="w-6 h-6" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function GenieACSDashboard({ selectedRouterId: propRouterId }) {
    const [selectedRouterId, setSelectedRouterId] = useState(propRouterId || '');

    // Sync with prop changes
    useEffect(() => {
        if (propRouterId) {
            setSelectedRouterId(propRouterId);
        }
    }, [propRouterId]);

    const { data: stats, isLoading, isError } = useGenieACSDashboardStats(selectedRouterId);
    const timezone = useAppTimezone();

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark space-y-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 animate-pulse">Analyzing ACS Data...</p>
            </div>
        );
    }

    // Default stats if none returned
    const dashboardData = stats || {
        total: 0,
        online: 0,
        offline: 0,
        signalDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, noSignal: 0 },
        vendorDistribution: {},
        modelDistribution: {},
        recentActivity: []
    };

    const signalData = [
        { name: 'Excellent (> -20)', value: dashboardData.signalDistribution.excellent, color: '#10b981' },
        { name: 'Good (-20 to -24)', value: dashboardData.signalDistribution.good, color: '#3b82f6' },
        { name: 'Fair (-25 to -27)', value: dashboardData.signalDistribution.fair, color: '#f59e0b' },
        { name: 'Poor (< -27)', value: dashboardData.signalDistribution.poor, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const vendorData = Object.entries(dashboardData.vendorDistribution).map(([name, value]) => ({ name, value }));
    const modelData = Object.entries(dashboardData.modelDistribution)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Monitor}
                    label="Total CPEs"
                    value={dashboardData.total}
                    color="primary"
                    delay="delay-0"
                />
                <StatCard
                    icon={Wifi}
                    label="Online Now"
                    value={dashboardData.online}
                    color="success"
                    delay="delay-75"
                />
                <StatCard
                    icon={WifiOff}
                    label="Offline"
                    value={dashboardData.offline}
                    color="danger"
                    delay="delay-150"
                />
                <StatCard
                    icon={Signal}
                    label="Avg Signal Level"
                    value={dashboardData.total > 0 ? "-24.2 dBm" : "N/A"}
                    color="warning"
                    delay="delay-300"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Device Status & Signal */}
                <Card className="bg-slate-900/40 border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
                    <div className="p-6 border-b border-slate-800">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" />
                            Signal Level Distribution
                        </h3>
                    </div>
                    <CardContent className="p-6 h-[300px] min-w-0">
                        {signalData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={signalData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {signalData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                        itemStyle={{ color: '#f8fafc' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 italic">
                                No signal data available for selected filters
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Vendor Distribution */}
                <Card className="bg-slate-900/40 border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700">
                    <div className="p-6 border-b border-slate-800">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Server className="w-4 h-4 text-blue-500" />
                            Model Distribution (Top 5)
                        </h3>
                    </div>
                    <CardContent className="p-6 h-[300px] min-w-0">
                        {modelData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={modelData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: '#ffffff0a' }}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 italic">
                                No model data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activity Table */}
            <Card className="bg-slate-900/40 border-slate-800 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 delay-1000">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        Recent Device Inform (TR-069 Events)
                    </h3>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-blue-400">View All Logs</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800/50 text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">CPE ID / Serial</th>
                                <th className="px-6 py-4">Model</th>
                                <th className="px-6 py-4">Last Event</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {dashboardData.recentActivity.map((dev) => (
                                <tr key={dev._id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className={clsx("w-2 h-2 rounded-full inline-block mr-2",
                                            new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000 ? "bg-emerald-500" : "bg-red-500"
                                        )} />
                                        <span className="text-xs text-slate-400 uppercase font-medium">
                                            {new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000 ? "Active" : "Idle"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-white text-sm">{dev._id}</div>
                                        <div className="text-[10px] text-primary font-mono">{dev._serialNumber}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-slate-300">{dev._productClass}</div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase">{dev._manufacturer}</div>
                                    </td>
                                    <td className="px-6 py-4 text-[10px] text-slate-400 font-mono">
                                        {formatDateWithTimezone(dev._lastInform, timezone)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-primary/20 hover:text-primary">
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {dashboardData.recentActivity.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                        No recent activity detected.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
