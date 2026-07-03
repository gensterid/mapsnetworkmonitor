import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import dagre from '@dagrejs/dagre';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    useEdgesState,
    useReactFlow,
    getNodesBounds,
    getViewportForBounds,
} from '@xyflow/react';
import {
    useRouterTopology,
    useUpdateTopologyCoords,
    useAddTopologyNode,
    useRemoveTopologyNode,
    useAddTopologyLink,
    useRemoveTopologyLink,
    useUpdateTopologyLink,
    useUpdateTopologyNode,
    useRouters,
    useOlts,
    useRouterNeighbors,
    useRouterRomonNeighbors,
    useRouterInterfaces,
    usePingHost,
    useAllRoutersTraffic,
    useAlerts,
} from '@/hooks';
import { Plus, Check, Edit2, X, Box, Network, Layers, Globe, Cpu, Zap, Trash2, Settings, Link2, Wand2, RefreshCw, Download, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useDebounce } from '@/hooks';

// Custom Components
import RouterNode from './nodes/RouterNode';
import SwitchNode from './nodes/SwitchNode';
import OltNode from './nodes/OltNode';
import NeonEdge from './edges/NeonEdge';

import './MiniTopology.css';

const nodeTypes = {
    router: RouterNode,
    switch: SwitchNode,
    olt: OltNode,
    netwatch: RouterNode, // Default to router style for netwatch
};

const edgeTypes = {
    neon: NeonEdge,
};

