import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import CustomTooltip from './CustomTooltip';

function SimpleBarChart({ data, dataKey = 'total', color = '#3b82f6', height = 200, onClick }) {
    // Transform and sort data for display
    const chartData = useMemo(() => {
        if (!data) return [];
        return [...data]
            .sort((a, b) => new Date(a.date || a.timestamp).getTime() - new Date(b.date || b.timestamp).getTime())
            .map(item => ({
                ...item,
                displayDate: item.date ? new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : item.label,
                [dataKey]: Number(item[dataKey] || 0)
            }));
    }, [data, dataKey]);

    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-slate-500">
                No data available
            </div>
        );
    }

    return (
        <div style={{ height, width: '100%', position: 'relative' }}>
            <ResponsiveContainer minWidth={0} width="100%" height="100%">
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                        dataKey="displayDate"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dx={-10}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#334155', opacity: 0.2 }} />
                    <Bar
                        dataKey={dataKey}
                        name="Alerts"
                        fill={color}
                        radius={[4, 4, 0, 0]}
                        barSize={30}
                        onClick={onClick}
                        cursor="pointer"
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export default SimpleBarChart;
