import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { WifiOff, Wifi, AlertTriangle, CheckCircle, PhoneOff } from 'lucide-react';
import { ListSkeleton, Skeleton } from '@/components/ui/Skeleton';
import clsx from 'clsx';

function AnalyticsDetails({ 
    topDownDevices, 
    topDownLoading = false,
    uptimeStats, 
    uptimeLoading = false,
    issuesAnalysis, 
    issuesAnalysisLoading = false,
    resolutionStats, 
    resolutionLoading = false,
    pppoeDisconnectors, 
    pppoeLoading = false,
    setHistoryModal 
}) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Device Sering Down */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <WifiOff className="w-4 h-4 text-red-400" />
                        Device Sering Down
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {topDownLoading ? (
                            <ListSkeleton rows={5} />
                        ) : topDownDevices?.length > 0 ? (
                            topDownDevices.slice(0, 5).map((device, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                    onClick={() => setHistoryModal({ open: true, type: 'device-logs', target: device })}
                                >
                                    <div>
                                        <p className="text-sm text-white font-medium group-hover:text-primary transition-colors">{device.name}</p>
                                        <p className="text-xs text-slate-500 font-mono">{device.host}</p>
                                    </div>
                                    <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
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

            {/* Uptime per Router */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-emerald-400" />
                        Uptime per Router
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {uptimeLoading ? (
                            <ListSkeleton rows={5} />
                        ) : uptimeStats?.length > 0 ? (
                            uptimeStats.slice(0, 5).map((router, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                    onClick={() => setHistoryModal({ open: true, type: 'router-uptime', target: router })}
                                >
                                    <p className="text-sm text-white font-medium group-hover:text-primary transition-colors">{router.routerName}</p>
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

            {/* Issues Analysis */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-primary" />
                        Analisis Informasi Issues
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {issuesAnalysisLoading ? (
                        <ListSkeleton rows={5} />
                    ) : (
                        <div className="space-y-2">
                            {issuesAnalysis?.length > 0 ? (
                                issuesAnalysis.slice(0, 5).map((issue, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                        onClick={() => setHistoryModal({ open: true, type: 'issue-logs', target: issue })}
                                    >
                                        <div className="flex-1 min-w-0 mr-2">
                                            <div className="flex items-center gap-2">
                                                <div className={clsx(
                                                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                                    issue.severity === 'critical' ? 'bg-red-500' :
                                                        issue.severity === 'warning' ? 'bg-amber-500' :
                                                            'bg-blue-500'
                                                )} />
                                                <p className="text-sm text-white font-medium truncate group-hover:text-primary transition-colors" title={issue.title}>{issue.title}</p>
                                            </div>
                                            <p className="text-xs text-slate-500 font-mono truncate pl-3.5">
                                                {issue.routerName} • {new Date(issue.lastOccurred).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <span className={clsx(
                                            "px-2 py-1 rounded text-xs font-medium whitespace-nowrap border border-white/5",
                                            issue.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                                                issue.severity === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                                                    'bg-blue-500/10 text-blue-400'
                                        )}>
                                            {issue.count}x
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-slate-500 py-4">Tidak ada issue</p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Resolution Stats */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Waktu Penyelesaian
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {resolutionLoading ? (
                            <>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <Skeleton className="h-4 w-12 mx-auto mb-2" />
                                    <Skeleton className="h-8 w-20 mx-auto" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Skeleton className="h-12 rounded-lg" />
                                    <Skeleton className="h-12 rounded-lg" />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                    <div className="text-xs text-slate-500 mb-1">Rata-rata</div>
                                    <div className="text-2xl font-bold text-emerald-400">
                                        {resolutionStats?.avgResolutionMinutes ? `${Math.round(resolutionStats.avgResolutionMinutes)}m` : '-'}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {resolutionStats?.totalResolved || 0} alerts resolved
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-800/30 rounded-lg p-2 text-center">
                                        <div className="text-[10px] text-slate-500 mb-1">Tercepat</div>
                                        <div className="text-base font-semibold text-slate-300">
                                            {resolutionStats?.fastestResolution !== undefined ? `${resolutionStats.fastestResolution}m` : '-'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-800/30 rounded-lg p-2 text-center">
                                        <div className="text-[10px] text-slate-500 mb-1">Terlambat</div>
                                        <div className="text-base font-semibold text-slate-300">
                                            {resolutionStats?.slowestResolution !== undefined ? `${resolutionStats.slowestResolution}m` : '-'}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* PPPoE Sering Disconnect */}
            <Card className="glass-panel">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <PhoneOff className="w-4 h-4 text-amber-400" />
                        PPPoE Sering Disconnect
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {pppoeLoading ? (
                            <ListSkeleton rows={5} />
                        ) : pppoeDisconnectors?.length > 0 ? (
                            pppoeDisconnectors.slice(0, 5).map((client, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors group"
                                    onClick={() => setHistoryModal({ open: true, type: 'pppoe-logs', target: client })}
                                >
                                    <div>
                                        <p className="text-sm text-white font-medium group-hover:text-primary transition-colors">{client.name}</p>
                                        <p className="text-xs text-slate-500">{client.routerName}</p>
                                    </div>
                                    <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20">
                                        {client.disconnectCount}x
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-slate-500 py-4">Tidak ada data</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default AnalyticsDetails;
