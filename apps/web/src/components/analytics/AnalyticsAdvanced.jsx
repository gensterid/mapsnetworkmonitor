import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { TrendingUp, Activity, Clock, AlertTriangle } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import clsx from 'clsx';

function AnalyticsAdvanced({
    cpuPeaksLoading,
    cpuPeaks,
    downtimeLoading,
    downtimeAnalysis,
    capacityLoading,
    capacityAnalysis,
    odpCapacityLoading,
    odpCapacity,
    incidentHeatmap,
    heatmapLoading = false,
    setHistoryModal
}) {
    return (
        <div className="mt-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Analisis Lanjutan
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* ODP Port Efficiency */}
                <Card className="glass-panel">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            ODP Port Efficiency
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {odpCapacityLoading ? (
                            <ListSkeleton rows={5} />
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold">Network Usage</span>
                                        <span className="text-sm font-bold text-primary">{odpCapacity?.utilizationPercent}%</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                                        <div 
                                            className="h-full bg-primary rounded-full"
                                            style={{ width: `${odpCapacity?.utilizationPercent || 0}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500">
                                        <span>{odpCapacity?.usedPorts} / {odpCapacity?.totalPorts} Ports</span>
                                        <span>{odpCapacity?.totalOdp} ODPs</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold px-1">Top Full ODPs</p>
                                    {odpCapacity?.topFullOdp?.length > 0 ? (
                                        odpCapacity.topFullOdp.map((item, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                                onClick={() => setHistoryModal({ open: true, type: 'odp-details', target: item })}
                                            >
                                                <div className="flex-1 min-w-0 mr-2">
                                                    <p className="text-sm text-white font-medium truncate">{item.name}</p>
                                                    <p className="text-xs text-slate-500 truncate">{item.usedPorts}/{item.portCapacity} Ports</p>
                                                </div>
                                                <div className={clsx(
                                                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                    item.utilizationPercent >= 100 ? 'bg-red-500/20 text-red-400' :
                                                    item.utilizationPercent > 80 ? 'bg-amber-500/20 text-amber-400' :
                                                    'bg-blue-500/20 text-blue-400'
                                                )}>
                                                    {item.utilizationPercent}%
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-slate-500 py-2 text-[10px]">No ODP data available</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* CPU Peak Analysis */}
                <Card className="glass-panel">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-orange-400" />
                            CPU Peak Hours
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {cpuPeaksLoading ? (
                            <ListSkeleton rows={5} />
                        ) : (
                            <div className="space-y-2">
                                {cpuPeaks?.length > 0 ? (
                                    cpuPeaks.slice(0, 5).map((item, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                            onClick={() => setHistoryModal({ open: true, type: 'cpu-peak-details', target: item })}
                                        >
                                            <div>
                                                <p className="text-sm text-white font-medium">{item.routerName}</p>
                                                <p className="text-xs text-slate-500">Jam {item.hour}:00</p>
                                            </div>
                                            <div className="text-right">
                                                <span className={clsx(
                                                    "px-2 py-1 rounded text-xs font-medium",
                                                    item.avgCpu > 90 ? 'bg-red-500/10 text-red-400' :
                                                        item.avgCpu > 70 ? 'bg-amber-500/10 text-amber-400' :
                                                            'bg-emerald-500/10 text-emerald-400'
                                                )}>
                                                    {item.avgCpu}% CPU
                                                </span>
                                                <p className="text-[10px] text-slate-500 mt-1">{item.peakCount}x &gt;90%</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-emerald-500 py-4 text-sm">Tidak ada peak CPU &gt;90% ✓</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Downtime Analysis */}
                <Card className="glass-panel">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Clock className="w-4 h-4 text-red-400" />
                            Downtime Signifikan
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {downtimeLoading ? (
                            <ListSkeleton rows={5} />
                        ) : (
                            <div className="space-y-2">
                                {downtimeAnalysis?.length > 0 ? (
                                    downtimeAnalysis.slice(0, 5).map((item, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                            onClick={() => setHistoryModal({ open: true, type: 'downtime-details', target: item })}
                                        >
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-sm text-white font-medium truncate">{item.name}</p>
                                                <p className="text-xs text-slate-500 truncate">{item.routerName}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <span className={clsx(
                                                    "px-2 py-1 rounded text-xs font-medium",
                                                    item.totalDowntimeMinutes > 60 ? 'bg-red-500/10 text-red-400' :
                                                        item.totalDowntimeMinutes > 30 ? 'bg-amber-500/10 text-amber-400' :
                                                            'bg-blue-500/10 text-blue-400'
                                                )}>
                                                    {item.totalDowntimeMinutes > 60 ? `${Math.round(item.totalDowntimeMinutes / 60)}h` : `${item.totalDowntimeMinutes}m`}
                                                </span>
                                                <p className="text-[10px] text-slate-500 mt-1">{item.incidentCount}x down</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-emerald-500 py-4 text-sm">Tidak ada downtime &gt;5 menit ✓</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Capacity Analysis */}
                <Card className="glass-panel">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-amber-400" />
                            Kapasitas Interface
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {capacityLoading ? (
                            <ListSkeleton rows={5} />
                        ) : (
                            <div className="space-y-2">
                                {capacityAnalysis?.length > 0 ? (
                                    capacityAnalysis.slice(0, 5).map((item, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                            onClick={() => setHistoryModal({ open: true, type: 'capacity-details', target: item })}
                                        >
                                            <div className="flex-1 min-w-0 mr-2">
                                                <p className="text-sm text-white font-medium truncate">{item.interfaceName}</p>
                                                <p className="text-xs text-slate-500 truncate">{item.routerName} • {item.speed}</p>
                                            </div>
                                            <div className="w-24">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={clsx(
                                                                "h-full rounded-full",
                                                                item.utilizationPercent > 80 ? 'bg-red-500' :
                                                                    item.utilizationPercent > 60 ? 'bg-amber-500' :
                                                                        'bg-emerald-500'
                                                            )}
                                                            style={{ width: `${Math.min(item.utilizationPercent, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-slate-400 w-10 text-right">{item.utilizationPercent}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-emerald-500 py-4 text-sm">Semua interface normal ✓</p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Incident Heatmap Summary */}
                <Card className="glass-panel">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            Zona Masalah
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {heatmapLoading ? (
                                <ListSkeleton rows={5} />
                            ) : incidentHeatmap?.length > 0 ? (
                                incidentHeatmap.slice(0, 5).map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                        onClick={() => setHistoryModal({ open: true, type: 'heatmap-details', target: item })}
                                    >
                                        <div className="flex-1 min-w-0 mr-2">
                                            <p className="text-sm text-white font-medium truncate">
                                                {item.deviceNames?.[0] || 'Unknown'}
                                                {item.deviceNames?.length > 1 && <span className="text-slate-500"> +{item.deviceNames.length - 1}</span>}
                                            </p>
                                            <p className="text-xs text-slate-500 truncate">{item.routerName}</p>
                                        </div>
                                        <span className={clsx(
                                            "px-2 py-1 rounded text-xs font-medium border",
                                            item.incidentCount > 15 ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                item.incidentCount > 5 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        )}>
                                            {item.incidentCount}x
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-emerald-500 py-4 text-sm">Tidak ada zona masalah ✓</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default AnalyticsAdvanced;
