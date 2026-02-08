import React from 'react';
import './map.css';

/**
 * MapLegend - Legend showing status indicators
 */
/**
 * MapLegend - Legend showing status indicators
 */
const MapLegend = ({
    showLabels: initialShowLabels = true,
    onToggleLabels: initialOnToggleLabels,
    enableAnimation = true,
    onToggleAnimation,
    enableClustering = true,
    onToggleClustering,
    lowPerfMode = false,
    onToggleLowPerf,
    isHeatmapMode = false,
    mapColors,
}) => {
    // Internal state for mobile responsiveness
    // On desktop, we respect the parent's prop. On mobile, we might default to hidden.
    const [isMobile, setIsMobile] = React.useState(window.innerWidth < 640);
    const [localShowLabels, setLocalShowLabels] = React.useState(initialShowLabels);

    React.useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 640;
            setIsMobile(mobile);
            // Auto-collapse on mobile if it was previously open? Optional.
            // keeping it simple for now.
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sync local state with prop when not controlled or just for init
    React.useEffect(() => {
        if (isMobile) {
            // Force minimize on mobile init if needed, effectively "default closed"
            setLocalShowLabels(false);
        } else {
            setLocalShowLabels(initialShowLabels);
        }
    }, [initialShowLabels, isMobile]);

    const toggleLabels = () => {
        if (initialOnToggleLabels && !isMobile) {
            initialOnToggleLabels();
        } else {
            setLocalShowLabels(!localShowLabels);
        }
    };

    const showContent = isMobile ? localShowLabels : initialShowLabels;

    return (
        <div className={`map-legend ${isMobile && !showContent ? 'map-legend--minimized' : ''}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="map-legend__title mb-0">Legend</div>
                {/* Mobile toggle button inside the header */}
                {isMobile && (
                    <button
                        onClick={() => setLocalShowLabels(!localShowLabels)}
                        className="text-slate-400 hover:text-white"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {localShowLabels ? 'expand_more' : 'expand_less'}
                        </span>
                    </button>
                )}
            </div>

            {(showContent || !isMobile) && (
                <>
                    <div className="map-legend__items">
                        {/* Status indicators - Always show Offline as it's critical */}
                        <div className="map-legend__item">
                            <span className="map-legend__dot map-legend__dot--offline"></span>
                            <span className="map-legend__text">Offline / Down</span>
                        </div>

                        {!isHeatmapMode ? (
                            <>
                                <div className="map-legend__item">
                                    <span className="map-legend__dot map-legend__dot--online"></span>
                                    <span className="map-legend__text">Online / Up</span>
                                </div>
                                <div className="map-legend__item" style={{ marginTop: 8 }}>
                                    <span className="map-legend__line map-legend__line--up"></span>
                                    <span className="map-legend__text">Active Link</span>
                                </div>
                                <div className="map-legend__item">
                                    <span className="map-legend__line map-legend__line--down"></span>
                                    <span className="map-legend__text">Down Link</span>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Heatmap Legend */}
                                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Traffic Load</div>

                                <div className="map-legend__item">
                                    <span className="map-legend__line" style={{ background: mapColors?.trafficyIdle || '#3b82f6', height: 2, width: 24 }}></span>
                                    <span className="map-legend__text">Idle (&lt; {mapColors?.trafficThresholdIdle || 1}M)</span>
                                </div>
                                <div className="map-legend__item">
                                    <span className="map-legend__line" style={{ background: mapColors?.trafficNormal || '#10b981', height: 3, width: 24 }}></span>
                                    <span className="map-legend__text">Normal ({mapColors?.trafficThresholdIdle || 1}-{mapColors?.trafficThresholdNormal || 20}M)</span>
                                </div>
                                <div className="map-legend__item">
                                    <span className="map-legend__line" style={{ background: mapColors?.trafficHigh || '#facc15', height: 4, width: 24 }}></span>
                                    <span className="map-legend__text">High ({mapColors?.trafficThresholdNormal || 20}-{mapColors?.trafficThresholdHigh || 50}M)</span>
                                </div>
                                <div className="map-legend__item">
                                    <span className="map-legend__line" style={{ background: mapColors?.trafficPeak || '#d946ef', height: 5, width: 24, boxShadow: `0 0 4px ${mapColors?.trafficPeak || '#d946ef'}` }}></span>
                                    <span className="map-legend__text">Peak (&gt; {mapColors?.trafficThresholdHigh || 50}M)</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Performance toggles */}
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Performa
                        </div>

                        {/* Animation toggle */}
                        {onToggleAnimation && (
                            <button
                                onClick={onToggleAnimation}
                                className="map-legend__toggle"
                                style={{
                                    marginBottom: 4,
                                    padding: '5px 8px',
                                    background: enableAnimation ? 'rgba(16, 185, 129, 0.2)' : 'rgba(71, 85, 105, 0.4)',
                                    border: 'none',
                                    borderRadius: 4,
                                    color: 'white',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                    {enableAnimation ? 'animation' : 'motion_photos_off'}
                                </span>
                                Animasi: {enableAnimation ? 'ON' : 'OFF'}
                            </button>
                        )}

                        {/* Clustering toggle */}
                        {onToggleClustering && (
                            <button
                                onClick={onToggleClustering}
                                className="map-legend__toggle"
                                style={{
                                    padding: '5px 8px',
                                    background: enableClustering ? 'rgba(59, 130, 246, 0.2)' : 'rgba(71, 85, 105, 0.4)',
                                    border: 'none',
                                    borderRadius: 4,
                                    color: 'white',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                    {enableClustering ? 'group_work' : 'scatter_plot'}
                                </span>
                                Cluster: {enableClustering ? 'ON' : 'OFF'}
                            </button>
                        )}

                        {/* Low Perf Mode Toggle */}
                        {onToggleLowPerf && (
                            <button
                                onClick={onToggleLowPerf}
                                className="map-legend__toggle"
                                style={{
                                    marginTop: 4,
                                    padding: '5px 8px',
                                    background: lowPerfMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(71, 85, 105, 0.4)',
                                    border: 'none',
                                    borderRadius: 4,
                                    color: 'white',
                                    fontSize: 10,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                    {lowPerfMode ? 'speed' : 'monitor_heart'}
                                </span>
                                Low Perf: {lowPerfMode ? 'ON' : 'OFF'}
                            </button>
                        )}
                    </div>

                    {/* Label toggle (Desktop only, or bottom of mobile if expanded) */}
                    {initialOnToggleLabels && !isMobile && (
                        <button
                            onClick={initialOnToggleLabels}
                            className="map-legend__toggle"
                            style={{
                                marginTop: 8,
                                padding: '6px 10px',
                                background: showContent ? 'rgba(59, 130, 246, 0.2)' : 'rgba(71, 85, 105, 0.4)',
                                border: 'none',
                                borderRadius: 4,
                                color: 'white',
                                fontSize: 11,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                width: '100%',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                {showContent ? 'label' : 'label_off'}
                            </span>
                            {showContent ? 'Hide Labels' : 'Show Labels'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default MapLegend;
