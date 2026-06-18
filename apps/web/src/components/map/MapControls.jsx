import React, { useState, useEffect } from 'react';

export const MapControls = ({
    searchQuery,
    setSearchQuery,
    mapType,
    setMapType,
    isHeatmapMode,
    setIsHeatmapMode,
    lineThickness,
    setLineThickness,
    isEditMode,
    setIsEditMode,
    isSyncing,
    onManualSync,
    isFullscreen,
    onToggleFullscreen,
    isPlacementModeOpen,
    setIsPlacementModeOpen,
    // Performance toggles — dipindah ke sini dari MapLegend (single source of truth).
    enableAnimation,
    setEnableAnimation,
    enableClustering,
    setEnableClustering,
    lowPerfMode,
    setLowPerfMode,
    // Saat SidePanel kanan terbuka, geser Settings ke kiri AlertPanel
    // supaya tetap accessible (tidak tertutup panel).
    panelOpen = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(() => {
        const saved = localStorage.getItem('map_controls_minimized');
        return saved !== null ? JSON.parse(saved) : false;
    });
    const [localSearch, setLocalSearch] = useState(searchQuery);

    const toggleMinimize = () => {
        const newValue = !isMinimized;
        setIsMinimized(newValue);
        localStorage.setItem('map_controls_minimized', JSON.stringify(newValue));
    };

    // Debounce search update
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) {
                setSearchQuery(localSearch);
            }
        }, 500); // 500ms debounce for complex map filtering

        return () => clearTimeout(timer);
    }, [localSearch, setSearchQuery, searchQuery]);

    // Sync local search if searchQuery changes from outside (e.g. click in table)
    useEffect(() => {
        setLocalSearch(searchQuery);
    }, [searchQuery]);

    return (
        <>
            {/* Mobile Menu Toggle */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="sm:hidden absolute top-4 right-4 z-[1000] w-9 h-9 bg-slate-900/90 rounded-lg flex items-center justify-center text-white border border-slate-700 shadow-lg backdrop-blur-sm"
                aria-label={isOpen ? 'Close menu' : 'Open map controls menu'}
            >
                <span className="material-symbols-outlined" aria-hidden="true">
                    {isOpen ? 'close' : 'menu'}
                </span>
            </button>

            {/* Mobile Fullscreen Button (Separate) */}
            <button
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                className="sm:hidden absolute top-4 right-14 z-[1000] w-9 h-9 bg-slate-900/90 rounded-lg flex items-center justify-center text-white border border-slate-700 shadow-lg backdrop-blur-sm"
            >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
                    {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                </span>
            </button>


            {/* Controls Container.
                Saat panelOpen=true (AlertPanel/SidePanel terbuka di kanan),
                geser posisi Settings ke kiri (right-[26rem] = 416px dari kanan)
                supaya tetap visible + accessible tanpa tertutup panel. */}
            <div className={`
                absolute top-16 sm:top-4 z-[1001]
                transition-all duration-200 origin-top-right
                ${panelOpen ? 'right-[26rem]' : 'right-4'}
                ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 sm:scale-100 sm:opacity-100'}
            `}>
                <div 
                    className={`flex flex-col gap-1.5 bg-slate-900/90 sm:bg-slate-900/80 p-2 rounded-lg backdrop-blur-sm border border-slate-700 shadow-xl transition-all duration-300 ${
                        isMinimized ? 'w-10 min-w-0 h-10 overflow-hidden' : 'min-w-[180px]'
                    }`}
                >
                    {/* Header with Minimize Toggle */}
                    <div className="flex items-center justify-between mb-1 px-1 min-h-[24px]">
                        {!isMinimized && <div className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Settings</div>}
                        <button
                            onClick={toggleMinimize}
                            className={`flex items-center justify-center rounded transition-colors ${
                                isMinimized ? 'w-full h-full text-primary' : 'w-5 h-5 bg-slate-800 hover:bg-slate-700 text-slate-400'
                            }`}
                            aria-label={isMinimized ? "Expand Settings" : "Minimize Settings"}
                            title={isMinimized ? "Expand Settings" : "Minimize Settings"}
                        >
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                {isMinimized ? 'settings' : 'keyboard_arrow_up'}
                            </span>
                        </button>
                    </div>

                    {!isMinimized && (
                        <>

                    {/* Search Box */}
                    <div className="mb-1 w-full">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">search</span>
                            <input
                                type="text"
                                placeholder="Search map..."
                                value={localSearch}
                                onChange={(e) => {
                                    setLocalSearch(e.target.value);
                                    // Handle clearing immediately if empty
                                    if (!e.target.value) setSearchQuery('');
                                }}
                                className="w-full bg-slate-800 text-white text-[11px] py-1 pl-7 pr-2 rounded border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                            />
                            {(localSearch || searchQuery) && (
                                <button
                                    onClick={() => {
                                        setLocalSearch('');
                                        setSearchQuery('');
                                    }}
                                    aria-label="Clear search"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <span className="material-symbols-outlined text-[13px]">close</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Map Type */}
                    <div className="flex items-center justify-between sm:block mb-0.5 px-0.5">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Map Type</label>
                    </div>
                    <select
                        value={mapType}
                        onChange={(e) => setMapType(e.target.value)}
                        className="bg-slate-800 text-white text-[11px] p-1 rounded border border-slate-600 outline-none w-full"
                    >
                        <option value="roadmap">Roadmap</option>
                        <option value="satellite">Satellite</option>
                        <option value="satellite_dark">Satellite Dark</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="terrain">Terrain</option>
                        <option value="dark">Dark Mode</option>
                    </select>

                    {/* Heatmap Mode Toggle */}
                    <div className="flex items-center justify-between sm:block mb-0.5 mt-1 border-t border-slate-700/30 pt-1.5 px-0.5">
                        <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-[10px] text-white font-bold group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                                Heatmap
                            </span>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={isHeatmapMode}
                                    onChange={(e) => setIsHeatmapMode(e.target.checked)}
                                    aria-label="Toggle Heatmap Overlay"
                                />
                                <div className="w-7 h-4 bg-slate-700 rounded-full peer peer-focus:ring-1 peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                        </label>
                    </div>

                    <div className="h-px bg-slate-700/30 my-0.5 sm:hidden"></div>

                    {/* Line Thickness Control */}
                    <div className="flex items-center justify-between p-1 bg-slate-800 rounded border border-slate-600 mt-0.5">
                        <span className="text-[10px] text-white font-medium pl-1">Size</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setLineThickness(Math.max(1, lineThickness - 1))}
                                className="w-4 h-4 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] transition-colors"
                                title="Decrease"
                            >
                                -
                            </button>
                            <span className="text-[10px] text-white font-mono w-3 text-center">{lineThickness}</span>
                            <button
                                onClick={() => setLineThickness(Math.min(10, lineThickness + 1))}
                                className="w-4 h-4 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] transition-colors"
                                title="Increase"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div className="h-px bg-slate-700/30 my-1"></div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-1.5">
                        {/* Edit Mode Toggle */}
                        <button
                            onClick={() => setIsEditMode(prev => !prev)}
                            aria-label={isEditMode ? 'Lock map - disable drag and drop' : 'Unlock map - enable drag and drop'}
                            title={isEditMode ? 'Lock map' : 'Unlock map'}
                            className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors border ${isEditMode
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                                } `}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
                                {isEditMode ? 'lock_open' : 'lock'}
                            </span>
                            {isEditMode ? 'Edit' : 'Lock'}
                        </button>

                        {/* Quick Placement Toggle */}
                        <button
                            onClick={() => setIsPlacementModeOpen(prev => !prev)}
                            className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors border ${isPlacementModeOpen
                                ? 'bg-orange-600 text-white border-orange-500 shadow-lg shadow-orange-900/20'
                                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                                } `}
                            title="Quickly place unmapped devices"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
                                {isPlacementModeOpen ? 'location_on' : 'location_off'}
                            </span>
                            Quick Place
                        </button>

                        <button
                            onClick={onManualSync}
                            disabled={isSyncing}
                            className="px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Refresh Data"
                        >
                            <span
                                className="material-symbols-outlined"
                                style={{
                                    fontSize: 13,
                                    animation: isSyncing ? 'spin 1s linear infinite' : 'none'
                                }}
                            >
                                sync
                            </span>
                            {isSyncing ? '...' : 'Sync'}
                        </button>

                        {/* Performance toggles — dipindah dari MapLegend.
                            Single source of truth: animasi / cluster / mode hemat CPU. */}
                        {typeof setEnableAnimation === 'function' && (
                            <button
                                onClick={() => setEnableAnimation(!enableAnimation)}
                                title={enableAnimation ? 'Matikan animasi peta' : 'Aktifkan animasi peta'}
                                aria-label={enableAnimation ? 'Matikan animasi peta' : 'Aktifkan animasi peta'}
                                aria-pressed={enableAnimation}
                                className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors border ${
                                    enableAnimation
                                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                                }`}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
                                    animation
                                </span>
                                {enableAnimation ? 'Animasi' : 'Off'}
                            </button>
                        )}

                        {typeof setEnableClustering === 'function' && (
                            <button
                                onClick={() => setEnableClustering(!enableClustering)}
                                title={enableClustering ? 'Matikan pengelompokan marker (cluster)' : 'Aktifkan pengelompokan marker (cluster)'}
                                aria-label={enableClustering ? 'Matikan cluster' : 'Aktifkan cluster'}
                                aria-pressed={enableClustering}
                                className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors border ${
                                    enableClustering
                                        ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                                }`}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
                                    group_work
                                </span>
                                {enableClustering ? 'Cluster' : 'Off'}
                            </button>
                        )}

                        {typeof setLowPerfMode === 'function' && (
                            <button
                                onClick={() => setLowPerfMode(!lowPerfMode)}
                                title={lowPerfMode ? 'Matikan mode hemat CPU' : 'Aktifkan mode hemat CPU (untuk laptop tua / banyak marker)'}
                                aria-label={lowPerfMode ? 'Matikan mode hemat' : 'Aktifkan mode hemat'}
                                aria-pressed={lowPerfMode}
                                className={`col-span-2 px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors border ${
                                    lowPerfMode
                                        ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
                                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                                }`}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
                                    monitor_heart
                                </span>
                                {lowPerfMode ? 'Mode Hemat ON' : 'Mode Hemat OFF'}
                            </button>
                        )}

                        <button
                            onClick={onToggleFullscreen}
                            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                            className="col-span-2 px-1.5 py-1 text-[10px] rounded flex items-center justify-center gap-1 transition-colors bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600"
                            title="Toggle Fullscreen"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                            </span>
                            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Mode'}
                        </button>
                    </div>
                    </>
                )}
                </div>
            </div>
        </>
    );
};
