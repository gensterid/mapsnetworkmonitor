import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser } from '@/hooks';
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
const GoogleMapsLayer = ({ type = 'hybrid', apiKey }) => {
    const map = useMap();
    const [scriptLoaded, setScriptLoaded] = useState(false);

    useEffect(() => {
        if (!apiKey) return;

        if (window.google?.maps) {
            setScriptLoaded(true);
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
            const checkLoaded = setInterval(() => {
                if (window.google?.maps) {
                    setScriptLoaded(true);
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
            script.remove();
        };
        document.head.appendChild(script);
    }, [apiKey]);

    useEffect(() => {
        if (!scriptLoaded || !L.gridLayer.googleMutant) return;

        try {
            const layerOptions = {
                type: (type === 'dark' || type === 'satellite_dark') ? 'hybrid' : type,
            };

            // Apply styles if dark mode or satellite dark
            if (type === 'dark') {
                layerOptions.styles = DARK_MAP_STYLES;
            } else if (type === 'satellite_dark') {
                layerOptions.styles = SATELLITE_DARK_STYLES;
            }

            const googleLayer = L.gridLayer.googleMutant(layerOptions);
            googleLayer.addTo(map);
            return () => map.removeLayer(googleLayer);
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
    children,
    ...props
}) => {
    const [markerPosition, setMarkerPosition] = useState(position);

    useEffect(() => {
        setMarkerPosition(position);
    }, [position]);

    const eventHandlers = useMemo(() => ({
        dragend: (e) => {
            const newPos = e.target.getLatLng();
            setMarkerPosition([newPos.lat, newPos.lng]);
            if (onDragEnd) {
                onDragEnd([newPos.lat, newPos.lng]);
            }
        },
        click: onClick,
        ...(props.eventHandlers || {}) // Merge external handlers
    }), [onDragEnd, onClick, props.eventHandlers]);

    // Safety check: Don't render if position is invalid. 
    // This prevents Leaflet internal errors like "Cannot read properties of undefined (reading 'x')"
    const isValidPosition = Array.isArray(markerPosition) &&
        markerPosition.length === 2 &&
        typeof markerPosition[0] === 'number' &&
        typeof markerPosition[1] === 'number' &&
        isFinite(markerPosition[0]) &&
        isFinite(markerPosition[1]);

    if (!isValidPosition) return null;

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

// Memoized Tooltip for Devices to prevent re-renders of the layer component itself unless props change
const DeviceTooltip = React.memo(({ node, line, rxRate, txRate, timezone, isHeatmapMode }) => {
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
        <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
            <div className="flex flex-col min-w-[200px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
                <div className={`px-3 py-2 flex items-center justify-between ${isUp ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    <div className="flex items-center gap-2 text-white">
                        <span className="material-symbols-outlined text-[16px]">
                            {node.deviceType === 'olt' ? 'hub' : node.deviceType === 'odp' ? 'settings_input_component' : 'person'}
                        </span>
                        <span className="font-bold text-xs truncate max-w-[100px]">{node.name || node.host}</span>
                    </div>
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {status}
                    </div>
                </div>
                <div className="p-3 bg-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Host</span>
                        <span className="text-slate-200 font-mono">{node.host}</span>
                    </div>
                    {line && (
                        <>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Source</span>
                                <span className="text-slate-200 truncate max-w-[100px]">{line.sourceName}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Distance</span>
                                <span className="text-slate-200 font-mono">{(line.distance / 1000).toFixed(2)} km</span>
                            </div>
                        </>
                    )}
                    {isUp ? (
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Latency</span>
                            <span className="text-emerald-400 font-bold">{node.latency} ms</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase">Down Since</span>
                            <span className="text-red-200 text-xs">{formatDateWithTimezone(node.lastDown, timezone)}</span>
                        </div>
                    )}
                    {isHeatmapMode && isUp && (
                        <div className="border-t border-slate-700/50 pt-2 mt-1 grid grid-cols-2 gap-2">
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
        </Tooltip>
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
    isHovered, // New prop
    txRate, // Added for MemoizedSmartMarker
    rxRate, // Added for MemoizedSmartMarker
    children,
    ...props
}) => {
    // Memoize the icon so it doesn't change reference on every render
    const icon = useMemo(() => createDeviceIcon({
        type,
        status,
        name: showLabel ? name : '',
        showLabel,
        small,
        latency,
        packetLoss
    }), [type, status, name, showLabel, small, latency, packetLoss]);

    return (
        <DraggableMarker
            position={position}
            icon={icon}
            draggable={draggable}
            onDragEnd={onDragEnd}
            onClick={onClick}
            status={status} // Pass status for cluster icon logic
            {...props}
        >
            {isHovered && children}
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
        prev.txRate === next.txRate &&
        prev.rxRate === next.rxRate &&
        prev.isHovered === next.isHovered && // Critical for tooltips
        (prev.isHovered ? prev.tick === next.tick : true) // Only care about tick if hovered
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
        if (status === 'down' || status === 'offline') {
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
    isHovered,
    tick,
    trafficMapRef // Pass the ref explicitly
}) => {
    // 1. Tooltip Content (Calculated lazily only when hovered)
    const tooltipContent = useMemo(() => {
        if (!isHovered) return null;

        // Use fresh stats from Ref for the hovered tooltip
        const map = trafficMapRef.current;
        const iface = line.targetInterface;
        const routerPrefixedKey = line.routerId ? `${line.routerId}:${iface}` : null;
        const stats = iface ? (map.get(routerPrefixedKey) || map.get(iface)) : null;

        // If we don't have live stats yet, fall back to throttled props
        const txRateLive = stats?.tx ?? txRate;
        const rxRateLive = stats?.rx ?? rxRate;

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
                        <span class="font-bold text-xs truncate max-w-[140px]">${line.targetName || 'Link'}</span>
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
                    ${line.targetInterface ? `
                    <div class="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2">
                        <span class="text-slate-400">Interface</span>
                        <span class="text-slate-200 font-mono text-[10px]">${line.targetInterface}</span>
                    </div>
                    ` : ''}
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
                </div>
            </div>
        `;
    }, [isHovered, tick, line, txRate, rxRate, timezone]);

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

        if (line.status === 'down') {
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
    return (
        prev.line.id === next.line.id &&
        prev.line.status === next.line.status &&
        prev.txRate === next.txRate &&
        prev.rxRate === next.rxRate &&
        prev.isHovered === next.isHovered &&
        (prev.isHovered ? prev.tick === next.tick : true) &&
        prev.isHeatmapMode === next.isHeatmapMode &&
        prev.lineThickness === next.lineThickness &&
        prev.enableAnimation === next.enableAnimation &&
        prev.lowPerfMode === next.lowPerfMode &&
        prev.timezone === next.timezone &&
        prev.trafficMapRef === next.trafficMapRef // Ref should be stable
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
    // 1. Traffic Hub - Dual Rate for Performance
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
        if (!isLiveMode || !realtimeTraffic) {
            setDisplayTraffic({});
            trafficMapRef.current.clear(); // Clear live ref too
            return;
        }

        // Update the live traffic ref immediately for tooltips
        const liveMap = new Map();
        Object.keys(realtimeTraffic).forEach(key => liveMap.set(key, realtimeTraffic[key]));
        Object.entries(realtimeTraffic).forEach(([key, val]) => {
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
            setDisplayTraffic(realtimeTraffic);
            lastDisplayUpdate.current = now;
        }
        // Increment tick to force re-render of hovered items
        setHoverTick(prev => prev + 1);
    }, [realtimeTraffic, isLiveMode]);

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

    const [mapType, setMapType] = useState('satellite_dark'); // Set to satellite_dark as default
    const [showLabels, setShowLabels] = useState(() => {
        const saved = localStorage.getItem('map_show_labels');
        return saved !== null ? JSON.parse(saved) : true; // Default true based on user feedback
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    const [lineThickness, setLineThickness] = useState(4); // Reverted default to 4 as requested

    const [isEditMode, setIsEditMode] = useState(false); // Master edit mode for dragging
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile menu toggle
    const [hoveredRouterId, setHoveredRouterId] = useState(null); // Track hovered router for tooltip fetching
    const [hoveredLineId, setHoveredLineId] = useState(null); // Track hovered line for live stats
    const mapContainerRef = React.useRef(null);

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

    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const apiKey = settings?.googleMapsApiKey;

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

    // Fetch Netwatch for all routers (Disabled if showRoutersOnly is true)
    const { data: netwatchData, refetch: refetchNetwatch } = useQuery({
        queryKey: ['netwatch-all'],
        queryFn: async () => {
            if (!routersData) return [];

            // If filteredRouterId is set, only fetch for that router to save bandwidth
            const targetRouters = filteredRouterId
                ? routersData.filter(r => r.id === filteredRouterId)
                : routersData;

            const promises = targetRouters.map(r =>
                apiClient.get(`/routers/${r.id}/netwatch`).then(res => ({
                    routerId: r.id,
                    entries: res.data.data
                }))
            );
            return Promise.all(promises);
        },
        enabled: !!routersData && !showRoutersOnly && !netwatchOverride,
        placeholderData: keepPreviousData,
        refetchInterval: 5000, // Faster polling for "live" traffic feeling
    });

    // Fetch PPPoE sessions with coordinates
    const { data: pppoeData } = useQuery({
        queryKey: ['pppoe-map', filteredRouterId],
        queryFn: async () => {
            const url = filteredRouterId
                ? `/pppoe/map?routerId=${filteredRouterId}`
                : '/pppoe/map';
            const res = await apiClient.get(url);
            return res.data.data || [];
        },
        enabled: !showRoutersOnly,
        staleTime: 30000,
        placeholderData: keepPreviousData,
    });

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

    // State for syncing indicator
    const [isSyncing, setIsSyncing] = useState(false);
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

    // Memoize dependencies to ensure mapData is only recalculated when ACTUAL data content changes
    const stableRoutersData = useDeepCompareMemoize(routersData);
    const stableNetwatchData = useDeepCompareMemoize(netwatchOverride || netwatchData);
    const stablePppoeData = useDeepCompareMemoize(pppoeData);

    // Combine Data
    const mapData = useMemo(() => {
        if (!stableRoutersData) return { routers: [], lines: [], nodes: [] };

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

            const rNode = { ...router, lat, lng, type: 'router' };
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

    // Hover State for Markers (Performance Optimization)
    const [hoveredMarkerId, setHoveredMarkerId] = useState(null);

    const handleSavePath = () => {
        if (!editingDevice) return;

        const waypointsJson = JSON.stringify(editWaypoints);

        if (editingDevice.type === 'pppoe') {
            updatePppoeMutation.mutate({
                pppoeId: editingDevice.id,
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

    // --- Stable Markers Generation ---
    const markers = useMemo(() => {
        return (
            <>
                {/* Router Markers */}
                {mapData.routers.filter(r =>
                    typeof r.lat === 'number' && typeof r.lng === 'number' &&
                    (!searchQuery || (r.name && r.name.toLowerCase().includes(searchQuery.toLowerCase())) || (r.host && r.host.includes(searchQuery)))
                ).map(router => {
                    const isHovered = hoveredRouterId === router.id;
                    return (
                        <MemoizedDraggableMarker
                            key={router.id}
                            status={router.status} // For cluster icon
                            position={[router.lat, router.lng]}
                            icon={createDeviceIcon({
                                type: 'router',
                                status: router.status,
                                name: showLabels ? router.name : '',
                                showLabel: showLabels,
                            })}
                            eventHandlers={{
                                click: () => handleDeviceClick(router, 'router'),
                                mouseover: () => setHoveredRouterId(router.id),
                                mouseout: () => setHoveredRouterId(null)
                            }}
                        >
                            {isHovered && <RouterTooltip router={router} isHovered={true} />}
                        </MemoizedDraggableMarker>
                    );
                })}

                {/* Netwatch Node Markers */}
                {mapData.nodes.filter(n =>
                    typeof n.lat === 'number' && typeof n.lng === 'number' &&
                    (!searchQuery || (n.name && n.name.toLowerCase().includes(searchQuery.toLowerCase())) || (n.host && n.host.includes(searchQuery)))
                ).map(node => {
                    // Optimized Lookup
                    const line = linesByNetwatchId[node.id];
                    const isHovered = hoveredMarkerId === node.id;

                    // Throttled Stats (Visuals)
                    const trafficInterface = node.targetInterface || line?.targetInterface;
                    const routerPrefixedKey = node.routerId ? `${node.routerId}:${trafficInterface}` : null;
                    const visualStats = trafficInterface ? (displayTrafficMap.get(routerPrefixedKey) || displayTrafficMap.get(trafficInterface)) : null;
                    const txRateThrottled = visualStats?.tx || node.txRate || 0;
                    const rxRateThrottled = visualStats?.rx || node.rxRate || 0;

                    // Live Stats (Lazy)
                    let txRateLive = 0;
                    let rxRateLive = 0;

                    if (isHovered && trafficInterface) {
                        const map = trafficMapRef.current;
                        const stats = map.get(routerPrefixedKey) || map.get(trafficInterface);
                        txRateLive = stats?.tx || 0;
                        rxRateLive = stats?.rx || 0;
                    }

                    return (
                        <MemoizedSmartMarker
                            key={`${node.routerId}-${node.id}`}
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
                            onClick={() => handleDeviceClick({ ...node, type: node.deviceType || 'client' }, node.deviceType || 'client')}
                            isHovered={isHovered}
                            // Pass tick to force re-render ONLY for hovered marker
                            tick={isHovered ? hoverTick : 0}
                            txRate={txRateThrottled} // For visual stability
                            rxRate={rxRateThrottled} // For visual stability
                            eventHandlers={{
                                mouseover: () => handleMarkerHover(node.id),
                                mouseout: () => handleMarkerHover(null)
                            }}
                        >
                            <DeviceTooltip
                                node={node}
                                line={line}
                                rxRate={isHovered ? rxRateLive : rxRateThrottled}
                                txRate={isHovered ? txRateLive : txRateThrottled}
                                timezone={timezone}
                                isHeatmapMode={isHeatmapMode}
                            />
                        </MemoizedSmartMarker>
                    );
                })}



                {/* PPPoE Client Markers */}
                {(mapData.pppoeNodes || []).filter(p =>
                    typeof p.lat === 'number' && typeof p.lng === 'number' &&
                    (!searchQuery || (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.address && p.address.includes(searchQuery)))
                ).map(pppoe => {
                    const line = linesByPppoeId[pppoe.id];
                    const isHovered = hoveredMarkerId === pppoe.id;

                    // Throttled Stats (Visuals)
                    const visualStats = displayTrafficMap.get(pppoe.name) || displayTrafficMap.get(pppoe.interface);
                    const txRateThrottled = visualStats?.tx || pppoe.txRate || 0;
                    const rxRateThrottled = visualStats?.rx || pppoe.rxRate || 0;

                    // Live Stats (Lazy)
                    let txRateLive = 0;
                    let rxRateLive = 0;
                    if (isHovered) {
                        const map = trafficMapRef.current;
                        const stats = map.get(pppoe.name) || map.get(pppoe.interface);
                        txRateLive = stats?.tx || 0;
                        rxRateLive = stats?.rx || 0;
                    }

                    return (
                        <MemoizedSmartMarker
                            key={`pppoe-${pppoe.id}`}
                            position={[pppoe.lat, pppoe.lng]}
                            type="pppoe"
                            status={pppoe.status}
                            name={pppoe.name}
                            showLabel={showLabels}
                            small={true}
                            draggable={isEditMode}
                            onDragEnd={(pos) => handlePppoeDragEnd(pppoe, pos)}
                            onClick={() => handleDeviceClick({ ...pppoe, deviceType: 'pppoe' }, 'pppoe')}
                            isHovered={isHovered}
                            tick={isHovered ? hoverTick : 0}
                            txRate={txRateThrottled} // For visual stability
                            rxRate={rxRateThrottled} // For visual stability
                            eventHandlers={{
                                mouseover: () => handleMarkerHover(pppoe.id),
                                mouseout: () => handleMarkerHover(null)
                            }}
                        >
                            <DeviceTooltip
                                node={{ ...pppoe, deviceType: 'pppoe' }}
                                line={line}
                                rxRate={isHovered ? rxRateLive : rxRateThrottled}
                                txRate={isHovered ? txRateLive : txRateThrottled}
                                timezone={timezone}
                                isHeatmapMode={isHeatmapMode}
                            />
                        </MemoizedSmartMarker>
                    );
                })}
            </>
        )
    }, [mapData, searchQuery, showLabels, isEditMode, handleDeviceClick, handlePppoeDragEnd, updateNetwatchMutation, timezone, hoveredRouterId, hoveredMarkerId, hoverTick, displayTrafficMap]); // Depend on hoverTick, NOT realtimeTraffic/trafficMap


    return (
        <main ref={mapContainerRef} className={`flex-1 relative flex flex-col bg-[#020617] overflow-hidden h-full ${lowPerfMode ? 'low-perf' : ''} map-type-${mapType}`}>
            <MapContainer
                center={center}
                zoom={10}
                maxZoom={20} // Fix: Map has no maxZoom specified error for clustering
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%", background: mapType === 'satellite_dark' ? '#000' : "#0f172a" }}
            >
                <MapAutoFit markers={allMarkers} isEditing={isEditMode || isEditingPath} />
                <MemoizedGoogleMapsLayer type={mapType} apiKey={apiKey} />


                {/* Animated Topology Lines (show when NOT editing) */}
                {/* Animated Topology Lines (show when NOT editing) */}
                {!isEditingPath && useMemo(() => mapData.lines.map((line) => {
                    const iface = line.targetInterface;
                    const isHovered = hoveredLineId === line.id;

                    // Throttled Stats for Visuals (Color/Thickness)
                    const routerPrefixedKey = line.routerId ? `${line.routerId}:${iface}` : null;
                    const stats = iface ? (displayTrafficMap.get(routerPrefixedKey) || displayTrafficMap.get(iface)) : null;
                    const txRateThrottled = stats?.tx || line.txRate || 0;
                    const rxRateThrottled = stats?.rx || line.rxRate || 0;

                    return (
                        <MemoizedNetworkLine
                            key={`line-${line.id}-${enableAnimation}`}
                            line={line}
                            txRate={txRateThrottled}
                            rxRate={rxRateThrottled}
                            isHeatmapMode={isHeatmapMode}
                            lineThickness={lineThickness}
                            mapColors={mapColors}
                            currentUser={currentUser}
                            enableAnimation={enableAnimation}
                            lowPerfMode={lowPerfMode}
                            timezone={timezone}
                            isHovered={isHovered}
                            tick={isHovered ? hoverTick : 0}
                            trafficMapRef={trafficMapRef} // Pass the ref
                            onMouseOver={() => handleLineHover(line.id)}
                            onMouseOut={() => handleLineHover(null)}
                        />
                    );
                }), [
                    mapData.lines,
                    displayTrafficMap,
                    hoveredLineId,
                    hoverTick, // Depend on tick, not trafficMap
                    trafficMapRef, // Stable ref
                    isHeatmapMode,
                    lineThickness,
                    mapColors,
                    currentUser,
                    enableAnimation,
                    lowPerfMode,
                    timezone
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
                                maxClusterRadius={60}
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
                                                const checked = e.target.checked;
                                                setIsHeatmapMode(checked);
                                                // If parent controls live mode, toggle it too
                                                if (onLiveModeChange) {
                                                    onLiveModeChange(checked);
                                                }
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
        </main >
    );
};

export default NetworkMap;