// Tombol export diagram → PNG. Harus di DALAM <ReactFlow> (pakai
// useReactFlow). Fit semua node lalu render viewport ke gambar.
const ExportButton = ({ routerName, wrapperRef }) => {
    const { getNodes } = useReactFlow();
    const [busy, setBusy] = useState(false);

    const onExport = async () => {
        const allNodes = getNodes();
        if (!allNodes.length) return;
        setBusy(true);
        try {
            // Scope ke viewport milik ReactFlow ini saja (bukan querySelector
            // global — kalau ada >1 ReactFlow di page bisa salah target).
            const viewportEl = wrapperRef?.current?.querySelector('.react-flow__viewport');
            if (!viewportEl) return;
            const bounds = getNodesBounds(allNodes);
            const pad = 80;
            const width = Math.max(800, Math.ceil(bounds.width) + pad * 2);
            const height = Math.max(600, Math.ceil(bounds.height) + pad * 2);
            const vp = getViewportForBounds(bounds, width, height, 0.4, 2, pad);
            // Lazy-load html-to-image supaya tidak masuk initial chunk.
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(viewportEl, {
                backgroundColor: '#0b0e14',
                width,
                height,
                pixelRatio: 2,
                style: {
                    width: `${width}px`,
                    height: `${height}px`,
                    transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
                },
            });
            const a = document.createElement('a');
            const safe = (routerName || 'topology').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            a.download = `topology-${safe}.png`;
            a.href = dataUrl;
            a.click();
        } catch (err) {
            console.error('Export topology failed:', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={onExport}
            disabled={busy}
            className="topo-export-btn"
            title="Export diagram ke PNG"
        >
            <Download size={13} /> {busy ? 'Rendering…' : 'Export PNG'}
        </button>
    );
};

// Helper component for debounced updates
const DebouncedUpdate = ({ value, onUpdate, delay = 500 }) => {
    const debouncedValue = useDebounce(value, delay);
    const lastAppliedRef = React.useRef(value);
    const currentValueRef = React.useRef(value);
    const onUpdateRef = React.useRef(onUpdate);

    React.useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    React.useEffect(() => {
        currentValueRef.current = value;
    }, [value]);

    React.useEffect(() => {
        if (debouncedValue !== undefined && debouncedValue !== lastAppliedRef.current) {
            onUpdateRef.current(debouncedValue);
            lastAppliedRef.current = debouncedValue;
        }
    }, [debouncedValue]);

    React.useEffect(() => {
        return () => {
            if (currentValueRef.current !== lastAppliedRef.current && currentValueRef.current !== undefined) {
                onUpdateRef.current(currentValueRef.current);
            }
        };
    }, []);

    return null;
};

const MiniTopology = ({ routerId }) => {
    const reactFlowWrapperRef = useRef(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showLinkSuggest, setShowLinkSuggest] = useState(false);
    const [selectedSuggest, setSelectedSuggest] = useState(() => new Set());
    const [suggestSearch, setSuggestSearch] = useState('');
    // Gaya garis link (global, persist localStorage): curved | stepped | straight
    const [lineStyle, setLineStyle] = useState(() => {
        try { return localStorage.getItem('topo.lineStyle') || 'curved'; } catch { return 'curved'; }
    });
    const changeLineStyle = (v) => {
        setLineStyle(v);
        try { localStorage.setItem('topo.lineStyle', v); } catch { /* ignore */ }
    };

    const [isLiveMode, setIsLiveMode] = useState(false);
    const [isAddingNode, setIsAddingNode] = useState(false);
    const [editingNode, setEditingNode] = useState(null);

    const { data: topology, isLoading, refetch } = useRouterTopology(routerId);
    
    // Extract router systems for real-time traffic subscription
    const topologyRouters = useMemo(() => {
        if (!topology?.nodes) return [];
        return topology.nodes
            .filter(n => (n.type === 'router' || n.type === 'olt') && n.systemId)
            .map(n => ({ id: n.systemId }));
    }, [topology]);

    // High-frequency traffic (WebSockets) is only active in Live Mode
    const allTraffic = useAllRoutersTraffic(topologyRouters, isLiveMode);

    const { mutate: updateCoords } = useUpdateTopologyCoords();
    const { mutate: addNode, isPending: isAddNodePending } = useAddTopologyNode();
    const { mutate: addLink, isPending: isAddLinkPending } = useAddTopologyLink();
    const { mutate: removeLink } = useRemoveTopologyLink(routerId);
    const { mutate: updateLink } = useUpdateTopologyLink(routerId);
    const { mutate: updateNode } = useUpdateTopologyNode();
    const { mutate: removeNode } = useRemoveTopologyNode();
    const [editingEdge, setEditingEdge] = useState(null);
    useRouterInterfaces((editingNode?.data?.type === 'router' || editingNode?.data?.type === 'olt') ? editingNode?.data?.systemId : null);

    useRouters();
    useOlts();
    // Neighbor MNDP hanya dipakai di UI edit mode (sidebar Discovered Units,
    // modal device, saran link) — gate fetch-nya biar tidak polling saat view.
    const { data: mndpNeighbors } = useRouterNeighbors(routerId, { enabled: isEditMode });

    // Alert aktif per-router → overlay badge di node. Ambil severity terparah
    // per routerId dari alert yang belum resolved.
    const { data: alertsResp } = useAlerts({ limit: 200, sortOrder: 'desc' });
    const alertByRouter = useMemo(() => {
        const arr = Array.isArray(alertsResp)
            ? alertsResp
            : (alertsResp?.data || alertsResp?.alerts || []);
        const rank = { critical: 3, warning: 2, info: 1 };
        const map = new Map();
        for (const a of arr) {
            if (a?.resolved || !a?.routerId) continue;
            const sev = String(a.severity || 'info').toLowerCase();
            const prev = map.get(a.routerId);
            if (!prev || (rank[sev] || 0) > (rank[prev] || 0)) map.set(a.routerId, sev);
        }
        return map;
    }, [alertsResp]);

    const { data: romonNeighbors } = useRouterRomonNeighbors(routerId, { enabled: isEditMode });

    const { mutate: pingHost } = usePingHost();
    const [pingResults, setPingResults] = useState({});

    const handlePing = (e, ip) => {
        e.stopPropagation();
        if (!ip) return;

        setPingResults(prev => ({ ...prev, [ip]: { status: 'loading' } }));
        pingHost({ routerId, ip }, {
            onSuccess: (res) => {
                if (res.data?.packetLoss === 100 || res.data?.latency === null) {
                    setPingResults(prev => ({ ...prev, [ip]: { status: 'error', packetLoss: 100 } }));
                } else {
                    setPingResults(prev => ({ ...prev, [ip]: { status: 'success', latency: res.data?.latency } }));
                }
            },
            onError: () => {
                setPingResults(prev => ({ ...prev, [ip]: { status: 'error', packetLoss: 100 } }));
            }
        });
    };
 
    // Helper for fuzzy interface matching
    const findTrafficStats = useCallback((deviceId, ifaceName) => {
        if (!deviceId || !ifaceName || !allTraffic) return null;
        
        // 1. Exact match
        let stats = allTraffic[`${deviceId}:${ifaceName}`];
        if (stats) return stats;
        
        // 2. Normalized match (lowercase, no spaces)
        const normName = ifaceName.toLowerCase().trim();
        const entry = Object.entries(allTraffic).find(([key, val]) => {
            const [rId, rIface] = key.split(':');
            if (rId !== deviceId) return false;
            const normRIface = rIface.toLowerCase().trim();
            // Match ether1 to ether1-WAN or Port1(ether1)
            return normRIface === normName || 
                   normRIface.startsWith(normName + '-') || 
                   normRIface.endsWith('-' + normName) ||
                   normRIface.includes('(' + normName + ')');
        });
        
        return entry ? entry[1] : null;
    }, [allTraffic]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // ── Saran link dari neighbor (MNDP/RoMON) ──────────────────────────────
    // Neighbor di-discover dari router root. Untuk tiap neighbor yang cocok
    // dengan node lain di canvas (via IP host / identity), usulkan link
    // root → node itu. Skip yang sudah ada link-nya. Operator review dulu.
    const linkSuggestions = useMemo(() => {
        const empty = { rootId: null, rootName: 'Router', items: [] };
        const rootNode = nodes.find(n => n.data?.systemId && n.data.systemId === routerId);
        if (!rootNode) return empty;

        const norm = (v) => String(v || '').trim().toLowerCase();
        const rootId = rootNode.id;

        // Pasangan node yang sudah terhubung (kedua arah) → skip.
        const linkedTo = new Set();
        for (const e of edges) {
            if (e.source === rootId) linkedTo.add(e.target);
            if (e.target === rootId) linkedTo.add(e.source);
        }

        // Host placeholder yang TIDAK boleh dipakai untuk cocokkan (device
        // custom default '0.0.0.0'). Kalau tidak di-exclude, semua device
        // custom bisa false-match ke satu sama lain.
        const SENTINEL_HOSTS = new Set(['0.0.0.0', '::', '0']);
        // MAC bukan IP — RoMON kirim romonId yang bisa berupa MAC. Jangan pakai
        // sebagai host node (polling/health check pakai host sebagai IP).
        const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
        const usableIp = (ip) => ip && !SENTINEL_HOSTS.has(ip) && !MAC_RE.test(ip);

        // Cari node di canvas yang mewakili sebuah neighbor (via systemId
        // mapping / IP host / identity).
        const matchNode = (neighborId, ipRaw, identityRaw) => {
            const nid = norm(neighborId);
            const ip = norm(ipRaw);
            const identity = norm(identityRaw);
            return nodes.find(n => {
                if (n.id === rootId) return false;
                if (nid && norm(n.data?.systemId) === nid) return true;
                const host = norm(n.data?.host);
                const name = norm(n.data?.name);
                const ipMatch = usableIp(ip) && usableIp(host) && host === ip;
                // identity minimal 2 char — hindari cocok kebetulan dgn identity
                // kosong/1-char (device sering advertise identity default dulu).
                const nameMatch = identity && identity.length > 1 && name && name === identity;
                return ipMatch || nameMatch;
            });
        };

        const items = [];
        const usedTargets = new Set(); // node id yang sudah jadi kandidat link
        const usedAdds = new Set();    // dedup neighbor untuk add (MNDP+RoMON)

        // Kalau neighbor sudah punya node di canvas → 'link'. Kalau belum &
        // punya IP valid → 'add' (buat node + link sekaligus). Device Layer-2
        // tanpa IP (mis. '*79') di-skip.
        const consider = (source, neighborId, ipRaw, identityRaw, iface) => {
            const cand = matchNode(neighborId, ipRaw, identityRaw);
            if (cand) {
                if (linkedTo.has(cand.id) || usedTargets.has(cand.id)) return;
                usedTargets.add(cand.id);
                items.push({
                    key: `link-${cand.id}`,
                    mode: 'link',
                    targetNodeId: cand.id,
                    targetName: cand.data?.name || cand.data?.host || cand.id,
                    targetHost: cand.data?.host || '',
                    sourceInterface: iface || null,
                    source,
                });
                return;
            }
            const ip = norm(ipRaw);
            if (!usableIp(ip) || usedAdds.has(ip)) return;
            usedAdds.add(ip);
            items.push({
                key: `add-${ip}`,
                mode: 'add',
                targetNodeId: null,
                targetName: (identityRaw && String(identityRaw).trim()) || ipRaw,
                targetHost: ipRaw,
                sourceInterface: iface || null,
                source,
                neighbor: { id: neighborId, identity: identityRaw, address: ipRaw },
            });
        };

        for (const nb of (mndpNeighbors || [])) consider('MNDP', nb.id, nb.address, nb.identity, nb.interface);
        for (const nb of (romonNeighbors || [])) consider('RoMON', nb.romonId, nb.romonId, nb.identity, null);

        return { rootId, rootName: rootNode.data?.name || 'Router', items };
    }, [nodes, edges, mndpNeighbors, romonNeighbors, routerId]);

    const suggestItems = linkSuggestions?.items || [];
    // Filter list saran sesuai kotak pencarian (nama/host/port/sumber).
    const shownSuggest = useMemo(() => {
        const q = suggestSearch.trim().toLowerCase();
        if (!q) return suggestItems;
        return suggestItems.filter(s =>
            String(s.targetName || '').toLowerCase().includes(q) ||
            String(s.targetHost || '').toLowerCase().includes(q) ||
            String(s.sourceInterface || '').toLowerCase().includes(q) ||
            String(s.source || '').toLowerCase().includes(q)
        );
    }, [suggestItems, suggestSearch]);


    const sourceNode = nodes.find(n => n.id === editingEdge?.source);

    const targetNode = nodes.find(n => n.id === editingEdge?.target);
    const sourceRouterId = (sourceNode?.data?.type === 'router' || sourceNode?.data?.type === 'olt') ? sourceNode?.data?.systemId : null;
    const targetRouterId = (targetNode?.data?.type === 'router' || targetNode?.data?.type === 'olt') ? targetNode?.data?.systemId : null;
    const { data: sourceInterfaces } = useRouterInterfaces(sourceRouterId);
    const { data: targetInterfaces } = useRouterInterfaces(targetRouterId);
    useEffect(() => {
        if (!topology) return;

        setNodes((prevNodes) => {
            const currentNodesMap = new Map(prevNodes.map(n => [n.id, n]));
            const rfNodes = (topology.nodes || []).map(node => {
                const existing = currentNodesMap.get(node.id);
                const dbX = parseFloat(node.x) || 0;
                const dbY = parseFloat(node.y) || 0;
                let position = existing ? existing.position : { x: dbX, y: dbY };

                if (!existing && dbX === 0 && dbY === 0) {
                    position = {
                        x: Math.floor(Math.random() * 100) - 50,
                        y: Math.floor(Math.random() * 100) - 50
                    };
                }

                const alertSeverity = node.systemId ? (alertByRouter.get(node.systemId) || null) : null;
                return {
                    id: node.id,
                    type: node.type || 'router',
                    position,
                    data: {
                        ...node,
                        deviceId: node.id,
                        isEditMode,
                        isLiveMode,
                        hasAlert: !!alertSeverity,
                        alertSeverity,
                    },
                    draggable: isEditMode,
                };
            });

            if (prevNodes.length === 0 || rfNodes.length !== prevNodes.length) return rfNodes;
            // O(N) merge — Map lookup, bukan .find() dalam .map() (O(N²) tiap tick).
            const rfById = new Map(rfNodes.map(rn => [rn.id, rn]));
            return prevNodes.map(n => {
                const updated = rfById.get(n.id);
                if (!updated) return n;
                return { ...n, draggable: isEditMode, data: { ...updated.data, isLiveMode } };
            });
        });

        // Map id→node topology dipakai saat build edge (hindari .find O(E×N)).
        const topoNodeById = new Map((topology.nodes || []).map(n => [n.id, n]));

        const rfEdges = (topology.edges || []).map(edge => {
            // Calculate traffic rates
            // 1. Start with static polling data from backend (passed via edge)
            let txRate = edge.txRate || 0;
            let rxRate = edge.rxRate || 0;
 
            // 2. Override with real-time WebSocket data ONLY if Live Mode is active
            if (isLiveMode && edge.fromInterface) {
                const sourceNodeFound = topoNodeById.get(edge.from);
                if (sourceNodeFound?.systemId) {
                    const stats = findTrafficStats(sourceNodeFound.systemId, edge.fromInterface);
                    if (stats) {
                        txRate = stats.tx;
                        rxRate = stats.rx;
                    }
                }
            }
 
            // 3. Fallback: If source side has no traffic in Live Mode, try target side (and swap TX/RX)
            if (isLiveMode && txRate === 0 && rxRate === 0 && edge.toInterface) {
                const targetNodeFound = topoNodeById.get(edge.to);
                if (targetNodeFound?.systemId) {
                    const stats = findTrafficStats(targetNodeFound.systemId, edge.toInterface);
                    if (stats) {
                        // Swap perspective: Target's RX is the link's TX from source perspective
                        txRate = stats.rx; 
                        rxRate = stats.tx;
                    }
                }
            }

            return ({
                id: edge.id,
                source: edge.from,
                target: edge.to,
                type: 'neon',
                animated: false,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                data: {
                    ...edge,
                    status: edge.status,
                    label: (edge.fromInterface && edge.toInterface) ? `${edge.fromInterface} → ${edge.toInterface}` : (edge.fromInterface || edge.toInterface || ''),
                    fromInterface: edge.fromInterface,
                    toInterface: edge.toInterface,
                    pathOffset: edge.pathOffset || '0',
                    animationType: edge.animationType || 'pulse',
                    lineStyle,
                    isEditMode,
                    isLiveMode,
                    txRate,
                    rxRate
                }
            });
        });
        setEdges(rfEdges);
    }, [topology, isEditMode, routerId, isLiveMode, allTraffic, alertByRouter, lineStyle, setNodes, setEdges]);




    const onNodeDragStop = useCallback((event, node) => {
        updateCoords({ routerId, nodeId: node.id, x: node.position.x, y: node.position.y });
    }, [routerId, updateCoords]);

    const onConnect = useCallback((connection) => {
        if (connection.source === connection.target) {
            alert("A device cannot create a link to itself.");
            return;
        }
        const sNode = nodes.find(n => n.id === connection.source);
        const tNode = nodes.find(n => n.id === connection.target);
        const sourceInterface = window.prompt(`Interface on ${sNode?.data?.name || 'Source'} (e.g. ether5):`, 'ether1');
        if (sourceInterface === null) return;
        const targetInterface = window.prompt(`Interface on ${tNode?.data?.name || 'Target'} (e.g. ether1):`, 'ether1');
        if (targetInterface === null) return;

        addLink({
            routerId,
            data: {
                sourceNodeId: connection.source,
                targetNodeId: connection.target,
                sourceInterface,
                targetInterface,
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle
            }
        }, { onSuccess: () => refetch() });
    }, [routerId, addLink, refetch, nodes]);

    const onEdgeClick = useCallback((event, edge) => {
        if (!isEditMode) return;
        setEditingEdge(edge);
    }, [isEditMode]);

    const onLayout = useCallback(() => {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        const nodeWidth = 160;
        const nodeHeight = 80;
        dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, edgesep: 20, ranksep: 150 });
        nodes.forEach((node) => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
        edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
        dagre.layout(dagreGraph);
        const posMap = {};
        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const position = { x: nodeWithPosition.x - nodeWidth / 2, y: nodeWithPosition.y - nodeHeight / 2 };
            posMap[node.id] = position;
            updateCoords({ routerId, nodeId: node.id, x: position.x, y: position.y });
            return { ...node, position };
        });
        setNodes(layoutedNodes);

        // Rapikan titik sambung link mengikuti posisi baru — attach di sisi
        // yang saling menghadap (bukan selalu b1→t1 yang bikin garis monoton).
        // Slot 1/2 memisah link paralel via arah tegak lurus.
        const pickHandles = (s, t) => {
            const sc = { x: s.x + nodeWidth / 2, y: s.y + nodeHeight / 2 };
            const tc = { x: t.x + nodeWidth / 2, y: t.y + nodeHeight / 2 };
            const dx = tc.x - sc.x, dy = tc.y - sc.y;
            if (Math.abs(dx) >= Math.abs(dy)) {
                const slot = dy < 0 ? '1' : '2';
                return dx >= 0
                    ? { sourceHandle: `r${slot}`, targetHandle: `l${slot}` }
                    : { sourceHandle: `l${slot}`, targetHandle: `r${slot}` };
            }
            const slot = dx < 0 ? '1' : '2';
            return dy >= 0
                ? { sourceHandle: `b${slot}`, targetHandle: `t${slot}` }
                : { sourceHandle: `t${slot}`, targetHandle: `b${slot}` };
        };
        const nextEdges = edges.map((edge) => {
            const s = posMap[edge.source], t = posMap[edge.target];
            if (!s || !t) return edge;
            const { sourceHandle, targetHandle } = pickHandles(s, t);
            if (edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle) return edge;
            updateLink({ linkId: edge.id, data: { sourceHandle, targetHandle } });
            return { ...edge, sourceHandle, targetHandle };
        });
        setEdges(nextEdges);
    }, [nodes, edges, updateCoords, updateLink, routerId, setNodes, setEdges]);


    const onNodeDoubleClick = useCallback((event, node) => {
        if (!isEditMode) return;
        setEditingNode(node);
    }, [isEditMode]);

    const onAddNode = (idInSystem, type, neighborData = null) => {
        if (nodes.some(n => n.data?.systemId === idInSystem)) return;
        addNode({
            routerId,
            data: {
                nodeId: neighborData ? null : idInSystem,
                nodeType: type,
                name: neighborData ? (neighborData.identity || neighborData.id) : undefined,
                host: neighborData ? (neighborData.address || neighborData.id) : undefined,
                systemId: neighborData ? idInSystem : undefined
            }
        }, {
            onSuccess: () => { setIsAddingNode(false); refetch(); },
            onError: (error) => alert(`Error: ${error?.message || 'Failed to add device'}`)
        });
    };

    const onAddCustom = (type) => {
        const randomId = Math.random().toString(36).substring(7);
        addNode({
            routerId,
            data: { nodeId: null, nodeType: type, name: `New ${type.toUpperCase()} ${randomId}`, host: `0.0.0.0` }
        }, { onSuccess: () => { setIsAddingNode(false); refetch(); } });
    };

    // Buka modal saran link — default TIDAK ada yang tercentang, operator
    // pilih sendiri (bisa pakai pencarian + pilih semua hasil).
    const openLinkSuggest = () => {
        setSelectedSuggest(new Set());
        setSuggestSearch('');
        setShowLinkSuggest(true);
    };

    const toggleSuggest = (key) => {
        setSelectedSuggest(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    // Centang semua yang sedang tampil (mengikuti filter pencarian).
    const selectAllShown = () => {
        setSelectedSuggest(prev => {
            const next = new Set(prev);
            shownSuggest.forEach(s => next.add(s.key));
            return next;
        });
    };
    const clearSuggestSelection = () => setSelectedSuggest(new Set());

    // Buat link untuk kandidat terpilih. Root → node, sourceHandle default
    // 'b1' / targetHandle 't1' (sama dgn default edit modal).
    const createSelectedLinks = () => {
        const rootId = linkSuggestions?.rootId;
        if (!rootId) return;
        const chosen = suggestItems.filter(s => selectedSuggest.has(s.key));
        const linkTo = (targetNodeId, sourceInterface) => addLink({
            routerId,
            data: {
                sourceNodeId: rootId,
                targetNodeId,
                sourceInterface,
                targetInterface: null,
                sourceHandle: 'b1',
                targetHandle: 't1',
            },
        }, {
            // Kalau node sudah dibuat tapi link gagal → kasih tahu operator
            // (modal sudah tertutup, kalau tidak error-nya hilang senyap).
            onError: (err) => alert(`Node dibuat tapi link gagal: ${err?.message || 'error'}. Buka Saran Link lagi untuk hubungkan.`),
        });
        chosen.forEach(s => {
            if (s.mode === 'add') {
                // Buat node baru dari neighbor, lalu link ke root pakai id node
                // yang baru dibuat (respons addNode = node ter-unwrap, punya .id).
                addNode({
                    routerId,
                    data: {
                        nodeId: null,
                        nodeType: 'router',
                        name: s.neighbor?.identity || s.neighbor?.address || s.neighbor?.id,
                        host: s.neighbor?.address || s.neighbor?.id,
                        systemId: s.neighbor?.id,
                    },
                }, {
                    onSuccess: (created) => { if (created?.id) linkTo(created.id, s.sourceInterface); },
                    onError: (err) => alert(`Gagal buat node ${s.targetName}: ${err?.message || 'error'}`),
                });
            } else {
                linkTo(s.targetNodeId, s.sourceInterface);
            }
        });
        // addLink/addNode onSuccess sudah invalidate query topology → refetch
        // otomatis. Jangan refetch() manual (fetch state basi sebelum persist).
        setShowLinkSuggest(false);
        setSelectedSuggest(new Set());
    };

    if (!routerId || routerId === 'undefined') {
        return <div className="p-8 text-slate-500 text-xs italic flex items-center gap-2">
            <RefreshCw className="w-3 h-3 animate-spin" /> Loading topology context...
        </div>;
    }

    if (isLoading) return <div className="topology-loading">Initializing Neural Map...</div>;


    return (
        <div className={clsx("mini-topology-container", isEditMode && "edit-mode")}>
            <div className="topology-header">
                <div className="header-info">
                    <h3><Network size={18} className="text-cyan-400" /> Network Flow Topology</h3>
                    <p className="topology-hint">
                        {isEditMode ? "Drag devices to arrange. Connect handles to create links." : "Live traffic flow active. Double-click connections to see details."}
                    </p>
                </div>
                <div className="header-actions">
                    <div className={clsx("live-mode-toggle-container", isLiveMode && "active")}>
                        <div className="live-mode-label">
                            <Zap size={14} className={clsx(isLiveMode ? "text-amber-400" : "text-slate-500")} />
                            <span>Live Mode</span>
                        </div>
                        <div
                            role="switch"
                            tabIndex={0}
                            aria-checked={isLiveMode}
                            aria-label="Live Mode"
                            className={clsx("toggle-switch", isLiveMode && "active")}
                            onClick={() => setIsLiveMode(!isLiveMode)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsLiveMode(v => !v); } }}
                        >
                            <div className="toggle-knob" />
                        </div>
                    </div>
                    {isEditMode ? (
                        <>
                            <select
                                value={lineStyle}
                                onChange={(e) => changeLineStyle(e.target.value)}
                                title="Gaya garis link"
                                className="bg-slate-800/60 border border-slate-700/60 text-slate-200 text-xs rounded px-2 py-1 outline-none focus:border-cyan-500/50 cursor-pointer"
                            >
                                <option value="curved">Garis: Lengkung</option>
                                <option value="stepped">Garis: Siku</option>
                                <option value="straight">Garis: Lurus</option>
                            </select>
                            <button className="action-btn bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded text-xs transition-all flex items-center gap-1.5 font-semibold mx-2" onClick={onLayout}>
                                <Wand2 size={14} /> Tidy Up
                            </button>
                            <button
                                className="action-btn bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded text-xs transition-all flex items-center gap-1.5 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={openLinkSuggest}
                                disabled={suggestItems.length === 0}
                                title={suggestItems.length === 0 ? 'Tidak ada neighbor yang cocok dengan node di canvas' : `${suggestItems.length} saran link dari neighbor`}
                            >
                                <Link2 size={14} /> Saran Link{suggestItems.length > 0 ? ` (${suggestItems.length})` : ''}
                            </button>
                            <button className="action-btn add" onClick={() => setIsAddingNode(!isAddingNode)}>
                                <Plus size={16} /> Add Device
                            </button>
                            <button className="action-btn finish" onClick={() => { setIsEditMode(false); setIsAddingNode(false); }}>
                                <Check size={16} /> Save Layout
                            </button>
                        </>
                    ) : (
                        <button className="action-btn edit" onClick={() => setIsEditMode(true)}>
                            <Edit2 size={14} /> Modularize
                        </button>
                    )}
                </div>
            </div>

            <div className="topology-main-layout">
                {isAddingNode && isEditMode && (
                    <div className="device-library-sidebar">
                        <div className="sidebar-header">
                            <h4>Schematic Library</h4>
                            <button onClick={() => setIsAddingNode(false)}><X size={14} /></button>
                        </div>
                        <div className="device-list">
                            <section>
                                <h5>Custom Nodes</h5>
                                <div className="library-item" onClick={() => onAddCustom('router')}><Plus size={12} /> Router</div>
                                <div className="library-item" onClick={() => onAddCustom('switch')}><Plus size={12} /> Switch</div>
                                <div className="library-item" onClick={() => onAddCustom('olt')}><Plus size={12} /> OLT</div>
                            </section>

                            <section>
                                <div className="flex items-center justify-between px-6 mb-3">
                                    <h5 className="!p-0 !m-0">Discovered Units</h5>
                                    <div className="flex gap-1">
                                        <span className="text-[8px] bg-cyan-500/10 text-cyan-400 px-1 border border-cyan-500/20 rounded">MNDP</span>
                                        <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1 border border-purple-500/20 rounded">RoMON</span>
                                    </div>
                                </div>
                                {mndpNeighbors?.filter(n => !nodes.some(node => node.data?.systemId === n.id)).map(n => {
                                    const ip = n.address || n.id;
                                    const pingState = pingResults[ip];
                                    return (
                                        <div key={`mndp-${n.id}`} className="library-item group flex items-center justify-between" onClick={() => onAddNode(n.id, 'router', n)}>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <Box size={14} className="text-cyan-400 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-medium leading-none mb-1 truncate">{n.identity || n.id}</div>
                                                    <div className="text-[9px] text-slate-500 truncate">{n.address || 'Layer 2'}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {n.address && (
                                                    <button
                                                        onClick={(e) => handlePing(e, n.address)}
                                                        disabled={pingState?.status === 'loading'}
                                                        className={`text-[9px] px-1.5 py-0.5 rounded border ${pingState?.status === 'loading' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                                                            pingState?.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                pingState?.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                    'bg-slate-800/50 hover:bg-slate-700 text-slate-400 border-slate-700 hover:text-white'
                                                            } transition-colors`}
                                                    >
                                                        {pingState?.status === 'loading' ? 'PINGING...' :
                                                            pingState?.status === 'success' ? `${pingState.latency}ms` :
                                                                pingState?.status === 'error' ? 'TIMEOUT' :
                                                                    'PING'}
                                                    </button>
                                                )}
                                                <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>
                                    );
                                })}
                                {romonNeighbors?.filter(n => !nodes.some(node => node.data?.systemId === n.id)).map(n => {
                                    const ip = n.id;
                                    const pingState = pingResults[ip];
                                    return (
                                        <div key={`romon-${n.id}`} className="library-item group border-l-2 border-l-purple-500/30 flex items-center justify-between" onClick={() => onAddNode(n.id, 'router', { ...n, identity: n.id, address: n.id })}>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <Globe size={14} className="text-purple-400 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[11px] font-medium leading-none mb-1 truncate">{n.id}</div>
                                                    <div className="text-[9px] text-purple-400/60 uppercase tracking-tighter font-bold truncate">RoMON Node</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={(e) => handlePing(e, n.id)}
                                                    disabled={pingState?.status === 'loading'}
                                                    className={`text-[9px] px-1.5 py-0.5 rounded border ${pingState?.status === 'loading' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                                                        pingState?.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                            pingState?.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                'bg-slate-800/50 hover:bg-slate-700 text-slate-400 border-slate-700 hover:text-white'
                                                        } transition-colors`}
                                                >
                                                    {pingState?.status === 'loading' ? 'PINGING...' :
                                                        pingState?.status === 'success' ? `${pingState.latency}ms` :
                                                            pingState?.status === 'error' ? 'TIMEOUT' :
                                                                'PING'}
                                                </button>
                                                <Plus size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>
                                    );
                                })}
                                {(!mndpNeighbors?.length && !romonNeighbors?.length) && (
                                    <div className="text-[10px] text-center text-slate-600 py-4 italic">No neighbors detected</div>
                                )}
                            </section>
                        </div>
                    </div>
                )}

                <div ref={reactFlowWrapperRef} className="react-flow-wrapper" style={{ flex: 1, height: '100%' }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeDragStop={onNodeDragStop}
                        onEdgeClick={onEdgeClick}
                        onNodeDoubleClick={onNodeDoubleClick}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.5 }}
                        minZoom={0.2}
                        maxZoom={2}
                        onlyRenderVisibleElements
                    >
                        {/* Background berlapis: grid dots halus + garis besar
                            samar untuk kedalaman. */}
                        <Background id="bg-dots" variant={BackgroundVariant.Dots} color="#1e293b" gap={30} size={1} />
                        <Background id="bg-lines" variant={BackgroundVariant.Lines} color="#141a24" gap={150} lineWidth={0.5} />
                        <Controls position="top-right" />
                        {/* Export PNG — di dalam ReactFlow supaya akses useReactFlow. */}
                        <Panel position="top-left">
                            <ExportButton wrapperRef={reactFlowWrapperRef} routerName={nodes.find(n => n.data?.systemId === routerId)?.data?.name} />
                        </Panel>
                        {/* MiniMap overview — warna node ikut status. */}
                        <MiniMap
                            position="bottom-right"
                            pannable
                            zoomable
                            nodeColor={(n) => {
                                const s = n?.data?.status;
                                if (s === 'up' || s === 'online') return '#22c55e';
                                if (s === 'down' || s === 'offline') return '#ef4444';
                                return '#64748b';
                            }}
                            maskColor="rgba(8, 11, 20, 0.6)"
                            style={{ background: 'rgba(11, 14, 20, 0.85)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 8 }}
                        />
                    </ReactFlow>
                </div>
            </div>

            {showLinkSuggest && (
                <div className="topology-config-overlay" onClick={() => setShowLinkSuggest(false)}>
                    <div className="topology-config-card max-w-md" role="dialog" aria-modal="true" aria-labelledby="link-suggest-title" onClick={e => e.stopPropagation()}>
                        <div className="config-header">
                            <h4 id="link-suggest-title" className="flex items-center gap-2"><Link2 size={18} /> Saran Link dari Neighbor</h4>
                            <button onClick={() => setShowLinkSuggest(false)}><X size={18} /></button>
                        </div>
                        <div className="config-body space-y-3">
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Neighbor MNDP/RoMON dari <span className="text-cyan-400 font-semibold">{linkSuggestions?.rootName}</span>. Yang sudah ada di canvas → dibuatkan link. Yang belum (tag <span className="text-amber-400 font-semibold">+NODE</span>) → node baru dibuat lalu di-link. Centang yang mau.
                            </p>
                            {suggestItems.length === 0 ? (
                                <div className="text-xs text-slate-500 italic py-4 text-center">Tidak ada saran link.</div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            value={suggestSearch}
                                            onChange={(e) => setSuggestSearch(e.target.value)}
                                            aria-label="Cari kandidat link"
                                            placeholder="Cari nama / IP / port…"
                                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded pl-8 pr-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500/50"
                                        />
                                    </div>
                                    <button onClick={selectAllShown} className="text-[10px] font-semibold px-2 py-1.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 shrink-0">Pilih semua{shownSuggest.length ? ` (${shownSuggest.length})` : ''}</button>
                                    {selectedSuggest.size > 0 && (
                                        <button onClick={clearSuggestSelection} className="text-[10px] font-semibold px-2 py-1.5 rounded border border-slate-600 text-slate-400 hover:bg-slate-700/40 shrink-0">Kosongkan</button>
                                    )}
                                </div>
                                {shownSuggest.length === 0 ? (
                                    <div className="text-xs text-slate-500 italic py-4 text-center">Tidak ada hasil untuk "{suggestSearch}".</div>
                                ) : (
                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                    {shownSuggest.map(s => {
                                        const checked = selectedSuggest.has(s.key);
                                        return (
                                            <button
                                                key={s.key}
                                                role="checkbox"
                                                aria-checked={checked}
                                                onClick={() => toggleSuggest(s.key)}
                                                className={clsx(
                                                    "w-full text-left p-2.5 rounded border flex items-center gap-3 transition-all",
                                                    checked ? "bg-cyan-500/10 border-cyan-500/40" : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600"
                                                )}
                                            >
                                                <div className={clsx("w-4 h-4 rounded flex items-center justify-center border shrink-0", checked ? "bg-cyan-500 border-cyan-500" : "border-slate-600")}>
                                                    {checked && <Check size={11} className="text-slate-900" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-white text-xs font-semibold truncate flex items-center gap-1.5">
                                                        {s.targetName}
                                                        {s.mode === 'add' && <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">+node</span>}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 truncate">
                                                        {s.targetHost || '—'}
                                                        {s.sourceInterface && <span className="text-slate-400"> · port {s.sourceInterface}</span>}
                                                    </div>
                                                </div>
                                                <span className={clsx("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0", s.source === 'MNDP' ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400")}>{s.source}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                )}
                              </>
                            )}
                            <button
                                onClick={createSelectedLinks}
                                disabled={selectedSuggest.size === 0 || isAddNodePending || isAddLinkPending}
                                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {(isAddNodePending || isAddLinkPending) ? 'Memproses…' : `Buat ${selectedSuggest.size > 0 ? `${selectedSuggest.size} ` : ''}Link Terpilih`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingNode && (
                <div className="topology-config-overlay" onClick={() => setEditingNode(null)}>
                    <div className="topology-config-card" onClick={e => e.stopPropagation()}>
                        <div className="config-header">
                            <h4 className="flex items-center gap-2"><Settings size={18} /> Device Configuration</h4>
                            <button onClick={() => setEditingNode(null)}><X size={18} /></button>
                        </div>
                        <div className="config-body space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Display Name</label>
                                <input type="text" className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white text-sm focus:border-emerald-500/50 outline-none" value={editingNode.data.name || ''} onChange={(e) => {
                                    const val = e.target.value;
                                    setEditingNode({ ...editingNode, data: { ...editingNode.data, name: val } });
                                    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, name: val } } : n));
                                }} />
                                <DebouncedUpdate value={editingNode.data.name} onUpdate={(val) => updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customName: val, routerId } })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Host Address</label>
                                <input type="text" className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white text-sm focus:border-emerald-500/50 outline-none" value={editingNode.data.host || ''} onChange={(e) => {
                                    const val = e.target.value;
                                    setEditingNode({ ...editingNode, data: { ...editingNode.data, host: val } });
                                    setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, host: val } } : n));
                                }} />
                                <DebouncedUpdate value={editingNode.data.host} onUpdate={(val) => updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customHost: val, routerId } })} />
                            </div>
                            <div className="pt-4 border-t border-slate-800">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 block">System Mapping</label>
                                {!editingNode.data.systemId ? (
                                    <div className="space-y-2 max-h-32 overflow-y-auto">
                                        {mndpNeighbors?.filter(n => !nodes.some(node => node.data?.systemId === n.id)).map(n => (
                                            <button key={n.id} className="w-full text-left p-2 hover:bg-emerald-500/10 rounded border border-slate-700/50 text-xs flex items-center gap-2 group" onClick={() => {
                                                const name = n.identity || n.id;
                                                updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customName: name, customHost: n.address || n.id } });
                                                setEditingNode(null);
                                            }}>
                                                <div className="flex-1"><div className="text-white font-medium">{n.identity || n.id}</div><div className="text-[10px] text-slate-500">{n.model}</div></div>
                                                <Plus size={10} className="text-slate-500 group-hover:text-emerald-400" />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 rounded-lg">
                                        <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /><span className="text-xs text-emerald-400 font-medium">Mapped</span></div>
                                        <button className="text-[10px] text-slate-500 hover:text-red-400" onClick={() => { updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { nodeId: null } }); setEditingNode(null); }}>UNLINK</button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold block">Notes / Remarks</label>
                                <textarea className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs min-h-[60px]" placeholder="Add a note for this device..." value={editingNode.data.notes || ''} onChange={(e) => setEditingNode({ ...editingNode, data: { ...editingNode.data, notes: e.target.value } })} />
                            </div>
                            <button onClick={() => { updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customName: editingNode.data.name, customHost: editingNode.data.host, notes: editingNode.data.notes, routerId } }, { onSuccess: () => { setEditingNode(null); refetch(); } }); }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition-all">SAVE CHANGES</button>
                            <button className="w-full mt-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded text-xs font-bold" onClick={() => { if (window.confirm('Remove device?')) { removeNode({ routerId, nodeId: editingNode.id }); setEditingNode(null); } }}><Trash2 size={12} /> REMOVE DEVICE</button>
                        </div>
                    </div>
                </div>
            )}

            {editingEdge && (
                <div className="topology-config-overlay" onClick={() => setEditingEdge(null)}>
                    <div className="topology-config-card max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="config-header">
                            <h4 className="flex items-center gap-2"><Link2 size={18} /> Link Details</h4>
                            <button onClick={() => setEditingEdge(null)}><X size={18} /></button>
                        </div>
                        <div className="config-body space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold block">Port (Local)</label>
                                    {(sourceInterfaces && sourceInterfaces.length > 0) ? (
                                        <select 
                                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500"
                                            value={editingEdge.data?.fromInterface || ''}
                                            onChange={(e) => setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, fromInterface: e.target.value } })}
                                        >
                                            <option value="">Select Port</option>
                                            {sourceInterfaces.map(iface => (
                                                <option key={iface.id} value={iface.name}>{iface.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input type="text" className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs" value={editingEdge.data?.fromInterface || ''} onChange={(e) => setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, fromInterface: e.target.value } })} />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold block">Port (Remote)</label>
                                    {(targetInterfaces && targetInterfaces.length > 0) ? (
                                        <select 
                                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500"
                                            value={editingEdge.data?.toInterface || ''}
                                            onChange={(e) => setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, toInterface: e.target.value } })}
                                        >
                                            <option value="">Select Port</option>
                                            {targetInterfaces.map(iface => (
                                                <option key={iface.id} value={iface.name}>{iface.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input type="text" className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs" value={editingEdge.data?.toInterface || ''} onChange={(e) => setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, toInterface: e.target.value } })} />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Source Handle</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['t1', 't2', 'r1', 'r2', 'b1', 'b2', 'l1', 'l2'].map(handle => (
                                        <button key={`source-${handle}`} onClick={() => {
                                            setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, sourceHandle: handle } });
                                            setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? { ...edge, sourceHandle: handle } : edge));
                                        }} className={clsx("p-2 rounded border text-[9px] font-bold uppercase", (editingEdge.data?.sourceHandle || 'b1') === handle ? "bg-cyan-500/10 border-cyan-500 text-cyan-400" : "bg-slate-800/30 border-slate-700/50 text-slate-500")}>{handle}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Target Handle</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['t1', 't2', 'r1', 'r2', 'b1', 'b2', 'l1', 'l2'].map(handle => (
                                        <button key={`target-${handle}`} onClick={() => {
                                            setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, targetHandle: handle } });
                                            setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? { ...edge, targetHandle: handle } : edge));
                                        }} className={clsx("p-2 rounded border text-[9px] font-bold uppercase", (editingEdge.data?.targetHandle || 't1') === handle ? "bg-cyan-500/10 border-cyan-500 text-cyan-400" : "bg-slate-800/30 border-slate-700/50 text-slate-500")}>{handle}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1 pt-2">
                                <div className="flex justify-between items-center"><label className="text-[10px] text-slate-500 uppercase font-bold">Path Offset</label><span className="text-[10px] font-mono text-cyan-400">{editingEdge.data?.pathOffset || 0}px</span></div>
                                <input type="range" min="-100" max="100" step="5" className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500" value={editingEdge.data?.pathOffset || 0} onChange={(e) => {
                                    const val = e.target.value;
                                    setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, pathOffset: val } });
                                    setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? { ...edge, data: { ...edge.data, pathOffset: val } } : edge));
                                }} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 uppercase font-bold">Animation Style</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['pulse', 'dash', 'dot', 'none'].map(style => (
                                        <button key={style} onClick={() => {
                                            setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, animationType: style } });
                                            setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? { ...edge, data: { ...edge.data, animationType: style } } : edge));
                                        }} className={clsx("p-2 rounded border text-[9px] font-bold uppercase", (editingEdge.data?.animationType || 'pulse') === style ? "bg-cyan-500/10 border-cyan-500 text-cyan-400" : "bg-slate-800/30 border-slate-700/50 text-slate-500")}>{style}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold block">Notes / Remarks</label>
                                <textarea className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs min-h-[60px]" placeholder="Add a note for this connection..." value={editingEdge.data?.notes || ''} onChange={(e) => setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, notes: e.target.value } })} />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => { updateLink({ linkId: editingEdge.id, data: { sourceInterface: editingEdge.data.fromInterface, targetInterface: editingEdge.data.toInterface, pathOffset: editingEdge.data.pathOffset, animationType: editingEdge.data.animationType || 'pulse', sourceHandle: editingEdge.data.sourceHandle, targetHandle: editingEdge.data.targetHandle, notes: editingEdge.data.notes } }, { onSuccess: () => { refetch(); setEditingEdge(null); } }); }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs">SAVE LINK</button>
                                <button onClick={() => { if (window.confirm('Delete connection?')) { removeLink(editingEdge.id, { onSuccess: () => { setEditingEdge(null); refetch(); } }); } }} className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MiniTopology;
