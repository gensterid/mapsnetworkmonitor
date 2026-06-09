import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Cpu, MemoryStick, Clock, Server, Gauge, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import StatsCard from '../common/StatsCard';
import ProgressBar from '../common/ProgressBar';
import InterfaceTrafficChart from '../common/InterfaceTrafficChart';
import ActiveUsersCard from '../common/ActiveUsersCard';
import PingLatencyCard from '../common/PingLatencyCard';
import RouterAiDiagnosis from '@/components/RouterAiDiagnosis';
import { formatBytes, formatBits, formatUptime } from '../router-utils';

function DashboardTab({ router, metrics, interfaces }) {
    const memoryUsage = metrics?.totalMemory && metrics?.usedMemory
        ? ((metrics.usedMemory / metrics.totalMemory) * 100).toFixed(1)
        : 0;

    return (
        <div className="space-y-6">
            {/* System Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatsCard icon={Cpu} label="CPU Usage" value={`${metrics?.cpuLoad || 0}%`} color="blue" />
                <StatsCard
                    icon={MemoryStick}
                    label="Memory"
                    value={`${memoryUsage}%`}
                    subValue={`${formatBytes(metrics?.usedMemory)} / ${formatBytes(metrics?.totalMemory)}`}
                    color="purple"
                />
                <StatsCard icon={Clock} label="Uptime" value={formatUptime(metrics?.uptime)} color="green" />
                <StatsCard icon={Server} label="Model" value={router?.model || 'Unknown'} subValue={router?.routerOsVersion} color="orange" />
            </div>

            {/* Active Users & Traffic Graph */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                    <ActiveUsersCard routerId={router.id} />

                    {/* Resource Gauges */}
                    <Card className="glass-panel">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Gauge className="w-5 h-5" />
                                System Resources
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ProgressBar
                                label="CPU Load"
                                value={metrics?.cpuLoad || 0}
                                color={metrics?.cpuLoad > 80 ? "red" : metrics?.cpuLoad > 50 ? "orange" : "blue"}
                            />
                            <ProgressBar
                                label="Memory Usage"
                                value={memoryUsage}
                                color={memoryUsage > 80 ? "red" : memoryUsage > 50 ? "orange" : "purple"}
                            />
                            {metrics?.totalDisk && (
                                <ProgressBar
                                    label="Disk Usage"
                                    value={Math.round((metrics.usedDisk / metrics.totalDisk) * 100)}
                                    color="green"
                                />
                            )}
                        </CardContent>
                    </Card>

                    {/* AI Router Diagnosis */}
                    <RouterAiDiagnosis routerId={router.id} routerName={router.name} />

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
                        <table className="w-full min-w-[640px]">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-3 px-4 text-xs font-medium text-fg-muted uppercase">Name</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-fg-muted uppercase">Type</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-fg-muted uppercase">Status</th>
                                    <th className="text-left py-3 px-4 text-xs font-medium text-fg-muted uppercase">Link</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-fg-muted uppercase">TX Rate</th>
                                    <th className="text-right py-3 px-4 text-xs font-medium text-fg-muted uppercase">RX Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {interfaces?.length > 0 ? (
                                    interfaces.map((iface) => (
                                        <tr key={iface.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                            <td className="py-3 px-4 text-sm text-fg font-medium">
                                                <div className="flex flex-col">
                                                    <span>{iface.name}</span>
                                                    {iface.macAddress && <span className="text-[10px] text-fg-muted font-mono">{iface.macAddress}</span>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-fg">{iface.type || 'ethernet'}</td>
                                            <td className="py-3 px-4">
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    iface.running
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-slate-700 text-fg-muted"
                                                )}>
                                                    {iface.running ? 'Running' : 'Down'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-fg">
                                                {iface.speed || '--'}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center gap-1 text-sm text-green-400 font-mono font-medium">
                                                        <TrendingUp className="w-3 h-3" />
                                                        {formatBits(iface.txRate)}
                                                    </div>
                                                    <span className="text-[10px] text-fg-muted">{formatBytes(iface.txBytes)} total</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center gap-1 text-sm text-blue-400 font-mono font-medium">
                                                        <TrendingDown className="w-3 h-3" />
                                                        {formatBits(iface.rxRate)}
                                                    </div>
                                                    <span className="text-[10px] text-fg-muted">{formatBytes(iface.rxBytes)} total</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-fg-muted">
                                            No interfaces found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default DashboardTab;
