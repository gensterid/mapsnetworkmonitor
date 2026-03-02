import React, { useMemo, useState, useEffect, useCallback } from 'react';
import dagre from '@dagrejs/dagre';
import {
    ReactFlow,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    addEdge,
    MarkerType
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
    useRouterNetwatch,
    useCreateNetwatch,
    useRouterNeighbors,
    useRouterRomonNeighbors,
    useRouterInterfaces
} from '@/hooks';
import { Plus, Check, Edit2, X, Box, Network, Layers, Globe, Cpu, Zap, Trash2, Settings, Link2, Wand2 } from 'lucide-react';
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

    // Keep onUpdateRef current without triggering effects
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

    // Save on unmount if pending
    React.useEffect(() => {
        return () => {
            if (currentValueRef.current !== lastAppliedRef.current && currentValueRef.current !== undefined) {
                onUpdateRef.current(currentValueRef.current);
            }
        };
    }, []); // Run ONLY on true unmount

    return null;
};

const MiniTopology = ({ routerId }) => {
    // Robust guard against missing or invalid routerId
    if (!routerId || routerId === 'undefined') {
        return <div className="p-8 text-slate-500 text-xs italic flex items-center gap-2">
            <RefreshCw className="w-3 h-3 animate-spin" /> Loading topology context...
        </div>;
    }

    const [isEditMode, setIsEditMode] = useState(false);
    const [isAddingNode, setIsAddingNode] = useState(false);
    const [editingNode, setEditingNode] = useState(null);

    const { data: topology, isLoading, refetch } = useRouterTopology(routerId);
    const { mutate: updateCoords } = useUpdateTopologyCoords();
    const { mutate: addNode } = useAddTopologyNode();
    const { mutate: addLink } = useAddTopologyLink();
    const { mutate: removeLink } = useRemoveTopologyLink(routerId);
    const { mutate: updateLink } = useUpdateTopologyLink(routerId);
    const { mutate: updateNode } = useUpdateTopologyNode();
    const { mutate: removeNode } = useRemoveTopologyNode();
    const [editingEdge, setEditingEdge] = useState(null);
    const { data: nodeInterfaces } = useRouterInterfaces((editingNode?.data?.type === 'router' || editingNode?.data?.type === 'olt') ? editingNode?.data?.systemId : null);

    // Device Lists
    const { data: allRouters } = useRouters();
    const { data: allOlts } = useOlts();
    const { data: allNetwatch } = useRouterNetwatch(routerId);
    const { data: mndpNeighbors } = useRouterNeighbors(routerId);
    const { data: romonNeighbors } = useRouterRomonNeighbors(routerId, { enabled: isEditMode });
    const { mutate: createNetwatch } = useCreateNetwatch();

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Fetch interfaces for link config hints
    const sourceNode = nodes.find(n => n.id === editingEdge?.source);
    const targetNode = nodes.find(n => n.id === editingEdge?.target);
    const sourceRouterId = (sourceNode?.data?.type === 'router' || sourceNode?.data?.type === 'olt') ? sourceNode?.data?.systemId : null;
    const targetRouterId = (targetNode?.data?.type === 'router' || targetNode?.data?.type === 'olt') ? targetNode?.data?.systemId : null;

    const { data: sourceInterfaces } = useRouterInterfaces(sourceRouterId);
    const { data: targetInterfaces } = useRouterInterfaces(targetRouterId);

    // Transform topology data to React Flow format
    useEffect(() => {
        if (!topology) return;

        setNodes((prevNodes) => {
            const currentNodesMap = new Map(prevNodes.map(n => [n.id, n]));

            const rfNodes = (topology.nodes || []).map(node => {
                const existing = currentNodesMap.get(node.id);

                // Safe number parsing
                const dbX = parseFloat(node.x) || 0;
                const dbY = parseFloat(node.y) || 0;

                // Keep local position if it exists, otherwise use DB or random offset for new nodes
                let position = existing ? existing.position : { x: dbX, y: dbY };

                // If it's a new node and at (0,0), give it a random offset so they don't stack perfectly
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
                    data: {
                        ...node,
                        deviceId: node.id,
                        isEditMode
                    },
                    draggable: isEditMode,
                };
            });

            // If lengths are different, it means a node was added/removed, so we update
            // Otherwise, we only update if nodes was empty (initial load)
            if (prevNodes.length === 0 || rfNodes.length !== prevNodes.length) {
                return rfNodes;
            }

            // Just sync internal data and draggable state without affecting positions
            return prevNodes.map(n => {
                const updated = rfNodes.find(rn => rn.id === n.id);
                if (!updated) return n;
                return {
                    ...n,
                    draggable: isEditMode,
                    data: updated.data
                };
            });
        });

        const rfEdges = (topology.edges || []).map(edge => ({
            id: edge.id,
            source: edge.from,
            target: edge.to,
            type: 'neon',
            animated: edge.status === 'up' || edge.status === 'online',
            data: {
                ...edge,
                status: edge.status,
                label: (edge.fromInterface && edge.toInterface)
                    ? `${edge.fromInterface} → ${edge.toInterface}`
                    : (edge.fromInterface || edge.toInterface || ''),
                fromInterface: edge.fromInterface,
                toInterface: edge.toInterface,
                pathOffset: edge.pathOffset || '0',
                animationType: edge.animationType || 'pulse',
                isEditMode
            }
        }));

        setEdges(rfEdges);
    }, [topology, isEditMode, routerId]);

    const onNodeDragStop = useCallback((event, node) => {
        updateCoords({
            routerId,
            nodeId: node.id,
            x: node.position.x,
            y: node.position.y
        });
    }, [routerId, updateCoords]);

    const onConnect = useCallback((connection) => {
        if (connection.source === connection.target) {
            alert("A device cannot create a link to itself.");
            return;
        }
        // Get names for better prompts if available
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        const sourceName = sourceNode?.data?.name || 'Source';
        const targetName = targetNode?.data?.name || 'Target';

        const sourceInterface = window.prompt(`Interface on ${sourceName} (e.g. ether5):`, 'ether1');
        if (sourceInterface === null) return; // Cancelled

        const targetInterface = window.prompt(`Interface on ${targetName} (e.g. ether1):`, 'ether1');
        if (targetInterface === null) return; // Cancelled

        addLink({
            routerId,
            data: {
                sourceNodeId: connection.source,
                targetNodeId: connection.target,
                sourceInterface,
                targetInterface
            }
        }, {
            onSuccess: () => refetch()
        });
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

        nodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const layoutedNodes = nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            const newNode = {
                ...node,
                position: {
                    x: nodeWithPosition.x - nodeWidth / 2,
                    y: nodeWithPosition.y - nodeHeight / 2,
                },
            };

            // Persist position immediately
            updateCoords({
                routerId,
                nodeId: newNode.id,
                x: newNode.position.x,
                y: newNode.position.y
            });

            return newNode;
        });

        setNodes(layoutedNodes);
    }, [nodes, edges, updateCoords, routerId]);

    const onNodeDoubleClick = useCallback((event, node) => {
        if (!isEditMode) return;
        setEditingNode(node);
    }, [isEditMode]);

    const onAddNode = (idInSystem, type, neighborData = null) => {
        // This is for adding a known device from the sidebar
        if (nodes.some(n => n.systemId === idInSystem)) return;

        addNode({
            routerId,
            data: {
                nodeId: neighborData ? null : idInSystem, // If neighborData, it's a custom node, so no systemId initially
                nodeType: type,
                name: neighborData ? (neighborData.identity || neighborData.id) : undefined,
                host: neighborData ? (neighborData.address || neighborData.id) : undefined,
                systemId: neighborData ? idInSystem : undefined // Store systemId for mapping later
            }
        }, {
            onSuccess: () => {
                setIsAddingNode(false);
                refetch();
            },
            onError: (error) => {
                console.error("Failed to add node to topology:", error);
                alert(`Error: ${error?.message || 'Failed to add device to schematic'}`);
            }
        });
    };

    const onAddCustom = (type) => {
        // Decoupled addition: add directly to topology without creating Netwatch
        const randomId = Math.random().toString(36).substring(7);
        const name = `New ${type.toUpperCase()} ${randomId}`;
        const host = `0.0.0.${Math.floor(Math.random() * 254) + 1}`;

        addNode({
            routerId,
            data: {
                nodeId: null,
                nodeType: type,
                name,
                host
            }
        }, {
            onSuccess: () => {
                setIsAddingNode(false);
                refetch();
            }
        });
    };

    if (isLoading) return <div className="topology-loading">Initializing Neural Map...</div>;

    return (
        <div className={clsx("mini-topology-container", isEditMode && "edit-mode")}>
            <div className="topology-header">
                <div className="header-info">
                    <h3><Network size={18} className="text-cyan-400" /> Network Flow Topology</h3>
                    <p className="topology-hint">
                        {isEditMode
                            ? "Drag devices to arrange. Connect handles to create links."
                            : "Live traffic flow active. Double-click connections to see details."}
                    </p>
                </div>
                <div className="header-actions">
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
                                <h5>Network Core (Neighbors)</h5>
                                {mndpNeighbors?.filter(n => !nodes.some(node => node.systemId === n.id)).map(n => (
                                    <div key={n.id} className="library-item" onClick={() => onAddNode(n.id, 'router', n)}>
                                        <Box size={14} /> <span>{n.identity || n.id}</span>
                                    </div>
                                ))}
                                {(!mndpNeighbors || mndpNeighbors.length === 0) && (
                                    <div key="no-neighbors-sidebar" className="text-[10px] text-center text-slate-600 py-2">No new neighbors detected</div>
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

            {/* Node Configuration Overlay */}
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
                                <input
                                    type="text"
                                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white text-sm focus:border-emerald-500/50 outline-none transition-colors"
                                    value={editingNode.data.name || ''}
                                    onChange={(e) => {
                                        const newName = e.target.value;
                                        setEditingNode({ ...editingNode, data: { ...editingNode.data, name: newName } });
                                        // Update local state for immediate feedback
                                        setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, name: newName } } : n));
                                    }}
                                />
                                <DebouncedUpdate
                                    value={editingNode.data.name}
                                    onUpdate={(val) => updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customName: val, routerId } })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Host / IP Address</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-3 py-2 text-white text-sm focus:border-emerald-500/50 outline-none transition-colors"
                                    value={editingNode.data.host || ''}
                                    placeholder="0.0.0.0"
                                    onChange={(e) => {
                                        const newHost = e.target.value;
                                        setEditingNode({ ...editingNode, data: { ...editingNode.data, host: newHost } });
                                        // Update local state for immediate feedback
                                        setNodes(nds => nds.map(n => n.id === editingNode.id ? { ...n, data: { ...n.data, host: newHost } } : n));
                                    }}
                                />
                                <DebouncedUpdate
                                    value={editingNode.data.host}
                                    onUpdate={(val) => updateNode({ nodeIdInTopology: editingNode.id, routerId, data: { customHost: val, routerId } })}
                                />
                            </div>

                            {/* Mapping Section */}
                            <div className="pt-4 border-t border-slate-800">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 block">System Mapping</label>
                                {!editingNode.data.systemId ? (
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-slate-500 italic">Unmapped device. Link to system data for status tracking.</p>
                                        <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-900/40 p-1.5 rounded border border-slate-800">
                                            {mndpNeighbors?.filter(n => !nodes.some(node => node.systemId === n.id)).map(n => (
                                                <button
                                                    key={n.id}
                                                    className="w-full text-left p-2 hover:bg-emerald-500/10 rounded border border-slate-700/50 hover:border-emerald-500/30 text-xs transition-all flex items-center gap-2 group"
                                                    onClick={() => {
                                                        const name = n.identity || n.id;
                                                        const host = n.address || n.id;
                                                        updateNode({
                                                            nodeIdInTopology: editingNode.id,
                                                            routerId,
                                                            data: {
                                                                customName: name,
                                                                customHost: host
                                                            }
                                                        });
                                                        // Update local state for immediate feedback
                                                        setNodes(nds => nds.map(node =>
                                                            node.id === editingNode.id
                                                                ? { ...node, data: { ...node.data, name, host } }
                                                                : node
                                                        ));
                                                        setEditingNode(null);
                                                    }}
                                                >
                                                    <div className="flex-1">
                                                        <div className="text-white font-medium">{n.identity || n.id}</div>
                                                        <div className="text-[10px] text-slate-500">{n.model} • {n.interface}</div>
                                                    </div>
                                                    <Plus size={10} className="text-slate-500 group-hover:text-emerald-400" />
                                                </button>
                                            ))}
                                            {(!mndpNeighbors || mndpNeighbors.length === 0) && (
                                                <div key="no-neighbors-overlay" className="text-[10px] text-center text-slate-600 py-2">No neighbors detected</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                <span className="text-xs text-emerald-400 font-medium">Mapped to System</span>
                                            </div>
                                            <button
                                                className="text-[10px] text-slate-500 hover:text-red-400 font-bold transition-colors"
                                                onClick={() => {
                                                    updateNode({
                                                        nodeIdInTopology: editingNode.id,
                                                        routerId,
                                                        data: { nodeId: null }
                                                    });
                                                    setEditingNode(null);
                                                }}
                                            >UNLINK</button>
                                        </div>

                                        {nodeInterfaces && nodeInterfaces.length > 0 && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">System Interfaces</label>
                                                <div className="bg-slate-900/50 border border-slate-700/50 rounded p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {nodeInterfaces.map(iface => (
                                                            <div key={iface.name} className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-slate-800/50 border border-slate-700/30">
                                                                <div className={clsx("w-1.5 h-1.5 rounded-full", iface.running ? "bg-emerald-500" : "bg-slate-600")} />
                                                                <span className="text-[10px] text-slate-300 truncate font-mono">{iface.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    updateNode({
                                        nodeIdInTopology: editingNode.id,
                                        routerId,
                                        data: {
                                            customName: editingNode.data.name,
                                            customHost: editingNode.data.host,
                                            routerId
                                        }
                                    }, {
                                        onSuccess: () => {
                                            // Sync local state for immediate feedback
                                            setNodes(nds => nds.map(n => n.id === editingNode.id ? {
                                                ...n,
                                                data: { ...n.data, name: editingNode.data.name, host: editingNode.data.host }
                                            } : n));
                                            setEditingNode(null);
                                            refetch();
                                        }
                                    });
                                }}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition-all shadow-lg shadow-emerald-500/10 mb-2"
                            >
                                SAVE CHANGES
                            </button>

                            <button
                                className="w-full mt-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2"
                                onClick={() => {
                                    if (window.confirm('Remove this device from schematic?')) {
                                        removeNode({ routerId, nodeId: editingNode.id });
                                        setEditingNode(null);
                                    }
                                }}
                            >
                                <Trash2 size={12} /> REMOVE DEVICE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Link Configuration Overlay */}
            {editingEdge && (
                <div className="topology-config-overlay" onClick={() => setEditingEdge(null)}>
                    <div className="topology-config-card max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="config-header">
                            <h4 className="flex items-center gap-2"><Link2 size={18} /> Link Details</h4>
                            <button onClick={() => setEditingEdge(null)}><X size={18} /></button>
                        </div>

                        <div className="config-body space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Port (Local)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs outline-none"
                                        placeholder="e.g. ether1"
                                        value={editingEdge.data?.fromInterface || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, fromInterface: val } });
                                        }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Port (Remote)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1.5 text-white text-xs outline-none"
                                        placeholder="e.g. uplink"
                                        value={editingEdge.data?.toInterface || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, toInterface: val } });
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Interface Hints */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-600 uppercase font-bold tracking-widest block">Local Hints</label>
                                    <div className="bg-slate-900/30 border border-slate-800/50 rounded p-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                                        {sourceInterfaces && sourceInterfaces.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {sourceInterfaces.map(iface => (
                                                    <button
                                                        key={iface.name}
                                                        onClick={() => {
                                                            const from = iface.name;
                                                            const to = editingEdge.data.toInterface;
                                                            const newEdge = {
                                                                ...editingEdge,
                                                                data: {
                                                                    ...editingEdge.data,
                                                                    fromInterface: from,
                                                                    label: (from && to) ? `${from} → ${to}` : (from || to || '')
                                                                }
                                                            };
                                                            setEditingEdge(newEdge);
                                                            setEdges(eds => eds.map(e => e.id === editingEdge.id ? newEdge : e));
                                                        }}
                                                        className={clsx(
                                                            "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                                                            iface.running ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10" : "text-slate-500 border-slate-700/30 bg-slate-800/10 hover:bg-slate-800/20"
                                                        )}
                                                    >
                                                        {iface.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[9px] text-slate-600 italic py-1">No interface data</div>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] text-slate-600 uppercase font-bold tracking-widest block">Remote Hints</label>
                                    <div className="bg-slate-900/30 border border-slate-800/50 rounded p-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                                        {targetInterfaces && targetInterfaces.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {targetInterfaces.map(iface => (
                                                    <button
                                                        key={iface.name}
                                                        onClick={() => {
                                                            const from = editingEdge.data.fromInterface;
                                                            const to = iface.name;
                                                            const newEdge = {
                                                                ...editingEdge,
                                                                data: {
                                                                    ...editingEdge.data,
                                                                    toInterface: to,
                                                                    label: (from && to) ? `${from} → ${to}` : (from || to || '')
                                                                }
                                                            };
                                                            setEditingEdge(newEdge);
                                                            setEdges(eds => eds.map(e => e.id === editingEdge.id ? newEdge : e));
                                                        }}
                                                        className={clsx(
                                                            "text-[9px] px-1.5 py-0.5 rounded border transition-colors",
                                                            iface.running ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10" : "text-slate-500 border-slate-700/30 bg-slate-800/10 hover:bg-slate-800/20"
                                                        )}
                                                    >
                                                        {iface.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[9px] text-slate-600 italic py-1">No interface data</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1 pt-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Path Offset</label>
                                    <span className="text-[10px] font-mono text-cyan-400">{editingEdge.data?.pathOffset || 0}px</span>
                                </div>
                                <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="5"
                                    className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    value={editingEdge.data?.pathOffset || 0}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingEdge({ ...editingEdge, data: { ...editingEdge.data, pathOffset: val } });
                                        // Update local state for immediate feedback
                                        setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? { ...edge, data: { ...edge.data, pathOffset: val } } : edge));
                                    }}
                                />
                                <p className="text-[9px] text-slate-600 italic">Adjust if links overlap each other</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block">Animation Style</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'pulse', label: 'Pulse', icon: Zap },
                                        { id: 'dash', label: 'Dash', icon: Layers },
                                        { id: 'none', label: 'Solid', icon: Box }
                                    ].map(style => (
                                        <button
                                            key={style.id}
                                            onClick={() => {
                                                const newEdge = { ...editingEdge, data: { ...editingEdge.data, animationType: style.id } };
                                                setEditingEdge(newEdge);
                                                // Update local state for immediate feedback
                                                setEdges(eds => eds.map(edge => edge.id === editingEdge.id ? newEdge : edge));
                                            }}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-1.5 p-2 rounded border transition-all",
                                                (editingEdge.data?.animationType || 'pulse') === style.id
                                                    ? "bg-cyan-500/10 border-cyan-500 text-cyan-400"
                                                    : "bg-slate-800/30 border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600"
                                            )}
                                        >
                                            <style.icon size={14} />
                                            <span className="text-[9px] font-bold uppercase">{style.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => {
                                        updateLink({
                                            linkId: editingEdge.id,
                                            data: {
                                                sourceInterface: editingEdge.data.fromInterface,
                                                targetInterface: editingEdge.data.toInterface,
                                                pathOffset: editingEdge.data.pathOffset,
                                                animationType: editingEdge.data.animationType || 'pulse'
                                            }
                                        }, {
                                            onSuccess: () => {
                                                // Sync local state for immediate feedback
                                                setEdges(eds => eds.map(e => e.id === editingEdge.id ? {
                                                    ...e,
                                                    label: (editingEdge.data.fromInterface || editingEdge.data.toInterface)
                                                        ? `${editingEdge.data.fromInterface || ''} → ${editingEdge.data.toInterface || ''}`
                                                        : '',
                                                    data: {
                                                        ...e.data,
                                                        fromInterface: editingEdge.data.fromInterface,
                                                        toInterface: editingEdge.data.toInterface,
                                                        pathOffset: editingEdge.data.pathOffset,
                                                        animationType: editingEdge.data.animationType || 'pulse'
                                                    }
                                                } : e));
                                                setEditingEdge(null);
                                                refetch();
                                            }
                                        });
                                    }}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition-all"
                                >
                                    SAVE LINK
                                </button>
                                <button
                                    onClick={() => {
                                        if (window.confirm('Delete this connection?')) {
                                            removeLink(editingEdge.id, { onSuccess: () => { setEditingEdge(null); refetch(); } });
                                        }
                                    }}
                                    className="px-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MiniTopology;
