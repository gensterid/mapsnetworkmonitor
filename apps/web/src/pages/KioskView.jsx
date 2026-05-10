import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import NetworkMap from '@/components/NetworkMap';
import NetworkHealthCard from '@/components/NetworkHealthCard';
import { useNetworkHealth, usePredictions } from '@/hooks/useAnalytics';
import { useRouters } from '@/hooks';
import { X, Maximize2, Monitor, Activity, Shield as ShieldCircle, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import './Kiosk.css';
import { formatDateOnly, formatTimeOnly } from '@/lib/timezone';
import { useAppTimezone } from '@/hooks';

export default function KioskView() {
    const navigate = useNavigate();
    const timezone = useAppTimezone();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const { data: routers = [] } = useRouters();
    const { data: health } = useNetworkHealth();
    const { data: predictions = [] } = usePredictions();
    
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            clearInterval(timer);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const exitKiosk = () => {
        navigate('/');
    };

    return (
        <div className="kiosk-mode">
            <header className="kiosk-header">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <Monitor className="w-6 h-6" />
                        </div>
                        <h1 className="kiosk-title tracking-widest uppercase">Network Operation Center</h1>
                    </div>
                    <div className="kiosk-status-badge">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        System Online & Syncing
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                    <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{formatDateOnly(currentTime, timezone)}</div>
                        <div className="kiosk-clock">{formatTimeOnly(currentTime, timezone)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleFullscreen}
                            className={`p-3 rounded-full transition-all border ${isFullscreen ? 'bg-primary/20 text-primary border-primary/30' : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent hover:border-slate-800'}`}
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        >
                            <Maximize2 className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={exitKiosk}
                            className="p-3 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all border border-transparent hover:border-slate-800"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="kiosk-body">
                <div className="kiosk-panel kiosk-map-container">
                    <div className="kiosk-scanline" />
                    <div className="absolute top-8 left-8 z-20 bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.15)] overline decoration-primary/50">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase font-black text-blue-400 tracking-[0.3em] mb-1">Live Feed // Node Matrix</span>
                            <span className="text-2xl font-black text-white tracking-tight">{routers.length} ACTIVE_NODES</span>
                        </div>
                    </div>
                    <div className="w-full h-full relative">
                        <NetworkMap 
                            showRoutersOnly={false} 
                            disableScaling={true} 
                            onMarkerClick={(device) => setSelectedDevice(device)}
                        />

                        {/* NOC-Style Device Detail Popup */}
                        {selectedDevice && (
                            <div className="absolute top-3 left-3 sm:top-6 sm:left-6 z-[1000] w-[calc(100%-1.5rem)] max-w-[20rem] sm:w-80 bg-slate-900/90 backdrop-blur-md border border-primary/30 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
                                <div className="p-3 bg-primary/10 border-b border-primary/20 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${['online', 'up', 'active'].includes(selectedDevice.data.status?.toLowerCase()) ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`} />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white truncate max-w-[180px]">
                                            {selectedDevice.data.name || selectedDevice.data.host}
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedDevice(null)}
                                        className="text-slate-400 hover:text-white transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <div className="text-[8px] text-slate-500 uppercase font-black mb-1">Status</div>
                                            <div className="text-xs font-mono text-slate-200">{selectedDevice.data.status?.toUpperCase() || 'UNKNOWN'}</div>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded border border-white/5 relative">
                                            <div className="text-[8px] text-slate-500 uppercase font-black mb-1 flex items-center justify-between">
                                                Latency
                                                {(() => {
                                                    const pred = predictions.find(p => p.id === (selectedDevice.data.routerId || selectedDevice.data.id));
                                                    if (!pred) return null;
                                                    const trend = pred.metrics.latency.trend;
                                                    if (trend === 'deteriorating') return <TrendingUp className="w-2.5 h-2.5 text-red-500 animate-pulse" />;
                                                    if (trend === 'improving') return <TrendingDown className="w-2.5 h-2.5 text-emerald-500" />;
                                                    return <Minus className="w-2.5 h-2.5 text-slate-600" />;
                                                })()}
                                            </div>
                                            <div className="text-xs font-mono text-emerald-400">{selectedDevice.data.latency || '0'}ms</div>
                                        </div>
                                    </div>

                                    {(() => {
                                        const pred = predictions.find(p => p.id === (selectedDevice.data.routerId || selectedDevice.data.id));
                                        if (pred?.riskLevel === 'high' || pred?.riskLevel === 'medium') {
                                            return (
                                                <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2 animate-pulse">
                                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                                                    <div className="text-[9px] font-black text-red-400 uppercase tracking-tight">
                                                        {pred.riskLevel === 'high' ? 'High Risk: Deteriorating Performance' : 'Medium Risk: Performance Trending Down'}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    
                                    <div className="space-y-2 border-t border-white/5 pt-3">
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-slate-500 uppercase font-bold tracking-tight">IP Address</span>
                                            <span className="text-slate-300 font-mono">{selectedDevice.data.host || selectedDevice.data.address || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-slate-500 uppercase font-bold tracking-tight">Device Type</span>
                                            <span className="text-slate-300 font-mono uppercase text-[9px]">{selectedDevice.data.deviceType || selectedDevice.type}</span>
                                        </div>
                                        {selectedDevice.data.model && (
                                            <div className="flex justify-between items-center text-[10px]">
                                                <span className="text-slate-500 uppercase font-bold tracking-tight">System Model</span>
                                                <span className="text-slate-300 font-mono truncate max-w-[120px] text-[9px]">{selectedDevice.data.model}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        className="w-full py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded text-[9px] font-black text-primary uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_15px_rgba(59,130,246,0.2)] active:scale-[0.98]"
                                        onClick={() => {
                                            const routerId = selectedDevice.data.routerId || selectedDevice.data.id;
                                            window.open(`/dashboard?routerId=${routerId}`, '_blank');
                                        }}
                                    >
                                        Inspect Node Architecture
                                    </button>
                                </div>
                                <div className="px-4 py-2 bg-black/40 text-[7px] text-slate-600 font-mono flex justify-between border-t border-white/5">
                                    <span className="tracking-tighter uppercase">NOC_UNIT_ID: {selectedDevice.data.id?.slice(0,12) || 'NODE-UNDEFINED'}</span>
                                    <span className="text-primary/50">LIVE_TELEMETRY</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="kiosk-panel kiosk-health-container">
                    <div className="w-full max-w-sm">
                        <NetworkHealthCard isKiosk={true} />
                    </div>
                </div>

                <div className="kiosk-panel kiosk-metrics-container">
                    <div className="flex flex-col h-full gap-4">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                            <Activity className="w-4 h-4 text-primary" />
                            <h2 className="text-sm font-bold uppercase tracking-widest">Network Throughput</h2>
                        </div>
                        <div className="flex-1 flex flex-col justify-center gap-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 backdrop-blur-md relative overflow-hidden group hover:border-blue-500/30 transition-all">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-all">
                                        <Activity className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <div className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                        Global Uplink
                                    </div>
                                    <div className="text-3xl font-black text-white kiosk-metric-value text-blue-400">
                                        {health?.stats ? (health.stats.totalTxRate / 1000000).toFixed(1) : '0.0'} 
                                        <span className="text-xs font-black text-slate-500 ml-1 tracking-normal opacity-50 font-mono">MBPS</span>
                                    </div>
                                </div>
                                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-all">
                                        <Activity className="w-8 h-8 text-emerald-400" />
                                    </div>
                                    <div className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        Global Downlink
                                    </div>
                                    <div className="text-3xl font-black text-white kiosk-metric-value text-emerald-400">
                                        {health?.stats ? (health.stats.totalRxRate / 1000000).toFixed(1) : '0.0'} 
                                        <span className="text-xs font-black text-slate-500 ml-1 tracking-normal opacity-50 font-mono">MBPS</span>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 rounded-lg bg-slate-800/30 border border-white/5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Resource Utilization</span>
                                    <span className="text-[10px] font-mono text-primary">
                                        CPU: {health?.stats?.avgCpuLoad || 0}%
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary transition-all duration-1000" 
                                        style={{ width: `${health?.stats?.avgCpuLoad || 0}%` }} 
                                    />
                                </div>
                                <div className="mt-3 flex justify-between items-center">
                                    <span className="text-[9px] uppercase text-slate-500">Group Latency</span>
                                    <span className="text-[10px] text-white font-mono">{Math.round(routers.reduce((acc, r) => acc + (r.latency || 0), 0) / (routers.length || 1))}ms</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
