import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser } from '@/hooks';
import useDeepCompareMemoize from '@/hooks/useDeepCompareMemoize';
import '@/lib/GoogleMutant';

// Import new map components
import {
    AnimatedPath,
    EditablePath,
    MapFAB,
    MapToolbar,
    MapLegend,
    DeviceModal,
    createDeviceIcon,
    LineThicknessControl,
    RouterTooltip,
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
                type: type === 'dark' ? 'roadmap' : type,
            };

            // Apply styles if dark mode
            if (type === 'dark') {
                layerOptions.styles = DARK_MAP_STYLES;
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
            const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));

            if (bounds.isValid()) {
                if (markers.length === 1) {
                    // If only one marker, center and zoom in
                    map.setView([markers[0].lat, markers[0].lng], 15);
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
    }), [onDragEnd, onClick]);

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
            {children}
        </DraggableMarker>
    );
};

// Custom Comparison Function to prevent re-renders when array refs change but values don't
const arePropsEqual = (prev, next) => {
    // 1. Check position by value (lat/lng)
    const posChanged = prev.position[0] !== next.position[0] || prev.position[1] !== next.position[1];
    if (posChanged) return false;

    // 2. Check other primitive props
    // Note: We ignore onClick and onDragEnd as they are often new function references but same logic
    // We ignore children (tooltip) assuming if status/name/etc match, tooltip is fine.
    // If tooltip relies on external data not passed as props, it won't update, but that's a trade-off for performance.
    return (
        prev.status === next.status &&
        prev.name === next.name &&
        prev.showLabel === next.showLabel &&
        prev.draggable === next.draggable &&
        prev.latency === next.latency &&
        prev.packetLoss === next.packetLoss &&
        prev.type === next.type &&
        prev.small === next.small &&
        // For draggable marker specifically
        prev.icon === next.icon
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

const NetworkMap = ({ routerId: filteredRouterId = null, showRoutersOnly = false }) => {
    const [mapType, setMapType] = useState('satellite'); // Changed default to satellite
    const [showLabels, setShowLabels] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    const [lineThickness, setLineThickness] = useState(4); // Changed default to 4
    const [isEditMode, setIsEditMode] = useState(false); // Master edit mode for dragging
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile menu toggle
    const [hoveredRouterId, setHoveredRouterId] = useState(null); // Track hovered router for tooltip fetching
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
        enabled: !!routersData && !showRoutersOnly,
        placeholderData: keepPreviousData,
        refetchInterval: 30000,
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

    // State for syncing indicator
    const [isSyncing, setIsSyncing] = useState(false);

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
                    })
                )
            );
            // Refresh the netwatch data
            if (!showRoutersOnly) {
                await refetchNetwatch();
            }
        } catch (err) {
            console.error('Manual sync failed:', err);
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
        },
    });

    // Mutation for updating netwatch
    const updateNetwatchMutation = useMutation({
        mutationFn: async ({ routerId, netwatchId, data }) => {
            const res = await apiClient.put(`/routers/${routerId}/netwatch/${netwatchId}`, data);
            return res.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
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
    const stableNetwatchData = useDeepCompareMemoize(netwatchData);
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

            if (!router.latitude || !router.longitude) return;
            const lat = parseFloat(router.latitude);
            const lng = parseFloat(router.longitude);
            const rNode = { ...router, lat, lng };
            routerNodes.push(rNode);
            routerMap.set(router.id, rNode);
        });

        // If showRoutersOnly is true, return early with just routers
        if (showRoutersOnly || !stableNetwatchData) {
            return { routers: routerNodes, nodes: [], lines: [] };
        }

        // Second pass: Create netwatch nodes and index them
        stableNetwatchData.forEach(nwGroup => {
            // Apply filtering
            if (filteredRouterId && nwGroup.routerId !== filteredRouterId) return;

            if (nwGroup.entries) {
                nwGroup.entries.forEach(entry => {
                    if (entry.latitude && entry.longitude) {
                        const lat = parseFloat(entry.latitude);
                        const lng = parseFloat(entry.longitude);
                        const node = { ...entry, lat, lng, routerId: nwGroup.routerId };
                        nodes.push(node);
                        deviceMap.set(entry.id, node);
                    }
                });
            }
        });

        // Third pass: Create lines based on connections
        nodes.forEach(node => {
            let fromPos = null;

            // Determine Source Position
            if (node.connectionType === 'client' && node.connectedToId) {
                // Connected to another client?
                const parentNode = deviceMap.get(node.connectedToId);
                if (parentNode) {
                    fromPos = [parentNode.lat, parentNode.lng];
                }
            }

            // Fallback to Router connection if no client parent found or connection type is router
            if (!fromPos) {
                // Try specific connectedToId if it matches a router
                if (node.connectionType === 'router' && node.connectedToId) {
                    const parentRouter = routerMap.get(node.connectedToId);
                    if (parentRouter) {
                        fromPos = [parentRouter.lat, parentRouter.lng];
                    }
                }

                // Final fallback: Use the routerId associated with the device
                if (!fromPos && node.routerId) {
                    const parentRouter = routerMap.get(node.routerId);
                    if (parentRouter) {
                        fromPos = [parentRouter.lat, parentRouter.lng];
                    }
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
                            });
                        }
                    }
                }
            });
        }

        return { routers: routerNodes, nodes, lines, pppoeNodes };
    }, [stableRoutersData, stableNetwatchData, stablePppoeData, filteredRouterId, showRoutersOnly]);

    const defaultCenter = [-8.8742173, 120.7290947];
    const center = mapData.routers.length > 0 ? [mapData.routers[0].lat, mapData.routers[0].lng] : defaultCenter;

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

        if (selectedDevice.type === 'router') {
            updateRouterMutation.mutate({
                routerId: selectedDevice.id,
                data: updatedData
            }, {
                onSettled: () => {
                    setIsSaving(false);
                    setIsModalOpen(false);
                }
            });
        } else if (selectedDevice.type === 'pppoe') {
            // For PPPoE we only update coords/waypoints usually via map
            // But if modal allows editing other things? Modal usually specifically for netwatch options
            // Assuming PPPoE editing is limited or uses updatePppoeMutation
            updatePppoeMutation.mutate({
                pppoeId: selectedDevice.id,
                data: updatedData
            }, {
                onSettled: () => {
                    setIsSaving(false);
                    setIsModalOpen(false);
                }
            });
        } else {
            // Netwatch
            updateNetwatchMutation.mutate({
                routerId: selectedDevice.routerId,
                netwatchId: selectedDevice.id,
                data: updatedData
            }, {
                onSettled: () => {
                    setIsSaving(false);
                    setIsModalOpen(false);
                }
            });
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
        setShowLabels(prev => !prev);
    }, []);

    // Find line for editing
    const editingLine = useMemo(() => {
        if (!isEditingPath || !editingDevice) return null;
        // Check both netwatch and pppoe lines
        return mapData.lines.find(l => l.netwatchId === editingDevice.id || l.pppoeId === editingDevice.id);
    }, [isEditingPath, editingDevice, mapData.lines]);

    // --- Stable Markers Generation ---
    const markers = useMemo(() => {
        return (
            <>
                {/* Router Markers */}
                {mapData.routers.filter(r => !searchQuery || (r.name && r.name.toLowerCase().includes(searchQuery.toLowerCase())) || (r.host && r.host.includes(searchQuery))).map(router => (
                    <DraggableMarker
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
                        onClick={() => handleDeviceClick(router, 'router')}
                    >
                        <RouterTooltip router={router} isHovered={hoveredRouterId === router.id} />
                    </DraggableMarker>
                ))}

                {/* Netwatch Node Markers */}
                {mapData.nodes.filter(n => !searchQuery || (n.name && n.name.toLowerCase().includes(searchQuery.toLowerCase())) || (n.host && n.host.includes(searchQuery))).map(node => {
                    // Find connected line to get source info
                    const line = mapData.lines.find(l => l.netwatchId === node.id);
                    return (
                        <MemoizedSmartMarker
                            key={`${node.routerId}-${node.id}`}
                            position={[node.lat, node.lng]}
                            type={node.deviceType}
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
                                    data: {
                                        latitude: String(pos[0]),
                                        longitude: String(pos[1])
                                    }
                                });
                            }}
                            onClick={() => handleDeviceClick({ ...node, type: node.deviceType || 'client' }, node.deviceType || 'client')}
                        >
                            <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
                                <div className="flex flex-col min-w-[200px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
                                    {/* Header */}
                                    <div className={`px-3 py-2 flex items-center justify-between ${node.status === 'up' ? 'bg-emerald-600' : 'bg-red-600'
                                        }`}>
                                        <div className="flex items-center gap-2 text-white">
                                            <span className="material-symbols-outlined text-[16px]">
                                                {node.deviceType === 'olt' ? 'hub' : node.deviceType === 'odp' ? 'settings_input_component' : 'person'}
                                            </span>
                                            <span className="font-bold text-xs truncate max-w-[100px]">{node.name || node.host}</span>
                                        </div>
                                        <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                            {node.status}
                                        </div>
                                    </div>
                                    {/* Body */}
                                    <div className="p-3 bg-slate-800 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-400">Host</span>
                                            <span className="text-slate-200 font-mono">{node.host}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2">
                                            <span className="text-slate-400">Type</span>
                                            <span className="text-slate-200 capitalize">{node.deviceType || 'client'}</span>
                                        </div>

                                        {/* Source & Distance Info */}
                                        {line && (
                                            <div className="space-y-2 border-b border-slate-700/50 pb-2">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Source</span>
                                                    <span className="text-slate-200 truncate max-w-[100px]" title={line.sourceName}>{line.sourceName}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Distance</span>
                                                    <span className="text-slate-200 font-mono">{formatDistance(line.distance)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Status Detail: Latency/Packet Loss OR Down Info */}
                                        {(node.status === 'up' || node.status === 'online') ? (
                                            (node.latency !== undefined && node.latency !== null) && (
                                                <div className="flex flex-col gap-1 pt-0.5">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-slate-400">Latency</span>
                                                        <span className={`font-mono font-bold ${Number(node.latency) < 20 ? 'text-emerald-400' :
                                                            Number(node.latency) < 100 ? 'text-yellow-400' : 'text-red-400'
                                                            }`}>
                                                            {node.latency} ms
                                                        </span>
                                                    </div>
                                                    {node.packetLoss > 0 && (
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-slate-400">Packet Loss</span>
                                                            <span className="font-mono font-bold text-red-400">
                                                                {node.packetLoss}%
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex flex-col gap-1 pt-0.5 text-xs text-red-300">
                                                {node.lastDown && (
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-400 mb-0.5">Down Since:</span>
                                                        <span className="font-mono bg-red-950/50 px-1.5 py-0.5 rounded border border-red-900/50">
                                                            {formatDateWithTimezone(node.lastDown, timezone)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Tooltip>
                        </MemoizedSmartMarker>
                    )
                })}



                {/* PPPoE Client Markers */}
                {
                    (mapData.pppoeNodes || []).filter(p => !searchQuery || (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.address && p.address.includes(searchQuery))).map(pppoe => (
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
                        >
                            <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
                                <div className="flex flex-col min-w-[220px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
                                    {/* Header */}
                                    <div className={`px-3 py-2 flex items-center justify-between ${['online', 'active', 'up'].includes(pppoe.status) ? 'bg-purple-600' : 'bg-slate-600'
                                        }`}>
                                        <div className="flex items-center gap-2 text-white">
                                            <span className="material-symbols-outlined text-[16px]">account_circle</span>
                                            <span className="font-bold text-xs truncate max-w-[140px]">{pppoe.name}</span>
                                        </div>
                                        <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                            PPPoE
                                        </div>
                                    </div>
                                    {/* Body */}
                                    <div className="p-3 bg-slate-800 space-y-3">
                                        {/* System Metrics */}
                                        {pppoe.address && (
                                            <div className="grid grid-cols-1 gap-2 text-xs">
                                                <div className="bg-slate-900/50 p-1.5 rounded border border-slate-700/30">
                                                    <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-0.5">IP Address</span>
                                                    <span className="text-slate-200 font-mono font-medium">{pppoe.address}</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1.5 border-t border-slate-700/50 pt-2">
                                            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium uppercase tracking-wider">
                                                <span className="material-symbols-outlined text-[14px]">info</span>
                                                Status
                                            </div>
                                            <div className="flex items-center justify-between text-xs bg-slate-900/30 px-2 py-1 rounded">
                                                <span className="text-slate-300">Connection</span>
                                                <span className={`font-mono font-bold ${['online', 'active', 'up'].includes(pppoe.status) ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {['online', 'active', 'up'].includes(pppoe.status) ? 'Online' : 'Offline'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Tooltip>
                        </MemoizedSmartMarker>
                    ))
                }
            </>
        )
    }, [mapData, searchQuery, showLabels, isEditMode, handleDeviceClick, handlePppoeDragEnd, updateNetwatchMutation, timezone, hoveredRouterId]);


    return (
        <main ref={mapContainerRef} className="flex-1 relative flex flex-col bg-[#0f172a] overflow-hidden h-full">
            <MapContainer
                center={center}
                zoom={10}
                maxZoom={20} // Fix: Map has no maxZoom specified error for clustering
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%", background: "#0f172a" }}
            >
                <MapAutoFit markers={allMarkers} isEditing={isEditMode || isEditingPath} />
                <MemoizedGoogleMapsLayer type={mapType} apiKey={apiKey} />


                {/* Animated Topology Lines (show when NOT editing) */}
                {!isEditingPath && mapData.lines.map((line) => {
                    const tooltipContent = `
                            <div class="flex flex-col min-w-[200px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
                                <div class="px-3 py-2 flex items-center justify-between ${line.status === 'up' ? 'bg-emerald-600' : 'bg-red-600'}">
                                    <div class="flex items-center gap-2 text-white">
                                        <span class="material-symbols-outlined text-[16px]">timeline</span>
                                        <span class="font-bold text-xs uppercase tracking-wide">Connection</span>
                                    </div>
                                    <div class="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                        ${line.status.toUpperCase()}
                                    </div>
                                </div>
                                <div class="p-3 bg-slate-800 space-y-2.5">
                                    <div class="space-y-2 border-b border-slate-700/50 pb-2.5">
                                        <div class="flex items-center justify-between text-xs group/item">
                                            <span class="text-slate-400 flex items-center gap-1">
                                                <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                                Source
                                            </span>
                                            <span class="text-slate-200 font-medium truncate max-w-[120px] ml-2" title="${line.sourceName}">${line.sourceName}</span>
                                        </div>
                                        <div class="flex items-center justify-between text-xs group/item">
                                            <span class="text-slate-400 flex items-center gap-1">
                                                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                                Target
                                            </span>
                                            <span class="text-slate-200 font-medium truncate max-w-[120px] ml-2" title="${line.destName}">${line.destName}</span>
                                        </div>
                                    </div>
                                    <div class="flex items-center justify-between text-xs">
                                        <span class="text-slate-400">Distance</span>
                                        <div class="flex items-center gap-1.5 text-slate-200 font-mono bg-slate-900/50 px-2 py-0.5 rounded">
                                            <span class="material-symbols-outlined text-[14px] text-slate-500">straighten</span>
                                            ${formatDistance(line.distance)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    return (
                        <AnimatedPath
                            key={`line-${line.id}`}
                            positions={[line.from, ...(line.waypoints || []), line.to]}
                            status={line.status}
                            type={line.deviceType}
                            animationStyle={currentUser?.animationStyle || 'default'}
                            delay={line.status === 'up' ? 800 : 400}
                            weight={line.status === 'up' ? lineThickness : Math.max(1, lineThickness - 1)}
                            enableAnimation={enableAnimation}
                            tooltip={tooltipContent}
                            popup={tooltipContent} // Fix: Add popup same as tooltip
                        />
                    );
                })}

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
                                    opacity: 1,
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
                                <option value="hybrid">Hybrid</option>
                                <option value="terrain">Terrain</option>
                                <option value="dark">Dark Mode</option>
                            </select>

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

                            {/* Edit Mode Toggle */}
                            <button
                                onClick={() => setIsEditMode(prev => !prev)}
                                className={`px-2 py-1.5 text-xs rounded flex items-center gap-2 sm:gap-1 transition-colors ${isEditMode
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
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
            />
        </main >
    );
};

export default NetworkMap;
