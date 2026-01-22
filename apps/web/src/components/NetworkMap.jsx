import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser } from '@/hooks';
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
} from './map';
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
            // Hide API Key from Inspect Element by removing the script tag
            // Note: Key is still visible in Network tab (cannot be hidden in client-side apps)
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

// Helper to auto-fit bounds to markers
const MapAutoFit = ({ markers, isEditing }) => {
    const map = useMap();

    useEffect(() => {
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

// Custom cluster icon creator
const createClusterCustomIcon = (cluster) => {
    const markers = cluster.getAllChildMarkers();
    let hasDown = false;
    let downCount = 0;

    for (const marker of markers) {
        // Access options passed to Marker via DraggableMarker
        if (marker.options.status === 'down' || marker.options.status === 'offline') {
            hasDown = true;
            downCount++;
        }
    }

    const childCount = cluster.getChildCount();

    return L.divIcon({
        html: `
            <div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                width: 100%; 
                height: 100%; 
                background-color: ${hasDown ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)'}; 
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
            </div>
        `,
        className: 'custom-cluster-marker', // Override default leaflet class
        iconSize: L.point(40, 40, true),
    });
};

const NetworkMap = ({ routerId: filteredRouterId = null, showRoutersOnly = false }) => {
    const [mapType, setMapType] = useState('hybrid');
    const [showLabels, setShowLabels] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    const [lineThickness, setLineThickness] = useState(3);
    const [isEditMode, setIsEditMode] = useState(false); // Master edit mode for dragging
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false); // Mobile menu toggle
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

    // Fetch Routers
    const { data: routersData } = useQuery({
        queryKey: ['routers'],
        queryFn: async () => {
            const res = await apiClient.get('/routers');
            return res.data.data;
        },
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

    // Combine Data
    const mapData = useMemo(() => {
        if (!routersData) return { routers: [], lines: [], nodes: [] };

        const nodes = [];
        const lines = [];
        const routerNodes = [];

        // First pass: Create lookup maps and router nodes
        const routerMap = new Map();
        const deviceMap = new Map();

        routersData.forEach(router => {
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
        if (showRoutersOnly || !netwatchData) {
            return { routers: routerNodes, nodes: [], lines: [] };
        }

        // Second pass: Create netwatch nodes and index them
        netwatchData.forEach(nwGroup => {
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
        if (pppoeData && Array.isArray(pppoeData)) {
            pppoeData.forEach(session => {
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
                            status: 'up', // Sessions in DB are always active
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
                                status: 'up',
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
    }, [routersData, netwatchData, pppoeData, filteredRouterId, showRoutersOnly]);

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
        setSelectedDevice({ ...device, deviceType: type });
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedDevice(null);
    }, []);

    const handleSaveDevice = useCallback(async (deviceData) => {
        setIsSaving(true);
        try {
            if (deviceData.deviceType === 'router') {
                // Update existing router
                await updateRouterMutation.mutateAsync({
                    routerId: deviceData.id,
                    data: {
                        name: deviceData.name,
                        latitude: deviceData.latitude,
                        longitude: deviceData.longitude,
                        notes: deviceData.notes,
                    },
                });
            } else if (deviceData.deviceType === 'pppoe' && deviceData.id) {
                // Update PPPoE session - uses separate endpoint
                await updatePppoeMutation.mutateAsync({
                    pppoeId: deviceData.id,
                    data: {
                        latitude: deviceData.latitude,
                        longitude: deviceData.longitude,
                        connectionType: deviceData.connectionType,
                        connectedToId: deviceData.connectedToId || null,
                    },
                });
            } else if (deviceData.id) {
                // Update existing Netwatch / Client / OLT / ODP
                await updateNetwatchMutation.mutateAsync({
                    routerId: deviceData.routerId || deviceData.connectedToId,
                    netwatchId: deviceData.id,
                    data: {
                        name: deviceData.name,
                        host: deviceData.host,
                        deviceType: deviceData.type || deviceData.deviceType,
                        latitude: deviceData.latitude,
                        longitude: deviceData.longitude,
                        connectionType: deviceData.connectionType,
                        connectedToId: deviceData.connectedToId,
                        notes: deviceData.notes,
                    },
                });
            } else {
                // Create new device (OLT, ODP, Client)
                let routerId = filteredRouterId;

                if (deviceData.connectedToId) {
                    // Check if connected directly to a router
                    const isRouter = mapData.routers.some(r => r.id === deviceData.connectedToId);
                    if (isRouter) {
                        routerId = deviceData.connectedToId;
                    } else {
                        // Connected to another node (ODP/OLT), find its routerId
                        const parentNode = mapData.nodes.find(n => n.id === deviceData.connectedToId);
                        if (parentNode) {
                            routerId = parentNode.routerId;
                        }
                    }
                }

                // Fallback to first router if still no ID
                if (!routerId) {
                    routerId = mapData.routers[0]?.id;
                }

                if (!routerId) {
                    throw new Error('No router available. Please add a router first.');
                }
                await createNetwatchMutation.mutateAsync({
                    routerId,
                    data: {
                        name: deviceData.name,
                        host: deviceData.host || '0.0.0.0', // Default IP for OLT/ODP
                        deviceType: deviceData.type || 'client',
                        latitude: deviceData.latitude,
                        longitude: deviceData.longitude,
                        connectionType: deviceData.connectionType,
                        connectedToId: deviceData.connectedToId,
                    },
                });
            }
            handleCloseModal();
        } catch (err) {
            console.error('Failed to save device:', err);
            alert('Failed to save device: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsSaving(false);
        }
    }, [updateRouterMutation, updateNetwatchMutation, createNetwatchMutation, updatePppoeMutation, handleCloseModal, mapData.routers]);

    const handleDeleteDevice = useCallback(async (device) => {
        console.log('Attempting to delete device:', device);

        // Only netwatch/client devices can be deleted from the map
        if (device.deviceType === 'router' || device.type === 'router') {
            alert('Router tidak bisa dihapus dari peta. Hapus melalui halaman Routers.');
            return;
        }

        if (!device.routerId || !device.id) {
            console.error('Invalid device data for deletion:', device);
            alert('Data perangkat tidak valid (missing routerId or id).');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                routerId: String(device.routerId),
                netwatchId: String(device.id),
            };
            console.log(`Deleting netwatch with payload:`, payload);
            await deleteNetwatchMutation.mutateAsync(payload);
            console.log('Device deleted successfully');
            handleCloseModal();
            // Force refetch
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
        } catch (err) {
            console.error('Failed to delete device:', err);
            alert('Gagal menghapus perangkat: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsSaving(false);
        }
    }, [deleteNetwatchMutation, handleCloseModal, queryClient]);

    const handleEditPath = useCallback((device) => {
        // Check for both netwatchId and pppoeId
        const line = mapData.lines.find(l => l.netwatchId === device.id || l.pppoeId === device.id);
        if (line) {
            setEditingDevice(device);
            setEditWaypoints(line.waypoints || []);
            setIsEditingPath(true);
        } else {
            console.warn('No line found for device:', device.id);
        }
    }, [mapData.lines]);

    const handleCancelPathEdit = useCallback(() => {
        setIsEditingPath(false);
        setEditingDevice(null);
        setEditWaypoints([]);
        setPathLength(0);
    }, []);

    const handleSavePath = useCallback(async () => {
        if (!editingDevice) return;

        setIsSaving(true);
        try {
            // Check if this is a PPPoE device or netwatch device
            if (editingDevice.deviceType === 'pppoe') {
                // Save PPPoE waypoints
                await apiClient.patch(`/pppoe/${editingDevice.id}/coordinates`, {
                    waypoints: JSON.stringify(editWaypoints),
                });
                queryClient.invalidateQueries({ queryKey: ['pppoe-map'] });
            } else {
                // Save netwatch waypoints
                await updateNetwatchMutation.mutateAsync({
                    routerId: editingDevice.routerId,
                    netwatchId: editingDevice.id,
                    data: {
                        waypoints: JSON.stringify(editWaypoints),
                    },
                });
            }
            handleCancelPathEdit();
        } catch (err) {
            console.error('Failed to save path:', err);
        } finally {
            setIsSaving(false);
        }
    }, [editingDevice, editWaypoints, updateNetwatchMutation, handleCancelPathEdit, queryClient]);

    const handleResetPath = useCallback(() => {
        setEditWaypoints([]);
    }, []);

    const handleAddDevice = useCallback((type) => {
        console.log('Add device of type:', type);
        setSelectedDevice({ deviceType: type, name: '', host: '' });
        setIsModalOpen(true);
    }, []);

    const handleToggleLabels = useCallback(() => {
        setShowLabels(prev => !prev);
    }, []);

    const handleMarkerDragEnd = useCallback(async (device, type, newPosition) => {
        try {
            if (type === 'router') {
                await updateRouterMutation.mutateAsync({
                    routerId: device.id,
                    data: {
                        latitude: newPosition[0].toString(),
                        longitude: newPosition[1].toString(),
                        notes: device.notes,
                    },
                });
            } else {
                await updateNetwatchMutation.mutateAsync({
                    routerId: device.routerId,
                    netwatchId: device.id,
                    data: {
                        latitude: newPosition[0].toString(),
                        longitude: newPosition[1].toString(),
                    },
                });
            }
        } catch (err) {
            console.error('Failed to update position:', err);
            // Refetch to revert position
            if (type === 'router') {
                queryClient.invalidateQueries({ queryKey: ['routers'] });
            } else {
                queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            }
        }
    }, [updateRouterMutation, updateNetwatchMutation, queryClient]);

    // Handle PPPoE marker drag
    const handlePppoeDragEnd = useCallback(async (pppoe, newPosition) => {
        try {
            await updatePppoeMutation.mutateAsync({
                pppoeId: pppoe.id,
                data: {
                    latitude: newPosition[0].toString(),
                    longitude: newPosition[1].toString(),
                },
            });
        } catch (err) {
            console.error('Failed to update PPPoE position:', err);
            queryClient.invalidateQueries({ queryKey: ['pppoe-map'] });
        }
    }, [updatePppoeMutation, queryClient]);

    // Find line for editing
    const editingLine = useMemo(() => {
        if (!isEditingPath || !editingDevice) return null;
        // Check both netwatch and pppoe lines
        return mapData.lines.find(l => l.netwatchId === editingDevice.id || l.pppoeId === editingDevice.id);
    }, [isEditingPath, editingDevice, mapData.lines]);

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
                <GoogleMapsLayer type={mapType} apiKey={apiKey} />

                {/* Animated Topology Lines (show when NOT editing) */}
                {!isEditingPath && mapData.lines.map((line) => (
                    <AnimatedPath
                        key={`line-${line.id}`}
                        positions={[line.from, ...(line.waypoints || []), line.to]}
                        status={line.status}
                        type={line.deviceType}
                        animationStyle={currentUser?.animationStyle || 'default'}
                        delay={line.status === 'up' ? 800 : 400}
                        weight={line.status === 'up' ? lineThickness : Math.max(1, lineThickness - 1)}
                        enableAnimation={enableAnimation}
                        tooltip={`
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
                        `}
                    />
                ))}

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

                {/* Router Markers */}

                {/* Markers with optional Clustering */}
                {(() => {
                    const markers = (
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
                                    draggable={isEditMode}
                                    onDragEnd={(pos) => handleMarkerDragEnd(router, 'router', pos)}
                                    onClick={() => handleDeviceClick(router, 'router')}
                                >
                                    <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
                                        <div className="flex flex-col min-w-[180px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
                                            {/* Header */}
                                            <div className={`px-3 py-2 flex items-center justify-between ${router.status === 'online' ? 'bg-emerald-600' : 'bg-red-600'
                                                }`}>
                                                <div className="flex items-center gap-2 text-white">
                                                    <span className="material-symbols-outlined text-[16px]">router</span>
                                                    <span className="font-bold text-xs truncate max-w-[120px]">{router.name}</span>
                                                </div>
                                                <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                                    {router.status}
                                                </div>
                                            </div>
                                            {/* Body */}
                                            <div className="p-3 bg-slate-800 space-y-2">
                                                <div className="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2">
                                                    <span className="text-slate-400">Host</span>
                                                    <span className="text-slate-200 font-mono">{router.host}</span>
                                                </div>
                                                {router.model && (
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-slate-400">Model</span>
                                                        <span className="text-slate-200">{router.model}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Tooltip>
                                </DraggableMarker>
                            ))}

                            {/* Netwatch Node Markers */}
                            {mapData.nodes.filter(n => !searchQuery || (n.name && n.name.toLowerCase().includes(searchQuery.toLowerCase())) || (n.host && n.host.includes(searchQuery))).map(node => (
                                <DraggableMarker
                                    key={node.id}
                                    status={node.status} // For cluster icon
                                    position={[node.lat, node.lng]}
                                    icon={createDeviceIcon({
                                        type: node.deviceType || 'client',
                                        status: node.status,
                                        name: showLabels ? (node.name || node.host) : '',
                                        showLabel: showLabels,
                                        small: true,
                                    })}
                                    draggable={isEditMode}
                                    onDragEnd={(pos) => handleMarkerDragEnd(node, 'client', pos)}
                                    onClick={() => handleDeviceClick(node, 'client')}
                                >
                                    <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
                                        <div className="flex flex-col min-w-[160px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
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
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Type</span>
                                                    <span className="text-slate-200 capitalize">{node.deviceType || 'client'}</span>
                                                </div>
                                                {(node.latency !== undefined && node.latency !== null) && (
                                                    <div className="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2 mt-1">
                                                        <span className="text-slate-400">Latency</span>
                                                        <span className={`font-mono font-bold ${Number(node.latency) < 20 ? 'text-emerald-400' :
                                                            Number(node.latency) < 100 ? 'text-yellow-400' : 'text-red-400'
                                                            }`}>
                                                            {node.latency} ms
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Tooltip>
                                </DraggableMarker>
                            ))}

                            {/* PPPoE Client Markers */}
                            {(mapData.pppoeNodes || []).filter(p => !searchQuery || (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) || (p.address && p.address.includes(searchQuery))).map(pppoe => (
                                <DraggableMarker
                                    key={`pppoe-${pppoe.id}`}
                                    status={pppoe.status} // For cluster icon
                                    position={[pppoe.lat, pppoe.lng]}
                                    icon={createDeviceIcon({
                                        type: 'pppoe',
                                        status: pppoe.status,
                                        name: showLabels ? pppoe.name : '',
                                        showLabel: showLabels,
                                        small: true,
                                    })}
                                    draggable={isEditMode}
                                    onDragEnd={(pos) => handlePppoeDragEnd(pppoe, pos)}
                                    onClick={() => handleDeviceClick({ ...pppoe, deviceType: 'pppoe' }, 'pppoe')}
                                >
                                    <Tooltip direction="top" offset={[0, -20]} opacity={1} className="custom-map-tooltip">
                                        <div className="flex flex-col min-w-[160px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden">
                                            <div className={`px-3 py-2 flex items-center justify-between ${pppoe.status === 'up' ? 'bg-purple-600' : 'bg-slate-600'}`}>
                                                <div className="flex items-center gap-2 text-white">
                                                    <span className="material-symbols-outlined text-[16px]">account_circle</span>
                                                    <span className="font-bold text-xs truncate max-w-[100px]">{pppoe.name}</span>
                                                </div>
                                                <div className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                                                    PPPoE
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-800 space-y-2">
                                                {pppoe.address && (
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-slate-400">IP</span>
                                                        <span className="text-slate-200 font-mono">{pppoe.address}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Status</span>
                                                    <span className="text-emerald-400">Online</span>
                                                </div>
                                                <div className="text-xs text-slate-500 text-center pt-1 border-t border-slate-700">
                                                    Klik untuk edit
                                                </div>
                                            </div>
                                        </div>
                                    </Tooltip>
                                </DraggableMarker>
                            ))}
                        </>
                    );

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

            </MapContainer>

            {/* Path Edit Toolbar */}
            {!showRoutersOnly && (
                <MapToolbar
                    isVisible={isEditingPath}
                    pathLength={pathLength}
                    onReset={handleResetPath}
                    onCancel={handleCancelPathEdit}
                    onSave={handleSavePath}
                />
            )}

            {/* Top Controls */}
            {!showRoutersOnly && (
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
            )}

            {/* Legend */}
            {!showRoutersOnly && (
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
            )}

            {/* Floating Action Button */}
            {!showRoutersOnly && (
                <MapFAB
                    onAddDevice={handleAddDevice}
                    disabled={isEditingPath}
                />
            )}

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
        </main>
    );
};

export default NetworkMap;
