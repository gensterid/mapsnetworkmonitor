import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser, usePingLatencies, useRouterHotspotActive, useRouterPppActive } from '@/hooks';
import useDeepCompareMemoize from '@/hooks/useDeepCompareMemoize';
import '@/lib/GoogleMutant';
import { toast } from 'react-hot-toast';

// Import new map components
import {
    AnimatedPath,
    AntPath, // Import AntPath
    EditablePath,
    MapFAB,
    MapToolbar,
    MapLegend,
    DeviceModal,
    createDeviceIcon,
    LineThicknessControl,
    RouterTooltip,
    getAnimationStyle, // Import helper to check style config
    DEFAULT_MAP_COLORS,
} from './map';
import { formatDateWithTimezone } from '@/lib/timezone';
import './map/map.css';
// Marker Cluster CSS
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { calculatePathLength, formatDistance } from '@/lib/geo';

// --- Custom Context ---
const TrafficContext = React.createContext({
    hoverTick: 0,
    displayTrafficMap: new Map(),
    trafficMapRef: { current: new Map() },
    timezone: 'UTC',
    isHeatmapMode: false,
    isLiveMode: false
});

const HoveredItemContext = React.createContext({
    hoveredMarkerId: null,
    hoveredLineId: null
});

// --- Custom Components ---

// Custom Dark Map Style
const DARK_MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
        featureType: "administrative.locality",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#263c3f" }],
    },
    {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
    },
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#38414e" }],
    },
    {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#212a37" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9ca5b3" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#746855" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ color: "#1f2835" }],
    },
    {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#f3d19c" }],
    },
    {
        featureType: "transit",
        elementType: "geometry",
        stylers: [{ color: "#2f3948" }],
    },
    {
        featureType: "transit.station",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#17263c" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#515c6d" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
    },
];

