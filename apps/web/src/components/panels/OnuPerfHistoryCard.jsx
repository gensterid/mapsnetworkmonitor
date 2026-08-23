import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ComposedChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Activity, RefreshCw } from 'lucide-react';
import { analyticsService } from '@/lib/api/services/analytics.service';
import { formatShortDateTime } from '@/lib/timezone';

/**
 * OnuPerfHistoryCard — grafik riwayat Latency + RX Power (30 hari) untuk satu
 * host/ONU, versi ringkas untuk dipakai di panel samping (NetwatchDetailPanel).
 * Reuse endpoint yang sama dengan HistoryTab: GET /analytics/performance/device
 * → array { timestamp, latency, signal }.
 *
 * Props:
 *   routerId, host, onuId — identitas target (host cukup untuk latency; onuId/
 *     host dipakai backend untuk cocokkan RX power ONU)
 *   enabled — fetch hanya saat panel terbuka
 */
function PerfTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-surface-dark/95 border border-slate-border p-2 rounded-lg shadow-2xl text-[10px] min-w-[130px] backdrop-blur-md">
            <p className="text-fg-muted font-bold mb-1.5 pb-1 border-b border-slate-border/50">{formatShortDateTime(label)}</p>
            <div className="space-y-1">
                {payload.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.color }} aria-hidden="true" />
                            <span className="text-fg-muted">{e.name}</span>
                        </span>
                        <span className="text-fg font-mono font-bold">
                            {e.value !== null && e.value !== undefined ? `${e.value}${e.unit || ''}` : '---'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function OnuPerfHistoryCard({ routerId, host, onuId, enabled = true }) {
    const dateRange = useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return { start: start.toISOString(), end: end.toISOString() };
    }, []);

    const { data: perf, isLoading } = useQuery({
        queryKey: ['netwatch_perf_trends', routerId, host, onuId],
        queryFn: () => analyticsService.getDevicePerformanceTrends({
            routerId,
            host,
            onuId,
            startDate: dateRange.start,
            endDate: dateRange.end,
        }),
        enabled: enabled && !!(host || onuId),
        staleTime: 60000,
        refetchInterval: false,
    });

    const hasData = Array.isArray(perf) && perf.length > 0;

    return (
        <>
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-primary" aria-hidden="true" />
                    Riwayat Performa (30h)
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted">Latency</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500" aria-hidden="true" />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-fg-muted">Rx Power</span>
                    </span>
                </div>
            </div>
            <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-2 h-[180px] mb-4">
                {isLoading ? (
                    <div className="h-full flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-slate-700" aria-hidden="true" />
                    </div>
                ) : hasData ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                        <ComposedChart data={perf} margin={{ top: 6, right: 2, left: -22, bottom: 0 }}>
                            <defs>
                                <linearGradient id="nwLatency" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="nwSignal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                            <XAxis
                                dataKey="timestamp"
                                stroke="#475569"
                                fontSize={8}
                                tickLine={false}
                                axisLine={false}
                                dy={6}
                                minTickGap={28}
                                tickFormatter={(val) => {
                                    const d = new Date(val);
                                    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                                }}
                            />
                            <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" fontSize={8} tickLine={false} axisLine={false} domain={[0, 'auto']} unit="ms" width={36} />
                            <YAxis yAxisId="right" orientation="right" stroke="#a855f7" fontSize={8} tickLine={false} axisLine={false} domain={[-35, -5]} unit="dBm" width={40} />
                            <Tooltip content={<PerfTooltip />} />
                            <Area yAxisId="left" type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#nwLatency)" name="Latency" unit="ms" isAnimationActive={false} connectNulls />
                            <Area yAxisId="right" type="monotone" dataKey="signal" stroke="#a855f7" strokeWidth={1.5} fillOpacity={1} fill="url(#nwSignal)" name="Rx Power" unit="dBm" isAnimationActive={false} connectNulls />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700">
                        <Activity className="w-8 h-8 mb-2 opacity-10" aria-hidden="true" />
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 italic">Belum ada data performa</p>
                    </div>
                )}
            </div>
        </>
    );
}
