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
import { formatBits, formatTimeOnly } from '../router-utils';
import { routerService } from '@/lib/api';

function InterfaceTrafficChart({ routerId, interfaces }) {
    const [selectedInterface, setSelectedInterface] = useState('');
    const [history, setHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const containerRef = useRef(null);
    const [chartAttributes, setChartAttributes] = useState({ width: 0, height: 250 });
    const lastHistoryTimestamp = useRef(null);

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
            const current = interfaces.find(i => i.name === selectedInterface);
            if (!selectedInterface || !current) {
                // Default to interface with highest combined traffic (TX + RX)
                const highest = [...interfaces].sort((a, b) => 
                    (Number(b.txRate || 0) + Number(b.rxRate || 0)) - 
                    (Number(a.txRate || 0) + Number(a.rxRate || 0))
                )[0];
                setSelectedInterface(highest?.name || interfaces[0].name);
            }
        }
    }, [interfaces, selectedInterface]);

    // Fetch history when selected interface changes
    useEffect(() => {
        const fetchHistory = async () => {
            if (!routerId || !currentInterface?.id) return;
            
            setIsLoadingHistory(true);
            try {
                const rawData = await routerService.getInterfaceHistory(routerId, currentInterface.id, 30);
                const formattedHistory = (rawData || [])
                    .map(item => ({
                        time: formatTimeOnly(item.recordedAt),
                        timestamp: new Date(item.recordedAt).getTime(),
                        tx: item.txRate || 0,
                        rx: item.rxRate || 0,
                    }))
                    .sort((a, b) => a.timestamp - b.timestamp);

                if (formattedHistory.length > 0) {
                    lastHistoryTimestamp.current = formattedHistory[formattedHistory.length - 1].timestamp;
                }
                
                setHistory(formattedHistory);
            } catch (error) {
                console.error('Failed to fetch interface traffic history:', error);
                setHistory([]);
            } finally {
                setIsLoadingHistory(false);
            }
        };

        if (currentInterface?.id) {
            fetchHistory();
        } else {
            setHistory([]);
        }
    }, [routerId, currentInterface?.id]);

    // Append live updates
    useEffect(() => {
        if (!currentInterface || isLoadingHistory) return;

        const now = new Date();
        const currentTs = now.getTime();
        
        // Prevent adding a live point if it's too close to the last history point (within 5 seconds)
        if (lastHistoryTimestamp.current && (currentTs - lastHistoryTimestamp.current < 5000)) {
            return;
        }

        const timeLabel = formatTimeOnly(now);

        setHistory(prev => {
            const newPoint = {
                time: timeLabel,
                timestamp: currentTs,
                tx: currentInterface.txRate || 0,
                rx: currentInterface.rxRate || 0,
            };

            // Avoid duplicate points by timestamp
            if (prev.length > 0 && prev[prev.length - 1].time === timeLabel) {
                 return prev;
            }

            const newHistory = [...prev, newPoint];
            if (newHistory.length > 40) return newHistory.slice(newHistory.length - 40);
            return newHistory;
        });
    }, [currentInterface, isLoadingHistory]);

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
                                minTickGap={30}
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
                                formatter={(value) => [formatBits(value)]}
                            />
                            <Area
                                type="monotone"
                                dataKey="tx"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTx)"
                                name="TX (Upload)"
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotone"
                                dataKey="rx"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRx)"
                                name="RX (Download)"
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    ) : (
                        <div className="flex h-full items-center justify-center text-slate-500 text-sm">
                            {isLoadingHistory ? "Loading history..." : "Waiting for traffic data..."}
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
