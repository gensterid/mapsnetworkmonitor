import React from 'react';
import { Link } from 'react-router-dom';
import { Router as RouterIcon, RefreshCw, Edit, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import clsx from 'clsx';

// Helper function to format uptime in seconds to human readable format
function formatUptime(seconds) {
    if (!seconds) return '--';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function RouterCard({ router, onEdit, onDelete, onRefresh, isRefreshing }) {
    return (
        <Link to={`/routers/${router.id}`} className="block">
            <Card className="group hover:border-slate-600 transition-colors cursor-pointer">
                <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={clsx(
                                "p-2.5 rounded-lg",
                                router.status === 'online' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                            )}>
                                <RouterIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white">{router.name}</h3>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                    <span className={clsx(
                                        "w-1.5 h-1.5 rounded-full",
                                        router.status === 'online' ? "bg-emerald-500" : "bg-red-500"
                                    )} />
                                    {router.host}:{router.port}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {(router.useSnmp ?? true) && (
                                        <div className={clsx(
                                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                                            router.snmpStatus === 'online' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                            router.snmpStatus === 'error' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                            "bg-slate-500/10 text-slate-500 border-slate-500/20"
                                        )}>
                                            SNMP: {router.snmpStatus === 'online' ? 'OK' : (router.snmpStatus === 'error' ? 'FAIL' : 'OFF')}
                                        </div>
                                    )}
                                    
                                    {router.useGenieAcs && (
                                        <div className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                            ACS
                                        </div>
                                    )}
                                </div>
                                {(router.useSnmp ?? true) && router.snmpStatus === 'error' && router.lastSnmpError && (
                                    <p className="text-[10px] text-red-400 mt-1 line-clamp-1 italic">
                                        SNMP Error: {router.lastSnmpError}
                                    </p>
                                )}
                                {router.status !== 'online' && router.lastErrorMessage && (
                                    <p className="text-[10px] text-red-400 mt-1 line-clamp-1 italic">
                                        API Error: {router.lastErrorMessage}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRefresh(router.id);
                                }}
                                disabled={isRefreshing}
                                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                                title="Refresh connection"
                            >
                                <RefreshCw className={clsx("w-4 h-4", isRefreshing && "animate-spin")} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onEdit(router);
                                }}
                                className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                title="Edit router"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onDelete(router);
                                }}
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                                title="Delete router"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* CPU, Memory, Uptime, Speed Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">CPU</div>
                            <div className="text-slate-300 truncate">
                                {router.latestMetrics?.cpuLoad != null
                                    ? `${router.latestMetrics.cpuLoad}%`
                                    : '--'}
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Memory</div>
                            <div className="text-slate-300 truncate">
                                {router.latestMetrics?.totalMemory && router.latestMetrics?.usedMemory
                                    ? `${Math.round((router.latestMetrics.usedMemory / router.latestMetrics.totalMemory) * 100)}%`
                                    : '--'}
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Uptime</div>
                            <div className="text-slate-300 truncate">
                                {router.latestMetrics?.uptime
                                    ? formatUptime(router.latestMetrics.uptime)
                                    : '--'}
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Speed</div>
                            <div className="text-slate-300 truncate">
                                {router.maxInterfaceSpeed || '--'}
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wide mb-1">Latency</div>
                            <div className={clsx(
                                "text-sm font-mono font-bold truncate",
                                router.status !== 'online' ? "text-slate-500" :
                                    (router.latency > 100 ? "text-yellow-500" : "text-emerald-500")
                            )}>
                                {router.status === 'online' ? `${router.latency || '--'}ms` : '--'}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

export default RouterCard;
