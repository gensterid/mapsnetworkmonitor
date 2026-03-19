import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Calendar, TrendingUp, Activity, Search } from 'lucide-react';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import InterfaceTrafficChart from './InterfaceTrafficChart';
import MetricHistoryChart from './MetricHistoryChart';

function AnalyticsHistory({
    selectedRouterId,
    selectedInterfaceId,
    setSelectedInterfaceId,
    interfaces,
    interfaceHistoryLoading,
    interfaceHistory,
    selectedHost,
    setSelectedHost,
    netwatch,
    latencyHistoryLoading,
    latencyHistory,
    selectedOnuId,
    setSelectedOnuId,
    onus,
    onuHistoryLoading,
    onuHistory
}) {
    return (
        <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Grafik Perangkat & Interface
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Interface Traffic Chart */}
                <Card className="glass-panel lg:col-span-1">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div className="flex flex-col">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Trafik Interface
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 mt-0.5">Histori Tx/Rx per interface</p>
                        </div>
                        <select 
                            className="bg-slate-800 border-none text-xs rounded px-2 py-1 text-slate-300 focus:ring-1 focus:ring-primary h-8 max-w-[150px]"
                            value={selectedInterfaceId || ''}
                            onChange={(e) => setSelectedInterfaceId(e.target.value)}
                            disabled={!selectedRouterId}
                        >
                            <option value="">Pilih Interface</option>
                            {interfaces.map(iface => (
                                <option key={iface.id} value={iface.id}>{iface.name}</option>
                            ))}
                        </select>
                    </CardHeader>
                    <CardContent>
                        {interfaceHistoryLoading ? (
                            <ChartSkeleton />
                        ) : (
                            <InterfaceTrafficChart data={interfaceHistory} />
                        )}
                    </CardContent>
                </Card>

                {/* Latency History Chart */}
                <Card className="glass-panel lg:col-span-1">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div className="flex flex-col">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-400" />
                                Analisis Latency
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 mt-0.5">Histori ping per host</p>
                        </div>
                        <select 
                            className="bg-slate-800 border-none text-xs rounded px-2 py-1 text-slate-300 focus:ring-1 focus:ring-primary h-8 max-w-[150px]"
                            value={selectedHost || ''}
                            onChange={(e) => setSelectedHost(e.target.value)}
                            disabled={!selectedRouterId}
                        >
                            <option value="">Pilih Host</option>
                            {netwatch.map(nw => (
                                <option key={nw.id} value={nw.host}>{nw.name || nw.host}</option>
                            ))}
                        </select>
                    </CardHeader>
                    <CardContent>
                        {latencyHistoryLoading ? (
                            <ChartSkeleton />
                        ) : (
                            <MetricHistoryChart 
                                data={latencyHistory} 
                                dataKey="latency" 
                                name="Latency" 
                                unit="ms" 
                                color="#3b82f6" 
                            />
                        )}
                    </CardContent>
                </Card>

                {/* ONU Power History Chart */}
                <Card className="glass-panel lg:col-span-1">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div className="flex flex-col">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Search className="w-4 h-4 text-amber-400" />
                                Daya ONU (Rx)
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 mt-0.5">Histori signal level</p>
                        </div>
                        <select 
                            className="bg-slate-800 border-none text-xs rounded px-2 py-1 text-slate-300 focus:ring-1 focus:ring-primary h-8 max-w-[150px]"
                            value={selectedOnuId || ''}
                            onChange={(e) => setSelectedOnuId(e.target.value)}
                            disabled={!selectedRouterId}
                        >
                            <option value="">Pilih ONU</option>
                            {onus.map(onu => (
                                <option key={onu.id} value={onu.id}>{onu.name}</option>
                            ))}
                        </select>
                    </CardHeader>
                    <CardContent>
                        {onuHistoryLoading ? (
                            <ChartSkeleton />
                        ) : (
                            <MetricHistoryChart 
                                data={onuHistory} 
                                dataKey="signal" 
                                name="Signal Power" 
                                unit="dBm" 
                                color="#f59e0b" 
                                placeholder="Pilih ONU untuk melihat data"
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default AnalyticsHistory;
