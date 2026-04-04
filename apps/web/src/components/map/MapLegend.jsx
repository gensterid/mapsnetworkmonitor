import React from 'react';
import './map.css';

/**
 * MapLegend - Legend showing status indicators (Simple Version)
 */
const MapLegend = ({
    showLabels,
    onToggleLabels,
    isHeatmapMode,
    mapColors,
    enableAnimation,
    setEnableAnimation,
    enableClustering,
    setEnableClustering,
    lowPerfMode,
    setLowPerfMode
}) => {
    const [isMinimized, setIsMinimized] = React.useState(() => {
        const saved = localStorage.getItem('map_legend_minimized');
        return saved !== null ? JSON.parse(saved) : false;
    });

    const toggleMinimize = () => {
        const newValue = !isMinimized;
        setIsMinimized(newValue);
        localStorage.setItem('map_legend_minimized', JSON.stringify(newValue));
    };

    return (
        <div
            className={`absolute bottom-6 left-6 z-[1000] bg-slate-900/90 border border-slate-700/50 rounded-lg p-2 backdrop-blur-sm shadow-xl transition-all duration-300 ${isMinimized ? 'w-10 min-w-0 h-10 overflow-hidden cursor-pointer hover:bg-slate-800' : 'min-w-[160px]'
                } mobile-map-legend`}
            onClick={isMinimized ? toggleMinimize : undefined}
        >
            <div className="flex items-center justify-between mb-1.5 px-1">
                {!isMinimized && <div className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Legend</div>}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleMinimize();
                    }}
                    className={`flex items-center justify-center rounded transition-colors ${isMinimized ? 'w-full h-full' : 'w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-400'
                        }`}
                    aria-label={isMinimized ? "Expand Legend" : "Minimize Legend"}
                    title={isMinimized ? "Expand Legend" : "Minimize Legend"}
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        {isMinimized ? 'legend_toggle' : 'keyboard_arrow_down'}
                    </span>
                </button>
            </div>

            {!isMinimized && (
                <>
                    <div className="flex flex-col gap-1.5 px-1">
                        {/* Status indicators */}
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)] border border-white/10"></span>
                            <span className="text-white text-[10px]">Online / Up</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)] border border-white/10"></span>
                            <span className="text-white text-[10px]">Offline / Down</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.4)] border border-white/10"></span>
                            <span className="text-white text-[10px]">Warning / Alert</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] border border-white/10 animate-pulse"></span>
                            <span className="text-white text-[10px]">Full ODP (Capacity)</span>
                        </div>

                        {!isHeatmapMode ? (
                            <div className="space-y-1 mt-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-0.5 rounded-full bg-emerald-500"></span>
                                    <span className="text-white text-[10px]">Active Link</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-0.5 rounded-full bg-red-500 border-b border-dashed"></span>
                                    <span className="text-white text-[10px]">Down Link</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mt-1 text-slate-500 text-[9px] uppercase font-semibold">Traffic Load</div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-0.5 bg-blue-500"></span>
                                    <span className="text-white text-[9px]">Idle (&lt; {mapColors?.trafficThresholdIdle || 1}M)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-0.5 bg-emerald-500"></span>
                                    <span className="text-white text-[9px]">Normal</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-1 bg-yellow-400"></span>
                                    <span className="text-white text-[9px]">High</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-1.5 bg-fuchsia-500 shadow-[0_0_3px_rgba(217,70,239,0.6)]"></span>
                                    <span className="text-white text-[9px]">Peak (&gt; {mapColors?.trafficThresholdHigh || 50}M)</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* PERFORMA Section */}
                    <div className="mt-2.5 border-t border-slate-700/30 pt-2 px-1">
                        <div className="text-slate-500 text-[9px] uppercase font-bold mb-1.5 tracking-wider">Performa</div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                onClick={() => setEnableAnimation(!enableAnimation)}
                                className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-colors border ${enableAnimation ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700/50'
                                    }`}
                                title={enableAnimation ? "Matikan Animasi Peta" : "Aktifkan Animasi Peta"}
                                aria-label={enableAnimation ? "Matikan Animasi Peta" : "Aktifkan Animasi Peta"}
                            >
                                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">animation</span>
                                {enableAnimation ? 'Animasi' : 'Off'}
                            </button>

                            <button
                                onClick={() => setEnableClustering(!enableClustering)}
                                className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-colors border ${enableClustering ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-800 text-slate-400 border-slate-700/50'
                                    }`}
                                title={enableClustering ? "Matikan Pengelompokan Cluster" : "Aktifkan Pengelompokan Cluster"}
                                aria-label={enableClustering ? "Matikan Pengelompokan Cluster" : "Aktifkan Pengelompokan Cluster"}
                            >
                                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">group_work</span>
                                {enableClustering ? 'Cluster' : 'Off'}
                            </button>

                            <button
                                onClick={() => setLowPerfMode(!lowPerfMode)}
                                className={`flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-colors border ${lowPerfMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700/50'
                                    }`}
                                title={lowPerfMode ? "Matikan Mode Performa Rendah" : "Aktifkan Mode Performa Rendah (Hemat CPU)"}
                                aria-label={lowPerfMode ? "Matikan Mode Performa Rendah" : "Aktifkan Mode Performa Rendah (Hemat CPU)"}
                            >
                                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">monitor_heart</span>
                                {lowPerfMode ? 'LowPerf' : 'Off'}
                            </button>

                            {onToggleLabels && (
                                <button
                                    onClick={onToggleLabels}
                                    className="flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition-colors"
                                    title="Toggle Labels"
                                >
                                    <span className="material-symbols-outlined text-[13px]">
                                        {showLabels ? 'label_off' : 'label'}
                                    </span>
                                    {showLabels ? 'Hide' : 'Show'}
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default MapLegend;
