import React, { useState, useCallback } from 'react';
import './map.css';

/**
 * MapLegend — Legend warna untuk marker + link status.
 *
 * Setelah refactor (Step 3):
 *   - HAPUS: 3 button performa duplikat (animation, clustering, lowPerf)
 *     yang sudah ada di MapControls. MapLegend cuma legend + show labels.
 *   - Pakai status token (bg-status-online/offline/issue) — konsisten
 *     dengan FloatingStatusCounter + MapStatusFilter.
 *
 * Props (signature setelah cleanup):
 *   showLabels: boolean
 *   onToggleLabels: () => void
 *   isHeatmapMode: boolean
 *   mapColors: { trafficThresholdIdle, trafficThresholdHigh, ... }
 *
 * Yang dihapus (tidak destructure lagi, otomatis di-ignore):
 *   enableAnimation, setEnableAnimation
 *   enableClustering, setEnableClustering
 *   lowPerfMode, setLowPerfMode
 */
const MapLegend = ({ showLabels, onToggleLabels, isHeatmapMode, mapColors }) => {
    const [isMinimized, setIsMinimized] = useState(() => {
        try {
            const saved = localStorage.getItem('map_legend_minimized');
            return saved !== null ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });

    const toggleMinimize = useCallback(() => {
        setIsMinimized((prev) => {
            const next = !prev;
            try {
                localStorage.setItem('map_legend_minimized', JSON.stringify(next));
            } catch {
                // localStorage bisa disabled di incognito strict
            }
            return next;
        });
    }, []);

    return (
        <div
            className={`absolute bottom-6 left-6 z-[1000] bg-surface-darker/95 border border-slate-border rounded-xl p-2 backdrop-blur-xl shadow-2xl transition-all duration-300 ${
                isMinimized
                    ? 'w-10 min-w-0 h-10 overflow-hidden cursor-pointer hover:bg-surface-dark'
                    : 'min-w-[160px]'
            } mobile-map-legend`}
            onClick={isMinimized ? toggleMinimize : undefined}
        >
            <div className="flex items-center justify-between mb-1.5 px-1">
                {!isMinimized && (
                    <div className="text-fg-muted text-[9px] uppercase font-bold tracking-wider">
                        Legend
                    </div>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleMinimize();
                    }}
                    className={`flex items-center justify-center rounded transition-colors ${
                        isMinimized
                            ? 'w-full h-full'
                            : 'w-5 h-5 bg-slate-surface hover:bg-slate-border text-fg-muted'
                    }`}
                    aria-label={isMinimized ? 'Expand Legend' : 'Minimize Legend'}
                    title={isMinimized ? 'Expand Legend' : 'Minimize Legend'}
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        {isMinimized ? 'legend_toggle' : 'keyboard_arrow_down'}
                    </span>
                </button>
            </div>

            {!isMinimized && (
                <div className="flex flex-col gap-1.5 px-1">
                    {/* Status indicators — pakai status token */}
                    <div className="flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full bg-status-online shadow-[0_0_4px_var(--color-status-online)] border border-white/10"
                            aria-hidden="true"
                        />
                        <span className="text-fg text-[10px]">Online / Up</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full bg-status-offline shadow-[0_0_4px_var(--color-status-offline)] border border-white/10"
                            aria-hidden="true"
                        />
                        <span className="text-fg text-[10px]">Offline / Down</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full bg-status-issue shadow-[0_0_4px_var(--color-status-issue)] border border-white/10"
                            aria-hidden="true"
                        />
                        <span className="text-fg text-[10px]">Warning / Issue</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className="w-2 h-2 rounded-full bg-status-offline shadow-[0_0_8px_var(--color-status-offline)] border border-white/10 animate-pulse"
                            aria-hidden="true"
                        />
                        <span className="text-fg text-[10px]">Full ODP (Capacity)</span>
                    </div>

                    {/* Link legend (atau Traffic Load jika heatmap mode) */}
                    {!isHeatmapMode ? (
                        <div className="space-y-1 mt-0.5">
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-4 h-0.5 rounded-full bg-status-online"
                                    aria-hidden="true"
                                />
                                <span className="text-fg text-[10px]">Active Link</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-4 h-0.5 rounded-full bg-status-offline border-b border-dashed"
                                    aria-hidden="true"
                                />
                                <span className="text-fg text-[10px]">Down Link</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mt-1 text-fg-muted text-[9px] uppercase font-semibold">
                                Traffic Load
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-0.5 bg-blue-500" aria-hidden="true" />
                                <span className="text-fg text-[9px]">
                                    Idle (&lt; {mapColors?.trafficThresholdIdle || 1}M)
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-0.5 bg-status-online" aria-hidden="true" />
                                <span className="text-fg text-[9px]">Normal</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-5 h-1 bg-status-issue" aria-hidden="true" />
                                <span className="text-fg text-[9px]">High</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-5 h-1.5 bg-fuchsia-500 shadow-[0_0_3px_rgba(217,70,239,0.6)]"
                                    aria-hidden="true"
                                />
                                <span className="text-fg text-[9px]">
                                    Peak (&gt; {mapColors?.trafficThresholdHigh || 50}M)
                                </span>
                            </div>
                        </>
                    )}

                    {/* Show Labels toggle — satu-satunya control yang relevan di Legend */}
                    {onToggleLabels && (
                        <div className="mt-2 pt-2 border-t border-slate-border/60">
                            <button
                                onClick={onToggleLabels}
                                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[10px] font-medium bg-slate-surface hover:bg-slate-border/60 text-fg-muted hover:text-fg transition-colors"
                                title={showLabels ? 'Sembunyikan label marker' : 'Tampilkan label marker'}
                                aria-label={showLabels ? 'Hide labels' : 'Show labels'}
                            >
                                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                                    {showLabels ? 'label_off' : 'label'}
                                </span>
                                {showLabels ? 'Sembunyikan Label' : 'Tampilkan Label'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MapLegend;
