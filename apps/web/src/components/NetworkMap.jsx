import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser, usePingLatencies, useRouterHotspotActive, useRouterPppActive, useAppTimezone } from '@/hooks';
import useDeepCompareMemoize from '@/hooks/useDeepCompareMemoize';
import '@/lib/GoogleMutant';
import { toast } from 'react-hot-toast';

const MapZoomHandler = ({ onZoomChange }) => {
    const map = useMap();
    useEffect(() => {
        const handleZoom = () => onZoomChange(map.getZoom());
        map.on('zoomend', handleZoom);
        // Initial set
        handleZoom();
        return () => map.off('zoomend', handleZoom);
    }, [map, onZoomChange]);
    return null;
};

const MapClickHandler = ({ enabled, onMapClick }) => {
    const map = useMap();
    
    useEffect(() => {
        if (!enabled) return;
        
        const handleClick = (e) => {
            console.log('Map capture click handled:', e.latlng);
            onMapClick([e.latlng.lat, e.latlng.lng]);
        };
        
        map.on('click', handleClick);
        return () => map.off('click', handleClick);
    }, [map, enabled, onMapClick]);
    
    return null;
};

// Import map components (existing + newly extracted)
import {
    AnimatedPath,
    AntPath,
    EditablePath,
    MapFAB,
    MapToolbar,
    MapLegend,
    MapControls,
    DeviceModal,
    createDeviceIcon,
    LineThicknessControl,
    RouterTooltip,
    getAnimationStyle,
    DEFAULT_MAP_COLORS,
    // Extracted components
    TrafficContext,
    HoveredItemContext,
    MemoizedGoogleMapsLayer,
    createClusterCustomIcon,
    MapAutoFit,
    DraggableMarker,
    SmartMarker,
    MemoizedSmartMarker,
    MemoizedDraggableMarker,
    getTooltipColor,
    RouterTooltipContent,
    DeviceTooltipContent,
    DeviceTooltip,
    DevicePopup,
    arePropsEqual,
    MemoizedNetworkLine,
    areLinesEqual,
    formatBitrate,
    UnplacedDevicesDrawer,
    PlacementToolbar,
} from './map';
import { formatDateWithTimezone, formatShortDateTime } from '@/lib/timezone';
import './map/map.css';
// Marker Cluster CSS
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { calculatePathLength, formatDistance } from '@/lib/geo';



