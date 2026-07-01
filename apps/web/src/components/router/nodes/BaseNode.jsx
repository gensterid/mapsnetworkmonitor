import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { clsx } from 'clsx';
import './nodes.css';

// Warna gauge ikut nilai: hijau (rendah) → amber → merah (tinggi).
const gaugeClass = (pct) => {
    if (pct === null || pct === undefined) return '';
    if (pct >= 85) return 'crit';
    if (pct >= 65) return 'warn';
    return 'ok';
};

const BaseNode = ({ data, children, type }) => {
    const { name, host, status } = data;
    const isUp = status === 'up' || status === 'online';

    // Live metrics — hanya tampil kalau ada (router/olt yang termonitor).
    const cpu = typeof data.cpuLoad === 'number' ? Math.round(data.cpuLoad) : null;
    const mem = typeof data.memoryPct === 'number' ? data.memoryPct : null;
    const temp = typeof data.temperature === 'number' ? Math.round(data.temperature) : null;
    const hasMetrics = cpu !== null || mem !== null || temp !== null;

    return (
        <div className={clsx('base-node-container', type, status, isUp && 'is-up')}>
            <div className="node-glass-card">
                {/* Status LED */}
                <div className={clsx('status-led', isUp ? 'up' : 'down')} />

                {/* --- 8 POINT HANDLE SYSTEM --- */}

                {/* TOP HANDLES */}
                <Handle type="source" position={Position.Top} id="t1" style={{ left: '30%' }} className="handle-top" />
                <Handle type="target" position={Position.Top} id="t1" style={{ left: '30%' }} className="handle-top" />
                <Handle type="source" position={Position.Top} id="t2" style={{ left: '70%' }} className="handle-top" />
                <Handle type="target" position={Position.Top} id="t2" style={{ left: '70%' }} className="handle-top" />

                {/* RIGHT HANDLES */}
                <Handle type="source" position={Position.Right} id="r1" style={{ top: '30%' }} className="handle-right" />
                <Handle type="target" position={Position.Right} id="r1" style={{ top: '30%' }} className="handle-right" />
                <Handle type="source" position={Position.Right} id="r2" style={{ top: '70%' }} className="handle-right" />
                <Handle type="target" position={Position.Right} id="r2" style={{ top: '70%' }} className="handle-right" />

                {/* BOTTOM HANDLES */}
                <Handle type="source" position={Position.Bottom} id="b1" style={{ left: '30%' }} className="handle-bottom" />
                <Handle type="target" position={Position.Bottom} id="b1" style={{ left: '30%' }} className="handle-bottom" />
                <Handle type="source" position={Position.Bottom} id="b2" style={{ left: '70%' }} className="handle-bottom" />
                <Handle type="target" position={Position.Bottom} id="b2" style={{ left: '70%' }} className="handle-bottom" />

                {/* LEFT HANDLES */}
                <Handle type="source" position={Position.Left} id="l1" style={{ top: '30%' }} className="handle-left" />
                <Handle type="target" position={Position.Left} id="l1" style={{ top: '30%' }} className="handle-left" />
                <Handle type="source" position={Position.Left} id="l2" style={{ top: '70%' }} className="handle-left" />
                <Handle type="target" position={Position.Left} id="l2" style={{ top: '70%' }} className="handle-left" />

                <div className="node-content">
                    {children}
                    <div className="node-info">
                        <div className="node-name">{name}</div>
                        <div className="node-host">{host}</div>
                    </div>

                    {/* Live metrics mini-gauges — CPU/RAM bar + suhu badge */}
                    {hasMetrics && (
                        <div className="node-metrics">
                            {cpu !== null && (
                                <div className="metric-row">
                                    <span className="metric-label">CPU</span>
                                    <span className="metric-bar">
                                        <span className={clsx('metric-fill', gaugeClass(cpu))} style={{ width: `${Math.min(100, cpu)}%` }} />
                                    </span>
                                    <span className="metric-val">{cpu}%</span>
                                </div>
                            )}
                            {mem !== null && (
                                <div className="metric-row">
                                    <span className="metric-label">RAM</span>
                                    <span className="metric-bar">
                                        <span className={clsx('metric-fill', gaugeClass(mem))} style={{ width: `${Math.min(100, mem)}%` }} />
                                    </span>
                                    <span className="metric-val">{mem}%</span>
                                </div>
                            )}
                            {temp !== null && (
                                <div className={clsx('metric-temp', gaugeClass(temp >= 60 ? 90 : temp >= 50 ? 70 : 40))}>
                                    {temp}°C
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Hover Tooltip */}
                <div className="node-tooltip">
                    <div className="tooltip-header">{name}</div>
                    <div className="tooltip-body">
                        {data.model && data.model !== 'custom' && <div className="tooltip-row"><span>Model</span><span>{data.model}</span></div>}
                        {data.boardName && <div className="tooltip-row"><span>Board</span><span>{data.boardName}</span></div>}
                        {data.latency !== undefined && data.latency !== null && <div className="tooltip-row"><span>Latency</span><span>{data.latency}ms</span></div>}
                        {data.uptime !== undefined && data.uptime !== null && <div className="tooltip-row"><span>Uptime</span><span>{Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m</span></div>}
                        {data.packetLoss !== undefined && data.packetLoss !== null && <div className="tooltip-row"><span>Loss</span><span>{data.packetLoss}%</span></div>}
                        {data.notes && (
                            <div className="tooltip-notes mt-2 pt-2 border-t border-slate-700/50">
                                <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Notes</div>
                                <div className="text-[10px] text-slate-300 leading-relaxed italic">"{data.notes}"</div>
                            </div>
                        )}
                        {(!data.model || data.model === 'custom') && data.latency === undefined && !data.notes && <div className="tooltip-row text-slate-500 italic"><span>No metrics available</span></div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default memo(BaseNode);
