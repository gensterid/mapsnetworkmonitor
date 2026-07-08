import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, Polyline, useMapEvents, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useSettings, useCurrentUser, usePingLatencies, useRouterHotspotActive, useRouterPppActive, useAppTimezone, useUnreadAlertCount } from '@/hooks';
import { useCables, useCreateCable, useUpdateCable, useDeleteCable } from '@/hooks/useCables';
import { mapToStatus, STATUS } from '@/constants/status';
import { AlertPanel, RouterDetailPanel, NetwatchDetailPanel } from '@/components/panels';
import '@/lib/GoogleMutant';
import { computeOdpDerivedStatus } from '@/lib/odpStatus';
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

// Auto-hide panel ukur jarak saat klik di area kosong peta (bukan garis).
// stateRef.current = { active, openedAt } supaya klik pembuka panel tidak
// langsung menutupnya (guard ~350ms) & baca nilai terbaru tanpa re-register.
const MeasurePanelCloser = ({ stateRef, onClose }) => {
    const map = useMap();
    useEffect(() => {
        const handleClick = () => {
            const s = stateRef.current;
            if (s.active && Date.now() - s.openedAt > 350) onClose();
        };
        map.on('click', handleClick);
        return () => map.off('click', handleClick);
    }, [map, stateRef, onClose]);
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
    FloatingStatusCounter,
    MapStatusFilter,
    DeviceModal,
    DeleteDeviceDialog,
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
import { calculatePathLength, formatDistance, pointAlongPath, calculateDistance } from '@/lib/geo';
import { coreColor, FIBER_COLORS } from '@/lib/fiberColors';

// Parse JSON aman — string malformed tidak boleh bikin build mapData crash.
function parseJsonSafe(v, fallback) {
    if (v == null) return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
}

// Properti dash untuk efek belang (candy stripe) N-core: tiap core = 1 polyline
// dashed dengan offset beda → warna bergantian sepanjang garis. n<=1 → solid.
const candyDashProps = (idx, n, seg = 10) => (n > 1
    ? { dashArray: `${seg} ${seg * (n - 1)}`, dashOffset: `${idx * seg}` }
    : {});




// Status string yang considered "down" untuk cluster refresh hash.
// Set untuk O(1) lookup vs Array.includes O(n) (perf audit L-2).
const DOWN_STATUSES = new Set(['down', 'offline', 'lost', 'power_down', 'dying_gasp']);

/**
 * Walk up parent chain via connectedToId untuk find inherited interface.
 * Top-level function (M-3): sebelumnya inline closure di dalam mapData
 * useMemo hot loop → recreated per node × per recomputation. Top-level
 * pure function: stable identity, no allocation overhead.
 *
 * Plus tambah visited Set untuk cycle guard — kalau ada circular
 * connectedToId di config (mis. A → B → A), sebelumnya stack overflow.
 */
function findInheritedInterfaceFor(node, deviceMap, visited = new Set()) {
    if (!node || visited.has(node.id)) return null;
    visited.add(node.id);
    if (node.targetInterface) {
        return { iface: node.targetInterface, device: node.name || node.host };
    }
    if (node.connectionType === 'client' && node.connectedToId) {
        const parent = deviceMap.get(node.connectedToId);
        if (parent) return findInheritedInterfaceFor(parent, deviceMap, visited);
    }
    return null;
}

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
    // Per perf audit H-1: hapus `useDeepCompareMemoize` (5× O(n) deep walks
    // per render). TanStack Query v5 default `structuralSharing: true`
    // sudah preserve referential identity saat data unchanged via JSON
    // diff at query layer. Wrapping di sini cuma duplicate effort + jadi
    // bottleneck saat 1000+ entries (netwatch).
    //
    // `netwatchOverride || netwatchData` di useMemo supaya fallback tidak
    // bikin new identity tiap render.
    const stableRoutersData = routersData;
    const stableNetwatchData = useMemo(
        () => netwatchOverride || netwatchData,
        [netwatchOverride, netwatchData],
    );
    const stablePppoeData = pppoeData;
    const stableOnusMapData = onusMapData;
    const stableRealtimeTraffic = realtimeTraffic;

    // Unread alert count untuk FloatingStatusCounter.
    const { data: alertCount } = useUnreadAlertCount();
    // Fiber cables (Cara C) — objek kabel digambar bebas, dirender belang N-core.
    const { data: cables = [] } = useCables(filteredRouterId || undefined);
    // Validasi + siapkan segmen kabel sekali (memoized): buang titik path yang
    // rusak (cegah crash Leaflet dari data tercemar/legacy) & core non-numerik.
    const cableSegments = useMemo(() => {
        if (!Array.isArray(cables)) return [];
        return cables.map((cable) => {
            const path = Array.isArray(cable.path)
                ? cable.path.filter((p) => Array.isArray(p) && p.length === 2
                    && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
                : [];
            const cores = Array.isArray(cable.cores)
                ? cable.cores.filter((c) => Number.isFinite(Number(c)))
                : [];
            if (path.length < 2 || cores.length === 0) return null;
            const distanceMarkers = Array.isArray(cable.distanceMarkers)
                ? cable.distanceMarkers.filter((m) => m && Number.isFinite(Number(m.meters)))
                : [];
            return { id: cable.id, name: cable.name, path, cores, distanceMarkers, length: calculatePathLength(path) };
        }).filter(Boolean);
    }, [cables]);

    // Draw-kabel (C2): mode gambar polyline + pilih core → simpan.
    const createCableMutation = useCreateCable();
    const [isDrawingCable, setIsDrawingCable] = useState(false);
    const [drawCablePath, setDrawCablePath] = useState([]); // [[lat,lng], …]
    const [drawCableName, setDrawCableName] = useState('');
    const [drawCableCores, setDrawCableCores] = useState([1, 2]); // index core aktif
    // Ref selalu-terkini supaya handler marker/garis yang di-memo (tak re-render
    // saat isDrawingCable toggle) tetap tahu mode gambar aktif + bisa nambah titik.
    const isDrawingCableRef = React.useRef(false);
    const addDrawPointRef = React.useRef(null);
    // Edit/hapus kabel (C3).
    const updateCableMutation = useUpdateCable();
    const deleteCableMutation = useDeleteCable();
    const [editingCable, setEditingCable] = useState(null); // { id, from, to }
    const [editCableWaypoints, setEditCableWaypoints] = useState([]);
    const [editCableName, setEditCableName] = useState('');
    const [editCableCores, setEditCableCores] = useState([]);
    // Ref selalu-terkini (dibaca handler garis/marker yang di-memo) untuk cegah
    // mode lain (ukur/edit device) dibuka saat sedang edit kabel.
    const editingCableRef = React.useRef(null);
    // Ukur jarak / cek putus pada kabel (C5) — lintas-ODP karena kabel 1 polyline.
    const [measureCableId, setMeasureCableId] = useState(null);
    const [cableMeasureMeters, setCableMeasureMeters] = useState(0);
    const [cableMeasureSide, setCableMeasureSide] = useState('source'); // 'source'|'dest'
    const [cableMeasureLabel, setCableMeasureLabel] = useState('');
    // Toggle layer kabel (C4) — persist ke localStorage.
    const [showCables, setShowCables] = useState(() => {
        try { const s = localStorage.getItem('map_show_cables'); return s === null ? true : JSON.parse(s); } catch { return true; }
    });
    const toggleShowCables = useCallback(() => setShowCables((v) => !v), []);
    // Persist di effect (updater state harus murni — hindari side-effect di dalamnya).
    useEffect(() => {
        try { localStorage.setItem('map_show_cables', JSON.stringify(showCables)); } catch { /* ignore */ }
    }, [showCables]);

    // Device status counts — ALL devices (router + netwatch host + pppoe session),
    // tenant-wide (TIDAK terpengaruh filteredRouterId). Konsumsi oleh
    // FloatingStatusCounter + MapStatusFilter.
    //
    // User feedback: sebelumnya cuma router yang dihitung, tapi filter chip
    // mempengaruhi visibility netwatch juga \xe2\x86\x92 disconnect: counter say
    // "4 online 0 offline" tapi map tampilkan marker offline netwatch/pppoe.
    // Now: count semua device type supaya counter match dengan apa yang
    // visible di map.
    //
    // Perf: 4 router + ~50 netwatch + ~300 pppoe = ~350 items per recompute.
    // O(n) tunggal saat data berubah (useMemo cache). Negligible.
    const routerStatusCounts = useMemo(() => {
        const counts = { online: 0, offline: 0, issue: 0 };

        if (Array.isArray(stableRoutersData)) {
            stableRoutersData.forEach((r) => {
                const s = mapToStatus(r.status);
                if (s === STATUS.ONLINE) counts.online += 1;
                else if (s === STATUS.OFFLINE) counts.offline += 1;
                else if (s === STATUS.ISSUE) counts.issue += 1;
            });
        }

        // Netwatch entries di-flatten dari nwGroup.entries[]
        if (Array.isArray(stableNetwatchData)) {
            stableNetwatchData.forEach((nwGroup) => {
                if (!nwGroup.entries) return;
                nwGroup.entries.forEach((entry) => {
                    const s = mapToStatus(entry.status);
                    if (s === STATUS.ONLINE) counts.online += 1;
                    else if (s === STATUS.OFFLINE) counts.offline += 1;
                    else if (s === STATUS.ISSUE) counts.issue += 1;
                });
            });
        }

        // PPPoE sessions \xe2\x80\x94 status normalize: 'active'/'up' = online, else offline
        if (Array.isArray(stablePppoeData)) {
            stablePppoeData.forEach((session) => {
                const isActive = session.status === 'active' || session.status === 'up';
                if (isActive) counts.online += 1;
                else counts.offline += 1;
            });
        }

        return counts;
    }, [stableRoutersData, stableNetwatchData, stablePppoeData]);

    // UI & Interactive State (Moved to top to prevent ReferenceError)
    const [mapType, setMapType] = useState(() => {
        const saved = localStorage.getItem('map_type_preference');
        return saved || 'roadmap'; // Default to roadmap for better initial load
    });
    const [showLabels, setShowLabels] = useState(() => {
        try { const saved = localStorage.getItem('map_show_labels'); return saved !== null && saved !== 'undefined' ? JSON.parse(saved) : true; } catch { return true; }
    });
    const [searchQuery, setSearchQuery] = useState('');
    // Status filter chip — 'all' | 'online' | 'offline' | 'issue'.
    // Affect router + netwatch marker visibility only (PPPoE & ONU tetap visible).
    const [statusFilter, setStatusFilter] = useState('all');
    // Single panel state — sesuai brief "panel tidak menumpuk".
    // Nilai: null | 'alert' | 'router' | 'netwatch'.
    const [activePanel, setActivePanel] = useState(null);
    // Device object yang lagi di-quick-view (router atau netwatch).
    // null kalau panel alert atau tidak ada panel terbuka.
    const [quickViewDevice, setQuickViewDevice] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialTab, setModalInitialTab] = useState('settings');
    const [isEditingPath, setIsEditingPath] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [editWaypoints, setEditWaypoints] = useState([]);
    const [pathLength, setPathLength] = useState(0);
    // Alat ukur jarak di garis (cek jalur putus): klik garis → panel.
    const [measureLine, setMeasureLine] = useState(null);
    const [measureMeters, setMeasureMeters] = useState(0);
    const [measureSide, setMeasureSide] = useState('source'); // 'source' | 'dest'
    const [measureLabel, setMeasureLabel] = useState('');
    // Highlight 1 core fiber → recolor garis. { lineId, hex, i } | null
    const [highlightCore, setHighlightCore] = useState(null);
    // Ref sinkron untuk auto-hide panel ukur (dibaca handler klik peta tanpa re-register).
    const measureStateRef = React.useRef({ active: false, openedAt: 0 });
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

    // Klik garis → buka panel ukur jarak (cek putus). Default meter = 0.
    const handleLineMeasure = useCallback((line) => {
        // Saat gambar/edit kabel: jangan buka panel ukur (klik gambar bubble ke
        // map → MapClickHandler yang menambah titik pada posisi klik).
        if (isDrawingCableRef.current || editingCableRef.current) return;
        setMeasureCableId(null); // tutup panel ukur kabel (mutual-exclusive)
        measureStateRef.current = { active: true, openedAt: Date.now() };
        setMeasureLine(line);
        setMeasureMeters(0);
        setMeasureSide('source');
        setMeasureLabel('');
        setHighlightCore(null);
    }, []);

    // Tutup panel ukur (dipakai tombol X, klik peta, & setelah simpan).
    const closeMeasure = useCallback(() => {
        measureStateRef.current.active = false;
        setMeasureLine(null);
        setHighlightCore(null);
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
            // Cache ['netwatch-all'] = ARRAY DATAR entri (res.data.data); grouping
            // ke { routerId, entries } baru terjadi di useMemo `netwatchData`.
            // Sebelumnya onMutate keliru menganggap cache sudah grouped (map ke
            // group.entries yang undefined) → patch optimistic jadi NO-OP, jadi
            // perubahan (mis. fiberCores) baru muncul setelah refetch (harus
            // refresh). Patch langsung ke entri datar.
            queryClient.setQueryData(['netwatch-all'], (old) => {
                if (!Array.isArray(old)) return old;
                return old.map((entry) =>
                    entry.id === netwatchId ? { ...entry, ...data } : entry
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

    // Stable ref ke mutate function — per perf audit M-1.
    // updateNetwatchMutation OBJECT identity berubah tiap render (mutation
    // state changes: isPending, data, dst.) → masuk ke `markers` useMemo
    // deps bikin recompute semua marker (500+) tiap render bukan cuma
    // saat data berubah.
    //
    // Note: TanStack Query v5 sebenarnya stable identity untuk `.mutate`
    // function itself (wrapped useCallback internal). Ref pattern di sini
    // explicit safety + clarity — kalau TQ behavior berubah suatu hari,
    // kode kita tetap aman. Plus dokumentasi intent jelas.
    const updateNetwatchMutateRef = useRef(updateNetwatchMutation.mutate);
    useEffect(() => {
        updateNetwatchMutateRef.current = updateNetwatchMutation.mutate;
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
        mutationFn: async ({ routerId, netwatchId, deleteFromMikrotik = true, deleteMode }) => {
            // New API supports ?mode=both|app_only|mikrotik_only.
            // Fall back to legacy boolean flag when deleteMode isn't given.
            const modeParam = deleteMode
                ? `mode=${encodeURIComponent(deleteMode)}`
                : `deleteFromMikrotik=${deleteFromMikrotik}`;
            const res = await apiClient.delete(`/routers/${routerId}/netwatch/${netwatchId}?${modeParam}`);
            return res.data;
        },
        onMutate: async ({ netwatchId }) => {
            // Optimistically strip the entry from nested groups so the marker
            // disappears the moment the user confirms — without this the
            // marker lingers until the onSuccess refetch lands (or worse,
            // never disappears if cache key drifts).
            await queryClient.cancelQueries({ queryKey: ['netwatch-all'] });
            const prev = queryClient.getQueryData(['netwatch-all']);
            queryClient.setQueryData(['netwatch-all'], (old) => {
                if (!Array.isArray(old)) return old;
                return old.map(group => ({
                    ...group,
                    entries: Array.isArray(group?.entries)
                        ? group.entries.filter(e => e.id !== netwatchId)
                        : group?.entries,
                }));
            });
            return { prev };
        },
        onError: (err, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['netwatch-all'], ctx.prev);
            console.error('Delete failed:', err);
            toast.error(`Gagal hapus netwatch: ${err.response?.data?.message || err.message}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            toast.success('Netwatch dihapus dari aplikasi.');
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

    // Stable ref untuk mutate function (perf review C-1 follow-up).
    // Sebelumnya updatePppoeMutation di handlePppoeDragEnd deps → handler
    // identity flap tiap render → pppoeMarkers recompute tiap render meski
    // data tidak ganti. Sama pattern dengan updateNetwatchMutateRef (M-1).
    const updatePppoeMutateRef = useRef(updatePppoeMutation.mutate);
    useEffect(() => {
        updatePppoeMutateRef.current = updatePppoeMutation.mutate;
    });

    // Mutation for archiving ONU (soft-delete). Auto-restored if SN reappears in OLT polling.
    const archiveOnuMutation = useMutation({
        mutationFn: async ({ oltId, onuId }) => {
            const res = await apiClient.post(`/olts/${oltId}/onus/${onuId}/archive`);
            return res.data;
        },
        onMutate: async ({ onuId }) => {
            await queryClient.cancelQueries({ queryKey: ['onus-map'] });
            const prev = queryClient.getQueryData(['onus-map']);
            queryClient.setQueryData(['onus-map'], (old) =>
                Array.isArray(old) ? old.filter(o => o.id !== onuId) : old
            );
            return { prev };
        },
        onError: (err, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['onus-map'], ctx.prev);
            toast.error(err.response?.data?.error || 'Gagal menghapus ONU');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });
            toast.success('ONU dihapus dari aplikasi.');
        },
    });

    // 3-option delete dialog state. Replaces the previous window.confirm flow
    // that always archived ONU — paired ODP/Netwatch markers wouldn't disappear
    // because their netwatch row was never touched.
    const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, node: null });

    const handleArchiveOnu = useCallback((node) => {
        if (!node) return;
        setDeleteDialog({ isOpen: true, node });
    }, []);

    const handleQuickPing = useCallback(async (node) => {
        const host = node.host || node.address;
        const routerId = node.routerId || (node.deviceType === 'router' ? node.id : null);
        if (!host || !routerId) return;
        const toastId = toast.loading(`Pinging ${host}...`);
        try {
            const res = await apiClient.post(`/routers/${routerId}/tools/ping`, { host, count: 4 });
            const { latency, packetLoss, success } = res.data.data;
            if (success) {
                toast.success(`${host}: ${latency}ms, loss ${packetLoss}%`, { id: toastId });
            } else {
                toast.error(`${host}: Timeout (${packetLoss}% loss)`, { id: toastId });
            }
        } catch (err) {
            toast.error(`Ping gagal ke ${host}`, { id: toastId });
        }
    }, []);

    const handleDeleteConfirmed = useCallback(({ mode, node }) => {
        if (!node) return;

        const hasOnu = !!(node.linkedOnuId || node.deviceType === 'onu');
        const hasNetwatchSide = node.deviceType !== 'onu' && !!node.id && !!node.routerId;

        // Non-ONU netwatch modes — go straight to delete with mode param.
        if (mode === 'app_only' || mode === 'mikrotik_only') {
            if (!hasNetwatchSide) {
                toast.error('Node ini bukan netwatch entry.');
            } else {
                deleteNetwatchMutation.mutate({
                    routerId: node.routerId,
                    netwatchId: node.id,
                    deleteMode: mode,
                });
            }
            setDeleteDialog({ isOpen: false, node: null });
            return;
        }

        // 'both' for non-ONU node: just delete netwatch with mode=both.
        if (mode === 'both' && !hasOnu) {
            if (!hasNetwatchSide) {
                toast.error('Node ini bukan netwatch entry.');
            } else {
                deleteNetwatchMutation.mutate({
                    routerId: node.routerId,
                    netwatchId: node.id,
                    deleteMode: 'both',
                });
            }
            setDeleteDialog({ isOpen: false, node: null });
            return;
        }

        // ONU device modes — 'onu', 'netwatch', or 'both' chains archive + delete.
        const wantsOnu = mode === 'onu' || mode === 'both';
        const wantsNetwatch = mode === 'netwatch' || mode === 'both';

        if (wantsOnu) {
            const onuId = node.linkedOnuId || (node.deviceType === 'onu' ? node.id : null);
            const oltId = node.oltId;
            if (onuId && oltId) {
                archiveOnuMutation.mutate({ oltId, onuId });
            } else if (mode === 'onu') {
                toast.error('Tidak ada ONU yang ter-link ke node ini.');
            }
        }
        if (wantsNetwatch) {
            if (hasNetwatchSide) {
                deleteNetwatchMutation.mutate({
                    routerId: node.routerId,
                    netwatchId: node.id,
                    deleteMode: 'both',
                });
            } else if (mode === 'netwatch') {
                toast.error('Node ini bukan netwatch entry.');
            }
        }
        setDeleteDialog({ isOpen: false, node: null });
    }, [archiveOnuMutation, deleteNetwatchMutation]);

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

            // Status filter (chip kiri atas) — hide router yang tidak match status.
            if (statusFilter !== 'all' && mapToStatus(router.status) !== statusFilter) return;

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
                    // Status filter chip — hide netwatch host yang tidak match status.
                    // 'up' → online, 'down' → offline (via mapToStatus).
                    if (statusFilter !== 'all' && mapToStatus(entry.status) !== statusFilter) return;

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
                        // Composite key: routerId+host. RFC1918 IP can collide across routers
                        // even within a tenant, so plain-host indexing causes wrong merges.
                        if (node.host && node.routerId) nodesByHost.set(`${node.routerId}:${node.host}`, node);
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
                    // Status filter chip \xe2\x80\x94 hide pppoe session yang tidak match.
                    // 'active'/'up' \xe2\x86\x92 online, else \xe2\x86\x92 offline.
                    // Sebelumnya pppoe BYPASS filter \xe2\x80\x94 user feedback "klik
                    // offline yang tampil pppoe" karena tidak ada filter check.
                    const normalizedStatus = (session.status === 'active' || session.status === 'up') ? 'online' : 'offline';
                    if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return;

                    const node = {
                        ...session,
                        lat,
                        lng,
                        type: 'pppoe',
                        deviceType: 'pppoe',
                        status: normalizedStatus,
                    };
                    pppoeNodesList.push(node);
                    deviceMap.set(session.id, node);

                    if (node.sn) nodesBySN.set(node.sn, node);
                    const pppoeHost = node.host || node.address;
                    if (pppoeHost && node.routerId) nodesByHost.set(`${node.routerId}:${pppoeHost}`, node);
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

            // SN match takes priority (globally unique). Host match only allowed when
            // routerId matches — otherwise overlapping RFC1918 IPs across routers/tenants
            // would cause cross-attach (security: tenant data leak).
            let existingNode = onu.sn ? nodesBySN.get(onu.sn) : null;
            if (!existingNode && onu.host && onu.routerId) {
                const candidate = nodesByHost.get(`${onu.routerId}:${onu.host}`);
                if (candidate) existingNode = candidate;
            }

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

        // 2.8 pass: Derive ODP health from attached ONUs.
        // ODP tidak punya ping sendiri — kalau ≥2 ONU anaknya semua optical-down
        // maka fiber ke ODP kemungkinan putus (merah). Sebagian down → warning (kuning).
        const onusByParent = new Map();
        [...nodes, ...pppoeNodesList].forEach(n => {
            const isOnuLike = n.deviceType === 'onu' || n.type === 'onu' || !!n.linkedOnuId;
            if (!isOnuLike || !n.connectedToId) return;
            const arr = onusByParent.get(n.connectedToId) || [];
            arr.push(n);
            onusByParent.set(n.connectedToId, arr);
        });

        nodes.forEach(node => {
            const isOdp = node.deviceType === 'odp' || node.type === 'odp';
            if (!isOdp) return;
            const currentStatus = String(node.status || '').toLowerCase();
            // Kalau ODP sudah punya status offline eksplisit dari netwatch, jangan di-override
            if (['offline', 'down', 'lost'].includes(currentStatus)) return;
            const attached = onusByParent.get(node.id) || [];
            const derived = computeOdpDerivedStatus(attached);
            if (derived === 'down') {
                node.status = 'down';
                node.statusSource = 'odp-derived-all-optical-down';
                node.odpDerivedAttachedCount = attached.length;
            } else if (derived === 'warning') {
                node.status = 'warning';
                node.statusSource = 'odp-derived-partial-optical-down';
                node.odpDerivedAttachedCount = attached.length;
            }
        });

        // 2.9 pass: Pre-calculate child counts for port capacity tracking
        const childCounts = new Map();
        [...nodes, ...pppoeNodesList].forEach(n => {
            const nodeType = n.deviceType || n.type;
            if (n.connectedToId && nodeType !== 'odp') {
                childCounts.set(n.connectedToId, (childCounts.get(n.connectedToId) || 0) + 1);
            }
        });

        // Fiber core = model PER-HOP. Warna tiap ruas (garis child→parent)
        // ditentukan LOKAL oleh fiberCores PARENT: core dengan dest = nama child
        // ini. Bisa >1 core ke child yang sama → kabel belang (candy). Tidak ada
        // propagasi multi-hop; kelanjutan core ditentukan lagi di ODP berikutnya.

        // 3.0 pass: Create lines for ALL indexed devices and enrich with port info
        const allDevices = [...nodes, ...pppoeNodesList];
        allDevices.forEach(node => {
            // Enrich with port info
            node.usedPorts = childCounts.get(node.id) || 0;
            // Default portCapacity is 8 if not specified (legacy or default)
            node.portCapacity = node.portCapacity || 8;

            let fromPos = null;
            let sourceName = 'Unknown';
            // Id device yang benar-benar jadi sumber garis (yang meresolve
            // fromPos). Dipakai tombol "Edit Source" di panel garis supaya
            // membuka device yang ditampilkan, bukan connectedToId yatim.
            let resolvedSourceId = null;

            // Determine Source Position (Robust Fallback Logic)
            if (node.connectionType === 'client' && node.connectedToId) {
                // 1. Try connecting to Parent Client (can be Netwatch or PPPoE now!)
                const parentNode = deviceMap.get(node.connectedToId);
                if (parentNode) {
                    fromPos = [parentNode.lat, parentNode.lng];
                    sourceName = parentNode.name || parentNode.host || 'Unknown Client';
                    resolvedSourceId = node.connectedToId;
                }
            } else if (node.connectionType === 'router' && node.connectedToId) {
                // 2. Try connecting to Parent Router
                const parentRouter = routerMap.get(node.connectedToId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                    sourceName = parentRouter.name;
                    resolvedSourceId = node.connectedToId;
                }
            }

            // 3. FALLBACK: Connect to Main Router if no parent found — KECUALI
            // device bertipe "Through Another Client". Device 'client' HARUS
            // nyambung ke client (branch 1). Kalau parent-nya tak ke-resolve
            // (kosong / nunjuk router / id yatim) = sengaja dilepas → JANGAN
            // fallback ke router; garis benar-benar hilang. (Fallback router
            // hanya untuk device "Direct to Router".)
            const detached = node.connectionType === 'client';
            if (!fromPos && !detached && node.routerId) {
                const parentRouter = routerMap.get(node.routerId);
                if (parentRouter) {
                    fromPos = [parentRouter.lat, parentRouter.lng];
                    sourceName = parentRouter.name;
                    resolvedSourceId = node.routerId;
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
                    // Per perf audit M-3: closure was being recreated per
                    // node iteration. Use top-level walk dengan visited
                    // Set untuk cycle guard (kalau ada circular connectedToId
                    // di config bermasalah, sebelumnya stack overflow).
                    if (node.connectionType === 'client' && node.connectedToId) {
                        const parent = deviceMap.get(node.connectedToId);
                        if (parent) {
                            const result = findInheritedInterfaceFor(parent, deviceMap);
                            if (result) {
                                trafficInterface = result.iface;
                                trafficSourceDevice = result.device;
                            }
                        }
                    }
                }

                // Warna garis ruas ini (PER-HOP): ambil dari fiberCores PARENT —
                // core yang dest-nya = nama node ini. 1 core → solid, >1 core ke
                // node yg sama → belang (candy). Kelanjutan core diatur lagi di
                // node ini (fiberCores-nya) untuk ruas berikutnya.
                let coreColorHex;
                let coreIndex;
                let coreName;
                let lineCores; // [{ i, hex, dest }] saat >1 core (candy stripe)
                const coreParent = node.connectedToId ? deviceMap.get(node.connectedToId) : null;
                if (coreParent) {
                    const pfc = parseJsonSafe(coreParent.fiberCores, null);
                    if (pfc && Array.isArray(pfc.cores)) {
                        const mine = pfc.cores
                            .filter((c) => c.dest && (c.dest === node.name || c.dest === node.host))
                            .sort((a, b) => Number(a.i) - Number(b.i));
                        if (mine.length === 1) {
                            const col = coreColor(mine[0].i);
                            coreColorHex = col.hex;
                            coreIndex = mine[0].i;
                            coreName = col.name;
                        } else if (mine.length >= 2) {
                            lineCores = mine.map((c) => ({ i: c.i, hex: coreColor(c.i).hex, dest: c.dest }));
                        }
                    }
                }

                lines.push({
                    id: node.type === 'pppoe' ? `pppoe-${node.id}` : `${node.routerId}-${node.id}`,
                    coreColorHex,
                    coreIndex,
                    coreName,
                    lineCores,
                    routerId: node.routerId,
                    sourceId: resolvedSourceId,
                    netwatchId: node.type !== 'pppoe' ? node.id : undefined,
                    pppoeId: node.type === 'pppoe' ? node.id : undefined,
                    from: fromPos,
                    to: [node.lat, node.lng],
                    status: node.type === 'pppoe' ? (node.status === 'online' ? 'up' : 'down') : node.status,
                    waypoints: waypoints,
                    fullPath,
                    distanceMarkers: parseJsonSafe(node.distanceMarkers, []),
                    fiberCores: parseJsonSafe(node.fiberCores, null),
                    nodeType: node.type,
                    oltId: node.oltId,
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
    }, [stableRoutersData, stableNetwatchData, stablePppoeData, stableOnusMapData, filteredRouterId, showRoutersOnly, statusFilter]);

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

    // Force cluster refresh when down counts change.
    // Per perf audit L-2: pakai Set untuk O(1) lookup vs Array.includes O(n).
    // Marginal tapi nyata di 500+ marker × 5-status array per iteration.
    const downHash = useMemo(() => {
        let count = 0;
        for (const m of allMarkers) {
            if (DOWN_STATUSES.has(m.status)) count++;
        }
        return count;
    }, [allMarkers]);

    // Saat gambar kabel: klik marker = tambah titik jalur (snap pas ke device),
    // bukan buka panelnya. (Leaflet Marker tak bubble ke map, jadi harus di
    // handler marker.) Baca ref → tetap terkini walau handler di-memo.
    const drawPointFromDevice = useCallback((device) => {
        const lat = Number(device?.lat ?? device?.latitude);
        const lng = Number(device?.lng ?? device?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) addDrawPointRef.current?.([lat, lng]);
    }, []);

    // Handlers
    const handleDeviceClick = useCallback((device, type, initialTab = 'settings') => {
        if (isDrawingCableRef.current) { drawPointFromDevice(device); return; }
        if (editingCableRef.current) return; // sedang edit kabel → jangan buka modal
        setSelectedDevice({ ...device, type });
        setModalInitialTab(initialTab);
        setIsModalOpen(true);
    }, [drawPointFromDevice]);

    // Buka modal edit device (source/dest) langsung dari panel garis, supaya
    // operator cepat ubah pengaturan core/garis tanpa cari markernya.
    const openDeviceEditById = useCallback((id) => {
        if (!id) return;
        const dev = allMarkers.find((d) => d.id === id);
        if (!dev) {
            toast.error('Device tidak ditemukan di peta');
            return;
        }
        const type = (dev.type === 'router' || dev.deviceType === 'router') ? 'router'
            : (dev.type === 'pppoe' || dev.deviceType === 'pppoe') ? 'pppoe'
            : (dev.type === 'onu' || dev.deviceType === 'onu') ? 'onu'
            : 'netwatch';
        closeMeasure();
        handleDeviceClick(dev, type, 'settings');
    }, [allMarkers, closeMeasure, handleDeviceClick]);

    // === Draw kabel (C2) ===
    // Snap titik gambar ke marker device terdekat (≤30m) supaya ujung kabel pas
    // di device + bisa rekam from/to device id.
    const snapToMarker = useCallback((pos) => {
        let best = null;
        let bestD = Infinity;
        for (const m of allMarkers) {
            if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
            const d = calculateDistance(pos[0], pos[1], m.lat, m.lng);
            if (d < bestD) { bestD = d; best = m; }
        }
        if (best && bestD <= 30) return { pos: [best.lat, best.lng], deviceId: best.id };
        return { pos, deviceId: null };
    }, [allMarkers]);

    const startDrawCable = useCallback(() => {
        setActivePanel(null);
        setMeasureLine(null);
        setIsPickingCoordinate(false); // mode pick koordinat & gambar tak boleh barengan
        setIsDrawingCable(true);
        setDrawCablePath([]);
        setDrawCableName('');
        setDrawCableCores([1, 2]);
    }, []);

    const handleDrawCableClick = useCallback((pos) => {
        setDrawCablePath((prev) => [...prev, snapToMarker(pos).pos]);
    }, [snapToMarker]);
    // Sinkron ref (dibaca handler marker/garis yang di-memo).
    useEffect(() => { isDrawingCableRef.current = isDrawingCable; }, [isDrawingCable]);
    useEffect(() => { addDrawPointRef.current = handleDrawCableClick; }, [handleDrawCableClick]);
    useEffect(() => { editingCableRef.current = editingCable; }, [editingCable]);

    const undoDrawPoint = useCallback(() => setDrawCablePath((prev) => prev.slice(0, -1)), []);

    const cancelDrawCable = useCallback(() => {
        setIsDrawingCable(false);
        setDrawCablePath([]);
    }, []);

    const toggleDrawCore = useCallback((i) => {
        setDrawCableCores((prev) => (prev.includes(i)
            ? prev.filter((x) => x !== i)
            : [...prev, i].sort((a, b) => a - b)));
    }, []);

    const saveDrawCable = useCallback(() => {
        if (drawCablePath.length < 2) { toast.error('Kabel butuh minimal 2 titik'); return; }
        if (drawCableCores.length === 0) { toast.error('Pilih minimal 1 core'); return; }
        const first = snapToMarker(drawCablePath[0]);
        const last = snapToMarker(drawCablePath[drawCablePath.length - 1]);
        createCableMutation.mutate({
            name: drawCableName.trim() || null,
            routerId: filteredRouterId || null,
            path: drawCablePath,
            cores: drawCableCores,
            fromDeviceId: first.deviceId,
            toDeviceId: last.deviceId,
        }, {
            onSuccess: () => { setIsDrawingCable(false); setDrawCablePath([]); setShowCables(true); },
        });
    }, [drawCablePath, drawCableCores, drawCableName, filteredRouterId, snapToMarker, createCableMutation]);

    // === Edit / hapus kabel (C3) ===
    // Edit jalur pakai EditablePath: ujung (from/to) tetap, waypoint tengah bisa
    // digeser/tambah/hapus. Ganti nama & core lewat panel.
    const startEditCable = useCallback((cable) => {
        const path = Array.isArray(cable.path) ? cable.path : [];
        if (path.length < 2) return;
        setIsDrawingCable(false);
        setMeasureLine(null);
        setEditingCable({ id: cable.id, from: path[0], to: path[path.length - 1] });
        setEditCableWaypoints(path.slice(1, -1));
        setEditCableName(cable.name || '');
        setEditCableCores(Array.isArray(cable.cores) ? cable.cores.filter((c) => Number.isFinite(Number(c))) : []);
    }, []);

    const cancelEditCable = useCallback(() => {
        setEditingCable(null);
        setEditCableWaypoints([]);
        setEditCableName('');
        setEditCableCores([]);
    }, []);

    const toggleEditCore = useCallback((i) => {
        setEditCableCores((prev) => (prev.includes(i)
            ? prev.filter((x) => x !== i)
            : [...prev, i].sort((a, b) => a - b)));
    }, []);

    const saveEditCable = useCallback(() => {
        if (!editingCable) return;
        if (!editCableCores.length) { toast.error('Pilih minimal 1 core'); return; }
        const path = [editingCable.from, ...editCableWaypoints, editingCable.to];
        updateCableMutation.mutate({
            id: editingCable.id,
            data: { name: editCableName.trim() || null, cores: editCableCores, path },
        }, {
            onSuccess: () => cancelEditCable(),
        });
    }, [editingCable, editCableWaypoints, editCableName, editCableCores, updateCableMutation, cancelEditCable]);

    const deleteCable = useCallback((id, name) => {
        if (!id) return;
        if (!window.confirm(`Hapus kabel "${name || 'tanpa nama'}"? Tindakan ini tak bisa dibatalkan.`)) return;
        deleteCableMutation.mutate(id, {
            onSuccess: () => { setEditingCable((prev) => (prev?.id === id ? null : prev)); },
        });
    }, [deleteCableMutation]);

    // === Ukur jarak / cek putus pada kabel (C5) ===
    // Kabel = 1 polyline menerus → ukur "X meter dari ujung" otomatis lintas-ODP.
    const measureCable = useMemo(
        () => (measureCableId ? cableSegments.find((c) => c.id === measureCableId) || null : null),
        [measureCableId, cableSegments],
    );
    const cableMeasurePoint = useMemo(() => {
        if (!measureCable) return null;
        const m = Number(cableMeasureMeters);
        if (!(m >= 0)) return null;
        return pointAlongPath(measureCable.path, m, cableMeasureSide);
    }, [measureCable, cableMeasureMeters, cableMeasureSide]);

    const startMeasureCable = useCallback((cableId) => {
        setEditingCable(null);
        setMeasureLine(null);
        setIsDrawingCable(false);
        setMeasureCableId(cableId);
        setCableMeasureMeters(0);
        setCableMeasureSide('source');
        setCableMeasureLabel('');
    }, []);

    const cancelMeasureCable = useCallback(() => setMeasureCableId(null), []);

    const saveCableMarker = useCallback(() => {
        if (!measureCable) return;
        const m = Number(cableMeasureMeters);
        if (!(m >= 0)) return;
        const existing = Array.isArray(measureCable.distanceMarkers) ? measureCable.distanceMarkers : [];
        const distanceMarkers = [...existing, { side: cableMeasureSide, meters: m, label: (cableMeasureLabel || '').trim() }];
        updateCableMutation.mutate({ id: measureCable.id, data: { distanceMarkers } }, {
            onSuccess: () => { toast.success('Penanda putus disimpan'); setCableMeasureMeters(0); setCableMeasureLabel(''); },
        });
    }, [measureCable, cableMeasureMeters, cableMeasureSide, cableMeasureLabel, updateCableMutation]);

    const deleteCableMarker = useCallback((idx) => {
        if (!measureCable) return;
        const existing = Array.isArray(measureCable.distanceMarkers) ? measureCable.distanceMarkers : [];
        const distanceMarkers = existing.filter((_, i) => i !== idx);
        updateCableMutation.mutate({ id: measureCable.id, data: { distanceMarkers } });
    }, [measureCable, updateCableMutation]);

    // Semua penanda putus kabel (tersimpan) → titik di peta, selalu tampil saat
    // layer kabel aktif. { pos, label, cableId }
    const cableMarkerPoints = useMemo(() => {
        const out = [];
        for (const c of cableSegments) {
            for (const mk of (c.distanceMarkers || [])) {
                const pos = pointAlongPath(c.path, Number(mk.meters), mk.side);
                if (pos) out.push({ pos, label: mk.label, meters: mk.meters });
            }
        }
        return out;
    }, [cableSegments]);

    // Tombol "Edit Source/Destination" di popup garis (HTML string Leaflet) pakai
    // atribut data-edit-device. Ditangkap di CAPTURE phase document → jalan lebih
    // dulu daripada stopPropagation bubble-nya Leaflet popup, dan CSP-safe (tanpa
    // inline onclick). Ref agar listener sekali daftar tapi panggil handler terbaru.
    const openEditRef = React.useRef(openDeviceEditById);
    useEffect(() => { openEditRef.current = openDeviceEditById; }, [openDeviceEditById]);
    useEffect(() => {
        const h = (e) => {
            const btn = e.target?.closest?.('[data-edit-device]');
            if (!btn) return;
            const id = btn.getAttribute('data-edit-device');
            if (id) openEditRef.current?.(id);
        };
        document.addEventListener('click', h, true); // capture
        return () => document.removeEventListener('click', h, true);
    }, []);

    const handleCloseModal = useCallback(() => {
        setIsModalOpen(false);
        setSelectedDevice(null);
        setIsPickingCoordinate(false);
    }, []);

    /**
     * Quick-view handler: klik marker → buka SidePanel quick view (read-only).
     * Panel lama otomatis tutup karena single activePanel state.
     * Tombol "Detail Lengkap / Edit" di panel → re-route ke handleDeviceClick
     * (DeviceModal lama) untuk full edit.
     *
     * @param {object} device — node dari marker click
     * @param {'router' | 'netwatch'} type
     */
    const handleQuickView = useCallback((device, type) => {
        if (isDrawingCableRef.current) { drawPointFromDevice(device); return; }
        if (editingCableRef.current) return; // sedang edit kabel → jangan buka panel
        if (type !== 'router' && type !== 'netwatch') return;
        // Stamp deviceType ke device supaya handleQuickViewEditFull bisa derive
        // type konsisten dari data (per H1 fix — tidak depend ke activePanel state).
        setQuickViewDevice({ ...device, deviceType: type });
        setActivePanel(type);
    }, [drawPointFromDevice]);

    const handleCloseQuickView = useCallback(() => {
        setActivePanel(null);
        setQuickViewDevice(null);
    }, []);

    /**
     * Bridge: klik "Detail Lengkap" di SidePanel → tutup panel + buka DeviceModal
     * existing. Tidak ubah DeviceModal logic — preserve edit/save/delete flow.
     *
     * Per code-review H1: derive `type` dari `device.deviceType` (data) bukan
     * `activePanel` state — supaya tidak stale closure saat panel transition
     * (race condition antara close + click button).
     */
    const handleQuickViewEditFull = useCallback((device, initialTab = 'settings') => {
        if (!device) return;
        const type = device.deviceType === 'router' ? 'router' : 'netwatch';
        setActivePanel(null);
        setQuickViewDevice(null);
        setSelectedDevice({ ...device, type });
        setModalInitialTab(initialTab);
        setIsModalOpen(true);
    }, []);

    /**
     * Index netwatch group by routerId — Map untuk O(1) lookup.
     * Per perf audit M-2: sebelumnya `.find()` di quickViewNetwatchCount
     * dijalankan O(n) tiap render → mahal saat 50+ router groups dengan
     * 100+ entries per group, especially saat hoverTick fires (traffic
     * update tiap detik kalau live mode on).
     */
    const netwatchByRouterId = useMemo(() => {
        const m = new Map();
        (stableNetwatchData || []).forEach((g) => {
            if (g?.routerId) m.set(g.routerId, g);
        });
        return m;
    }, [stableNetwatchData]);

    /**
     * Hitung netwatch host count untuk router yang lagi di-quick-view.
     * Dipakai oleh RouterDetailPanel sebagai prop.
     */
    const quickViewNetwatchCount = useMemo(() => {
        if (activePanel !== 'router' || !quickViewDevice?.id) return 0;
        const group = netwatchByRouterId.get(quickViewDevice.id);
        return Array.isArray(group?.entries) ? group.entries.length : 0;
    }, [activePanel, quickViewDevice, netwatchByRouterId]);

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
    // Mutation di deps OK di sini (handleQuickPlaceClick): user-action handler,
    // bukan render hot path. Ref pattern hanya dipakai di JSX inline yang masuk
    // useMemo `markers` deps (lihat updateNetwatchMutateRef line 519).
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
        // Better to trigger mutation. Pakai ref (perf review C-1 follow-up)
        // supaya identity stable + pppoeMarkers tidak recompute spurious.
        updatePppoeMutateRef.current({
            pppoeId: pppoe.id,
            data: {
                latitude: String(newPos[0]),
                longitude: String(newPos[1])
            }
        });
    }, []);

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

    // --- Markers Generation: Split per device type (perf audit C-1) ---
    //
    // Sebelumnya satu monolithic `markers` useMemo bikin SEMUA 500+ JSX
    // elements re-allocate tiap polling 30s netwatch, walau data router +
    // pppoe tidak berubah. React reconciler tetap diff 500 subtree.
    //
    // Split jadi 3 sub-memo per device type. Saat netwatch poll fire:
    // - mapData.nodes berubah → netwatchMarkers recompute
    // - mapData.routers + mapData.pppoeNodes identity preserved
    //   (via TanStack Query v5 structural sharing, H-1 fix)
    //   → routerMarkers + pppoeMarkers SKIP recompute (memo hit)
    //
    // Combiner final cuma concat existing arrays (cheap, no element alloc).
    // Hasil: 2/3 markers preserve identity di netwatch refresh → React
    // reconciler skip diff buat unchanged subtrees.

    // 1. Router Markers
    const routerMarkers = useMemo(() => {
        const out = [];
        mapData.routers.forEach(router => {
            if (typeof router.lat !== 'number' || typeof router.lng !== 'number' ||
                (searchQuery && !(
                    (router.name && router.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (router.host && router.host.includes(searchQuery))
                ))) {
                return;
            }

            out.push(
                <MemoizedSmartMarker
                    key={`router-${router.id}`}
                    id={router.id}
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
                    // Klik marker → langsung buka panel detail (bukan popup
                    // perantara). Di edit mode klik diabaikan supaya tidak
                    // ganggu drag reposisi.
                    onClick={isEditMode ? null : () => handleQuickView({ ...router, deviceType: 'router' }, 'router')}
                    eventHandlers={{
                        mouseover: () => handleMarkerHover(router.id),
                        mouseout: () => handleMarkerHover(null)
                    }}
                >
                    <DeviceTooltip
                        node={{ ...router, deviceType: 'router' }}
                    />
                </MemoizedSmartMarker>
            );
        });
        return out;
    }, [
        mapData.routers,
        searchQuery,
        isEditMode,
        handleMarkerHover,
        handleQuickView,
    ]);

    // 2. Netwatch Node Markers
    const netwatchMarkers = useMemo(() => {
        const out = [];
        mapData.nodes.forEach(node => {
            if (typeof node.lat !== 'number' || typeof node.lng !== 'number' ||
                (searchQuery && !(
                    (node.name && node.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (node.host && node.host.includes(searchQuery))
                ))) {
                return;
            }

            const line = linesByNetwatchId[node.id];

            out.push(
                <MemoizedSmartMarker
                    key={`netwatch-${node.routerId}-${node.id}`}
                    id={node.id}
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
                    usedPorts={node.usedPorts}
                    portCapacity={node.portCapacity}
                    splitterRatio={node.splitterRatio}
                    draggable={isEditMode}
                    onDragEnd={(pos) => {
                        const payload = { latitude: String(pos[0]), longitude: String(pos[1]) };

                        if (node.deviceType === 'odp' || node.deviceType === 'client' || node.deviceType === 'pppoe') {
                            updateNetwatchMutateRef.current({
                                routerId: node.routerId,
                                netwatchId: node.id,
                                data: payload
                            });
                            return;
                        }

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

                        if (!node.isPassive && node.deviceType !== 'onu') {
                            updateNetwatchMutateRef.current({
                                routerId: node.routerId,
                                netwatchId: node.id,
                                data: payload
                            });
                        }
                    }}
                    // Klik marker → langsung buka panel detail netwatch.
                    onClick={isEditMode ? null : () => handleQuickView(node, node.deviceType === 'router' ? 'router' : 'netwatch')}
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
                </MemoizedSmartMarker>
            );
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- updateOnuMutation +
        // updateNetwatchMutateRef sengaja tidak di deps: ref pattern (M-1) + mutation
        // object identity flap tiap render → masuk deps bikin recompute spurious.
    }, [
        mapData.nodes,
        searchQuery,
        showLabels,
        isEditMode,
        isHeatmapMode,
        linesByNetwatchId,
        handleMarkerHover,
        handleQuickView,
    ]);

    // 3. PPPoE Client Markers
    const pppoeMarkers = useMemo(() => {
        const out = [];
        (mapData.pppoeNodes || []).forEach(pppoe => {
            if (typeof pppoe.lat !== 'number' || typeof pppoe.lng !== 'number' ||
                (searchQuery && !(
                    (pppoe.name && pppoe.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (pppoe.address && pppoe.address.includes(searchQuery))
                ))) {
                return;
            }

            const line = linesByPppoeId[pppoe.id];

            out.push(
                <MemoizedSmartMarker
                    key={`pppoe-${pppoe.id}`}
                    id={pppoe.id}
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
                    // Klik marker PPPoE → langsung buka detail (modal PPPoE).
                    onClick={isEditMode ? null : () => handleDeviceClick({ ...pppoe, deviceType: 'pppoe' }, 'pppoe')}
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
                </MemoizedSmartMarker>
            );
        });
        return out;
    }, [
        mapData.pppoeNodes,
        searchQuery,
        showLabels,
        isEditMode,
        isHeatmapMode,
        linesByPppoeId,
        handleMarkerHover,
        handleDeviceClick,
        handlePppoeDragEnd,
    ]);

    // Combiner — cheap concat dari 3 sub-array yang sudah memoized.
    // Saat sub-array identity preserved (mis. routerMarkers tidak ganti
    // saat netwatch poll), combiner output stable di slot itu — React
    // reconciler skip diff bagian itu.
    const markers = useMemo(
        () => [...routerMarkers, ...netwatchMarkers, ...pppoeMarkers],
        [routerMarkers, netwatchMarkers, pppoeMarkers],
    );

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
                // Key sengaja TIDAK include enableAnimation (per perf audit H-3).
                // Sebelumnya force REMOUNT (Leaflet polyline destroyed + recreated
                // + flash visual) tiap toggle animation. enableAnimation di-pass
                // sebagai prop biasa → MemoizedNetworkLine RE-RENDER (preserve
                // polyline element, update style). areLinesEqual line 269 sudah
                // compare enableAnimation jadi memo tetap kerja correct.
                <MemoizedNetworkLine
                    key={`line-${line.id}`}
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
                    onLineClick={handleLineMeasure}
                    highlightColor={highlightCore?.lineId === line.id ? highlightCore.hex : line.coreColorHex}
                />
            );
        });
    }, [
        mapData.lines,
        handleLineMeasure,
        highlightCore,
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

    // Penanda jarak di sepanjang garis — hitung posisi via pointAlongPath.
    const distanceMarkerPoints = useMemo(() => {
        const out = [];
        for (const line of (mapData.lines || [])) {
            const dm = line.distanceMarkers;
            const path = line.fullPath;
            if (!Array.isArray(dm) || dm.length === 0 || !Array.isArray(path) || path.length < 2) continue;
            dm.forEach((m, idx) => {
                const meters = Number(m?.meters);
                if (!(meters >= 0)) return;
                const side = m?.side === 'dest' ? 'dest' : 'source';
                const pos = pointAlongPath(path, meters, side);
                if (!pos) return;
                out.push({ key: `${line.id}-dm-${idx}`, pos, meters, side, label: m?.label || '' });
            });
        }
        return out;
    }, [mapData.lines]);

    // Titik ukur live (mengikuti input meter) untuk cek jalur putus.
    const measurePoint = useMemo(() => {
        if (!measureLine || !Array.isArray(measureLine.fullPath) || measureLine.fullPath.length < 2) return null;
        const m = Number(measureMeters);
        if (!(m >= 0)) return null;
        return pointAlongPath(measureLine.fullPath, m, measureSide);
    }, [measureLine, measureMeters, measureSide]);

    // Simpan titik ukur jadi penanda permanen di device pemilik garis.
    const handleSaveMeasure = useCallback(() => {
        if (!measureLine) return;
        const m = Number(measureMeters);
        if (!(m >= 0)) return;
        const existing = Array.isArray(measureLine.distanceMarkers) ? measureLine.distanceMarkers : [];
        const distanceMarkers = JSON.stringify([...existing, { side: measureSide, meters: m, label: (measureLabel || '').trim() }]);
        const done = () => { toast.success('Penanda jarak disimpan'); closeMeasure(); };
        const fail = (e) => toast.error(`Gagal simpan: ${e?.message || 'error'}`);
        if (measureLine.nodeType === 'onu' && measureLine.oltId) {
            updateOnuMutation.mutate({ oltId: measureLine.oltId, onuId: measureLine.netwatchId, data: { distanceMarkers } }, { onSuccess: done, onError: fail });
        } else if (measureLine.netwatchId) {
            updateNetwatchMutation.mutate({ routerId: measureLine.routerId, netwatchId: measureLine.netwatchId, data: { distanceMarkers } }, { onSuccess: done, onError: fail });
        } else {
            toast('Garis ini (PPPoE) belum didukung untuk simpan penanda.');
        }
    }, [measureLine, measureMeters, measureSide, measureLabel, updateOnuMutation, updateNetwatchMutation, closeMeasure]);

    // Hapus 1 penanda jarak dari detail panel (netwatch/ODP). Persist ke DB.
    const handleDeleteDistanceMarker = useCallback((idx) => {
        const nw = quickViewDevice;
        if (!nw?.id) return;
        let markers = [];
        try {
            const dm = nw.distanceMarkers;
            markers = Array.isArray(dm) ? dm : (dm ? JSON.parse(dm) : []);
        } catch { markers = []; }
        const next = markers.filter((_, i) => i !== idx);
        const distanceMarkers = next.length ? JSON.stringify(next) : null;
        updateNetwatchMutation.mutate(
            { routerId: nw.routerId, netwatchId: nw.id, data: { distanceMarkers } },
            {
                onSuccess: () => toast.success('Penanda jarak dihapus'),
                onError: (e) => toast.error(`Gagal hapus: ${e?.message || 'error'}`),
            }
        );
    }, [quickViewDevice, updateNetwatchMutation]);

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
                            enabled={!!selectedUnplacedDevice || isPickingCoordinate || isDrawingCable}
                            onMapClick={isDrawingCable ? handleDrawCableClick : (isPickingCoordinate ? handlePickCoordinate : handleQuickPlaceClick)}
                        />
                        <MeasurePanelCloser stateRef={measureStateRef} onClose={closeMeasure} />
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

                        {/* Penanda jarak di sepanjang garis (X m dari source/dest) */}
                        {!isEditingPath && distanceMarkerPoints.map((dm) => (
                            <CircleMarker
                                key={dm.key}
                                center={dm.pos}
                                radius={4}
                                pane="markerPane"
                                pathOptions={{
                                    color: '#0b0e14',
                                    weight: 2,
                                    fillColor: dm.side === 'dest' ? '#f59e0b' : '#06b6d4',
                                    fillOpacity: 1,
                                }}
                            >
                                {showLabels && zoomLevel >= 16 && (
                                    <Tooltip permanent direction="top" offset={[0, -3]} className="dist-marker-label">
                                        {dm.label ? `${dm.label} · ` : ''}{formatDistance(dm.meters)}
                                    </Tooltip>
                                )}
                            </CircleMarker>
                        ))}

                        {/* Kabel multi-core: garis BELANG warna core (candy stripe).
                            Tiap core = 1 polyline dashed dengan offset beda → warna
                            bergantian sepanjang kabel. Garis DOWN dilewati (tetap
                            merah dari base line). */}
                        {!isEditingPath && mapData.lines.map((line) => {
                            const lc = line.lineCores;
                            if (!Array.isArray(lc) || lc.length < 2) return null;
                            const path = line.fullPath;
                            if (!Array.isArray(path) || path.length < 2) return null;
                            const down = line.status && !['up', 'online', 'active', 'warning'].includes(String(line.status).toLowerCase());
                            if (down) return null;
                            const N = lc.length;
                            return lc.map((c, idx) => (
                                <Polyline
                                    key={`${line.id}-core-${idx}`}
                                    positions={path}
                                    interactive={false}
                                    pathOptions={{
                                        color: c.hex,
                                        weight: 4,
                                        opacity: 0.95,
                                        lineCap: 'butt',
                                        ...candyDashProps(idx, N),
                                    }}
                                />
                            ));
                        })}

                        {/* Fiber cables (Cara C) — objek kabel digambar bebas, dirender
                            belang N-core. Independen dari device-tree. Klik → popup info.
                            Layer bisa disembunyikan lewat toggle (C4). */}
                        {!isEditingPath && showCables && cableSegments.map((cable) => {
                            if (editingCable && editingCable.id === cable.id) return null; // sedang diedit → EditablePath
                            const N = cable.cores.length;
                            return (
                                <React.Fragment key={`cable-${cable.id}`}>
                                    {/* hitbox transparan (lebar) untuk klik + popup */}
                                    <Polyline positions={cable.path} pathOptions={{ color: '#000', weight: 12, opacity: 0 }}>
                                        <Popup>
                                            <div style={{ minWidth: 170 }}>
                                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{cable.name || 'Kabel'}</div>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                                                    {cable.cores.map((c, i) => (
                                                        <span key={`${cable.id}-sw-${i}`} title={`Core ${c} · ${coreColor(c).name}`} style={{ width: 12, height: 12, borderRadius: 3, background: coreColor(c).hex, border: '1px solid rgba(255,255,255,0.4)', display: 'inline-block' }} />
                                                    ))}
                                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 2 }}>{N} core</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{formatDistance(cable.length)}</div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button type="button" onClick={() => startMeasureCable(cable.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#0e3a44', color: '#67e8f9', border: '1px solid rgba(103,232,249,0.35)', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>straighten</span> Ukur
                                                    </button>
                                                    <button type="button" onClick={() => startEditCable(cable)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span> Edit
                                                    </button>
                                                    <button type="button" onClick={() => deleteCable(cable.id, cable.name)} disabled={deleteCableMutation.isPending} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(127,29,29,0.4)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: deleteCableMutation.isPending ? 'not-allowed' : 'pointer' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span> Hapus
                                                    </button>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Polyline>
                                    {cable.cores.map((c, idx) => (
                                        <Polyline
                                            key={`cable-${cable.id}-core-${idx}`}
                                            positions={cable.path}
                                            interactive={false}
                                            pathOptions={{
                                                color: coreColor(c).hex,
                                                weight: 4,
                                                opacity: 0.95,
                                                lineCap: 'butt',
                                                ...candyDashProps(idx, N),
                                            }}
                                        />
                                    ))}
                                </React.Fragment>
                            );
                        })}

                        {/* Edit jalur kabel (C3): EditablePath — geser/tambah/hapus
                            waypoint tengah (ujung tetap). Warna = core pertama. */}
                        {editingCable && (
                            <EditablePath
                                fromPosition={editingCable.from}
                                toPosition={editingCable.to}
                                waypoints={editCableWaypoints}
                                isEditing={true}
                                color={editCableCores.length ? coreColor(editCableCores[0]).hex : '#22d3ee'}
                                weight={4}
                                onWaypointsChange={setEditCableWaypoints}
                            />
                        )}

                        {/* Penanda putus tersimpan pada kabel (C5) — selalu tampil
                            saat layer kabel aktif. */}
                        {showCables && !isEditingPath && cableMarkerPoints.map((mk, i) => (
                            <CircleMarker
                                key={`cablemk-${i}`}
                                center={mk.pos}
                                radius={6}
                                pane="markerPane"
                                pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}
                            >
                                {(showLabels && zoomLevel >= 16) && (
                                    <Tooltip permanent direction="top" offset={[0, -5]} className="dist-marker-tooltip">
                                        {mk.label ? `${mk.label} · ` : ''}{formatDistance(mk.meters)}
                                    </Tooltip>
                                )}
                            </CircleMarker>
                        ))}

                        {/* Titik ukur LIVE kabel (C5) — ikut input meter di panel. */}
                        {measureCable && cableMeasurePoint && (
                            <CircleMarker
                                center={cableMeasurePoint}
                                radius={7}
                                pane="markerPane"
                                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}
                            >
                                <Tooltip permanent direction="top" offset={[0, -5]} className="dist-marker-tooltip">
                                    {formatDistance(Number(cableMeasureMeters) || 0)} dari {cableMeasureSide === 'dest' ? 'ujung' : 'awal'}
                                </Tooltip>
                            </CircleMarker>
                        )}

                        {/* Preview LIVE saat menggambar kabel (C2): garis belang core
                            terpilih + titik vertex. */}
                        {isDrawingCable && drawCablePath.length >= 2 && (
                            (drawCableCores.length ? drawCableCores : [0]).map((c, idx) => (
                                <Polyline
                                    key={`draw-core-${idx}`}
                                    positions={drawCablePath}
                                    interactive={false}
                                    pathOptions={{
                                        color: c ? coreColor(c).hex : '#22d3ee',
                                        weight: 4,
                                        opacity: 0.9,
                                        lineCap: 'butt',
                                        ...candyDashProps(idx, drawCableCores.length || 1),
                                    }}
                                />
                            ))
                        )}
                        {isDrawingCable && drawCablePath.map((p, i) => (
                            <CircleMarker
                                key={`draw-pt-${i}`}
                                center={p}
                                radius={5}
                                pane="markerPane"
                                pathOptions={{ color: '#fff', weight: 2, fillColor: '#06b6d4', fillOpacity: 1 }}
                            />
                        ))}

                        {/* Titik ukur LIVE (cek jalur putus) — ikut input meter */}
                        {!isEditingPath && measurePoint && (
                            <CircleMarker
                                center={measurePoint}
                                radius={7}
                                pane="markerPane"
                                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}
                            >
                                <Tooltip permanent direction="top" offset={[0, -5]} className="dist-marker-tooltip">
                                    {formatDistance(Number(measureMeters) || 0)} dari {measureSide === 'dest' ? 'dest' : 'source'}
                                </Tooltip>
                            </CircleMarker>
                        )}

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

                    {/* Floating Status Counter (Top-Right) — total tenant router + alert.
                        Alert row klik → open AlertPanel quick view (read-only).
                        HIDE saat activePanel terbuka — SidePanel di right side overlap
                        dengan posisi counter. */}
                    {!showRoutersOnly && !selectedUnplacedDevice && !activePanel && (
                        <FloatingStatusCounter
                            routerCounts={routerStatusCounts}
                            alertCount={alertCount?.connectivity ?? 0}
                            onAlertClick={() => setActivePanel('alert')}
                        />
                    )}

                    {/* Floating Status Filter Chip (Top-Left) — filter marker by status.
                        Posisi top-left, tidak overlap dengan SidePanel right — tetap visible. */}
                    {!showRoutersOnly && !selectedUnplacedDevice && (
                        <MapStatusFilter
                            value={statusFilter}
                            onChange={setStatusFilter}
                            counts={routerStatusCounts}
                        />
                    )}

                    {/* Map Controls (Right Panel) — TETAP visible saat AlertPanel
                        terbuka, tapi geser posisi via prop panelOpen supaya tidak
                        overlap dengan SidePanel (Settings shift ke kiri AlertPanel). */}
                    {!showRoutersOnly && !selectedUnplacedDevice && (
                        <MapControls
                            panelOpen={!!activePanel}
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

                    {/* Legend — cuma warna + show labels. 3 toggle performa
                        (animation/cluster/lowPerf) sudah pindah ke MapControls. */}
                    {!showRoutersOnly && !selectedUnplacedDevice && (
                        <MapLegend
                            showLabels={showLabels}
                            onToggleLabels={handleToggleLabels}
                            isHeatmapMode={isHeatmapMode}
                            mapColors={mapColors}
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

                    {/* Quick-view panels — single panel state (panel tidak menumpuk).
                        Klik marker router/netwatch → buka SidePanel.
                        Tombol "Detail Lengkap" di panel → tutup panel + buka DeviceModal lama. */}
                    <AlertPanel
                        isOpen={activePanel === 'alert'}
                        onClose={() => setActivePanel(null)}
                    />
                    <RouterDetailPanel
                        isOpen={activePanel === 'router'}
                        onClose={handleCloseQuickView}
                        router={activePanel === 'router' ? quickViewDevice : null}
                        netwatchCount={quickViewNetwatchCount}
                        onEditFull={handleQuickViewEditFull}
                    />
                    <NetwatchDetailPanel
                        isOpen={activePanel === 'netwatch'}
                        onClose={handleCloseQuickView}
                        netwatch={activePanel === 'netwatch' ? quickViewDevice : null}
                        onEditFull={handleQuickViewEditFull}
                        onDeleteDistanceMarker={handleDeleteDistanceMarker}
                    />

                    {/* Trash confirmation — 3 options (ONU only / Netwatch only / Both) */}
                    <DeleteDeviceDialog
                        isOpen={deleteDialog.isOpen}
                        node={deleteDialog.node}
                        onClose={() => setDeleteDialog({ isOpen: false, node: null })}
                        onConfirm={handleDeleteConfirmed}
                    />

                    {/* Cluster kabel kiri-bawah (C2 gambar + C4 toggle layer) */}
                    {!showRoutersOnly && !selectedUnplacedDevice && !isEditingPath && !isDrawingCable && !measureLine && !isPickingCoordinate && !editingCable && !measureCable && (
                        <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 1100, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                type="button"
                                onClick={startDrawCable}
                                title="Gambar kabel fiber di peta (Cara C)"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 10, padding: '8px 12px', color: '#e2e8f0', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a78bfa' }}>cable</span>
                                Gambar Kabel
                            </button>
                            {cableSegments.length > 0 && (
                                <button
                                    type="button"
                                    onClick={toggleShowCables}
                                    aria-pressed={showCables}
                                    title={showCables ? 'Sembunyikan layer kabel' : 'Tampilkan layer kabel'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(15,23,42,0.95)', border: `1px solid ${showCables ? 'rgba(167,139,250,0.5)' : 'rgba(148,163,184,0.35)'}`, borderRadius: 10, padding: '8px 12px', color: showCables ? '#e2e8f0' : '#94a3b8', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showCables ? 'visibility' : 'visibility_off'}</span>
                                    Kabel ({cableSegments.length})
                                </button>
                            )}
                        </div>
                    )}

                    {/* Panel gambar kabel (C2) */}
                    {isDrawingCable && (
                        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 440, maxWidth: '94vw', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.55)', padding: 14, color: '#e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a78bfa' }}>cable</span>
                                    Gambar Kabel · {drawCablePath.length} titik
                                </div>
                                <button type="button" onClick={cancelDrawCable} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }} title="Batal">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
                                Klik di peta untuk menambah titik jalur (klik marker/dekat marker → nempel ke device). Pilih core yang dibawa, lalu Simpan.
                            </div>
                            <input
                                type="text" aria-label="Nama kabel" placeholder="Nama kabel (opsional, mis. Trunk PUSAT-ADY)"
                                value={drawCableName} onChange={(e) => setDrawCableName(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12, marginBottom: 10 }}
                            />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Core yang dibawa ({drawCableCores.length}):</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                {FIBER_COLORS.map((fc, idx) => {
                                    const i = idx + 1;
                                    const active = drawCableCores.includes(i);
                                    return (
                                        <button
                                            type="button" key={i} onClick={() => toggleDrawCore(i)} aria-pressed={active} title={`Core ${i} · ${fc.name}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', border: active ? '1px solid rgba(148,163,184,0.5)' : '1px solid rgba(148,163,184,0.2)', color: active ? '#e2e8f0' : '#94a3b8', fontSize: 11 }}
                                        >
                                            <span style={{ width: 12, height: 12, borderRadius: 3, background: fc.hex, border: '1px solid rgba(255,255,255,0.4)' }} />
                                            C{i}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={undoDrawPoint} disabled={!drawCablePath.length} style={{ flex: 1, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '7px 8px', color: drawCablePath.length ? '#e2e8f0' : '#475569', fontSize: 12, cursor: drawCablePath.length ? 'pointer' : 'not-allowed' }}>Undo titik</button>
                                <button type="button" onClick={cancelDrawCable} style={{ flex: 1, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '7px 8px', color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>Batal</button>
                                <button
                                    type="button"
                                    onClick={saveDrawCable}
                                    disabled={drawCablePath.length < 2 || !drawCableCores.length || createCableMutation.isPending}
                                    style={{ flex: 1.4, background: (drawCablePath.length >= 2 && drawCableCores.length) ? '#06b6d4' : 'rgba(6,182,212,0.35)', color: '#04121a', fontWeight: 800, border: 'none', borderRadius: 6, padding: '7px 8px', cursor: (drawCablePath.length >= 2 && drawCableCores.length) ? 'pointer' : 'not-allowed', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                                    {createCableMutation.isPending ? 'Menyimpan…' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Panel edit kabel (C3) */}
                    {editingCable && (
                        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 440, maxWidth: '94vw', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.55)', padding: 14, color: '#e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a78bfa' }}>edit</span>
                                    Edit Kabel · {editCableWaypoints.length + 2} titik
                                </div>
                                <button type="button" onClick={cancelEditCable} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }} title="Batal">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
                                Geser titik untuk membelokkan jalur. Klik garis/titik-tengah untuk tambah titik; klik-kanan titik untuk hapus. Ujung kabel tetap.
                            </div>
                            <input
                                type="text" aria-label="Nama kabel" placeholder="Nama kabel (opsional)"
                                value={editCableName} onChange={(e) => setEditCableName(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12, marginBottom: 10 }}
                            />
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Core yang dibawa ({editCableCores.length}):</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                {FIBER_COLORS.map((fc, idx) => {
                                    const i = idx + 1;
                                    const active = editCableCores.includes(i);
                                    return (
                                        <button
                                            type="button" key={i} onClick={() => toggleEditCore(i)} aria-pressed={active} title={`Core ${i} · ${fc.name}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', border: active ? '1px solid rgba(148,163,184,0.5)' : '1px solid rgba(148,163,184,0.2)', color: active ? '#e2e8f0' : '#94a3b8', fontSize: 11 }}
                                        >
                                            <span style={{ width: 12, height: 12, borderRadius: 3, background: fc.hex, border: '1px solid rgba(255,255,255,0.4)' }} />
                                            C{i}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={() => deleteCable(editingCable.id, editCableName)} disabled={deleteCableMutation.isPending} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(127,29,29,0.4)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 6, padding: '7px 8px', fontSize: 12, fontWeight: 600, cursor: deleteCableMutation.isPending ? 'not-allowed' : 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span> Hapus
                                </button>
                                <button type="button" onClick={cancelEditCable} style={{ flex: 1, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '7px 8px', color: '#e2e8f0', fontSize: 12, cursor: 'pointer' }}>Batal</button>
                                <button
                                    type="button"
                                    onClick={saveEditCable}
                                    disabled={!editCableCores.length || updateCableMutation.isPending}
                                    style={{ flex: 1.4, background: editCableCores.length ? '#06b6d4' : 'rgba(6,182,212,0.35)', color: '#04121a', fontWeight: 800, border: 'none', borderRadius: 6, padding: '7px 8px', cursor: editCableCores.length ? 'pointer' : 'not-allowed', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                                    {updateCableMutation.isPending ? 'Menyimpan…' : 'Simpan'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Panel Ukur Kabel · Cek Putus (C5) — ukur lintas-ODP */}
                    {measureCable && (
                        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 400, maxWidth: '92vw', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.55)', padding: 14, color: '#e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#06b6d4' }}>straighten</span>
                                    Ukur Kabel · Cek Putus
                                </div>
                                <button type="button" onClick={cancelMeasureCable} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }} title="Tutup">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
                                {measureCable.name || 'Kabel'} · total {formatDistance(measureCable.length)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <input
                                    type="number" aria-label="Jarak meter" min="0" max={Math.ceil(measureCable.length || 0)}
                                    value={cableMeasureMeters}
                                    onChange={(e) => setCableMeasureMeters(e.target.value)}
                                    style={{ width: 90, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}
                                />
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>m dari</span>
                                <select value={cableMeasureSide} onChange={(e) => setCableMeasureSide(e.target.value)} style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12 }}>
                                    <option value="source">awal</option>
                                    <option value="dest">ujung</option>
                                </select>
                            </div>
                            <input
                                type="range" min="0" max={Math.max(1, Math.ceil(measureCable.length || 0))}
                                value={Number(cableMeasureMeters) || 0}
                                onChange={(e) => setCableMeasureMeters(e.target.value)}
                                style={{ width: '100%', accentColor: '#06b6d4', marginBottom: 10 }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginBottom: (measureCable.distanceMarkers || []).length ? 10 : 0 }}>
                                <input
                                    type="text" aria-label="Label titik" placeholder="label (opsional, mis. Titik Putus)"
                                    value={cableMeasureLabel}
                                    onChange={(e) => setCableMeasureLabel(e.target.value)}
                                    style={{ flex: 1, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12 }}
                                />
                                <button type="button" onClick={saveCableMarker} disabled={updateCableMutation.isPending} style={{ background: '#06b6d4', color: '#04121a', fontWeight: 800, border: 'none', borderRadius: 6, padding: '6px 12px', cursor: updateCableMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>push_pin</span> Simpan
                                </button>
                            </div>
                            {(measureCable.distanceMarkers || []).length > 0 && (
                                <div style={{ borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
                                    {measureCable.distanceMarkers.map((mk, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {mk.label ? `${mk.label} · ` : ''}{formatDistance(mk.meters)} dari {mk.side === 'dest' ? 'ujung' : 'awal'}
                                                </span>
                                            </span>
                                            <button type="button" onClick={() => deleteCableMarker(i)} disabled={updateCableMutation.isPending} title="Hapus penanda" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Panel Ukur Jarak (cek jalur putus) — muncul saat garis diklik */}
                    {measureLine && (
                        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, width: 370, maxWidth: '92vw', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.55)', padding: 14, color: '#e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#06b6d4' }}>straighten</span>
                                    Ukur Jarak · Cek Putus
                                </div>
                                <button onClick={closeMeasure} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }} title="Tutup">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                                {measureLine.sourceName} → {measureLine.destName} · total {formatDistance(measureLine.distance || 0)}
                            </div>
                            {/* Edit cepat pengaturan garis/core di device ujung */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                <button
                                    onClick={() => openDeviceEditById(measureLine.sourceId)}
                                    disabled={!measureLine.sourceId}
                                    title="Edit device sumber (ubah core & pengaturan garis)"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: measureLine.sourceId ? '#e2e8f0' : '#475569', fontSize: 11, fontWeight: 600, cursor: measureLine.sourceId ? 'pointer' : 'not-allowed' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit_location</span>
                                    Edit Source
                                </button>
                                <button
                                    onClick={() => openDeviceEditById(measureLine.netwatchId || measureLine.pppoeId)}
                                    disabled={!(measureLine.netwatchId || measureLine.pppoeId)}
                                    title="Edit device tujuan (ubah core & pengaturan garis)"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: (measureLine.netwatchId || measureLine.pppoeId) ? '#e2e8f0' : '#475569', fontSize: 11, fontWeight: 600, cursor: (measureLine.netwatchId || measureLine.pppoeId) ? 'pointer' : 'not-allowed' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit_location</span>
                                    Edit Destination
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                <input
                                    type="number" min="0" max={Math.ceil(measureLine.distance || 0)}
                                    value={measureMeters}
                                    onChange={(e) => setMeasureMeters(e.target.value)}
                                    style={{ width: 90, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 13, fontWeight: 700 }}
                                />
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>m dari</span>
                                <select value={measureSide} onChange={(e) => setMeasureSide(e.target.value)} style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12 }}>
                                    <option value="source">source</option>
                                    <option value="dest">destination</option>
                                </select>
                            </div>
                            <input
                                type="range" min="0" max={Math.max(1, Math.ceil(measureLine.distance || 0))}
                                value={Number(measureMeters) || 0}
                                onChange={(e) => setMeasureMeters(e.target.value)}
                                style={{ width: '100%', accentColor: '#06b6d4', marginBottom: 10 }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="text" placeholder="label (opsional, mis. Titik Putus)"
                                    value={measureLabel}
                                    onChange={(e) => setMeasureLabel(e.target.value)}
                                    style={{ flex: 1, background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '6px 8px', color: '#e2e8f0', fontSize: 12 }}
                                />
                                <button onClick={handleSaveMeasure} style={{ background: '#06b6d4', color: '#04121a', fontWeight: 800, border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>push_pin</span> Simpan
                                </button>
                            </div>

                            {/* Fiber Core — daftar core + sorot warna di garis */}
                            {measureLine.fiberCores && Array.isArray(measureLine.fiberCores.cores) && measureLine.fiberCores.cores.length > 0 && (
                                <div style={{ marginTop: 12, borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#a78bfa' }}>cable</span>
                                            Fiber {measureLine.fiberCores.coreCount} core
                                        </span>
                                        {highlightCore?.lineId === measureLine.id && (
                                            <button onClick={() => setHighlightCore(null)} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 5, padding: '2px 6px', cursor: 'pointer' }}>Reset warna</button>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                                        {measureLine.fiberCores.cores.map((c) => {
                                            const col = coreColor(c.i);
                                            const active = highlightCore?.lineId === measureLine.id && highlightCore?.i === c.i;
                                            return (
                                                <button
                                                    key={c.i}
                                                    onClick={() => setHighlightCore(active ? null : { lineId: measureLine.id, hex: col.hex, i: c.i })}
                                                    title="Sorot core ini di garis"
                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', background: active ? 'rgba(255,255,255,0.08)' : 'transparent', border: active ? '1px solid rgba(148,163,184,0.4)' : '1px solid transparent' }}
                                                >
                                                    <span style={{ width: 14, height: 14, borderRadius: 4, background: col.hex, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 11, color: '#94a3b8', width: 44, flexShrink: 0 }}>C{c.i}</span>
                                                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.dest || <span style={{ color: '#64748b' }}>—</span>}</span>
                                                    {active && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22d3ee' }}>visibility</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
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
