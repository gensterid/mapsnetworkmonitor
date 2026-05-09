import React, { useMemo, useState, useEffect, useCallback } from 'react';
import dagre from '@dagrejs/dagre';
import {
    ReactFlow,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    MarkerType,
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
    useAllRoutersTraffic
} from '@/hooks';
import { Plus, Check, Edit2, X, Box, Network, Layers, Globe, Cpu, Zap, Trash2, Settings, Link2, Wand2, RefreshCw } from 'lucide-react';
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
    const [isEditMode, setIsEditMode] = useState(false);

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
    const { mutate: addNode } = useAddTopologyNode();
    const { mutate: addLink } = useAddTopologyLink();
    const { mutate: removeLink } = useRemoveTopologyLink(routerId);
    const { mutate: updateLink } = useUpdateTopologyLink(routerId);
    const { mutate: updateNode } = useUpdateTopologyNode();
    const { mutate: removeNode } = useRemoveTopologyNode();
    const [editingEdge, setEditingEdge] = useState(null);
    useRouterInterfaces((editingNode?.data?.type === 'router' || editingNode?.data?.type === 'olt') ? editingNode?.data?.systemId : null);

    useRouters();
    useOlts();
    const { data: mndpNeighbors } = useRouterNeighbors(routerId);

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

                return {
                    id: node.id,
                    type: node.type || 'router',
                    position,
                    data: { ...node, deviceId: node.id, isEditMode, isLiveMode },
                    draggable: isEditMode,
                };
            });

            if (prevNodes.length === 0 || rfNodes.length !== prevNodes.length) return rfNodes;
            return prevNodes.map(n => {
                const updated = rfNodes.find(rn => rn.id === n.id);
                if (!updated) return n;
                return { ...n, draggable: isEditMode, data: { ...updated.data, isLiveMode } };
            });
        });

        const rfEdges = (topology.edges || []).map(edge => {
            // Calculate traffic rates
            // 1. Start with static polling data from backend (passed via edge)
            let txRate = edge.txRate || 0;
            let rxRate = edge.rxRate || 0;
 
            // 2. Override with real-time WebSocket data ONLY if Live Mode is active
            if (isLiveMode && edge.fromInterface) {
                const sourceNodeFound = (topology.nodes || []).find(n => n.id === edge.from);
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
                const targetNodeFound = (topology.nodes || []).find(n => n.id === edge.to);
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
                    sourceHandle: edge.sourceHandle,
                    targetHandle: edge.targetHandle,
                    isEditMode,
                    isLiveMode,
                    txRate,
                    rxRate
                }
            });
        });
        setEdges(rfEdges);
    }, [topology, isEditMode, routerId, isLiveMode, allTraffic, setNodes, setEdges]);




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
        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const newNode = { ...node, position: { x: nodeWithPosition.x - nodeWidth / 2, y: nodeWithPosition.y - nodeHeight / 2 } };
            updateCoords({ routerId, nodeId: newNode.id, x: newNode.position.x, y: newNode.position.y });
            return newNode;
        });
        setNodes(layoutedNodes);
    }, [nodes, edges, updateCoords, routerId, setNodes]);


    const onNodeDoubleClick = useCallback((event, node) => {
        if (!isEditMode) return;
        setEditingNode(node);
    }, [isEditMode]);

    const onAddNode = (idInSystem, type, neighborData = null) => {
        if (nodes.some(n => n.systemId === idInSystem)) return;
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
                            className={clsx("toggle-switch", isLiveMode && "active")}
                            onClick={() => setIsLiveMode(!isLiveMode)}
                        >
                            <div className="toggle-knob" />
                        </div>
                    </div>
                    {isEditMode ? (
                        <>
                            <button className="action-btn bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded text-xs transition-all flex items-center gap-1.5 font-semibold mx-2" onClick={onLayout}>
                                <Wand2 size={14} /> Tidy Up
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
                                {mndpNeighbors?.filter(n => !nodes.some(node => node.systemId === n.id)).map(n => {
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
                                {romonNeighbors?.filter(n => !nodes.some(node => node.systemId === n.id)).map(n => {
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

                <div className="react-flow-wrapper" style={{ flex: 1, height: '100%' }}>
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
                    >
                        <Background color="#1e293b" gap={30} size={1} />
                        <Controls />
                    </ReactFlow>
                </div>
            </div>

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
                                        {mndpNeighbors?.filter(n => !nodes.some(node => node.systemId === n.id)).map(n => (
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
