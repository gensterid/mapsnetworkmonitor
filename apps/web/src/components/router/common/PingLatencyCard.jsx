import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Activity, RefreshCw, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { usePingLatencies } from '@/hooks';

function PingLatencyCard({ routerId }) {
    const { data: latencies, isLoading, isFetching, isError, error, refetch } = usePingLatencies(routerId);

    const getLatencyColor = (latency) => {
        if (latency === null) return 'text-slate-500';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getLatencyBg = (latency) => {
        if (latency === null) return 'bg-slate-700';
        if (latency < 50) return 'bg-emerald-500/10';
        if (latency < 100) return 'bg-yellow-500/10';
        return 'bg-red-500/10';
    };

    return (
        <Card className="glass-panel">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="w-5 h-5" />
                    Ping Latency
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={clsx("w-3 h-3 text-slate-400", isFetching && "animate-spin")} />
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                    </div>
                ) : isError ? (
                    <div className="text-center py-4 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                        <p>Failed to load latency data</p>
                        <p className="text-xs text-slate-500 mt-1">{error?.message || 'Check logs'}</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                            Try Again
                        </Button>
                    </div>
                ) : !latencies || latencies.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                        No ping targets configured
                        <p className="text-xs mt-1">Configure targets in Settings → General</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {latencies.map((item, idx) => (
                            <div
                                key={idx}
                                className={clsx(
                                    "flex items-center justify-between p-2 rounded-lg",
                                    getLatencyBg(item.latency)
                                )}
                            >
                                <div className="flex flex-col">
                                    <span className="text-sm text-white font-medium">{item.label}</span>
                                    <span className="text-xs text-slate-500 font-mono">{item.ip}</span>
                                </div>
                                <span className={clsx("text-lg font-bold font-mono", getLatencyColor(item.latency))}>
                                    {item.latency !== null ? `${item.latency}ms` : '--'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default PingLatencyCard;
