import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';
import CustomTooltip from './CustomTooltip';

function TrendChart({ data, height = 200 }) {
    // Format and sort data timestamps
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data)) return [];
        return data
            .filter(item => item && item.timestamp && !isNaN(new Date(item.timestamp).getTime()))
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(item => {
                const date = new Date(item.timestamp);
                return {
                    ...item,
                    time: date.toLocaleString('id-ID', { 
                        day: '2-digit', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit', 
                        minute: '2-digit' 
                    }),
                    avgCpu: Number(item.avgCpu || 0),
                    avgMemory: Number(item.avgMemory || 0)
                };
            });
    }, [data]);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                Data tidak tersedia
            </div>
        );
    }

    return (
        <div style={{ height, width: '100%', position: 'relative' }}>
            <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
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
                        minTickGap={30}
                        dy={10}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dx={-10}
                        unit="%"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="avgCpu"
                        name="CPU Load"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCpu)"
                        unit="%"
                    />
                    <Area
                        type="monotone"
                        dataKey="avgMemory"
                        name="Memory Usage"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorMem)"
                        unit="%"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export default TrendChart;
