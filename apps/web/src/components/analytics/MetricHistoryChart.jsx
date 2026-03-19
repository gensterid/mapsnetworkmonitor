import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';
import CustomTooltip from './CustomTooltip';

function MetricHistoryChart({ data, dataKey, name, unit, color = '#3b82f6', height = 250, placeholder = "Pilih perangkat untuk melihat data" }) {
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
                value: Number(item[dataKey] || 0)
            }));
    }, [data, dataKey]);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                {placeholder}
            </div>
        );
    }

    return (
        <div style={{ height, width: '100%', position: 'relative' }}>
            <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dx={-10} unit={unit} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#grad-${dataKey})`} unit={unit} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export default MetricHistoryChart;
