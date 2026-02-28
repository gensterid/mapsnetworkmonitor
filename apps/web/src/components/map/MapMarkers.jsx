import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePingLatencies, useRouterHotspotActive, useRouterPppActive } from '@/hooks';
import { createDeviceIcon } from './DeviceIcon';
import { TrafficContext, HoveredItemContext } from './MapStyles';
import { formatShortDateTime } from '@/lib/timezone';

// Helper to auto-fit bounds to markers (only on initial load)
export const MapAutoFit = ({ markers, isEditing }) => {
    const map = useMap();
    const hasInitialFit = React.useRef(false);

    useEffect(() => {
        // Only fit bounds on initial load, not after updates
        if (hasInitialFit.current) return;
        // Don't auto-fit if we have no markers, OR if we are in an editing mode
        if (!markers || markers.length === 0 || isEditing) return;

        // Use a small delay to allow all data (Netwatch, PPPoE, etc.) to settle
        const timer = setTimeout(() => {
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
        }, 1000); // 1s debounce

        return () => clearTimeout(timer);
    }, [markers, map, isEditing]);

    return null;
};

// Component to handle marker drag events
export const DraggableMarker = ({
    position,
    icon,
    draggable,
    onDragEnd,
    onClick,
    eventHandlers: externalEventHandlers,
    title,
    alt,
    children,
    ...props
}) => {
    const [markerPosition, setMarkerPosition] = useState(position);
    const markerRef = React.useRef(null);

    useEffect(() => {
        setMarkerPosition(position);
    }, [position]);

    // Sync custom options to the Leaflet instance for clustering logic
    useEffect(() => {
        if (markerRef.current) {
            const marker = markerRef.current;
            // Update the options object directly so ClusterIcon.jsx (which reads L.Marker instances)
            // sees the latest values without needing a full marker destruction
            Object.assign(marker.options, {
                status: props.status,
                type: props.type,
                latency: props.latency,
                packetLoss: props.packetLoss,
                lastRxPower: props.lastRxPower,
                host: props.host
            });
        }
    }, [props.status, props.type, props.latency, props.packetLoss, props.lastRxPower, props.host]);

    const eventHandlers = useMemo(() => {
        const handlers = {
            dragend: (e) => {
                const newPos = e.target.getLatLng();
                setMarkerPosition([newPos.lat, newPos.lng]);
                if (onDragEnd) {
                    onDragEnd([newPos.lat, newPos.lng]);
                }
            },
            ...(externalEventHandlers || {})
        };

        if (typeof onClick === 'function') {
            handlers.click = onClick;
        }

        return handlers;
    }, [onDragEnd, onClick, externalEventHandlers]);

    const isValidPosition = Array.isArray(markerPosition) &&
        markerPosition.length === 2 &&
        typeof markerPosition[0] === 'number' &&
        typeof markerPosition[1] === 'number' &&
        isFinite(markerPosition[0]) &&
        isFinite(markerPosition[1]);

    if (!isValidPosition || !icon) {
        return null;
    }

    return (
        <Marker
            ref={markerRef}
            position={markerPosition}
            icon={icon}
            draggable={draggable}
            eventHandlers={eventHandlers}
            title={title}
            alt={alt}
            {...props}
        >
            {children}
        </Marker>
    );
};

// Helper to get consistent colors for tooltips and icons
export const getTooltipColor = (node) => {
    const type = node.deviceType || node.type || 'router';
    const status = (node.status || 'unknown').toLowerCase();
    const isOffline = ['down', 'offline', 'lost', 'power_down', 'dying_gasp', 'disable', 'disconnected', 'unknown'].includes(status) || !node.status;

    if (isOffline) return 'var(--map-color-offline, #EF4444)';

    // Performance/Warning checks (Consistent with DeviceIcon Smart Warning)
    const hasPerformanceIssue =
        (node.latency !== null && node.latency > 100) ||
        (node.packetLoss !== null && node.packetLoss > 0) ||
        (node.lastRxPower && parseFloat(node.lastRxPower) < -24);

    // Smart Warning: ODP only shows yellow if it has an IP host (monitored)
    if (hasPerformanceIssue && (type !== 'odp' || node.host)) {
        return 'var(--map-color-warning, #FACC15)';
    }

    if (type === 'odp') return 'var(--map-color-odp, #F97316)';
    if (type === 'pppoe') return 'var(--map-color-pppoe, #A855F7)';

    return 'var(--map-color-online, #10B981)';
};

