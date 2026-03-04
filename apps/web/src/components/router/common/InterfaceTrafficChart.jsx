import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Activity } from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip
} from 'recharts';
import { formatBits } from '../router-utils';

function InterfaceTrafficChart({ routerId, interfaces }) {
    const [selectedInterface, setSelectedInterface] = useState('');
    const [history, setHistory] = useState([]);
    const containerRef = useRef(null);
    const [chartAttributes, setChartAttributes] = useState({ width: 0, height: 250 });

    useEffect(() => {
        if (!containerRef.current) return;

        const updateSize = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                if (width > 0 && Math.abs(width - chartAttributes.width) > 5) {
                    setChartAttributes({ width, height: 250 });
                }
            }
        };

        updateSize();
        const timer = setTimeout(updateSize, 100);
        window.addEventListener('resize', updateSize);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateSize);
        };
    }, [chartAttributes.width]);

    const currentInterface = interfaces?.find(i => i.name === selectedInterface);

    useEffect(() => {
        if (interfaces?.length > 0) {
            if (!selectedInterface || !interfaces.find(i => i.name === selectedInterface)) {
                setSelectedInterface(interfaces[0].name);
            }
        }
    }, [interfaces, selectedInterface]);

    useEffect(() => {
        if (!currentInterface) return;

        const now = new Date();
        const timeLabel = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setHistory(prev => {
            const newPoint = {
                time: timeLabel,
                tx: currentInterface.txRate || 0,
                rx: currentInterface.rxRate || 0,
            };

            if (prev.length === 0) {
                return [
                    { ...newPoint, time: '' },
                    newPoint
                ];
            }

            const newHistory = [...prev, newPoint];
            if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
            return newHistory;
        });
    }, [currentInterface]);

    useEffect(() => {
        setHistory([]);
    }, [selectedInterface]);

    return (
        <Card className="glass-panel col-span-1 lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Interface Traffic
                </CardTitle>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedInterface}
                        onChange={(e) => setSelectedInterface(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white text-xs rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                    >
                        {interfaces?.map(iface => (
                            <option key={iface.id} value={iface.name}>
                                {iface.name} ({iface.running ? 'up' : 'down'})
                            </option>
                        ))}
                    </select>
                </div>
            </CardHeader>
            <CardContent>
                <div ref={containerRef} style={{ width: '100%', height: 250, minHeight: 250 }}>
                    {chartAttributes.width > 0 && history.length > 0 ? (
                        <AreaChart width={chartAttributes.width} height={chartAttributes.height} data={history}>
                            <defs>
                                <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="time"
                                stroke="#475569"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#475569"
                                fontSize={10}
                                tickFormatter={formatBits}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                                domain={[0, 'auto']}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }}
                                itemStyle={{ fontSize: '12px' }}
                                labelStyle={{ color: '#94a3b8', marginBottom: '5px' }}
                                formatter={(value) => [formatBits(value), value === history[history.length - 1]?.tx ? 'TX (Upload)' : 'RX (Download)']}
                            />
                            <Area
                                type="monotone"
                                dataKey="tx"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTx)"
                                name="TX"
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="rx"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRx)"
                                name="RX"
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    ) : (
                        <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                            {history.length === 0 ? "Waiting for traffic data..." : "Initializing chart..."}
                        </div>
                    )}
                </div>
                <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        <span className="text-xs text-slate-400">TX: {formatBits(currentInterface?.txRate || 0)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-xs text-slate-400">RX: {formatBits(currentInterface?.rxRate || 0)}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default InterfaceTrafficChart;