const NetworkMap = ({
    routerId: filteredRouterId = null,
    showRoutersOnly = false,
    netwatchOverride = null,
    realtimeTraffic = null,
    isLiveMode = false,
    onLiveModeChange = null,
    disableScaling = false,
    onMarkerClick = null
}) => {
    // 1. Hooks & Data Fetching (Must be at the top)
    const queryClient = useQueryClient();
    const { data: settings } = useSettings();
    const { data: currentUser } = useCurrentUser();
    const apiKey = settings?.googleMapsApiKey;
    const timezone = useAppTimezone();

    // Fetch Routers
    const { data: routersData } = useQuery({
        queryKey: ['routers'],
        queryFn: async () => {
            const res = await apiClient.get('/routers');
            return res.data.data;
        },
        staleTime: 60000, // 1 minute
        placeholderData: keepPreviousData,
    });

    // Batch Fetch all Netwatch entries
    const { data: netwatchDataBatch, refetch: refetchNetwatch } = useQuery({
        queryKey: ['netwatch-all'],
        queryFn: async () => {
            const res = await apiClient.get('/routers/netwatch-all');
            return res.data.data || [];
        },
        staleTime: 60000,
        placeholderData: keepPreviousData,
        refetchInterval: 30000,
        enabled: !netwatchOverride,
    });

    // Memoize and filter netwatch data locally for compatibility with existing code
    const netwatchData = useMemo(() => {
        if (!netwatchDataBatch) return [];

        // Transform batch data into the grouped format expected by the rest of the file
        // [{ routerId: string, entries: [] }, ...]
        const grouped = new Map();
        netwatchDataBatch.forEach(entry => {
            if (!grouped.has(entry.routerId)) {
                grouped.set(entry.routerId, []);
            }
            grouped.get(entry.routerId).push(entry);
        });

        const formatted = Array.from(grouped.entries()).map(([routerId, entries]) => ({
            routerId,
            entries
        }));

        return filteredRouterId
            ? formatted.filter(f => f.routerId === filteredRouterId)
            : formatted;
    }, [netwatchDataBatch, filteredRouterId]);

    // Fetch PPPoE (all sessions — the map/unplaced logic handles placed vs unplaced filtering)
    const { data: pppoeData } = useQuery({
        queryKey: ['pppoe-all', filteredRouterId],
        queryFn: async () => {
            const url = filteredRouterId ? `/pppoe?routerId=${filteredRouterId}` : '/pppoe';
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
            return res.data.data;
        },
        enabled: !showRoutersOnly,
        staleTime: 60000,
        placeholderData: keepPreviousData,
    });

    // Stable Data Memoization
    const stableRoutersData = useDeepCompareMemoize(routersData);
    const stableNetwatchData = useDeepCompareMemoize(netwatchOverride || netwatchData);
    const stablePppoeData = useDeepCompareMemoize(pppoeData);
    const stableOnusMapData = useDeepCompareMemoize(onusMapData);
    const stableRealtimeTraffic = useDeepCompareMemoize(realtimeTraffic);

    // UI & Interactive State (Moved to top to prevent ReferenceError)
    const [mapType, setMapType] = useState(() => {
        const saved = localStorage.getItem('map_type_preference');
        return saved || 'roadmap'; // Default to roadmap for better initial load
    });
    const [showLabels, setShowLabels] = useState(() => {
        try { const saved = localStorage.getItem('map_show_labels'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : true; } catch { return true; }
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialTab, setModalInitialTab] = useState('settings');
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    const [lineThickness, setLineThickness] = useState(4);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPickingCoordinate, setIsPickingCoordinate] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hoveredMarkerId, setHoveredMarkerId] = useState(null); // Consolidating all marker hover here
    const [hoveredLineId, setHoveredLineId] = useState(null);
    const mapContainerRef = React.useRef(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [googleLoaded, setGoogleLoaded] = useState(() => !!window.google?.maps);
    const [googleFailed, setGoogleFailed] = useState(false);
    const [googleErrorType, setGoogleErrorType] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(10);

    // Performance optimization states
    const [enableAnimation, setEnableAnimation] = useState(() => {
        try { const saved = localStorage.getItem('map_animation_enabled'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : true; } catch { return true; }
    });
    const [enableClustering, setEnableClustering] = useState(() => {
        try { const saved = localStorage.getItem('map_clustering_enabled'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : true; } catch { return true; }
    });
    const [lowPerfMode, setLowPerfMode] = useState(() => {
        try { const saved = localStorage.getItem('map_low_perf_enabled'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : false; } catch { return false; }
    });
    const [isHeatmapMode, setIsHeatmapMode] = useState(false);

    // Quick Placement State
    const [isPlacementModeOpen, setIsPlacementModeOpen] = useState(() => {
        try { const saved = localStorage.getItem('map_placement_mode_enabled'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : false; } catch { return false; }
    });
    const [selectedUnplacedDevice, setSelectedUnplacedDevice] = useState(null);

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
    // Debounced Hover Handlers
    const handleLineHover = useCallback((id) => {
        if (lineHoverTimeout.current) clearTimeout(lineHoverTimeout.current);
        if (id === null) {
            // Immediate clear for better responsiveness when leaving
            setHoveredLineId(null);
            return;
        }
        lineHoverTimeout.current = setTimeout(() => {
            setHoveredLineId(id);
        }, 50); // 50ms delay to prevent jitter
    }, []);

    const handleMarkerHover = useCallback((id) => {
        if (markerHoverTimeout.current) clearTimeout(markerHoverTimeout.current);
        if (id === null) {
            setHoveredMarkerId(null);
            return;
        }
        markerHoverTimeout.current = setTimeout(() => {
            setHoveredMarkerId(id);
        }, 50);
    }, []);

    // Stable Load/Error Handlers for Google Maps (Defined at top level to satisfy Rules of Hooks)
    const handleGoogleLoaded = useCallback(() => {
        setGoogleLoaded(true);
        setGoogleFailed(false);
        setGoogleErrorType(null);
    }, []);

    const handleGoogleError = useCallback((type) => {
        setGoogleFailed(true);
        setGoogleErrorType(type);
    }, []);

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

    // Google Maps Loading Timeout & Reset
    useEffect(() => {
        if (!googleLoaded && apiKey && !googleFailed) {
            const timer = setTimeout(() => {
                if (!googleLoaded) {
                    console.warn("Google Maps loading timeout. Falling back to OSM.");
                    setGoogleFailed(true);
                    setGoogleErrorType('TIMEOUT');
                }
            }, 10000); // 10 seconds
            return () => clearTimeout(timer);
        }
    }, [googleLoaded, apiKey, googleFailed]);

    useEffect(() => {
        // Reset loading status when key changes (e.g. switching ISP)
        setGoogleFailed(false);
        setGoogleErrorType(null);
        setGoogleLoaded(!!window.google?.maps);
    }, [apiKey]);

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
        onMutate: async ({ netwatchId, data }) => {
            await queryClient.cancelQueries({ queryKey: ['netwatch-all'] });
            const previousData = queryClient.getQueryData(['netwatch-all']);
            queryClient.setQueryData(['netwatch-all'], (old) => {
                if (!old || !Array.isArray(old)) return old;
                return old.map(item =>
                    item.id === netwatchId ? { ...item, ...data } : item
                );
            });
            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['netwatch-all'], context.previousData);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            toast.success('Device configuration saved successfully.');
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
        mutationFn: async ({ routerId, netwatchId, deleteFromMikrotik = true }) => {
            const res = await apiClient.delete(`/routers/${routerId}/netwatch/${netwatchId}?deleteFromMikrotik=${deleteFromMikrotik}`);
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
        onMutate: async ({ pppoeId, data }) => {
            await queryClient.cancelQueries({ queryKey: ['pppoe-all'] });
            const previousData = queryClient.getQueryData(['pppoe-all']);
            queryClient.setQueryData(['pppoe-all'], (old) => {
                if (!old || !Array.isArray(old)) return old;
                return old.map(item =>
                    item.id === pppoeId ? { ...item, ...data } : item
                );
            });
            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['pppoe-all'], context.previousData);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pppoe-all'] });
        },
    });

    // Mutation for updating ONU coordinates (Passive Nodes)
    const updateOnuMutation = useMutation({
        mutationFn: async ({ oltId, onuId, data }) => {
            const res = await apiClient.patch(`/olts/${oltId}/onus/${onuId}`, data);
            return res.data;
        },
        onMutate: async ({ onuId, data }) => {
            await queryClient.cancelQueries({ queryKey: ['onus-map'] });
            const previousData = queryClient.getQueryData(['onus-map']);
            queryClient.setQueryData(['onus-map'], (old) => {
                if (!old || !Array.isArray(old)) return old;
                return old.map(item =>
                    item.id === onuId ? { ...item, ...data } : item
                );
            });
            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['onus-map'], context.previousData);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });
            toast.success('ONU configuration saved successfully.');
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

    // Inject CSS variable for dynamic zoom scaling
    useEffect(() => {
        const root = document.documentElement;
        if (root) {
            // Scaled scaling logic for 32px Max Size (0.89x of base 36px)
            // Zoom 18+: 0.89x (32px)
            // Zoom 15: ~0.62x (22px)
            // Zoom 12: ~0.40x (14px)
            const scale = disableScaling ? 1 : Math.max(0.15, Math.min(0.89, (zoomLevel / 18) ** 2 * 0.89));
            root.style.setProperty('--map-zoom-scale', scale.toFixed(2));
        }

        const mapContainer = mapContainerRef.current;
        if (mapContainer) {
            // Auto-hide labels logic - Conservative (Zoom < 15)
            if (zoomLevel < 15 && !disableScaling) {
                mapContainer.classList.add('hide-labels-auto');
            } else {
                mapContainer.classList.remove('hide-labels-auto');
            }

            // Dot mode logic - Conservative (Zoom < 12)
            if (zoomLevel < 12 && !disableScaling) {
                mapContainer.classList.add('dot-mode');
            } else {
                mapContainer.classList.remove('dot-mode');
            }
        }
    }, [zoomLevel, disableScaling]);

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

        // Second pass: Create netwatch and PPPoE nodes and index them
        const nodesBySN = new Map();
        const nodesByHost = new Map();

        const netwatchDataToUse = stableNetwatchData || [];
        netwatchDataToUse.forEach(nwGroup => {
            if (filteredRouterId && nwGroup.routerId !== filteredRouterId) return;

            if (nwGroup.entries) {
                nwGroup.entries.forEach((entry) => {
                    let lat = null, lng = null;
                    if (entry.latitude && entry.longitude &&
                        !isNaN(parseFloat(entry.latitude)) && !isNaN(parseFloat(entry.longitude)) &&
                        parseFloat(entry.latitude) !== 0 && parseFloat(entry.longitude) !== 0) {
                        lat = parseFloat(entry.latitude);
                        lng = parseFloat(entry.longitude);

                        const node = { ...entry, lat, lng, routerId: nwGroup.routerId, type: entry.deviceType || 'netwatch' };
                        nodes.push(node);
                        deviceMap.set(entry.id, node);

                        if (node.sn) nodesBySN.set(node.sn, node);
                        if (node.host) nodesByHost.set(node.host, node);
                    }
                });
            }
        });

        const pppoeNodesList = [];
        if (stablePppoeData && Array.isArray(stablePppoeData)) {
            stablePppoeData.forEach(session => {
                const lat = parseFloat(session.latitude);
                const lng = parseFloat(session.longitude);
                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    const node = {
                        ...session,
                        lat,
                        lng,
                        type: 'pppoe',
                        deviceType: 'pppoe',
                        status: (session.status === 'active' || session.status === 'up') ? 'online' : 'offline',
                    };
                    pppoeNodesList.push(node);
                    deviceMap.set(session.id, node);

                    if (node.sn) nodesBySN.set(node.sn, node);
                    if (node.host || node.address) nodesByHost.set(node.host || node.address, node);
                }
            });
        }

        // 2.5 pass: Create Passive Inventory nodes (ONUs) OR enrich existing markers
        const onusMapDataToUse = stableOnusMapData || [];
        onusMapDataToUse.forEach(onu => {
            if (filteredRouterId && onu.routerId !== filteredRouterId) return;

            const lat = parseFloat(onu.latitude);
            const lng = parseFloat(onu.longitude);

            if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
                return;
            }

            const existingNode = (onu.sn && nodesBySN.get(onu.sn)) || (onu.host && nodesByHost.get(onu.host));

            if (existingNode) {
                // Determine accurate OLT values (Support both camelCase and snake_case from API)
                const onuStatus = (onu.status || '').toLowerCase();
                const onuReason = onu.lastDownReason || onu.last_down_reason;
                const onuLastDown = onu.lastDown || onu.last_down || onu.lastSeen || onu.last_seen;
                const onuSignal = onu.lastRxPower || onu.last_rx_power || onu.signal;

                existingNode.oltName = onu.oltName || onu.olt_name;
                existingNode.ponPort = onu.ponPort || onu.pon_port;
                existingNode.oltId = onu.oltId || onu.olt_id; // CRITICAL: Preserved for move mutation
                existingNode.lastRxPower = onuSignal || existingNode.lastRxPower;
                existingNode.linkedOnuId = onu.id;
                existingNode.sn = onu.sn || existingNode.sn;

                // Prioritize explicit OLT data over Netwatch/PPPoE generic one
                if (onuReason) existingNode.lastDownReason = onuReason;
                if (onuLastDown) existingNode.lastDown = onuLastDown;

                // Update status if it's a specific OLT outage status (CRITICAL FIX)
                if (['power_down', 'dying_gasp', 'lost'].includes(onuStatus)) {
                    existingNode.status = onuStatus;
                }

                deviceMap.set(onu.id, existingNode);
            } else {
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

        // 2.9 pass: Pre-calculate child counts for port capacity tracking
        const childCounts = new Map();
        [...nodes, ...pppoeNodesList].forEach(n => {
            if (n.connectedToId) {
                childCounts.set(n.connectedToId, (childCounts.get(n.connectedToId) || 0) + 1);
            }
        });

        // 3.0 pass: Create lines for ALL indexed devices and enrich with port info
        const allDevices = [...nodes, ...pppoeNodesList];
        allDevices.forEach(node => {
            // Enrich with port info
            node.usedPorts = childCounts.get(node.id) || 0;
            // Default portCapacity is 8 if not specified (legacy or default)
            node.portCapacity = node.portCapacity || 8;

            let fromPos = null;
            let sourceName = 'Unknown';

            // Determine Source Position (Robust Fallback Logic)
            if (node.connectionType === 'client' && node.connectedToId) {
                // 1. Try connecting to Parent Client (can be Netwatch or PPPoE now!)
                const parentNode = deviceMap.get(node.connectedToId);
                if (parentNode) {
                    fromPos = [parentNode.lat, parentNode.lng];
                    sourceName = parentNode.name || parentNode.host || 'Unknown Client';
                }
            } else if (node.connectionType === 'router' && node.connectedToId) {
                // 2. Try connecting to Parent Router
                const parentRouter = routerMap.get(node.connectedToId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                    sourceName = parentRouter.name;
                }
            }

            // 3. FALLBACK: Connect to Main Router if no parent found
            if (!fromPos && node.routerId) {
                const parentRouter = routerMap.get(node.routerId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                    sourceName = parentRouter.name;
                }
            }

            if (fromPos) {
                const waypoints = node.waypoints ? (typeof node.waypoints === 'string' ? JSON.parse(node.waypoints) : node.waypoints) : [];
                const fullPath = [fromPos, ...waypoints, [node.lat, node.lng]];
                const distance = calculatePathLength(fullPath);

                // Determine Traffic Interface (with Inheritance for Netwatch)
                let trafficInterface = node.targetInterface;
                let trafficSourceDevice = null;

                if (!trafficInterface && node.type !== 'pppoe') {
                    const findInheritedInterface = (currentNode) => {
                        if (currentNode.targetInterface) return { iface: currentNode.targetInterface, device: currentNode.name || currentNode.host };
                        if (currentNode.connectionType === 'client' && currentNode.connectedToId) {
                            const parent = deviceMap.get(currentNode.connectedToId);
                            if (parent) return findInheritedInterface(parent);
                        }
                        return null;
                    };
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
                    id: node.type === 'pppoe' ? `pppoe-${node.id}` : `${node.routerId}-${node.id}`,
                    routerId: node.routerId,
                    netwatchId: node.type !== 'pppoe' ? node.id : undefined,
                    pppoeId: node.type === 'pppoe' ? node.id : undefined,
                    from: fromPos,
                    to: [node.lat, node.lng],
                    status: node.type === 'pppoe' ? (node.status === 'online' ? 'up' : 'down') : node.status,
                    waypoints: waypoints,
                    sourceName,
                    destName: node.name || node.host,
                    distance,
                    deviceType: node.deviceType,
                    latency: node.latency || node.lastLatency,
                    packetLoss: node.packetLoss,
                    targetInterface: trafficInterface || (node.type === 'pppoe' ? node.name : undefined),
                    inheritedFrom: trafficSourceDevice,
                    txRate: node.txRate,
                    rxRate: node.rxRate,
                    // Pass parent metadata for the tooltip/popup
                    parentData: (node.connectionType === 'client' && node.connectedToId)
                        ? deviceMap.get(node.connectedToId)
                        : (node.linkedOnuId ? deviceMap.get(node.linkedOnuId) : null)
                });
            }
        });

        return { routers: routerNodes, nodes, lines, pppoeNodes: pppoeNodesList };
    }, [stableRoutersData, stableNetwatchData, stablePppoeData, stableOnusMapData, filteredRouterId, showRoutersOnly]);

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

    const allMarkers = useMemo(() => [
        ...mapData.routers,
        ...mapData.nodes,
        ...(mapData.pppoeNodes || [])
    ], [mapData.routers, mapData.nodes, mapData.pppoeNodes]);

    // Force cluster refresh when down counts change
    const downHash = useMemo(() => {
        return allMarkers.reduce((acc, m) => {
            const isDown = ['down', 'offline', 'lost', 'power_down', 'dying_gasp'].includes(m.status);
            return acc + (isDown ? 1 : 0);
        }, 0);
    }, [allMarkers]);

    // Handlers
    const handleDeviceClick = useCallback((device, type, initialTab = 'settings') => {
        setSelectedDevice({ ...device, type });
        setModalInitialTab(initialTab);
        setIsModalOpen(true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedDevice(null);
        setIsPickingCoordinate(false);
    }, []);

    const handlePickCoordinate = useCallback((pos) => {
        if (!selectedDevice) return;

        // Force update the selected item with new coordinates
        setSelectedDevice(prev => ({
            ...prev,
            latitude: String(pos[0]),
            longitude: String(pos[1]),
            lat: pos[0], // for compatibility
            lng: pos[1]
        }));

        setIsPickingCoordinate(false);
        toast.success(`Koordinat diambil: ${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}`);
    }, [selectedDevice]);

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
                    setSelectedDevice(null);
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
                    setSelectedDevice(null);
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
                    setSelectedDevice(null);
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
                        setSelectedDevice(null);
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
                        setSelectedDevice(null);
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

    const handleDeleteDevice = (deleteFromMikrotik) => {
        if (!selectedDevice) return;
        deleteNetwatchMutation.mutate({
            routerId: selectedDevice.routerId,
            netwatchId: selectedDevice.id,
            deleteFromMikrotik
        }, {
            onSuccess: () => {
                setIsModalOpen(false);
                setSelectedDevice(null);
            }
        });
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

        const onSuccess = () => {
            setIsEditingPath(false);
            setEditingDevice(null);
            setEditWaypoints([]);
            toast.success('Path saved successfully');
        };

        const onError = (error) => {
            console.error('Failed to save path:', error);
            toast.error(`Failed to save path: ${error.message}`);
        };

        if (editingDevice.type === 'pppoe') {
            updatePppoeMutation.mutate({
                pppoeId: editingDevice.id,
                data: { waypoints: waypointsJson }
            }, { onSuccess, onError });
        } else if (editingDevice.type === 'onu') {
            updateOnuMutation.mutate({
                oltId: editingDevice.oltId,
                onuId: editingDevice.id,
                data: { waypoints: waypointsJson }
            }, { onSuccess, onError });
        } else {
            updateNetwatchMutation.mutate({
                routerId: editingDevice.routerId,
                netwatchId: editingDevice.id,
                data: { waypoints: waypointsJson }
            }, { onSuccess, onError });
        }
    };

    const handleQuickPlaceClick = useCallback((pos) => {
        if (!selectedUnplacedDevice) return;

        const payload = { latitude: String(pos[0]), longitude: String(pos[1]) };
        const id = selectedUnplacedDevice.id;
        const type = selectedUnplacedDevice.deviceType || selectedUnplacedDevice.type;

        const onSuccess = () => {
            toast.success(`${selectedUnplacedDevice.name || 'Device'} placed successfully`);
            setSelectedUnplacedDevice(null);
            // If drawer was open, keep it open but the item will disappear from list due to memo re-calc
        };

        if (type === 'router') {
            updateRouterMutation.mutate({ routerId: id, data: payload }, { onSuccess });
        } else if (type === 'pppoe') {
            updatePppoeMutation.mutate({ pppoeId: id, data: payload }, { onSuccess });
        } else if (type === 'onu') {
            updateOnuMutation.mutate({
                oltId: selectedUnplacedDevice.oltId,
                onuId: id,
                data: payload
            }, { onSuccess });
        } else {
            // Netwatch / OLT / ODP
            updateNetwatchMutation.mutate({
                routerId: selectedUnplacedDevice.routerId,
                netwatchId: id,
                data: payload
            }, { onSuccess });
        }
    }, [selectedUnplacedDevice, updateRouterMutation, updatePppoeMutation, updateOnuMutation, updateNetwatchMutation]);

    const handleAddDevice = (type) => {
        // Logic to add device (open modal with empty state)
        // Use raw routersData to ensure we can add devices even if routers aren't placed on map yet
        if (!routersData || routersData.length === 0) {
            alert("No routers available to add device to. Please add a MikroTik Router first.");
            return;
        }

        setSelectedDevice({
            isNew: true,
            type: type, // 'olt', 'odp', 'client'
            routerId: filteredRouterId || routersData[0].id // Use filtered router if present, else first available
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
                    disabled={false}
                    name={router.name || router.host}
                    small={false}
                    latency={router.latency || (router.latestMetrics?.latency)}
                    packetLoss={router.packetLoss || (router.latestMetrics?.packetLoss)}
                    lastErrorMessage={router.lastErrorMessage}
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
                        onEdit={(node, tab) => handleDeviceClick(node, 'router', tab)}
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
                    disabled={node.disabled}
                    name={node.name || node.host}
                    host={node.host}
                    showLabel={showLabels}
                    small={true}
                    latency={node.latency}
                    packetLoss={node.packetLoss}
                    hasWebhook={node.hasWebhook}
                    lastRxPower={node.lastRxPower}
                    draggable={isEditMode}
                    onDragEnd={(pos) => {
                        const payload = { latitude: String(pos[0]), longitude: String(pos[1]) };

                        // 1. Update specifically as ONU if it's passive OR linked
                        if (node.isPassive || node.deviceType === 'onu' || node.linkedOnuId) {
                            const onuId = node.linkedOnuId || node.id;
                            const oltId = node.oltId;

                            if (onuId && oltId) {
                                updateOnuMutation.mutate({
                                    oltId,
                                    onuId,
                                    data: payload
                                });
                            } else {
                                console.warn('[NetworkMap] Missing onuId or oltId for ONU move', { onuId, oltId, node });
                            }
                        }

                        // 2. Update as Netwatch if it's NOT purely passive
                        if (!node.isPassive) {
                            updateNetwatchMutation.mutate({
                                routerId: node.routerId,
                                netwatchId: node.id,
                                data: payload
                            });
                        }
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
                        onEdit={(n, tab) => handleDeviceClick(n, n.deviceType || 'netwatch', tab)}
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
                    disabled={false}
                    name={pppoe.name}
                    showLabel={showLabels}
                    latency={pppoe.latency}
                    packetLoss={pppoe.packetLoss}
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
                        onEdit={(n, tab) => handleDeviceClick(n, 'pppoe', tab)}
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
        isHeatmapMode,
        linesByNetwatchId,
        linesByPppoeId,
        handleMarkerHover // Added missing dependency
    ]);

    // --- Unplaced Devices Calculation ---
    const unplacedDevices = useMemo(() => {
        const list = [];
        const placedSNs = new Set();
        const placedHosts = new Set();

        // Pass 1: Identify all devices that ALREADY have coordinates
        (stableRoutersData || []).forEach(r => {
            const lat = parseFloat(r.latitude);
            const lng = parseFloat(r.longitude);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                if (r.sn) placedSNs.add(r.sn);
                if (r.host) placedHosts.add(r.host);
            }
        });

        (stableNetwatchData || []).forEach(nwGroup => {
            (nwGroup.entries || []).forEach(entry => {
                const lat = parseFloat(entry.latitude);
                const lng = parseFloat(entry.longitude);
                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                    if (entry.sn) placedSNs.add(entry.sn);
                    if (entry.host) placedHosts.add(entry.host);
                }
            });
        });

        (stablePppoeData || []).forEach(p => {
            const lat = parseFloat(p.latitude);
            const lng = parseFloat(p.longitude);
            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                if (p.sn) placedSNs.add(p.sn);
                if (p.host || p.address) placedHosts.add(p.host || p.address);
            }
        });

        // Pass 2: Filter unplaced candidates based on linking
        // 1. Routers
        (stableRoutersData || []).forEach(r => {
            const lat = parseFloat(r.latitude);
            const lng = parseFloat(r.longitude);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                list.push({ ...r, type: 'router', deviceType: 'router' });
            }
        });

        // 2. Netwatch
        (stableNetwatchData || []).forEach(nwGroup => {
            (nwGroup.entries || []).forEach(entry => {
                const lat = parseFloat(entry.latitude);
                const lng = parseFloat(entry.longitude);
                if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                    list.push({ ...entry, routerId: nwGroup.routerId, type: entry.deviceType || 'netwatch' });
                }
            });
        });

        // 3. PPPoE
        (stablePppoeData || []).forEach(p => {
            const lat = parseFloat(p.latitude);
            const lng = parseFloat(p.longitude);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                const isLinkedToPlaced = (p.sn && placedSNs.has(p.sn)) || (p.host && placedHosts.has(p.host)) || (p.address && placedHosts.has(p.address));
                if (!isLinkedToPlaced) {
                    list.push({ ...p, type: 'pppoe', deviceType: 'pppoe' });
                }
            }
        });

        // 4. ONUs (from map data)
        (stableOnusMapData || []).forEach(o => {
            const lat = parseFloat(o.latitude);
            const lng = parseFloat(o.longitude);
            if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                const isLinkedToPlaced = (o.sn && placedSNs.has(o.sn)) || (o.host && placedHosts.has(o.host));
                if (!isLinkedToPlaced) {
                    list.push({ ...o, type: 'onu', deviceType: 'onu' });
                }
            }
        });

        return list;
    }, [stableRoutersData, stableNetwatchData, stablePppoeData, stableOnusMapData]);

    // --- Memoized Topology Lines (Moved to component body to obey rules of hooks) ---
    const topologyLines = useMemo(() => {
        return mapData.lines.map((line) => {
            const iface = line.targetInterface;
            // Removed isHovered calculation - handled by Context in child component

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
                    isLiveMode={isLiveMode}
                    lineThickness={lineThickness}
                    mapColors={mapColors}
                    currentUser={currentUser}
                    enableAnimation={enableAnimation}
                    lowPerfMode={lowPerfMode}
                    timezone={timezone}
                    // Removed isHovered prop
                    onMouseOver={() => handleLineHover(line.id)}
                    onMouseOut={() => handleLineHover(null)}
                />
            );
        });
    }, [
        mapData.lines,
        // hoveredLineId removed
        isHeatmapMode,
        lineThickness,
        mapColors,
        currentUser,
        enableAnimation,
        lowPerfMode,
        timezone,
        isLiveMode,
        displayTrafficMap,
        handleLineHover // Added dependency
    ]);

    // Device modal data
    const allDevicesList = useMemo(() => [...mapData.nodes, ...(mapData.pppoeNodes || [])], [mapData.nodes, mapData.pppoeNodes]);


    const trafficContextValue = useMemo(() => ({
        hoverTick,
        displayTrafficMap,
        trafficMapRef,
        timezone,
        isHeatmapMode,
        isLiveMode
    }), [hoverTick, displayTrafficMap, trafficMapRef, timezone, isHeatmapMode, isLiveMode]);

    return (
        <main ref={mapContainerRef} className={`flex-1 relative flex flex-col bg-[#020617] overflow-hidden h-full ${lowPerfMode ? 'low-perf' : ''} ${!enableAnimation ? 'animations-disabled' : ''} map-type-${mapType}`}>
            {!googleLoaded && !googleFailed && (
                <div className="absolute inset-0 z-[2000] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-300 font-medium">Memuat Peta Google...</p>
                    {googleErrorType && (
                        <p className="text-red-400 text-xs mt-2 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/20">
                            Error: {googleErrorType === 'AUTH_FAILURE' ? 'API Key tidak valid' :
                                googleErrorType === 'INVALID_KEY' ? 'Format Key salah' :
                                    googleErrorType === 'SCRIPT_LOAD_ERROR' ? 'Gagal memuat script' : 'Batas waktu habis'}
                        </p>
                    )}
                    <p className="text-slate-500 text-xs mt-2 max-w-xs">
                        Jika loading terlalu lama, mungkin koneksi lambat atau API Key sedang bermasalah.
                    </p>
                    <button
                        onClick={() => setGoogleFailed(true)}
                        className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-all active:scale-95"
                    >
                        Gunakan Peta Standar (OSM)
                    </button>
                    {!apiKey && <p className="text-red-400 text-xs mt-4">API Key Google Maps tidak ditemukan.</p>}
                </div>
            )}
            <TrafficContext.Provider value={trafficContextValue}>
                <HoveredItemContext.Provider value={{ hoveredMarkerId, hoveredLineId }}>
                    <MapContainer
                        center={center}
                        zoom={10}
                        maxZoom={22} // Increased to allow high zoom ungrouping
                        scrollWheelZoom={true}
                        className={isPickingCoordinate ? 'picking-location' : ''}
                        preferCanvas={lowPerfMode} // Enable canvas rendering only in low-performance mode to preserve animations
                        aria-label="Network Topology Map"
                        style={{ height: "100%", width: "100%", background: mapType === 'satellite_dark' ? '#000' : "#0f172a" }}
                    >
                        <MapZoomHandler onZoomChange={setZoomLevel} />
                        <MapClickHandler
                            enabled={!!selectedUnplacedDevice || isPickingCoordinate}
                            onMapClick={isPickingCoordinate ? handlePickCoordinate : handleQuickPlaceClick}
                        />
                        <MapAutoFit markers={allMarkers} isEditing={isEditMode || isEditingPath} />
                        {(!apiKey || googleFailed) ? (
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                        ) : (
                            <MemoizedGoogleMapsLayer
                                type={mapType}
                                apiKey={apiKey}
                                onLoaded={handleGoogleLoaded}
                                onError={handleGoogleError}
                            />
                        )}


                        {/* Animated Topology Lines (show when NOT editing) */}
                        {!isEditingPath && topologyLines}

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
                                        key={`cluster-${enableClustering}-${mapType}-${apiKey ? 'google' : 'osm'}-${downHash}`} // Force remount on engine or status change
                                        chunkedLoading
                                        zoomToBoundsOnClick={true}
                                        spiderfyOnMaxZoom={false}
                                        disableClusteringAtZoom={21} // Ungroup at Zoom 21 as requested
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
                                        spiderLegPolylineOptions={{
                                            weight: 1.5,
                                            color: '#22c55e',
                                            opacity: 0.6
                                        }}
                                    >
                                        {markers.filter(m => m !== null)}
                                    </MarkerClusterGroup>
                                );
                            }

                            return markers.filter(m => m !== null);
                        })()}

                    </MapContainer >

                    {/* Path Edit Toolbar */}
                    {
                        !showRoutersOnly && !selectedUnplacedDevice && (
                            <MapToolbar
                                isVisible={isEditingPath}
                                pathLength={pathLength}
                                onReset={handleResetPath}
                                onCancel={handleCancelPathEdit}
                                onSave={handleSavePath}
                            />
                        )
                    }

                    {/* Map Controls (Right Panel) */}
                    {!showRoutersOnly && !selectedUnplacedDevice && (
                        <MapControls
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            mapType={mapType}
                            setMapType={(val) => {
                                setMapType(val);
                                localStorage.setItem('map_type_preference', val);
                            }}
                            isHeatmapMode={isHeatmapMode}
                            setIsHeatmapMode={setIsHeatmapMode}
                            lineThickness={lineThickness}
                            setLineThickness={setLineThickness}
                            isEditMode={isEditMode}
                            setIsEditMode={setIsEditMode}
                            isSyncing={isSyncing}
                            onManualSync={handleManualSync}
                            isPlacementModeOpen={isPlacementModeOpen}
                            setIsPlacementModeOpen={(val) => {
                                setIsPlacementModeOpen(val);
                                localStorage.setItem('map_placement_mode_enabled', JSON.stringify(val));
                            }}
                            isFullscreen={isFullscreen}
                            onToggleFullscreen={() => {
                                if (!document.fullscreenElement) {
                                    mapContainerRef.current?.requestFullscreen();
                                    setIsFullscreen(true);
                                } else {
                                    document.exitFullscreen();
                                    setIsFullscreen(false);
                                }
                            }}
                            enableAnimation={enableAnimation}
                            setEnableAnimation={(val) => {
                                setEnableAnimation(val);
                                localStorage.setItem('map_animation_enabled', JSON.stringify(val));
                            }}
                            enableClustering={enableClustering}
                            setEnableClustering={(val) => {
                                setEnableClustering(val);
                                localStorage.setItem('map_clustering_enabled', JSON.stringify(val));
                            }}
                            lowPerfMode={lowPerfMode}
                            setLowPerfMode={(val) => {
                                setLowPerfMode(val);
                                localStorage.setItem('map_low_perf_enabled', JSON.stringify(val));
                            }}
                        />
                    )}

                    {/* Legend (With Performance Controls) */}
                    {!showRoutersOnly && !selectedUnplacedDevice && (
                        <MapLegend
                            showLabels={showLabels}
                            onToggleLabels={handleToggleLabels}
                            isHeatmapMode={isHeatmapMode}
                            mapColors={mapColors}
                            enableAnimation={enableAnimation}
                            setEnableAnimation={(val) => {
                                setEnableAnimation(val);
                                localStorage.setItem('map_animation_enabled', JSON.stringify(val));
                            }}
                            enableClustering={enableClustering}
                            setEnableClustering={(val) => {
                                setEnableClustering(val);
                                localStorage.setItem('map_clustering_enabled', JSON.stringify(val));
                            }}
                            lowPerfMode={lowPerfMode}
                            setLowPerfMode={(val) => {
                                setLowPerfMode(val);
                                localStorage.setItem('map_low_perf_enabled', JSON.stringify(val));
                            }}
                        />
                    )}

                    {/* Floating Action Button */}
                    {
                        !showRoutersOnly && !selectedUnplacedDevice && (
                            <MapFAB
                                onAddDevice={handleAddDevice}
                                disabled={isEditingPath || !!selectedUnplacedDevice}
                            />
                        )
                    }

                    {/* Quick Placement Overlay Elements */}
                    {!showRoutersOnly && (
                        <>
                            <PlacementToolbar
                                selectedDevice={selectedUnplacedDevice}
                                onCancel={() => setSelectedUnplacedDevice(null)}
                            />

                            <UnplacedDevicesDrawer
                                isOpen={isPlacementModeOpen}
                                onClose={() => setIsPlacementModeOpen(false)}
                                unplacedDevices={unplacedDevices}
                                selectedDevice={selectedUnplacedDevice}
                                onSelectDevice={(device) => {
                                    setSelectedUnplacedDevice(device);
                                    if (device) setIsPlacementModeOpen(false);
                                }}
                            />
                        </>
                    )}

                    {/* Device Modal */}
                    <DeviceModal
                        isOpen={isModalOpen}
                        device={selectedDevice}
                        routers={mapData.routers}
                        devices={allDevicesList}
                        onClose={handleCloseModal}
                        onSave={handleSaveDevice}
                        onDelete={handleDeleteDevice}
                        onEditPath={handleEditPath}
                        onStartPicking={setIsPickingCoordinate}
                        isPicking={isPickingCoordinate}
                        isSaving={isSaving}
                        isDeleting={deleteNetwatchMutation.isPending || deleteNetwatchMutation.isLoading}
                        initialTab={modalInitialTab}
                        routerInterfaces={routerInterfaces || []}
                    />
                </HoveredItemContext.Provider>
            </TrafficContext.Provider>
        </main>
    );
};

export default NetworkMap;