// Memoized Tooltip for Devices
export const RouterTooltipContent = React.memo(({ node, onEdit }) => {
    const { timezone, isLiveMode } = React.useContext(TrafficContext);
    const hasWebhook = node.hasWebhook;
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

    // Prioritize physical OLT status if this Router/Netwatch node is linked to an ONU
    const rawStatus = (node.physicalStatus && node.physicalStatus !== 'unknown'
        ? node.physicalStatus
        : (node.status || 'unknown')).toLowerCase();

    // An ONU physical status of 'online' or Netwatch 'up' means it's up.
    const isUp = ['up', 'online', 'active'].includes(rawStatus);

    let displayStatus = rawStatus;
    if (!isUp) {
        if (rawStatus === 'power_down' || node.lastDownReason === 'Power Down') displayStatus = 'power_down';
        else if (rawStatus === 'dying_gasp' || node.lastDownReason === 'Dying Gasp') displayStatus = 'dying_gasp';
        else if (rawStatus === 'lost' || node.lastDownReason === 'Optical Loss') displayStatus = 'optical_loss';
        else if (rawStatus === 'offline' || rawStatus === 'down') displayStatus = 'down';
    }


    const getDownReason = (node) => {
        // 1. Explicit reason from Database/OLT (Highest Priority)
        const explicitReason = node.lastDownReason || node.last_down_reason;
        if (explicitReason && explicitReason !== 'Unknown') return explicitReason;

        // 2. Normal Up states but with warnings (New Logic)
        if (isUp) {
            if (node.lastRxPower) {
                const pwr = parseFloat(node.lastRxPower);
                if (!isNaN(pwr) && pwr < -24) return 'Low Optical Power (Warning)';
            }
            if (node.packetLoss !== null && node.packetLoss > 0) return `Packet Loss Detected (${node.packetLoss}%)`;
            if (node.latency !== null && node.latency > 100) return 'High Latency (> 100ms)';
            return 'Performance Issues';
        }

        // 3. Normalized OLT statuses
        if (displayStatus === 'power_down') return 'Power Down';
        if (displayStatus === 'dying_gasp') return 'Dying Gasp';
        if (displayStatus === 'optical_loss' || displayStatus === 'lost') return 'Optical Signal Loss';

        const signal = parseFloat(node.lastRxPower || node.last_rx_power);
        if (!isUp && !isNaN(signal) && signal < -27) return 'Optical Signal Loss';

        if (!isUp) {
            if (displayStatus === 'offline' || displayStatus === 'down' || displayStatus === 'unknown') return 'Connection Lost';
            return displayStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return 'Unknown';
    };

    // Determine if we should show the outage/warning reason section
    const showReasonSection = !isUp ||
        (node.latency !== null && node.latency > 100) ||
        (node.packetLoss !== null && node.packetLoss > 0) ||
        (node.lastRxPower && parseFloat(node.lastRxPower) < -24);

    return (
        <div className="flex flex-col min-w-[240px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: getTooltipColor(node) }}>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-white">
                        <span className="material-symbols-outlined text-[16px] text-white">router</span>
                        <span className="font-bold text-xs truncate max-w-[120px]">{node.name || node.host}</span>
                        {hasWebhook && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-400 text-slate-900 rounded text-[9px] font-bold animate-pulse shadow-[0_0_10px_rgba(250,204,21,0.5)]">
                                <span className="material-symbols-outlined text-[10px]">bolt</span>
                                REAL-TIME
                            </div>
                        )}
                    </div>
                    {node.model && (
                        <span className="text-[10px] text-white/80 pl-6 truncate max-w-[140px]">{node.model}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {displayStatus.replace(/_/g, ' ')}
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

                {/* Netwatch Timestamp Status Block if available */}
                {(!isUp || node.lastUpTime || node.lastDownTime) && (
                    <div className="space-y-1.5 border-t border-slate-700/50 pt-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Status</span>
                            <span className={isUp ? 'text-emerald-400 font-bold uppercase' : 'text-red-400 font-bold uppercase'}>
                                {displayStatus.replace(/_/g, ' ')}
                            </span>
                        </div>
                        {isUp && (node.lastUpTime || node.lastUp) && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Last Up</span>
                                <span className="text-emerald-400 font-mono text-[10px] truncate max-w-[120px]">
                                    {node.lastUpTime || (node.lastUp ? formatShortDateTime(node.lastUp, timezone) : '-')}
                                </span>
                            </div>
                        )}
                        {(!isUp || node.lastDownTime || node.lastDown) && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Last Down</span>
                                <span className="text-red-400 font-mono text-[10px] truncate max-w-[120px]">
                                    {node.lastDownTime || (node.lastDown ? formatShortDateTime(node.lastDown, timezone) : '-')}
                                </span>
                            </div>
                        )}
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

                {showReasonSection && (
                    <div className="space-y-3 border-t border-slate-700/50 pt-3 mt-1">
                        <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-wider">
                                {isUp ? 'Warning Reason' : 'Outage Reason'}
                            </span>
                            <span className={isUp ? 'text-yellow-400 text-xs font-bold' : 'text-orange-300 text-xs font-bold'}>
                                {getDownReason(node)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

// 1. Content Component (Heavy Logic, only rendered when hovered or clicked)
export const DeviceTooltipContent = ({ node, line, onEdit }) => {
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

    const formatOnuId = (ponId, onuId) => {
        if (!ponId || !onuId) return null;

        const oId = parseInt(onuId);

        if (!isNaN(oId) && oId >= 256) {
            // Absolute ID mapping: (Base | Port) << 8 | ONU
            // We use % 256 to safely strip the Base offset (often 256)
            const portPart = Math.floor(oId / 256);
            const ponNumber = portPart % 256;
            const formattedPon = `PON${String(ponNumber).padStart(2, '0')}`;
            const formattedOnu = oId % 256;
            return `${formattedPon}/${formattedOnu}`;
        }

        return `${ponId}-${onuId}`;
    };

    const rawStatus = (node.physicalStatus && node.physicalStatus !== 'unknown'
        ? node.physicalStatus
        : (node.status || 'unknown')).toLowerCase();

    const isUp = ['up', 'online', 'active'].includes(rawStatus);

    // Some OLTs provide detailed status like 'power_down', but it might be mapped
    // to just 'offline' in some places, while we still have 'lastDownReason'.
    // Let's create a displayStatus that prioritizes detail.
    let displayStatus = rawStatus;
    if (!isUp) {
        if (rawStatus === 'power_down' || node.lastDownReason === 'Power Down') displayStatus = 'power_down';
        else if (rawStatus === 'dying_gasp' || node.lastDownReason === 'Dying Gasp') displayStatus = 'dying_gasp';
        else if (rawStatus === 'lost' || node.lastDownReason === 'Optical Loss') displayStatus = 'optical_loss';
        else if (rawStatus === 'offline' || rawStatus === 'down') displayStatus = 'down';
    }

    const getDownReason = (node) => {
        // 1. Explicit reason from Database/OLT (Highest Priority)
        const explicitReason = node.lastDownReason || node.last_down_reason;
        if (explicitReason && explicitReason !== 'Unknown') return explicitReason;

        // 2. Normal Up states but with warnings (New Logic)
        if (isUp) {
            if (node.lastRxPower) {
                const pwr = parseFloat(node.lastRxPower);
                if (!isNaN(pwr) && pwr < -24) return 'Low Optical Power (Warning)';
            }
            if (node.packetLoss !== null && node.packetLoss > 0) return `Packet Loss Detected (${node.packetLoss}%)`;
            if (node.latency !== null && node.latency > 100) return 'High Latency (> 100ms)';
            return 'Performance Issues';
        }

        // 3. Normalized OLT statuses
        if (displayStatus === 'power_down') return 'Power Down';
        if (displayStatus === 'dying_gasp') return 'Dying Gasp';
        if (displayStatus === 'optical_loss' || displayStatus === 'lost') return 'Optical Signal Loss';

        // 4. Last Resort Fallback (Signal Analysis)
        const signal = parseFloat(node.lastRxPower || node.last_rx_power);
        if (!isUp && !isNaN(signal) && signal < -27) return 'Optical Signal Loss';

        // 5. Default generic status
        if (!isUp) {
            if (displayStatus === 'offline' || displayStatus === 'down' || displayStatus === 'unknown') return 'Connection Lost';
            return displayStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        return 'Unknown';
    };

    // Determine if we should show the outage/warning reason section
    const showReasonSection = !isUp ||
        (node.latency !== null && node.latency > 100) ||
        (node.packetLoss !== null && node.packetLoss > 0) ||
        (node.lastRxPower && parseFloat(node.lastRxPower) < -24);

    return (
        <div className="flex flex-col min-w-[200px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: getTooltipColor(node) }}>
                <div className="flex items-center gap-2 text-white">
                    <span className="material-symbols-outlined text-[16px]">
                        {node.deviceType === 'olt' ? 'hub' : node.deviceType === 'odp' ? 'settings_input_component' : (node.deviceType === 'router' || node.type === 'router') ? 'router' : node.deviceType === 'pppoe' ? 'person' : node.deviceType === 'onu' ? 'settings_input_antenna' : 'person'}
                    </span>
                    <span className="font-bold text-xs truncate max-w-[100px]">{node.name || node.host}</span>
                    {node.hasWebhook && (
                        <div className="flex items-center gap-1 px-1 py-0.5 bg-yellow-400 text-slate-900 rounded text-[8px] font-bold animate-pulse">
                            <span className="material-symbols-outlined text-[10px]">bolt</span>
                            REAL-TIME
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {displayStatus.replace(/_/g, ' ')}
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

                {/* Unified Linkage Metadata (Netwatch + ACS + OLT) */}
                {(node.model || node.sn || node.ssid || node.oltName || node.ponPort || node.lastRxPower) && (
                    <div className="space-y-1.5 py-1 pt-1 border-t border-slate-700/30">
                        {node.model && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Model</span>
                                <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.model}>{node.model}</span>
                            </div>
                        )}
                        {node.sn && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Serial</span>
                                <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.sn}>{node.sn}</span>
                            </div>
                        )}
                        {node.description && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Desc</span>
                                <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.description}>{node.description}</span>
                            </div>
                        )}
                        {node.ssid && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">SSID</span>
                                <span className="text-slate-200 font-mono truncate max-w-[120px]" title={node.ssid}>{node.ssid}</span>
                            </div>
                        )}
                        {node.oltName && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">OLT</span>
                                <span className="text-blue-400 font-mono truncate max-w-[100px]" title={node.oltName}>{node.oltName}</span>
                            </div>
                        )}
                        {node.ponId && node.onuId && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">PON / ID</span>
                                <span className="text-slate-200 font-mono">{formatOnuId(node.ponId, node.onuId)}</span>
                            </div>
                        )}
                        {!node.ponId && node.ponPort && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">PON Port</span>
                                <span className="text-slate-200 font-mono">{node.ponPort}</span>
                            </div>
                        )}
                        {node.lastRxPower && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Signal</span>
                                <span className={`font-mono font-bold ${parseFloat(node.lastRxPower) < -27 ? 'text-red-400' :
                                    parseFloat(node.lastRxPower) < -24 ? 'text-yellow-400' : 'text-emerald-400'
                                    }`}>
                                    {node.lastRxPower} dBm
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Status & Timing Block (Always shown if data exists) */}
                <div className="space-y-1.5 py-1 pt-1 border-t border-slate-700/30">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Status</span>
                        <span className={isUp ? 'text-emerald-400 font-bold uppercase' : 'text-red-400 font-bold uppercase'}>
                            {displayStatus.replace(/_/g, ' ')}
                        </span>
                    </div>
                    {isUp && (node.lastUpTime || node.lastUp) && (
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Last Up</span>
                            <span className="text-emerald-400 font-mono text-[10px] truncate max-w-[120px]">
                                {node.lastUpTime || (node.lastUp ? formatShortDateTime(node.lastUp, timezone) : '-')}
                            </span>
                        </div>
                    )}
                    {(!isUp || node.lastDownTime || node.lastDown) && (
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 uppercase text-[9px] font-bold tracking-tight">Last Down</span>
                            <span className="text-red-400 font-mono text-[10px] truncate max-w-[120px]">
                                {node.lastDownTime || (node.lastDown ? formatShortDateTime(node.lastDown, timezone) : '-')}
                            </span>
                        </div>
                    )}
                </div>
                {/* Show Down Reason only if UP but suspicious (e.g. low signal). If Offline, Outage Section handles it below. */}
                {isUp && (node.lastDownReason || ['lost', 'power_down', 'dying_gasp'].includes(status) || (node.lastRxPower && parseFloat(node.lastRxPower) < -27)) && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Status Detail</span>
                        <span className="text-amber-400 font-medium truncate max-w-[120px]" title={getDownReason(node)}>
                            {getDownReason(node)}
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
                {line ? (
                    <>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Source</span>
                            <span className="text-slate-200 truncate max-w-[100px]">{line.sourceName}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Distance</span>
                            <span className="text-slate-200 font-mono">{line.distance.toFixed(2)} m</span>
                        </div>
                        {/* Show parent specific info (OLT/ONU) */}
                        {line.parentData && line.parentData.deviceType === 'onu' && (
                            <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Parent OLT Info</div>
                                {line.parentData.oltName && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400">OLT</span>
                                        <span className="text-blue-400 font-mono">{line.parentData.oltName}</span>
                                    </div>
                                )}
                                {line.parentData.ponPort && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400">Port</span>
                                        <span className="text-slate-200 font-mono">{line.parentData.ponPort}</span>
                                    </div>
                                )}
                                {line.parentData.lastRxPower && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400">ONT Signal</span>
                                        <span className={`font-mono font-bold ${parseFloat(line.parentData.lastRxPower) < -27 ? 'text-red-400' :
                                            parseFloat(line.parentData.lastRxPower) < -24 ? 'text-yellow-400' : 'text-emerald-400'
                                            }`}>
                                            {line.parentData.lastRxPower} dBm
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (node.connectionType === 'client' && node.connectedToId) ? (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Connection</span>
                        <span className="text-slate-200">Linked to Client</span>
                    </div>
                ) : null}
                {isUp && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Latency</span>
                        <span className="text-emerald-400 font-bold">{node.latency} ms</span>
                    </div>
                )}
                {showReasonSection && (
                    <div className="space-y-3 border-t border-slate-700/50 pt-3 mt-1">
                        <div className="flex flex-col gap-1">
                            <span className="text-slate-400 text-[10px] uppercase tracking-wider">
                                {isUp ? 'Warning Reason' : 'Outage Reason'}
                            </span>
                            <span className={isUp ? 'text-yellow-400 text-xs font-bold' : 'text-orange-300 text-xs font-bold'}>
                                {getDownReason(node)}
                            </span>
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
export const DeviceTooltip = React.memo(({ node, line }) => {
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
export const DevicePopup = React.memo(({ node, line, onEdit }) => {
    return (
        <Popup offset={[0, -10]} className="custom-map-popup">
            <DeviceTooltipContent node={node} line={line} onEdit={onEdit} />
        </Popup>
    );
});

// Wrapper that handles icon creation internally to ensure prop stability for memoization
export const SmartMarker = ({
    position,
    type,
    status,
    name,
    showLabel,
    small,
    latency,
    packetLoss,
    hasWebhook,
    lastErrorMessage,
    draggable,
    onDragEnd,
    onClick,
    eventHandlers,
    id,
    children,
    ...props
}) => {
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
        packetLoss: safePacketLoss,
        hasWebhook,
        lastErrorMessage,
        lastRxPower: props.lastRxPower || props.last_rx_power || null,
        host: props.host || null
    }), [type, status, name, showLabel, small, safeLatency, safePacketLoss, hasWebhook, lastErrorMessage, props.lastRxPower, props.last_rx_power, props.host]);

    return (
        <DraggableMarker
            position={position}
            icon={icon}
            draggable={draggable}
            onDragEnd={onDragEnd}
            onClick={onClick}
            eventHandlers={eventHandlers}
            status={status}
            type={type}
            latency={safeLatency}
            packetLoss={safePacketLoss}
            lastErrorMessage={lastErrorMessage}
            lastRxPower={props.lastRxPower || props.last_rx_power || null}
            host={props.host}
            {...props}
        >
            {children}
        </DraggableMarker>
    );
};

// Custom Comparison Function to prevent re-renders when array refs change but values don't
export const arePropsEqual = (prev, next) => {
    // 1. Check position by value (lat/lng) - Support both Array and Leaflet LatLng objects
    if (!prev.position || !next.position) return false;

    // Normalize positions to [lat, lng] for comparison
    const getPos = (p) => {
        if (Array.isArray(p)) return p;
        if (p && typeof p.lat === 'number') return [p.lat, p.lng];
        return [0, 0];
    };

    const p1 = getPos(prev.position);
    const p2 = getPos(next.position);

    const posChanged = p1[0] !== p2[0] || p1[1] !== p2[1];
    if (posChanged) return false;

    // 2. Check other primitive props
    return (
        prev.status === next.status &&
        prev.name === next.name &&
        prev.host === next.host &&
        prev.showLabel === next.showLabel &&
        prev.draggable === next.draggable &&
        prev.latency === next.latency &&
        prev.packetLoss === next.packetLoss &&
        prev.lastErrorMessage === next.lastErrorMessage &&
        prev.type === next.type &&
        prev.small === next.small &&
        prev.icon === next.icon &&
        prev.isHeatmapMode === next.isHeatmapMode &&
        prev.id === next.id
    );
};

// Strict memoization for the SmartMarker with custom check
export const MemoizedSmartMarker = React.memo(SmartMarker, arePropsEqual);

// Memoized Marker to prevent re-renders unless position/status changes
export const MemoizedDraggableMarker = React.memo(DraggableMarker, arePropsEqual);
