import React from 'react';
import { usePingLatencies } from '@/hooks';
import { Tooltip } from 'react-leaflet';
import { formatDistance } from '@/lib/geo'; // Assuming this is where it was, or I'll check imports

export const RouterTooltip = ({ router, isHovered }) => {
    // Fetch live latencies only when hovered
    const { data: latencies, isLoading, isError } = usePingLatencies(router.id, {
        enabled: isHovered,
        staleTime: 60000, // Cache for 1 min
    });

    const getLatencyColor = (latency) => {
        if (latency === null || latency === undefined) return 'text-slate-500';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
            <div className="flex flex-col min-w-[220px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
                {/* Header */}
                <div className={`px-3 py-2 flex items-center justify-between ${router.status === 'online' ? 'bg-emerald-600' : 'bg-red-600'
                    }`}>
                    <div className="flex items-center gap-2 text-white">
                        <span className="material-symbols-outlined text-[16px]">router</span>
                        <span className="font-bold text-xs truncate max-w-[140px]">{router.name}</span>
                    </div>
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {router.status}
                    </div>
                </div>
                {/* Body */}
                <div className="p-3 bg-slate-800 space-y-3">
                    {/* System Metrics */}
                    {router.latestMetrics && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30">
                                <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">CPU</span>
                                <span className="text-slate-200 font-mono font-medium">{router.latestMetrics.cpuLoad}%</span>
                            </div>
                            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30">
                                <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">RAM</span>
                                <span className="text-slate-200 font-mono font-medium">
                                    {Math.round((router.latestMetrics.usedMemory / router.latestMetrics.totalMemory) * 100)}%
                                </span>
                            </div>
                            <div className="col-span-2 bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex items-center justify-between">
                                <span className="text-slate-400 text-[10px] uppercase tracking-wider">Uptime</span>
                                <span className="text-slate-200 font-mono font-medium">
                                    {router.latestMetrics.uptime ? (() => {
                                        const seconds = Number(router.latestMetrics.uptime);
                                        const d = Math.floor(seconds / (3600 * 24));
                                        const h = Math.floor((seconds % (3600 * 24)) / 3600);
                                        const m = Math.floor((seconds % 3600) / 60);
                                        if (d > 0) return `${d}d ${h}h`;
                                        if (h > 0) return `${h}h ${m}m`;
                                        return `${m}m`;
                                    })() : '-'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Ping Latency List (Live from API like Dashboard) */}
                    <div className="space-y-1.5 border-t border-slate-700/50 pt-2">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[14px]">show_chart</span>
                            Ping Latency
                        </div>

                        {isLoading && !latencies ? (
                            <div className="flex justify-center py-2">
                                <span className="material-symbols-outlined animate-spin text-slate-500 text-sm">refresh</span>
                            </div>
                        ) : latencies && latencies.length > 0 ? (
                            <div className="space-y-1.5">
                                {latencies.slice(0, 5).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-700/30">
                                        <div className="flex flex-col overflow-hidden max-w-[120px]">
                                            <span className="text-slate-200 font-bold text-[11px] truncate" title={item.label}>
                                                {item.label}
                                            </span>
                                            <span className="text-slate-500 text-[9px] truncate" title={item.ip}>
                                                {item.ip}
                                            </span>
                                        </div>
                                        <span className={`font-mono font-bold text-xs ${getLatencyColor(item.latency)}`}>
                                            {item.latency !== null ? `${item.latency}ms` : '-'}
                                        </span>
                                    </div>
                                ))}
                                {latencies.length > 5 && (
                                    <div className="text-[10px] text-center text-slate-500 italic pt-0.5">
                                        + {latencies.length - 5} more
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[10px] text-center text-slate-500 italic">
                                No targets configured
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Tooltip>
    );
};

export default RouterTooltip;
