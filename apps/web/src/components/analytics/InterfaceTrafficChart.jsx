import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';

function InterfaceTrafficChart({ data, height = 250 }) {
    const chartData = useMemo(() => {
        if (!data) return [];
        return [...data]
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(item => ({
                ...item,
                time: new Date(item.timestamp).toLocaleString('id-ID', { 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                tx: Number(item.txRate || 0),
                rx: Number(item.rxRate || 0)
            }));
    }, [data]);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                Pilih interface untuk melihat data
            </div>
        );
    }

    const formatRate = (bps) => {
        if (bps === null || bps === undefined) return '0 bps';
        if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
        if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Kbps`;
        return `${bps} bps`;
    };


    return (
        <div style={{ height, width: '100%', position: 'relative' }}>
            <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                        dataKey="time"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={40}
                        dy={10}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dx={-10}
                        tickFormatter={(val) => formatRate(val)}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-slate-800 border border-slate-700 p-2 rounded-lg shadow-xl text-xs">
                                        <p className="text-slate-300 font-medium mb-1">{label}</p>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            <span className="text-slate-400">TX:</span>
                                            <span className="text-white font-mono font-medium">{formatRate(payload[0].value)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-slate-400">RX:</span>
                                            <span className="text-white font-mono font-medium">{formatRate(payload[1].value)}</span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Area type="monotone" dataKey="tx" name="TX" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorTx)" />
                    <Area type="monotone" dataKey="rx" name="RX" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRx)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export default InterfaceTrafficChart;
