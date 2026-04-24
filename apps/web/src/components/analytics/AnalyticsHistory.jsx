import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Calendar, TrendingUp, Activity, Search } from 'lucide-react';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import InterfaceTrafficChart from './InterfaceTrafficChart';
import MetricHistoryChart from './MetricHistoryChart';

/**
 * Build a human-readable label for an ONU picker option.
 * Format: [SOURCE] OltName • Model • Location • CustomName
 * Keeps the most identifying fields first, but hides sections that are empty.
 */
function buildOnuLabel(onu) {
    if (!onu) return '';

    const sources = Array.isArray(onu.discoverySources) ? onu.discoverySources : [];
    const hasOlt = sources.includes('olt');
    const hasAcs = sources.includes('acs');
    const sourceTag = hasOlt && hasAcs ? 'OLT+ACS' : hasAcs ? 'ACS' : hasOlt ? 'OLT' : '—';

    const parts = [];
    if (onu.oltName) parts.push(onu.oltName);
    if (onu.model) parts.push(onu.model);
    if (onu.ponPort && onu.onuIndex) parts.push(`${onu.ponPort}:${onu.onuIndex}`);
    else if (onu.ponPort) parts.push(onu.ponPort);

    // Customer-friendly name: prefer description (operator note) over auto-generated
    // "ONT-XXXX" or "ACS-XXXX" fallback that isn't human-readable.
    const isAutoName = onu.name && (/^ONT-/i.test(onu.name) || /^ACS-/i.test(onu.name));
    const customName = onu.description || (isAutoName ? null : onu.name);
    if (customName) parts.push(customName);

    // Last resort so there's always something to click on
    if (parts.length === 0 && onu.sn) parts.push(`SN ${onu.sn.slice(-6)}`);
    if (parts.length === 0 && onu.host) parts.push(onu.host);
    if (parts.length === 0) parts.push(onu.name || 'ONU');

    return `[${sourceTag}] ${parts.join(' • ')}`;
}

function sortOnus(onus) {
    return [...onus].sort((a, b) => {
        const aOlt = a.oltName || 'ZZZ';
        const bOlt = b.oltName || 'ZZZ';
        if (aOlt !== bOlt) return aOlt.localeCompare(bOlt);
        const aPon = a.ponPort || '';
        const bPon = b.ponPort || '';
        if (aPon !== bPon) return aPon.localeCompare(bPon);
        const aIdx = parseInt(a.onuIndex) || 0;
        const bIdx = parseInt(b.onuIndex) || 0;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return (a.name || '').localeCompare(b.name || '');
    });
}

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
                            className="bg-slate-800 border-none text-xs rounded px-2 py-1 text-slate-300 focus:ring-1 focus:ring-primary h-8 max-w-[380px] truncate"
                            value={selectedOnuId || ''}
                            onChange={(e) => setSelectedOnuId(e.target.value)}
                            disabled={!selectedRouterId}
                            title={onus.find(o => o.id === selectedOnuId) ? buildOnuLabel(onus.find(o => o.id === selectedOnuId)) : ''}
                        >
                            <option value="">Pilih ONU</option>
                            {sortOnus(onus).map(onu => (
                                <option key={onu.id} value={onu.id}>{buildOnuLabel(onu)}</option>
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