const SATELLITE_DARK_STYLES = [
    {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "administrative",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "road",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "transit",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
];

// Component to add Google Maps Layer
const GoogleMapsLayer = ({ type = 'hybrid', apiKey, onLoaded }) => {
    const map = useMap();
    const [scriptLoaded, setScriptLoaded] = useState(() => !!window.google?.maps);

    useEffect(() => {
        if (!apiKey) return;

        if (window.google?.maps) {
            if (!scriptLoaded) setScriptLoaded(true);
            onLoaded?.();
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
            const checkLoaded = setInterval(() => {
                if (window.google?.maps) {
                    setScriptLoaded(true);
                    onLoaded?.();
                    clearInterval(checkLoaded);
                }
            }, 100);
            return () => clearInterval(checkLoaded);
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            setScriptLoaded(true);
            onLoaded?.();
            // Important: Don't remove the script tag so it stays in browser cache
        };
        document.head.appendChild(script);
    }, [apiKey, scriptLoaded, onLoaded]);

    useEffect(() => {
        if (!scriptLoaded || !L.gridLayer.googleMutant) return;

        try {
            const layerOptions = {
                type: type === 'dark' ? 'roadmap' : (type === 'satellite_dark' ? 'hybrid' : type),
            };

            // Apply styles if dark mode or satellite dark
            if (type === 'dark') {
                layerOptions.styles = DARK_MAP_STYLES;
            } else if (type === 'satellite_dark') {
                layerOptions.styles = SATELLITE_DARK_STYLES;
            }

            const googleLayer = L.gridLayer.googleMutant(layerOptions);
            googleLayer.addTo(map);
            return () => {
                if (map.hasLayer(googleLayer)) {
                    map.removeLayer(googleLayer);
                }
            };
        } catch (e) {
            console.error("Failed to init google layer", e);
        }
    }, [map, type, scriptLoaded]);

    return null;
};

// Prevent re-renders of the layer component itself unless props change
const MemoizedGoogleMapsLayer = React.memo(GoogleMapsLayer);

// Helper to auto-fit bounds to markers (only on initial load)
const MapAutoFit = ({ markers, isEditing }) => {
    const map = useMap();
    const hasInitialFit = React.useRef(false);

    useEffect(() => {
        // Only fit bounds on initial load, not after updates
        if (hasInitialFit.current) return;
        // Don't auto-fit if we have no markers, OR if we are in an editing mode
        if (!markers || markers.length === 0 || isEditing) return;

        try {
            // Filter out any markers with invalid coordinates to prevent L.latLngBounds crash
            const validPoints = markers
                .filter(m => m && typeof m.lat === 'number' && typeof m.lng === 'number' && isFinite(m.lat) && isFinite(m.lng))
                .map(m => [m.lat, m.lng]);

            if (validPoints.length === 0) return;

            const bounds = L.latLngBounds(validPoints);

            if (bounds.isValid()) {
                if (validPoints.length === 1) {
                    // If only one marker, center and zoom in
                    map.setView(validPoints[0], 15);
                } else {
                    // Fit bounds with padding for multiple markers
                    map.fitBounds(bounds, {
                        padding: [50, 50],
                        maxZoom: 16
                    });
                }
                // Mark as initialized
                hasInitialFit.current = true;
            }
        } catch (e) {
            console.error("Error fitting bounds:", e);
        }
    }, [markers, map, isEditing]);

    return null;
};

// Component to handle marker drag events
const DraggableMarker = ({
    position,
    icon,
    draggable,
    onDragEnd,
    onClick,
    eventHandlers: externalEventHandlers, // Destructure to prevent leakage into props
    children,
    ...props
}) => {
    const [markerPosition, setMarkerPosition] = useState(position);

    useEffect(() => {
        setMarkerPosition(position);
    }, [position]);

    const eventHandlers = useMemo(() => {
        const handlers = {
            dragend: (e) => {
                const newPos = e.target.getLatLng();
                setMarkerPosition([newPos.lat, newPos.lng]);
                if (onDragEnd) {
                    onDragEnd([newPos.lat, newPos.lng]);
                }
            },
            ...(externalEventHandlers || {}) // Merge external handlers (mouseover, etc)
        };

        // Only add click handler if it's actually provided as a function
        if (typeof onClick === 'function') {
            handlers.click = onClick;
        }

        return handlers;
    }, [onDragEnd, onClick, externalEventHandlers]);

    // Safety check: Don't render if position is invalid. 
    // This prevents Leaflet internal errors like "Cannot read properties of undefined (reading 'x')"
    const isValidPosition = Array.isArray(markerPosition) &&
        markerPosition.length === 2 &&
        typeof markerPosition[0] === 'number' &&
        typeof markerPosition[1] === 'number' &&
        isFinite(markerPosition[0]) &&
        isFinite(markerPosition[1]);

    // Additional check: Ensure icon is valid
    if (!isValidPosition || !icon) return null;

    return (
        <Marker
            position={markerPosition}
            icon={icon}
            draggable={draggable}
            eventHandlers={eventHandlers}
            {...props}
        >
            {children}
        </Marker>
    );
};

// Helper to get consistent colors for tooltips and icons
const getTooltipColor = (node) => {
    const type = node.deviceType || node.type || 'router';
    const status = (node.status || 'unknown').toLowerCase();
    const isOffline = ['down', 'offline', 'lost', 'power_down', 'dying_gasp', 'disable', 'disconnected', 'unknown'].includes(status) || !node.status;

    if (isOffline) return 'var(--map-color-offline, #EF4444)';
    if (type === 'odp') return 'var(--map-color-odp, #F97316)';
    if (type === 'pppoe') return 'var(--map-color-pppoe, #A855F7)';

    // Performance warning (Yellow)
    const hasPerformanceIssue = (node.latency !== null && node.latency > 100);
    if (hasPerformanceIssue) return 'var(--map-color-warning, #FACC15)';

    // Optical Power Warning (Calculated from OLT data)
    if (node.lastRxPower) {
        const pwr = parseFloat(node.lastRxPower);
        if (!isNaN(pwr)) {
            // -27 is typical receiver sensitivity limit
            if (pwr < -27) return 'var(--map-color-offline, #EF4444)';
            if (pwr < -24) return 'var(--map-color-warning, #FACC15)';
        }
    }

    return 'var(--map-color-online, #10B981)';
};

// Memoized Tooltip for Devices
const RouterTooltipContent = ({ node, onEdit }) => {
    const { timezone } = React.useContext(TrafficContext);
    const { hoveredMarkerId } = React.useContext(HoveredItemContext);
    const isHovered = hoveredMarkerId === node.id;

    // Fetch live data only when hovered
    const { data: latencies, isLoading: isLoadingPing } = usePingLatencies(node.id, {
        enabled: isHovered,
        staleTime: 60000,
    });

    const { data: hotspotData } = useRouterHotspotActive(node.id, {
        enabled: isHovered,
        staleTime: 60000,
    });

    const { data: pppData } = useRouterPppActive(node.id, {
        enabled: isHovered,
        staleTime: 60000,
    });

    const getLatencyColor = (latency) => {
        if (latency === null || latency === undefined) return 'text-slate-500';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        return 'text-red-400';
    };

    const status = node.status || 'unknown';
    const isUp = ['up', 'online', 'active'].includes(status);

    return (
        <div className="flex flex-col min-w-[240px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: getTooltipColor(node) }}>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-white">
                        <span className="material-symbols-outlined text-[16px]">router</span>
                        <span className="font-bold text-xs truncate max-w-[140px]">{node.name || node.host}</span>
                    </div>
                    {node.model && (
                        <span className="text-[10px] text-white/80 pl-6 truncate max-w-[140px]">{node.model}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {status}
                    </div>
                    {onEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onEdit();
                            }}
                            className="w-6 h-6 flex items-center justify-center bg-white/20 hover:bg-white/40 rounded transition-colors text-white"
                            title="Edit Router"
                        >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-3 bg-slate-800 space-y-3">
                {/* System Metrics */}
                {node.latestMetrics && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30">
                            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">CPU</span>
                            <span className="text-slate-200 font-mono font-medium">{node.latestMetrics.cpuLoad}%</span>
                        </div>
                        <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30">
                            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">RAM</span>
                            <span className="text-slate-200 font-mono font-medium">
                                {node.latestMetrics.totalMemory > 0
                                    ? Math.round((node.latestMetrics.usedMemory / node.latestMetrics.totalMemory) * 100)
                                    : 0}%
                            </span>
                        </div>

                        {hotspotData?.count > 0 && (
                            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex items-center justify-between col-span-2">
                                <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">wifi</span>
                                    Hotspot
                                </span>
                                <span className="text-orange-400 font-mono font-bold">{hotspotData.count}</span>
                            </div>
                        )}

                        {pppData?.count > 0 && (
                            <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex items-center justify-between col-span-2">
                                <span className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">lan</span>
                                    PPPoE
                                </span>
                                <span className="text-blue-400 font-mono font-bold">{pppData.count}</span>
                            </div>
                        )}

                        <div className="col-span-2 bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex items-center justify-between">
                            <span className="text-slate-400 text-[10px] uppercase tracking-wider">Host</span>
                            <span
                                className="text-slate-200 font-mono font-medium hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const host = node.host || node.address;
                                    if (host) window.open(`http://${host}`, '_blank');
                                }}
                            >
                                {node.host || node.address || '-'}
                            </span>
                        </div>
                        <div className="col-span-2 bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex items-center justify-between">
                            <span className="text-slate-400 text-[10px] uppercase tracking-wider">Uptime</span>
                            <span className="text-slate-200 font-mono font-medium">
                                {node.latestMetrics.uptime ? (() => {
                                    const seconds = Number(node.latestMetrics.uptime);
                                    const d = Math.floor(seconds / (3600 * 24));
                                    const h = Math.floor((seconds % (3600 * 24)) / 3600);
                                    const m = Math.floor((seconds % 3600) / 60);
                                    if (d > 0) return `${d}d ${h}h`;
                                    if (h > 0) return `${h}h ${m}m`;
                                    return `${m}m`;
                                })() : '-'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Ping Latency List */}
                <div className="space-y-1.5 border-t border-slate-700/50 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[14px]">show_chart</span>
                        Ping Latency
                    </div>

                    {isLoadingPing && !latencies ? (
                        <div className="flex justify-center py-2">
                            <span className="material-symbols-outlined animate-spin text-slate-500 text-sm">refresh</span>
                        </div>
                    ) : latencies && latencies.length > 0 ? (
                        <div className="space-y-1.5">
                            {latencies.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-700/30">
                                    <div className="flex flex-col overflow-hidden max-w-[120px]">
                                        <span className="text-slate-200 font-bold text-[11px] truncate" title={item.label}>
                                            {item.label}
                                        </span>
                                        <span className="text-slate-500 text-[9px] truncate" title={item.ip}>
                                            {item.ip}
                                        </span>
                                    </div>
                                    <span className={`font-mono font-bold text-xs ${getLatencyColor(item.latency)}`}>
                                        {item.latency !== null ? `${item.latency}ms` : '-'}
                                    </span>
                                </div>
                            ))}
                            {latencies.length > 5 && (
                                <div className="text-[10px] text-center text-slate-500 italic pt-0.5">
                                    + {latencies.length - 5} more
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-[10px] text-center text-slate-500 italic">
                            No targets configured
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// 1. Content Component (Heavy Logic, only rendered when hovered or clicked)
const DeviceTooltipContent = ({ node, line, onEdit }) => {
    const { hoverTick, displayTrafficMap, trafficMapRef, timezone, isHeatmapMode, isLiveMode } = React.useContext(TrafficContext);

    // If it's a router, use the router specialized view
    if (node.deviceType === 'router' || node.type === 'router') {
        return <RouterTooltipContent node={node} onEdit={onEdit} />;
    }

    // Logic for retrieving Traffic Data
    const trafficInterface = node.targetInterface || line?.targetInterface;
    const routerPrefixedKey = node.routerId && trafficInterface ? `${node.routerId}:${trafficInterface}` : null;
    const nameKey = node.name || node.host;

    // Data Sourcing Rule: 
    // 1. If Live Mode is ON, use real-time SNMP stats
    // 2. If Live Mode is OFF, use database stats (node.txRate/rxRate)
    let rxRate = node.rxRate || 0;
    let txRate = node.txRate || 0;

    if (isLiveMode) {
        const map = trafficMapRef.current;
        let stats = null;
        if (map) {
            if (routerPrefixedKey) stats = map.get(routerPrefixedKey);
            if (!stats && trafficInterface) stats = map.get(trafficInterface);
            if (!stats && nameKey) stats = map.get(nameKey);
        }

        const visualStats = trafficInterface ? (displayTrafficMap.get(routerPrefixedKey) || displayTrafficMap.get(trafficInterface)) : null;
        rxRate = stats?.rx ?? (visualStats?.rx || rxRate);
        txRate = stats?.tx ?? (visualStats?.tx || txRate);
    }

    const formatBitrate = (bitsPerSecond) => {
        if (!bitsPerSecond || isNaN(bitsPerSecond)) return '0 bps';
        const bps = Number(bitsPerSecond);
        if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(2)} Gbps`;
        if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
        if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
        return `${bps.toFixed(0)} bps`;
    };

    const status = node.status || 'unknown';
    const isUp = ['up', 'online', 'active'].includes(status);

    return (
        <div className="flex flex-col min-w-[200px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: getTooltipColor(node) }}>
                <div className="flex items-center gap-2 text-white">
                    <span className="material-symbols-outlined text-[16px]">
                        {node.deviceType === 'olt' ? 'hub' : node.deviceType === 'odp' ? 'settings_input_component' : (node.deviceType === 'router' || node.type === 'router') ? 'router' : node.deviceType === 'pppoe' ? 'person' : node.deviceType === 'onu' ? 'settings_input_antenna' : 'person'}
                    </span>
                    <span className="font-bold text-xs truncate max-w-[100px]">{node.name || node.host}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {status}
                    </div>
                    {onEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onEdit();
                            }}
                            className="w-6 h-6 flex items-center justify-center bg-white/20 hover:bg-white/40 rounded transition-colors text-white"
                            title="Edit Device"
                        >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                    )}
                </div>
            </div>
            <div className="p-3 bg-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{node.deviceType === 'pppoe' ? 'IP Address' : 'Host'}</span>
                    <span
                        className="text-slate-200 font-mono hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            const host = node.deviceType === 'pppoe' ? node.address : node.host;
                            if (host) window.open(`http://${host}`, '_blank');
                        }}
                    >
                        {node.deviceType === 'pppoe' ? node.address : node.host}
                    </span>
                </div>

                {/* Unified Linkage Metadata */}
                {node.model && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Model</span>
                        <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.model}>{node.model}</span>
                    </div>
                )}
                {node.sn && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">SN</span>
                        <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.sn}>{node.sn}</span>
                    </div>
                )}
                {node.ssid && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">SSID</span>
                        <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.ssid}>{node.ssid}</span>
                    </div>
                )}
                {node.lastRxPower && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Signal</span>
                        <span className={`font-mono font-bold text-xs ${parseFloat(node.lastRxPower) < -27 ? 'text-red-400' :
                            parseFloat(node.lastRxPower) < -24 ? 'text-yellow-400' : 'text-emerald-400'
                            }`}>
                            {node.lastRxPower} dBm
                        </span>
                    </div>
                )}
                {node.deviceType === 'pppoe' && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Type</span>
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">
                            PPPoE Client
                        </span>
                    </div>
                )}
                {isHeatmapMode && trafficInterface && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Interface</span>
                        <span className="text-slate-200 font-mono text-[10px]">{trafficInterface}</span>
                    </div>
                )}
                {line && (
                    <>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Source</span>
                            <span className="text-slate-200 truncate max-w-[100px]">{line.sourceName}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Distance</span>
                            <span className="text-slate-200 font-mono">{line.distance.toFixed(2)} m</span>
                        </div>
                    </>
                )}
                {isUp && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Latency</span>
                        <span className="text-emerald-400 font-bold">{node.latency} ms</span>
                    </div>
                )}
                {!isUp && (
                    <div className="space-y-3 border-t border-slate-700/50 pt-3 mt-1">
                        {node.lastDownReason && (
                            <div className="flex flex-col gap-1">
                                <span className="text-slate-400 text-[10px] uppercase tracking-wider">Outage Reason</span>
                                <span className="text-orange-300 text-xs font-bold">{node.lastDownReason}</span>
                            </div>
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-wider">Down Since</span>
                            <span className="text-red-200 text-xs font-mono">{formatDateWithTimezone(node.lastDown, timezone)}</span>
                        </div>
                    </div>
                )}

                {/* Show traffic info only in heatmap mode */}
                {isUp && isHeatmapMode && (
                    <div className={`border-t border-slate-700/50 pt-2 mt-1 grid grid-cols-2 gap-2 opacity-100`}>
                        <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex flex-col items-center">
                            <span className="text-[10px] text-slate-500">RX</span>
                            <span className="text-emerald-400 font-mono text-xs">{formatBitrate(rxRate)}</span>
                        </div>
                        <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30 flex flex-col items-center">
                            <span className="text-[10px] text-slate-500">TX</span>
                            <span className="text-blue-400 font-mono text-xs">{formatBitrate(txRate)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// 2. Container Component (Lightweight, always rendered to bind Leaflet Tooltip)
const DeviceTooltip = React.memo(({ node, line }) => {
    const { hoveredMarkerId } = React.useContext(HoveredItemContext);

    // Only render content if this specific node is hovered
    const isHovered = hoveredMarkerId === node.id;

    return (
        <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
            {isHovered && <DeviceTooltipContent node={node} line={line} />}
        </Tooltip>
    );
});

// 3. Popup Container (Rendered when clicked)
const DevicePopup = React.memo(({ node, line, onEdit }) => {
    return (
        <Popup offset={[0, -10]} className="custom-map-popup">
            <DeviceTooltipContent node={node} line={line} onEdit={onEdit} />
        </Popup>
    );
});

// Wrapper that handles icon creation internally to ensure prop stability for memoization
const SmartMarker = ({
    position,
    type,
    status,
    name,
    showLabel,
    small,
    latency,
    packetLoss,
    draggable,
    onDragEnd,
    onClick,
    eventHandlers, // Destructure to prevent leakage into props
    id, // NEW: Need ID to check hover context
    children,
    ...props
}) => {
    // Optimized: Context removed from SmartMarker to prevent re-renders on tick/hover
    // The tooltip itself now listens to context when needed.


    // Sanitize metrics to ensure they are numbers or null
    const safeLatency = (typeof latency === 'number' && isFinite(latency)) ? latency : null;
    const safePacketLoss = (typeof packetLoss === 'number' && isFinite(packetLoss)) ? packetLoss : null;

    // Memoize the icon so it doesn't change reference on every render
    const icon = useMemo(() => createDeviceIcon({
        type,
        status,
        name: showLabel ? name : '',
        showLabel,
        small,
        latency: safeLatency,
        packetLoss: safePacketLoss
    }), [type, status, name, showLabel, small, safeLatency, safePacketLoss]);

    return (
        <DraggableMarker
            position={position}
            icon={icon}
            draggable={draggable}
            onDragEnd={onDragEnd}
            onClick={onClick}
            eventHandlers={eventHandlers} // Fix: Pass eventHandlers (mouseover/out)
            status={status} // Pass status for cluster icon logic
            {...props}
        >
            {children}
        </DraggableMarker>
    );
};

// Custom Comparison Function to prevent re-renders when array refs change but values don't
const arePropsEqual = (prev, next) => {
    // 1. Check position by value (lat/lng)
    if (!prev.position || !next.position) return false;
    const posChanged = prev.position[0] !== next.position[0] || prev.position[1] !== next.position[1];
    if (posChanged) return false;

    // 2. Check other primitive props
    return (
        prev.status === next.status &&
        prev.name === next.name &&
        prev.showLabel === next.showLabel &&
        prev.draggable === next.draggable &&
        prev.latency === next.latency &&
        prev.packetLoss === next.packetLoss &&
        prev.type === next.type &&
        prev.small === next.small &&
        prev.icon === next.icon &&
        prev.isHeatmapMode === next.isHeatmapMode &&
        prev.id === next.id
        // Removed isHovered from comparison since it's now internal via Context
    );
};

// Strict memoization for the SmartMarker with custom check
const MemoizedSmartMarker = React.memo(SmartMarker, arePropsEqual);

// Memoized Marker to prevent re-renders unless position/status changes
const MemoizedDraggableMarker = React.memo(DraggableMarker, arePropsEqual);

// Custom cluster icon creator
const createClusterCustomIcon = (cluster) => {
    const markers = cluster.getAllChildMarkers();
    let hasDown = false;
    let hasIssue = false;
    let downCount = 0;
    let issueCount = 0;

    for (const marker of markers) {
        // Access options passed to Marker via DraggableMarker
        const status = marker.options.status;
        const latency = marker.options.icon?.options?.latency;
        const packetLoss = marker.options.icon?.options?.packetLoss;

        // Check Down
        if (['down', 'offline', 'lost', 'power_down', 'dying_gasp'].includes(status)) {
            hasDown = true;
            downCount++;
        }
        // Check Issue (if not down)
        else {
            // Check if icon options created a warning status or check raw metrics
            // The createDeviceIcon function normalizes status to 'warning' if issues exist,
            // but here we might just have the raw status 'up'.
            // We can check the icon's options if possible, or re-evaluate metrics.
            // marker.options.icon is L.DivIcon. It has options.
            // But createDeviceIcon returns an icon where we passed {latency, packetLoss}.
            // Let's rely on the marker props if possible or re-check.
            // However, marker.options usually contains what was passed to <Marker>.
            // We passed `status={node.status}`.
            // We ALSO need to know if it has issues.
            // Let's check if we can access the normalized status from the icon class? No.
            // Better: Check latency/packetLoss if available in marker options options.

            // Inspecting NetworkMap.jsx:
            // <DraggableMarker ... icon={createDeviceIcon({ latency: node.latency ... })} ... >
            // The icon object is stored in marker.options.icon.
            // Leaflet stores options in icon.options.

            const isWarning = (latency !== undefined && latency > 100) || (packetLoss !== undefined && packetLoss > 0);
            if (isWarning) {
                hasIssue = true;
                issueCount++;
            }
        }
    }

    const childCount = cluster.getChildCount();

    // Color logic: Red > Yellow > Blue
    let bgColor = 'rgba(59, 130, 246, 0.9)'; // Blue (Default)
    if (hasDown) {
        bgColor = 'rgba(239, 68, 68, 0.9)'; // Red
    } else if (hasIssue) {
        bgColor = 'rgba(234, 179, 8, 0.9)'; // Yellow (Amber-500)
    }

    return L.divIcon({
        html: `
                <div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                width: 100%; 
                height: 100%; 
                background-color: ${bgColor}; 
                border: 2px solid white; 
                border-radius: 50%; 
                color: white; 
                font-weight: bold; 
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                position: relative;
                ${hasDown ? 'animation: pulse-ring 2s infinite;' : ''}
            ">
                    <span>${childCount}</span>
                    ${hasDown ? `
                    <span style="
                        position: absolute; 
                        top: -5px; 
                        right: -5px; 
                        background-color: #7f1d1d; 
                        color: white; 
                        font-size: 10px; 
                        width: 16px; 
                        height: 16px; 
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        border: 1px solid white;
                    ">${downCount}</span>
                ` : ''}
                    ${!hasDown && hasIssue ? `
                    <span style="
                        position: absolute; 
                        top: -5px; 
                        right: -5px; 
                        background-color: #ca8a04; 
                        color: white; 
                        font-size: 10px; 
                        width: 16px; 
                        height: 16px; 
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        border: 1px solid white;
                    ">${issueCount}</span>
                ` : ''}
                </div>
                `,
        className: 'custom-cluster-marker',
        iconSize: L.point(40, 40, true),
    });
};



// Helper to format bitrate
const formatBitrate = (bits) => {
    if (!bits) return '0 bps';
    if (bits >= 1000000) return `${(bits / 1000000).toFixed(1)} Mbps`;
    if (bits >= 1000) return `${(bits / 1000).toFixed(1)} Kbps`;
    return `${bits} bps`;
};

// Memoized Line Component for Performance
const NetworkLineOriginal = ({
    line,
    txRate, // Throttled (4s)
    rxRate, // Throttled (4s)
    isHeatmapMode,
    lineThickness,
    mapColors,
    currentUser,
    enableAnimation,
    lowPerfMode,
    timezone,
    onMouseOver,
    onMouseOut,
    tick,
    isLiveMode, // New prop
    trafficMapRef // Removed: now consumed from context
}) => {
    const { hoverTick, displayTrafficMap, trafficMapRef: contextTrafficMapRef } = React.useContext(TrafficContext);
    const { hoveredLineId } = React.useContext(HoveredItemContext);
    const isHovered = hoveredLineId === line.id;

    const activeTrafficMapRef = contextTrafficMapRef || trafficMapRef; // Fallback

    // Safety check for coordinates
    const isValidCoordinate = (coord) => Array.isArray(coord) && coord.length === 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]);
    if (!line || !isValidCoordinate(line.from) || !isValidCoordinate(line.to)) {
        return null; // Skip rendering invalid lines
    }

    // 1. Tooltip Content (Always calculated but values based on isLiveMode)
    const tooltipContent = useMemo(() => {
        // IMPROVEMENT: Removed "if (!isHovered) return null" to ensure Leaflet consistent binding
        // The data sourcing follows the rule: SNMP if Live Mode ON, otherwise DB

        const iface = line.targetInterface;
        let txRateLive = line.txRate || 0;
        let rxRateLive = line.rxRate || 0;

        if (isLiveMode) {
            // Use fresh stats from Ref for the hovered tooltip
            const map = activeTrafficMapRef.current;
            const routerPrefixedKey = line.routerId ? `${line.routerId}:${iface}` : null;
            const stats = iface ? (map.get(routerPrefixedKey) || map.get(iface)) : null;

            // If we don't have live stats yet, fall back to throttled props (which already respect mode in caller)
            txRateLive = stats?.tx ?? txRate;
            rxRateLive = stats?.rx ?? rxRate;
        }

        const formatBitrate = (bitsPerSecond) => {
            if (!bitsPerSecond || isNaN(bitsPerSecond)) return '0 bps';
            const bps = Number(bitsPerSecond);
            if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(2)} Gbps`;
            if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
            if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
            return `${bps.toFixed(0)} bps`;
        };

        const isUp = ['up', 'online', 'active'].includes(line.status);

        return `
            <div class="flex flex-col min-w-[220px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
                <div class="px-3 py-2 flex items-center justify-between ${isUp ? 'bg-indigo-600' : 'bg-slate-600'}">
                    <div class="flex items-center gap-2 text-white">
                        <span class="material-symbols-outlined text-[16px]">cable</span>
                        <span class="font-bold text-xs truncate max-w-[140px]">${line.destName || 'Link'}</span>
                    </div>
                    <div class="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        ${line.deviceType || 'Link'}
                    </div>
                </div>
                <div class="p-3 bg-slate-800 space-y-3">
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Status</span>
                        <span class="font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}">${line.status.toUpperCase()}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
                        <span class="text-slate-400">Source</span>
                        <span class="text-slate-200 truncate max-w-[120px]">${line.sourceName || '-'}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Destination</span>
                        <span class="text-slate-200 truncate max-w-[120px]">${line.destName || '-'}</span>
                    </div>
                    ${line.distance ? `
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Distance</span>
                        <span class="text-slate-200 font-mono text-[10px]">${line.distance.toFixed(2)} m</span>
                    </div>
                    ` : ''}
                    ${isHeatmapMode && line.targetInterface ? `
                    <div class="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2">
                        <span class="text-slate-400">Interface</span>
                        <span class="text-slate-200 font-mono text-[10px]">${line.targetInterface}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="bg-slate-900/50 p-2 rounded border border-slate-700/30 flex flex-col items-center shadow-inner">
                            <span class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">RX</span>
                            <span class="text-emerald-400 font-mono font-bold text-xs">${formatBitrate(rxRateLive)}</span>
                        </div>
                        <div class="bg-slate-900/50 p-2 rounded border border-slate-700/30 flex flex-col items-center shadow-inner">
                            <span class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TX</span>
                            <span class="text-blue-400 font-mono font-bold text-xs">${formatBitrate(txRateLive)}</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }, [line, txRate, rxRate, timezone, isLiveMode, isHeatmapMode]); // Added isLiveMode/isHeatmapMode dependency

    // 2. Derive visual props
    const renderOptions = useMemo(() => {
        const styleConfig = getAnimationStyle(currentUser?.animationStyle || 'default');

        const latency = line.latency || 0;
        const packetLoss = line.packetLoss || 0;
        const isHighLatency = latency > 100;
        const isPacketLoss = packetLoss > 5;
        const isAlert = isHighLatency || isPacketLoss;

        // Use the throttled rates for visual calculations
        const maxRate = Math.max(txRate, rxRate);
        const isHeatmapActive = isHeatmapMode && ['up', 'online', 'active'].includes(line.status);

        let railColor = "#06b6d4";
        const thresholdIdle = (Number(mapColors.trafficThresholdIdle) || 1) * 1000000;
        const thresholdNormal = (Number(mapColors.trafficThresholdNormal) || 20) * 1000000;
        const thresholdHigh = (Number(mapColors.trafficThresholdHigh) || 50) * 1000000;

        if (line.status && !['up', 'online', 'active'].includes(line.status.toLowerCase())) {
            railColor = mapColors.offline;
        } else if (isHeatmapActive) {
            if (maxRate < thresholdIdle) railColor = mapColors.trafficyIdle;
            else if (maxRate < thresholdNormal) railColor = mapColors.trafficNormal;
            else if (maxRate < thresholdHigh) railColor = mapColors.trafficHigh;
            else railColor = mapColors.trafficPeak;
        } else if (line.deviceType === 'pppoe') {
            railColor = mapColors.pppoe;
        } else if (line.deviceType === 'odp') {
            railColor = mapColors.odp;
        } else if (isAlert) {
            railColor = mapColors.warning;
        } else if (line.status === 'up' || line.status === 'online') {
            railColor = mapColors.online;
        }

        let effectiveThickness = lineThickness;
        if (isHeatmapActive) {
            if (maxRate < thresholdIdle) effectiveThickness = Math.max(1, lineThickness - 1);
            else if (maxRate > thresholdHigh) effectiveThickness = lineThickness + 3;
            else if (maxRate > thresholdNormal) effectiveThickness = lineThickness + 1;
        }

        let motionColor = railColor;
        let motionType = 'orb';
        if (isHeatmapActive || isAlert) {
            motionType = 'packet';
        } else if (line.deviceType === 'pppoe') {
            motionType = 'orb';
        } else if (line.deviceType === 'odp') {
            motionType = 'comet';
        }

        return {
            styleConfig,
            railColor,
            effectiveThickness,
            motionColor,
            motionType,
            isAlert,
            isAntPath: styleConfig.isAntPath && !lowPerfMode
        };
    }, [line.status, line.deviceType, line.latency, line.packetLoss, txRate, rxRate, isHeatmapMode, lineThickness, mapColors, currentUser?.animationStyle, lowPerfMode]);

    const { styleConfig, railColor, effectiveThickness, motionColor, motionType, isAlert, isAntPath } = renderOptions;

    if (isAntPath) {
        return (
            <AntPath
                positions={[line.from, ...(line.waypoints || []), line.to]}
                options={{
                    delay: styleConfig.delay,
                    dashArray: styleConfig.dashArray,
                    weight: effectiveThickness,
                    color: styleConfig.color || railColor,
                    pulseColor: styleConfig.pulseColor || "transparent",
                    paused: !enableAnimation,
                    reverse: false
                }}
                tooltip={tooltipContent}
                popup={tooltipContent}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            />
        );
    }

    return (
        <AnimatedPath
            positions={[line.from, ...(line.waypoints || []), line.to]}
            status={line.status}
            type={line.deviceType}
            animationStyle={currentUser?.animationStyle || 'default'}
            delay={styleConfig.delay}
            dashArray={styleConfig.dashArray}
            weight={effectiveThickness}
            enableAnimation={enableAnimation}
            lineCap={styleConfig.lineCap || 'butt'}
            color={railColor}
            pulseColor={(line.status === 'down' || isAlert) ? railColor : (styleConfig.pulseColor ?? railColor)}
            motionColor={motionColor}
            motionType={motionType}
            disableMotionPath={lowPerfMode}
            paused={!enableAnimation}
            tooltip={tooltipContent}
            popup={tooltipContent}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
        />
    );
};

// Custom comparison to prevent re-renders when non-hovered live traffic changes
const areLinesEqual = (prev, next) => {
    // 1. Check for position changes (Essential for fixing "Centered at Router" bug)
    const fromChanged = prev.line.from[0] !== next.line.from[0] || prev.line.from[1] !== next.line.from[1];
    const toChanged = prev.line.to[0] !== next.line.to[0] || prev.line.to[1] !== next.line.to[1];

    if (fromChanged || toChanged) return false;

    // 2. Check other primitive props
    return (
        prev.line.id === next.line.id &&
        prev.line.status === next.line.status &&
        prev.txRate === next.txRate &&
        prev.rxRate === next.rxRate &&
        prev.isHovered === next.isHovered &&
        (prev.isHovered ? prev.tick === next.tick : true) &&
        prev.isHeatmapMode === next.isHeatmapMode &&
        prev.isLiveMode === next.isLiveMode &&
        prev.lineThickness === next.lineThickness &&
        prev.enableAnimation === next.enableAnimation &&
        prev.lowPerfMode === next.lowPerfMode &&
        prev.timezone === next.timezone &&
        prev.trafficMapRef === next.trafficMapRef
    );
};

const MemoizedNetworkLine = React.memo(NetworkLineOriginal, areLinesEqual);

const NetworkMap = ({
    routerId: filteredRouterId = null,
    showRoutersOnly = false,
    netwatchOverride = null,
    realtimeTraffic = null,
    isLiveMode = false,
    onLiveModeChange = null // New prop to control live mode from parent
}) => {
    // 1. Hooks & Data Fetching (Must be at the top)
    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const apiKey = settings?.googleMapsApiKey;
    const timezone = currentUser?.timezone || settings?.timezone || 'Asia/Jakarta';

    // Fetch Routers
    const { data: routersData } = useQuery({
        queryKey: ['routers'],
        queryFn: async () => {
            const res = await apiClient.get('/routers');
            return res.data.data;
        },
        placeholderData: keepPreviousData,
    });

    // Fetch Netwatch
    const { data: netwatchData, refetch: refetchNetwatch } = useQuery({
        queryKey: ['netwatch-all'],
        queryFn: async () => {
            if (!routersData) return [];
            const targetRouters = filteredRouterId ? routersData.filter(r => r.id === filteredRouterId) : routersData;
            const promises = targetRouters.map(r =>
                apiClient.get(`/routers/${r.id}/netwatch`).then(res => ({ routerId: r.id, entries: res.data.data }))
            );
            return Promise.all(promises);
        },
        enabled: !!routersData && !showRoutersOnly && !netwatchOverride,
        placeholderData: keepPreviousData,
        refetchInterval: 5000,
    });

    // Fetch PPPoE
    const { data: pppoeData } = useQuery({
        queryKey: ['pppoe-map', filteredRouterId],
        queryFn: async () => {
            const url = filteredRouterId ? `/pppoe/map?routerId=${filteredRouterId}` : '/pppoe/map';
            const res = await apiClient.get(url);
            return res.data.data || [];
        },
        enabled: !showRoutersOnly,
        staleTime: 30000,
        placeholderData: keepPreviousData,
    });

    // Fetch ONUs with coordinates (Passive Nodes)
    const { data: onusMapData } = useQuery({
        queryKey: ['onus-map'],
        queryFn: async () => {
            const res = await apiClient.get('/olts/onus/map');
            return res.data;
        },
        enabled: !showRoutersOnly,
        staleTime: 30000,
        placeholderData: keepPreviousData,
    });

    // Stable Data Memoization
    const stableRoutersData = useDeepCompareMemoize(routersData);
    const stableNetwatchData = useDeepCompareMemoize(netwatchOverride || netwatchData);
    const stablePppoeData = useDeepCompareMemoize(pppoeData);
    const stableOnusMapData = useDeepCompareMemoize(onusMapData);
    const stableRealtimeTraffic = useDeepCompareMemoize(realtimeTraffic);

    // UI & Interactive State (Moved to top to prevent ReferenceError)
    const [mapType, setMapType] = useState('satellite_dark');
    const [showLabels, setShowLabels] = useState(() => {
        const saved = localStorage.getItem('map_show_labels');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    const [lineThickness, setLineThickness] = useState(4);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [hoveredMarkerId, setHoveredMarkerId] = useState(null); // Consolidating all marker hover here
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const mapContainerRef = React.useRef(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [googleLoaded, setGoogleLoaded] = useState(() => !!window.google?.maps);

    // Performance optimization states
    const [enableAnimation, setEnableAnimation] = useState(() => {
        const saved = localStorage.getItem('map_animation_enabled');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [enableClustering, setEnableClustering] = useState(() => {
        const saved = localStorage.getItem('map_clustering_enabled');
        return saved !== null ? JSON.parse(saved) : true;
    });
    const [lowPerfMode, setLowPerfMode] = useState(() => {
        const saved = localStorage.getItem('map_low_perf_enabled');
        return saved !== null ? JSON.parse(saved) : false;
    });
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);

    // 2. Traffic Hub - Dual Rate for Performance
    const [displayTraffic, setDisplayTraffic] = useState(realtimeTraffic || {});
    const lastDisplayUpdate = React.useRef(0);

    // Performance: Store traffic in Ref to allow reading inside loops without triggering re-renders
    const trafficMapRef = useRef(new Map());

    // Performance: Only trigger re-renders for live data if an item is actually hovered
    const [hoverTick, setHoverTick] = useState(0);

    // Debounced Hover Refs
    const lineHoverTimeout = useRef(null);
    const markerHoverTimeout = useRef(null);

    // Debounced Hover Handlers
    const handleLineHover = (id) => {
        if (lineHoverTimeout.current) clearTimeout(lineHoverTimeout.current);
        if (id === null) {
            // Immediate clear for better responsiveness when leaving
            setHoveredLineId(null);
            return;
        }
        lineHoverTimeout.current = setTimeout(() => {
            setHoveredLineId(id);
        }, 50); // 50ms delay to prevent jitter
    };

    const handleMarkerHover = (id) => {
        if (markerHoverTimeout.current) clearTimeout(markerHoverTimeout.current);
        if (id === null) {
            setHoveredMarkerId(null);
            return;
        }
        markerHoverTimeout.current = setTimeout(() => {
            setHoveredMarkerId(id);
        }, 50);
    };

    // Sync Live vs Display Traffic
    useEffect(() => {
        if (!isLiveMode || !stableRealtimeTraffic) {
            setDisplayTraffic({});
            trafficMapRef.current.clear(); // Clear live ref too
            return;
        }

        // Update the live traffic ref immediately for tooltips
        const liveMap = new Map();
        Object.keys(stableRealtimeTraffic).forEach(key => liveMap.set(key, stableRealtimeTraffic[key]));
        Object.entries(stableRealtimeTraffic).forEach(([key, val]) => {
            if (key.includes(':')) {
                const ifaceOnly = key.split(':')[1];
                if (!liveMap.has(ifaceOnly)) liveMap.set(ifaceOnly, val);
            }
            if (key.includes('-')) {
                const ifaceOnly = key.split('-')[0];
                if (!liveMap.has(ifaceOnly)) liveMap.set(ifaceOnly, val);
            }
        });
        trafficMapRef.current = liveMap;

        // Update display (heatmap/thickness) at most every 4 seconds for maximum smoothness
        const now = Date.now();
        if (now - lastDisplayUpdate.current > 4000) {
            setDisplayTraffic(stableRealtimeTraffic);
            lastDisplayUpdate.current = now;
        }

        // Performance Improvement: Only increment tick if something is actively hovered
        // This prevents infinite loops and saves CPU when the map is idle
        if (hoveredMarkerId || hoveredLineId) {
            setHoverTick(prev => prev + 1);
        }
    }, [stableRealtimeTraffic, isLiveMode, hoveredMarkerId, hoveredLineId]);

    // --- Optimization: Pre-calculate flat traffic map for O(1) lookup ---
    // This solves the O(N*M) performance issue that causes stutter in large maps
    // This is for the `trafficMapRef` which is updated in the useEffect above.
    // The `displayTrafficMap` is for visual elements (lines, markers) that update less frequently.
    const displayTrafficMap = useMemo(() => {
        const map = new Map();
        const raw = displayTraffic || {};
        Object.keys(raw).forEach(key => map.set(key, raw[key]));
        Object.entries(raw).forEach(([key, val]) => {
            if (key.includes(':')) {
                const ifaceOnly = key.split(':')[1];
                if (!map.has(ifaceOnly)) map.set(ifaceOnly, val);
            }
            if (key.includes('-')) {
                const ifaceOnly = key.split('-')[0];
                if (!map.has(ifaceOnly)) map.set(ifaceOnly, val);
            }
        });
        return map;
    }, [displayTraffic]);



    // Fetch router interfaces for selected device (for dropdown)
    const { data: routerInterfaces } = useQuery({
        queryKey: ['router-interfaces', selectedDevice?.routerId],
        queryFn: async () => {
            if (!selectedDevice?.routerId) return [];
            const res = await apiClient.get(`/routers/${selectedDevice.routerId}/interfaces`);
            return res.data.data;
        },
        enabled: !!isModalOpen && !!selectedDevice?.routerId,
        staleTime: 60000,
    });


    // const { toast } = useToast(); // Removed: using react-hot-toast import directly

    // Manual sync function - syncs all routers' netwatch data
    const handleManualSync = useCallback(async () => {
        if (!routersData || isSyncing) return;

        setIsSyncing(true);
        try {
            const targetRouters = filteredRouterId
                ? routersData.filter(r => r.id === filteredRouterId)
                : routersData;

            // Sync netwatch for target routers
            await Promise.all(
                targetRouters.map(r =>
                    apiClient.post(`/routers/${r.id}/netwatch/sync`).catch(err => {
                        console.error(`Sync failed for router ${r.name}:`, err);
                        toast.error(`Sync Failed: ${r.name} - ${err.response?.data?.message || err.message}`);
                    })
                )
            );
            // Refresh the netwatch data
            if (!showRoutersOnly) {
                await refetchNetwatch();
            }
            toast.success('Netwatch data synchronized with routers.');
        } catch (err) {
            console.error('Manual sync failed:', err);
            toast.error('Failed to synchronize data.');
        } finally {
            setIsSyncing(false);
        }
    }, [routersData, isSyncing, refetchNetwatch, filteredRouterId, showRoutersOnly]);

    // Mutation for creating netwatch (new devices: OLT, ODP, Client)
    const createNetwatchMutation = useMutation({
        mutationFn: async ({ routerId, data }) => {
            const res = await apiClient.post(`/routers/${routerId}/netwatch`, data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            toast.success('New device has been successfully added.');
        },
        onError: (err) => {
            console.error('Create failed:', err);
            toast.error(`Failed to Add Device: ${err.response?.data?.message || err.message}`);
        },
    });

    // Mutation for updating netwatch
    const updateNetwatchMutation = useMutation({
        mutationFn: async ({ routerId, netwatchId, data }) => {
            const res = await apiClient.put(`/routers/${routerId}/netwatch/${netwatchId}`, data);
            return res.data.data;
        },
        onSuccess: (updatedData, variables) => {
            // Optimistic update for instant feedback
            queryClient.setQueryData(['netwatch-all'], (oldData) => {
                if (!oldData) return oldData;
                return oldData.map(group => {
                    if (group.routerId === variables.routerId) {
                        return {
                            ...group,
                            entries: group.entries.map(e =>
                                e.id === variables.netwatchId ? { ...e, ...updatedData } : e
                            )
                        };
                    }
                    return group;
                });
            });

            // Still invalidate to ensure consistency
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            toast.success('Device configuration saved successfully.');
        },
        onError: (err) => {
            console.error('Update failed:', err);
            toast.error(`Failed to Save Device: ${err.response?.data?.message || err.message}`);
        },
    });

    // Mutation for updating router
    const updateRouterMutation = useMutation({
        mutationFn: async ({ routerId, data }) => {
            const res = await apiClient.put(`/routers/${routerId}`, data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['routers'] });
            toast.success('Router configuration saved successfully.');
        },
        onError: (err) => {
            console.error('Update router failed:', err);
            toast.error(`Failed to Update Router: ${err.response?.data?.message || err.message}`);
        },
    });

    // Mutation for deleting netwatch
    const deleteNetwatchMutation = useMutation({
        mutationFn: async ({ routerId, netwatchId }) => {
            const res = await apiClient.delete(`/routers/${routerId}/netwatch/${netwatchId}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            toast.success('Device has been removed.');
        },
        onError: (err) => {
            console.error('Delete failed:', err);
            toast.error(`Failed to Delete Device: ${err.response?.data?.message || err.message}`);
        },
    });

    // Mutation for updating PPPoE session coordinates
    const updatePppoeMutation = useMutation({
        mutationFn: async ({ pppoeId, data }) => {
            const res = await apiClient.patch(`/pppoe/${pppoeId}/coordinates`, data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pppoe-map'] });
        },
    });

    // Mutation for updating ONU coordinates (Passive Nodes)
    const updateOnuMutation = useMutation({
        mutationFn: async ({ oltId, onuId, data }) => {
            const res = await apiClient.patch(`/olts/${oltId}/onus/${onuId}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });
            toast.success('ONU configuration saved successfully.');
        },
        onError: (err) => {
            console.error('Update ONU failed:', err);
            toast.error(`Failed to Save ONU: ${err.response?.data?.message || err.message}`);
        },
    });

    // Resolve Map Colors (Settings > Default)
    const mapColors = useMemo(() => {
        if (!settings?.mapColors) return DEFAULT_MAP_COLORS;
        return { ...DEFAULT_MAP_COLORS, ...settings.mapColors };
    }, [settings?.mapColors]);

    // Inject CSS Variables for Map Colors
    useEffect(() => {
        const root = document.documentElement;
        if (mapColors) {
            root.style.setProperty('--map-color-online', mapColors.online);
            root.style.setProperty('--map-color-offline', mapColors.offline);
            root.style.setProperty('--map-color-warning', mapColors.warning);
            root.style.setProperty('--map-color-pppoe', mapColors.pppoe);
            root.style.setProperty('--map-color-odp', mapColors.odp);
            root.style.setProperty('--map-color-router', mapColors.router);
            // Heatmap
            root.style.setProperty('--map-traffic-idle', mapColors.trafficyIdle);
            root.style.setProperty('--map-traffic-normal', mapColors.trafficNormal);
            root.style.setProperty('--map-traffic-high', mapColors.trafficHigh);
            root.style.setProperty('--map-traffic-peak', mapColors.trafficPeak);
        }
    }, [mapColors]);

    // Combine Data
    const mapData = useMemo(() => {
        if (!stableRoutersData) return { routers: [], lines: [], nodes: [] };
        // DEBUG: Check if lastDownReason is present
        // console.log('Map Data Debug:', stableOnusMapData?.[0]); 

        const nodes = [];

        const lines = [];
        const routerNodes = [];

        // First pass: Create lookup maps and router nodes
        const routerMap = new Map();
        const deviceMap = new Map();

        stableRoutersData.forEach(router => {
            // Apply filtering
            if (filteredRouterId && router.id !== filteredRouterId) return;

            // Robust coordinate processing for routers
            const lat = parseFloat(router.latitude);
            const lng = parseFloat(router.longitude);

            if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
                return; // Skip invalid routers
            }

            const rNode = { ...router, lat, lng, type: 'router', deviceType: 'router' };
            routerNodes.push(rNode);
            routerMap.set(router.id, rNode);
        });

        // If showRoutersOnly is true, return early with just routers
        if (showRoutersOnly) {
            return { routers: routerNodes, nodes: [], lines: [], pppoeNodes: [] };
        }

        // Second pass: Create netwatch nodes and index them
        const netwatchDataToUse = stableNetwatchData || [];
        netwatchDataToUse.forEach(nwGroup => {
            // Apply filtering
            if (filteredRouterId && nwGroup.routerId !== filteredRouterId) return;

            if (nwGroup.entries) {
                // Get router coordinates for fallback
                const routerNode = routerMap.get(nwGroup.routerId);
                const routerLat = routerNode ? routerNode.lat : 0;
                const routerLng = routerNode ? routerNode.lng : 0;

                nwGroup.entries.forEach((entry, index) => {
                    let lat = null, lng = null;

                    // Robust coordinate check
                    if (entry.latitude && entry.longitude &&
                        !isNaN(parseFloat(entry.latitude)) && !isNaN(parseFloat(entry.longitude)) &&
                        parseFloat(entry.latitude) !== 0 && parseFloat(entry.longitude) !== 0) {
                        lat = parseFloat(entry.latitude);
                        lng = parseFloat(entry.longitude);

                        const node = { ...entry, lat, lng, routerId: nwGroup.routerId };
                        nodes.push(node);
                        deviceMap.set(entry.id, node);
                    }
                    // If no valid coordinates, we simply skip this entry (do not show on map)
                });
            }
        });

        // 2.5 pass: Create Passive Inventory nodes (ONUs with coordinates but no Netwatch)
        const onusMapDataToUse = stableOnusMapData || [];
        onusMapDataToUse.forEach(onu => {
            // Apply filtering: show if no filter, or if ONU's routerId matches
            if (filteredRouterId && onu.routerId !== filteredRouterId) return;

            const lat = parseFloat(onu.latitude);
            const lng = parseFloat(onu.longitude);

            if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
                return;
            }

            // Avoid duplication if already in Netwatch (check by Host or SN)
            const alreadyOnMap = nodes.some(n =>
                (n.host && n.host === onu.host) ||
                (n.sn && n.sn === onu.sn)
            );

            if (!alreadyOnMap) {
                const node = {
                    ...onu,
                    lat,
                    lng,
                    type: 'onu',
                    deviceType: 'onu',
                    isPassive: true
                };
                nodes.push(node);
                deviceMap.set(onu.id, node);
            }
        });

        // Third pass: Create lines based on connections
        nodes.forEach(node => {
            let fromPos = null;

            // Determine Source Position (Robust Fallback Logic)
            if (node.connectionType === 'client' && node.connectedToId) {
                // 1. Try connecting to Parent Client
                const parentNode = deviceMap.get(node.connectedToId);
                if (parentNode) {
                    fromPos = [parentNode.lat, parentNode.lng];
                }
            } else if (node.connectionType === 'router' && node.connectedToId) {
                // 2. Try connecting to Parent Router (if explicitly set)
                const parentRouter = routerMap.get(node.connectedToId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                }
            }

            // 3. FALLBACK: Always connect to Main Router if no other parent found
            // This fixes "Missing Line" issues for orphaned devices (like Down/ODP with broken links)
            if (!fromPos && node.routerId) {
                const parentRouter = routerMap.get(node.routerId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                }
            }

            if (fromPos) {
                // Determine Source Name
                let sourceName = 'Unknown';
                if (node.connectionType === 'client' && node.connectedToId) {
                    sourceName = deviceMap.get(node.connectedToId)?.name || deviceMap.get(node.connectedToId)?.host || 'Unknown Client';
                } else if (node.connectionType === 'router' && node.connectedToId) {
                    sourceName = routerMap.get(node.connectedToId)?.name || 'Unknown Router';
                } else if (node.routerId) {
                    sourceName = routerMap.get(node.routerId)?.name || 'Unknown Router';
                }

                // Calculate Distance
                const waypoints = node.waypoints ? (typeof node.waypoints === 'string' ? JSON.parse(node.waypoints) : node.waypoints) : [];
                const fullPath = [fromPos, ...waypoints, [node.lat, node.lng]];
                const distance = calculatePathLength(fullPath);

                // Determine Traffic Interface (with Inheritance)
                let trafficInterface = node.targetInterface;
                let trafficSourceDevice = null;

                if (!trafficInterface) {
                    // Recursive lookup for inherited interface
                    const findInheritedInterface = (currentNode) => {
                        if (currentNode.targetInterface) return { iface: currentNode.targetInterface, device: currentNode.name || currentNode.host };

                        if (currentNode.connectionType === 'client' && currentNode.connectedToId) {
                            const parent = deviceMap.get(currentNode.connectedToId);
                            // Avoid infinite loops with simple depth check or visited set if needed, 
                            // but here we just go up. Valid topology is tree-like.
                            if (parent) return findInheritedInterface(parent);
                        }
                        return null;
                    };

                    // Start search from parent
                    if (node.connectionType === 'client' && node.connectedToId) {
                        const parent = deviceMap.get(node.connectedToId);
                        if (parent) {
                            const result = findInheritedInterface(parent);
                            if (result) {
                                trafficInterface = result.iface;
                                trafficSourceDevice = result.device;
                            }
                        }
                    }
                }

                lines.push({
                    id: `${node.routerId}-${node.id}`,
                    routerId: node.routerId,
                    netwatchId: node.id,
                    from: fromPos,
                    to: [node.lat, node.lng],
                    status: node.status,
                    waypoints: waypoints,
                    sourceName,
                    destName: node.name || node.host,
                    distance,
                    deviceType: node.deviceType,
                    // FIX: Pass latency/packetLoss so Yellow Alert works
                    latency: node.latency,
                    packetLoss: node.packetLoss,
                    // Added for Heatmap Details
                    targetInterface: trafficInterface,
                    inheritedFrom: trafficSourceDevice,
                    txRate: node.txRate,
                    rxRate: node.rxRate,
                });
            }
        });

        // Fourth pass: Create PPPoE nodes
        const pppoeNodes = [];
        if (stablePppoeData && Array.isArray(stablePppoeData)) {
            stablePppoeData.forEach(session => {
                if (session.latitude && session.longitude) {
                    const lat = parseFloat(session.latitude);
                    const lng = parseFloat(session.longitude);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        // Find parent router for this PPPoE
                        const parentRouter = routerMap.get(session.routerId);

                        pppoeNodes.push({
                            ...session,
                            lat,
                            lng,
                            deviceType: 'pppoe',
                            status: (session.status === 'active' || session.status === 'up') ? 'online' : 'offline',
                        });

                        // Determine source position based on connectionType
                        let fromPos = null;
                        let sourceName = 'Unknown';

                        if (session.connectionType === 'client' && session.connectedToId) {
                            // Connected to another client/device
                            const parentDevice = deviceMap.get(session.connectedToId);
                            if (parentDevice) {
                                fromPos = [parentDevice.lat, parentDevice.lng];
                                sourceName = parentDevice.name || parentDevice.host || 'Unknown Client';
                            }
                        }

                        // Fallback to router if no client connection found
                        if (!fromPos && parentRouter) {
                            fromPos = [parentRouter.lat, parentRouter.lng];
                            sourceName = parentRouter.name;
                        }

                        // Create line from source to PPPoE
                        if (fromPos) {
                            const waypoints = session.waypoints
                                ? (typeof session.waypoints === 'string' ? JSON.parse(session.waypoints) : session.waypoints)
                                : [];
                            const fullPath = [fromPos, ...waypoints, [lat, lng]];
                            const distance = calculatePathLength(fullPath);

                            lines.push({
                                id: `pppoe-${session.id}`,
                                routerId: session.routerId,
                                pppoeId: session.id,
                                from: fromPos,
                                to: [lat, lng],
                                status: session.status === 'active' ? 'up' : 'down',
                                waypoints: waypoints,
                                sourceName: sourceName,
                                destName: session.name,
                                distance,
                                deviceType: 'pppoe',
                                // FIX: Pass latency/packetLoss so Yellow Alert works
                                latency: session.lastLatency || session.latency,
                                packetLoss: session.packetLoss,
                                targetInterface: session.name, // Added for Live Mode matching
                                txRate: session.txRate,
                                rxRate: session.rxRate,
                            });
                        }
                    }
                }
            });
        }

        return { routers: routerNodes, nodes, lines, pppoeNodes };
    }, [stableRoutersData, stableNetwatchData, stablePppoeData, filteredRouterId, showRoutersOnly]);

    const defaultCenter = [-8.8742173, 120.7290947];
    const center = useMemo(() => {
        if (mapData.routers && mapData.routers.length > 0) {
            const firstRouter = mapData.routers[0];
            if (typeof firstRouter.lat === 'number' && typeof firstRouter.lng === 'number' && !isNaN(firstRouter.lat)) {
                return [firstRouter.lat, firstRouter.lng];
            }
        }
        return defaultCenter;
    }, [mapData.routers]);

    // Combine all points for auto-fitting
    const allMarkers = useMemo(() => [
        ...mapData.routers,
        ...mapData.nodes,
        ...(mapData.pppoeNodes || [])
    ], [mapData.routers, mapData.nodes, mapData.pppoeNodes]);

    // Handlers
    const handleDeviceClick = useCallback((device, type) => {
        setSelectedDevice({ ...device, type });
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedDevice(null);
    }, []);

    const handleEditPath = (device) => {
        setIsModalOpen(false);
        setIsEditingPath(true);
        setEditingDevice(device);

        // Parse waypoints if they exist
        let waypoints = [];
        if (device.waypoints) {
            waypoints = typeof device.waypoints === 'string'
                ? JSON.parse(device.waypoints)
                : device.waypoints;
        }

        // Add source and dest to create complete path for editing
        // Find line for this device
        const line = mapData.lines.find(l =>
            (device.type === 'pppoe' ? l.pppoeId === device.id : l.netwatchId === device.id)
        );

        if (line && line.from) {
            // waypoints only (exclude start/end for editing logic if EditablePath handles it)
            // But EditablePath usually takes [start, ...waypoints, end]
            // We'll set just waypoints state and let EditablePath handle rendering
            setEditWaypoints(waypoints);
        } else {
            setEditWaypoints([]);
        }
    };

    const handleSaveDevice = (updatedData) => {
        if (!selectedDevice) return;

        setIsSaving(true);

        // Sanitize data: valid UUID or null (not empty string)
        const sanitizedData = { ...updatedData };
        if (sanitizedData.connectedToId === '') {
            sanitizedData.connectedToId = null;
        }

        if (selectedDevice.type === 'router') {
            updateRouterMutation.mutate({
                routerId: selectedDevice.id,
                data: sanitizedData
            }, {
                onSuccess: () => {
                    setIsModalOpen(false);
                },
                onError: (error) => {
                    console.error('Failed to update router:', error);
                    alert(`Failed to save router: ${error.message || 'Unknown error'}`);
                },
                onSettled: () => {
                    setIsSaving(false);
                }
            });
        } else if (selectedDevice.type === 'pppoe') {
            // For PPPoE we only update coords/waypoints usually via map
            // But if modal allows editing other things? Modal usually specifically for netwatch options
            // Assuming PPPoE editing is limited or uses updatePppoeMutation
            updatePppoeMutation.mutate({
                pppoeId: selectedDevice.id,
                data: sanitizedData
            }, {
                onSuccess: () => {
                    setIsModalOpen(false);
                },
                onError: (error) => {
                    console.error('Failed to update PPPoE:', error);
                    alert(`Failed to save PPPoE: ${error.message || 'Unknown error'}`);
                },
                onSettled: () => {
                    setIsSaving(false);
                }
            });
        } else if (selectedDevice.type === 'onu') {
            updateOnuMutation.mutate({
                oltId: selectedDevice.oltId,
                onuId: selectedDevice.id,
                data: sanitizedData
            }, {
                onSuccess: () => {
                    setIsModalOpen(false);
                },
                onError: (error) => {
                    console.error('Failed to update ONU:', error);
                    alert(`Failed to save ONU: ${error.message || 'Unknown error'}`);
                },
                onSettled: () => {
                    setIsSaving(false);
                }
            });
        } else {
            // Netwatch
            if (selectedDevice.isNew) {
                createNetwatchMutation.mutate({
                    routerId: selectedDevice.routerId,
                    data: sanitizedData
                }, {
                    onSuccess: () => {
                        setIsModalOpen(false);
                    },
                    onError: (error) => {
                        console.error('Failed to create device:', error);
                        alert(`Failed to create device: ${error.message || 'Unknown error'}`);
                    },
                    onSettled: () => {
                        setIsSaving(false);
                    }
                });
            } else {
                updateNetwatchMutation.mutate({
                    routerId: selectedDevice.routerId,
                    netwatchId: selectedDevice.id,
                    data: sanitizedData
                }, {
                    onSuccess: () => {
                        setIsModalOpen(false);
                    },
                    onError: (error) => {
                        console.error('Failed to update device:', error);
                        alert(`Failed to save device: ${error.message || 'Unknown error'}`);
                    },
                    onSettled: () => {
                        setIsSaving(false);
                    }
                });
            }
        }
    };

    const handleDeleteDevice = () => {
        if (!selectedDevice) return;
        if (confirm('Are you sure you want to delete this device?')) {
            deleteNetwatchMutation.mutate({
                routerId: selectedDevice.routerId,
                netwatchId: selectedDevice.id
            }, {
                onSuccess: () => {
                    setIsModalOpen(false);
                }
            });
        }
    };

    const handleResetPath = () => {
        setEditWaypoints([]);
    };

    const handleCancelPathEdit = () => {
        setIsEditingPath(false);
        setEditingDevice(null);
        setEditWaypoints([]);
    };



    const handleSavePath = () => {
        if (!editingDevice) return;

        const waypointsJson = JSON.stringify(editWaypoints);

        if (editingDevice.type === 'pppoe') {
            updatePppoeMutation.mutate({
                pppoeId: editingDevice.id,
                data: { waypoints: waypointsJson }
            });
        } else if (editingDevice.type === 'onu') {
            updateOnuMutation.mutate({
                oltId: editingDevice.oltId,
                onuId: editingDevice.id,
                data: { waypoints: waypointsJson }
            });
        } else {
            updateNetwatchMutation.mutate({
                routerId: editingDevice.routerId,
                netwatchId: editingDevice.id,
                data: { waypoints: waypointsJson }
            });
        }

        setIsEditingPath(false);
        setEditingDevice(null);
        setEditWaypoints([]);
    };

    const handleAddDevice = (type) => {
        // Logic to add device (open modal with empty state)
        // For now, assume adding Netwatch
        if (mapData.routers.length === 0) {
            alert("No routers available to add device to.");
            return;
        }

        setSelectedDevice({
            isNew: true,
            type: type, // 'olt', 'odp', 'client'
            routerId: mapData.routers[0].id // Default to first router
        });
        setIsModalOpen(true);
    };

    const handlePppoeDragEnd = useCallback((pppoe, newPos) => {
        // Update local cache or optimistically update?
        // Better to trigger mutation
        updatePppoeMutation.mutate({
            pppoeId: pppoe.id,
            data: {
                latitude: String(newPos[0]),
                longitude: String(newPos[1])
            }
        });
    }, [updatePppoeMutation]);

    const handleToggleLabels = useCallback(() => {
        setShowLabels(prev => {
            const newValue = !prev;
            localStorage.setItem('map_show_labels', JSON.stringify(newValue));
            return newValue;
        });
    }, []);

    // Find line for editing
    const editingLine = useMemo(() => {
        if (!isEditingPath || !editingDevice) return null;
        // Check both netwatch and pppoe lines
        return mapData.lines.find(l => l.netwatchId === editingDevice.id || l.pppoeId === editingDevice.id);
    }, [isEditingPath, editingDevice, mapData.lines]);

    // --- Optimization: Create Lookup Maps for Lines ---
    const linesByNetwatchId = useMemo(() => {
        const lookup = {};
        mapData.lines.forEach(line => {
            if (line.netwatchId) lookup[line.netwatchId] = line;
        });
        return lookup;
    }, [mapData.lines]);

    const linesByPppoeId = useMemo(() => {
        const lookup = {};
        mapData.lines.forEach(line => {
            if (line.pppoeId) lookup[line.pppoeId] = line;
        });
        return lookup;
    }, [mapData.lines]);

    // --- Stable Markers Generation (Flattened Array for Clustering) ---
    // --- Stable Markers Generation (Flattened Array for Clustering) ---
    const markers = useMemo(() => {
        const allMarkers = [];

        // 1. Router Markers
        mapData.routers.forEach(router => {
            if (typeof router.lat !== 'number' || typeof router.lng !== 'number' ||
                (searchQuery && !(
                    (router.name && router.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (router.host && router.host.includes(searchQuery))
                ))) {
                return;
            }

            allMarkers.push(
                <MemoizedSmartMarker
                    key={`router-${router.id}`}
                    id={router.id} // Pass ID for context check
                    position={[router.lat, router.lng]}
                    type="router"
                    status={router.status}
                    name={router.name || router.host}
                    small={false}
                    draggable={isEditMode}
                    onClick={null} // Click now handled by Popup
                    eventHandlers={{
                        mouseover: () => handleMarkerHover(router.id),
                        mouseout: () => handleMarkerHover(null)
                    }}
                >
                    <DeviceTooltip
                        node={{ ...router, deviceType: 'router' }}
                    />
                    <DevicePopup
                        node={{ ...router, deviceType: 'router' }}
                        onEdit={() => handleDeviceClick({ ...router, deviceType: 'router' }, 'router')}
                    />
                </MemoizedSmartMarker>
            );
        });

        // 2. Netwatch Node Markers
        mapData.nodes.forEach(node => {
            if (typeof node.lat !== 'number' || typeof node.lng !== 'number' ||
                (searchQuery && !(
                    (node.name && node.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (node.host && node.host.includes(searchQuery))
                ))) {
                return;
            }

            // Optimized Lookup
            const line = linesByNetwatchId[node.id];

            allMarkers.push(
                <MemoizedSmartMarker
                    key={`netwatch-${node.routerId}-${node.id}`}
                    id={node.id} // Pass ID for context check
                    position={[node.lat, node.lng]}
                    type={node.deviceType === 'client' ? 'netwatch' : (node.deviceType || 'netwatch')}
                    status={node.status}
                    name={node.name || node.host}
                    showLabel={showLabels}
                    small={true}
                    latency={Number(node.latency)}
                    packetLoss={Number(node.packetLoss)}
                    draggable={isEditMode}
                    onDragEnd={(pos) => {
                        updateNetwatchMutation.mutate({
                            routerId: node.routerId,
                            netwatchId: node.id,
                            data: { latitude: String(pos[0]), longitude: String(pos[1]) }
                        });
                    }}
                    // isHovered prop removed
                    onClick={null} // Click now handled by Popup
                    eventHandlers={{
                        mouseover: () => handleMarkerHover(node.id),
                        mouseout: () => handleMarkerHover(null)
                    }}
                    isHeatmapMode={isHeatmapMode}
                >
                    <DeviceTooltip
                        node={node}
                        line={line}
                    />
                    <DevicePopup
                        node={node}
                        line={line}
                        onEdit={() => handleDeviceClick(node, node.deviceType)}
                    />
                </MemoizedSmartMarker>
            );
        });

        // 3. PPPoE Client Markers
        (mapData.pppoeNodes || []).forEach(pppoe => {
            if (typeof pppoe.lat !== 'number' || typeof pppoe.lng !== 'number' ||
                (searchQuery && !(
                    (pppoe.name && pppoe.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (pppoe.address && pppoe.address.includes(searchQuery))
                ))) {
                return;
            }

            const line = linesByPppoeId[pppoe.id];

            allMarkers.push(
                <MemoizedSmartMarker
                    key={`pppoe-${pppoe.id}`}
                    id={pppoe.id} // Pass ID
                    position={[pppoe.lat, pppoe.lng]}
                    type="pppoe"
                    status={pppoe.status}
                    name={pppoe.name}
                    showLabel={showLabels}
                    small={true}
                    draggable={isEditMode}
                    onDragEnd={(pos) => handlePppoeDragEnd(pppoe, pos)}
                    // isHovered prop removed
                    onClick={null} // Click now handled by Popup
                    eventHandlers={{
                        mouseover: () => handleMarkerHover(pppoe.id),
                        mouseout: () => handleMarkerHover(null)
                    }}
                    isHeatmapMode={isHeatmapMode}
                >
                    <DeviceTooltip
                        node={{ ...pppoe, deviceType: 'pppoe' }}
                        line={line}
                    />
                    <DevicePopup
                        node={{ ...pppoe, deviceType: 'pppoe' }}
                        line={line}
                        onEdit={() => handleDeviceClick({ ...pppoe, deviceType: 'pppoe' }, 'pppoe')}
                    />
                </MemoizedSmartMarker>
            );
        });

        return allMarkers;
    }, [
        mapData.routers,
        mapData.nodes,
        mapData.pppoeNodes,
        searchQuery,
        showLabels,
        isEditMode,
        handleDeviceClick,
        handlePppoeDragEnd,
        updateNetwatchMutation,
        timezone,
        isHeatmapMode
    ]); // Removed mapData (whole) and hoveredRouterId to stabilize clusters


    const trafficContextValue = useMemo(() => ({
        hoverTick,
        displayTrafficMap,
        trafficMapRef,
        timezone,
        isHeatmapMode,
        isLiveMode
    }), [hoverTick, displayTrafficMap, trafficMapRef, timezone, isHeatmapMode, isLiveMode]);

    return (
        <main ref={mapContainerRef} className={`flex-1 relative flex flex-col bg-[#020617] overflow-hidden h-full ${lowPerfMode ? 'low-perf' : ''} map-type-${mapType}`}>
            {(!googleLoaded || !apiKey) && (
                <div className="absolute inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-300 font-medium">Memuat Peta Google...</p>
                    {!apiKey && <p className="text-red-400 text-xs mt-2">API Key Google Maps tidak ditemukan.</p>}
                </div>
            )}
            <TrafficContext.Provider value={trafficContextValue}>
                <HoveredItemContext.Provider value={{ hoveredMarkerId, hoveredLineId }}>
                    <MapContainer
                        center={center}
                        zoom={10}
                        maxZoom={20} // Fix: Map has no maxZoom specified error for clustering
                        scrollWheelZoom={true}
                        style={{ height: "100%", width: "100%", background: mapType === 'satellite_dark' ? '#000' : "#0f172a" }}
                    >
                        <MapAutoFit markers={allMarkers} isEditing={isEditMode || isEditingPath} />
                        <MemoizedGoogleMapsLayer type={mapType} apiKey={apiKey} onLoaded={() => setGoogleLoaded(true)} />


                        {/* Animated Topology Lines (show when NOT editing) */}
                        {!isEditingPath && useMemo(() => mapData.lines.map((line) => {
                            const iface = line.targetInterface;
                            const isHovered = hoveredLineId === line.id;

                            // Throttled Stats for Visuals (Color/Thickness)
                            // Rule: Use SNMP data only if isLiveMode is ON
                            const routerPrefixedKey = line.routerId ? `${line.routerId}:${iface}` : null;
                            const stats = isLiveMode && iface ? (displayTrafficMap.get(routerPrefixedKey) || displayTrafficMap.get(iface)) : null;
                            const txRateThrottled = stats?.tx || line.txRate || 0;
                            const rxRateThrottled = stats?.rx || line.rxRate || 0;

                            return (
                                <MemoizedNetworkLine
                                    key={`line-${line.id}-${enableAnimation}`}
                                    line={line}
                                    txRate={txRateThrottled}
                                    rxRate={rxRateThrottled}
                                    isHeatmapMode={isHeatmapMode}
                                    isLiveMode={isLiveMode} // Added
                                    lineThickness={lineThickness}
                                    mapColors={mapColors}
                                    currentUser={currentUser}
                                    enableAnimation={enableAnimation}
                                    lowPerfMode={lowPerfMode}
                                    timezone={timezone}
                                    isHovered={isHovered}
                                    onMouseOver={() => handleLineHover(line.id)}
                                    onMouseOut={() => handleLineHover(null)}
                                />
                            );
                        }), [
                            mapData.lines,
                            hoveredLineId,
                            isHeatmapMode,
                            lineThickness,
                            mapColors,
                            currentUser,
                            enableAnimation,
                            lowPerfMode,
                            timezone,
                            isLiveMode
                        ])}

                        {/* Editable Path (show when editing) */}
                        {isEditingPath && editingLine && (
                            <EditablePath
                                fromPosition={editingLine.from}
                                toPosition={editingLine.to}
                                waypoints={editWaypoints}
                                isEditing={true}
                                color="#3b82f6"
                                onWaypointsChange={setEditWaypoints}
                                onLengthChange={setPathLength}
                            />
                        )}

                        {/* Markers with optional Clustering */}
                        {(() => {
                            if (enableClustering) {
                                return (
                                    <MarkerClusterGroup
                                        chunkedLoading
                                        spiderfyOnMaxZoom={true}
                                        showCoverageOnHover={false}
                                        maxClusterRadius={40}
                                        animate={true}
                                        iconCreateFunction={createClusterCustomIcon}
                                        polygonOptions={{
                                            fillColor: '#3b82f6',
                                            color: '#3b82f6',
                                            weight: 1,
                                            opacity: 0.8,
                                            fillOpacity: 0.1,
                                        }}
                                    >
                                        {markers}
                                    </MarkerClusterGroup>
                                );
                            }

                            return markers;
                        })()}

                    </MapContainer >

                    {/* Path Edit Toolbar */}
                    {
                        !showRoutersOnly && (
                            <MapToolbar
                                isVisible={isEditingPath}
                                pathLength={pathLength}
                                onReset={handleResetPath}
                                onCancel={handleCancelPathEdit}
                                onSave={handleSavePath}
                            />
                        )
                    }

                    {/* Top Controls */}
                    {
                        !showRoutersOnly && (
                            <>
                                {/* Mobile Fullscreen Button - Visible only on mobile */}
                                <button
                                    onClick={() => {
                                        if (!document.fullscreenElement) {
                                            mapContainerRef.current?.requestFullscreen();
                                            setIsFullscreen(true);
                                        } else {
                                            document.exitFullscreen();
                                            setIsFullscreen(false);
                                        }
                                    }}
                                    className="sm:hidden absolute top-4 right-14 z-[1000] w-9 h-9 bg-slate-900/90 rounded-lg flex items-center justify-center text-white border border-slate-700 shadow-lg backdrop-blur-sm"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                        {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                                    </span>
                                </button>

                                {/* Mobile Menu Button - Only visible on small screens */}
                                <button
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                    className="sm:hidden absolute top-4 right-4 z-[1000] w-9 h-9 bg-slate-900/90 rounded-lg flex items-center justify-center text-white border border-slate-700 shadow-lg backdrop-blur-sm"
                                >
                                    <span className="material-symbols-outlined">
                                        {isMenuOpen ? 'close' : 'menu'}
                                    </span>
                                </button>

                                <div className={`
                            absolute top-16 right-4 sm:top-4 sm:right-4 z-[1000] 
                            flex flex-col gap-2 bg-slate-900/90 sm:bg-slate-900/80 p-3 rounded-lg
                            backdrop-blur-sm border border-slate-700 shadow-xl sm:shadow-none
                            transition-all duration-200 origin-top-right
                            ${isMenuOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 sm:scale-100 sm:opacity-100'}
                        `}>

                                    {/* Search Box */}
                                    <div className="mb-2 w-full min-w-[200px]">
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                            <input
                                                type="text"
                                                placeholder="Search map..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-slate-800 text-white text-xs py-1.5 pl-8 pr-2 rounded border border-slate-600 outline-none focus:border-blue-500 transition-colors"
                                            />
                                            {searchQuery && (
                                                <button
                                                    onClick={() => setSearchQuery('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:block mb-2 sm:mb-1">
                                        <label className="text-xs text-white font-bold">Map Type</label>
                                    </div>
                                    <select
                                        value={mapType}
                                        onChange={(e) => setMapType(e.target.value)}
                                        className="bg-slate-800 text-white text-xs p-1.5 rounded border border-slate-600 outline-none w-full"
                                    >
                                        <option value="roadmap">Roadmap</option>
                                        <option value="satellite">Satellite</option>
                                        <option value="satellite_dark">Satellite Dark</option>
                                        <option value="hybrid">Hybrid</option>
                                        <option value="terrain">Terrain</option>
                                        <option value="dark">Dark Mode</option>
                                    </select>

                                    {/* Heatmap Mode Toggle */}
                                    <div className="flex items-center justify-between sm:block mb-2 sm:mb-1 mt-2 border-t border-slate-700/50 pt-2">
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <span className="text-xs text-white font-bold group-hover:text-blue-400 transition-colors">
                                                Bandwidth Heatmap
                                            </span>
                                            <div className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={isHeatmapMode}
                                                    onChange={(e) => {
                                                        setIsHeatmapMode(e.target.checked);
                                                    }}
                                                />
                                                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="h-px bg-slate-700/50 my-1 sm:hidden"></div>

                                    {/* Line Thickness Control */}
                                    <div className="flex items-center justify-between p-1.5 bg-slate-800 rounded border border-slate-600 mt-2 sm:mt-1">
                                        <span className="text-xs text-white font-medium pl-1">Line Size</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setLineThickness(Math.max(1, lineThickness - 1))}
                                                className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition-colors"
                                                title="Decrease (Tipis)"
                                            >
                                                -
                                            </button>
                                            <span className="text-xs text-white font-mono w-4 text-center">{lineThickness}</span>
                                            <button
                                                onClick={() => setLineThickness(Math.min(10, lineThickness + 1))}
                                                className="w-5 h-5 flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition-colors"
                                                title="Increase (Tebal)"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div className="h-px bg-slate-700/50 my-1"></div>

                                    {/* Line Opacity Control */}




                                    {/* Edit Mode Toggle */}
                                    <button
                                        onClick={() => setIsEditMode(prev => !prev)}
                                        className={`px-2 py-1.5 text-xs rounded flex items-center gap-2 sm:gap-1 transition-colors ${isEditMode
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                            } `}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                            {isEditMode ? 'lock_open' : 'lock'}
                                        </span>
                                        {isEditMode ? 'Editing' : 'Locked'}
                                    </button>

                                    {/* Refresh/Sync Button */}
                                    <button
                                        onClick={handleManualSync}
                                        disabled={isSyncing}
                                        className="mt-1 sm:mt-2 px-2 py-1.5 text-xs rounded flex items-center gap-2 sm:gap-1 transition-colors bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Sinkronisasi data dari MikroTik"
                                    >
                                        <span
                                            className="material-symbols-outlined"
                                            style={{
                                                fontSize: 16,
                                                animation: isSyncing ? 'spin 1s linear infinite' : 'none'
                                            }}
                                        >
                                            sync
                                        </span>
                                        {isSyncing ? 'Syncing...' : 'Refresh'}
                                    </button>

                                    {/* Fullscreen Button */}
                                    <button
                                        onClick={() => {
                                            if (!document.fullscreenElement) {
                                                mapContainerRef.current?.requestFullscreen();
                                                setIsFullscreen(true);
                                            } else {
                                                document.exitFullscreen();
                                                setIsFullscreen(false);
                                            }
                                            setIsMenuOpen(false); // Close menu on action
                                        }}
                                        className="mt-1 sm:mt-2 px-2 py-1.5 text-xs rounded flex items-center gap-2 sm:gap-1 transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600"
                                        title="Toggle Fullscreen"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                            {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                                        </span>
                                        {isFullscreen ? 'Exit' : 'Full'}
                                    </button>
                                </div>
                            </>
                        )
                    }

                    {/* Router Detail View Controls (Fullscreen Only) */}
                    {
                        showRoutersOnly && (
                            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        if (!document.fullscreenElement) {
                                            mapContainerRef.current?.requestFullscreen();
                                            setIsFullscreen(true);
                                        } else {
                                            document.exitFullscreen();
                                            setIsFullscreen(false);
                                        }
                                    }}
                                    className="bg-slate-900/90 hover:bg-slate-800 text-white rounded-lg p-2 border border-slate-700 shadow-lg backdrop-blur-sm flex items-center justify-center transition-colors"
                                    title="Toggle Fullscreen"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                        {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                                    </span>
                                </button>
                            </div>
                        )
                    }

                    {/* Legend */}
                    {
                        !showRoutersOnly && (
                            <MapLegend
                                showLabels={showLabels}
                                onToggleLabels={handleToggleLabels}
                                enableAnimation={enableAnimation}
                                onToggleAnimation={() => {
                                    setEnableAnimation(prev => {
                                        const newVal = !prev;
                                        localStorage.setItem('map_animation_enabled', JSON.stringify(newVal));
                                        return newVal;
                                    });
                                }}
                                enableClustering={enableClustering}
                                onToggleClustering={() => {
                                    setEnableClustering(prev => {
                                        const newVal = !prev;
                                        localStorage.setItem('map_clustering_enabled', JSON.stringify(newVal));
                                        return newVal;
                                    });
                                }}
                                lowPerfMode={lowPerfMode}
                                onToggleLowPerf={() => {
                                    setLowPerfMode(prev => {
                                        const newVal = !prev;
                                        localStorage.setItem('map_low_perf_enabled', JSON.stringify(newVal));
                                        return newVal;
                                    });
                                }}
                                isHeatmapMode={isHeatmapMode}
                                mapColors={mapColors}
                            />
                        )
                    }

                    {/* Floating Action Button */}
                    {
                        !showRoutersOnly && (
                            <MapFAB
                                onAddDevice={handleAddDevice}
                                disabled={isEditingPath}
                            />
                        )
                    }

                    {/* Device Modal */}
                    <DeviceModal
                        isOpen={isModalOpen}
                        device={selectedDevice}
                        routers={mapData.routers}
                        devices={mapData.nodes}
                        onClose={handleCloseModal}
                        onSave={handleSaveDevice}
                        onDelete={handleDeleteDevice}
                        onEditPath={handleEditPath}
                        isSaving={isSaving}
                        routerInterfaces={routerInterfaces || []}
                    />
                </HoveredItemContext.Provider>
            </TrafficContext.Provider>
        </main>
    );
};

export default NetworkMap;
