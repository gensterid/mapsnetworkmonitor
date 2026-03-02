import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { clsx } from 'clsx';
import './nodes.css';

const BaseNode = ({ data, children, type }) => {
    const { name, host, status } = data;

    return (
        <div className={clsx('base-node-container', type, status)}>
            <div className="node-glass-card">
                {/* Status LED */}
                <div className={clsx('status-led', (status === 'up' || status === 'online') ? 'up' : 'down')} />

                {/* Ports - Left Side */}
                <div className="handles-left">
                    <Handle type="target" position={Position.Left} id="tl1" style={{ top: '30%' }} />
                    <Handle type="source" position={Position.Left} id="sl1" style={{ top: '40%' }} />
                    <Handle type="target" position={Position.Left} id="tl2" style={{ top: '60%' }} />
                    <Handle type="source" position={Position.Left} id="sl2" style={{ top: '70%' }} />
                </div>

                <div className="node-content">
                    {children}
                    <div className="node-info">
                        <div className="node-name">{name}</div>
                        <div className="node-host">{host}</div>
                    </div>
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
                        {(!data.model || data.model === 'custom') && data.latency === undefined && <div className="tooltip-row text-slate-500 italic"><span>No metrics available</span></div>}
                    </div>
                </div>

                {/* Ports - Right Side */}
                <div className="handles-right">
                    <Handle type="source" position={Position.Right} id="sr1" style={{ top: '30%' }} />
                    <Handle type="target" position={Position.Right} id="tr1" style={{ top: '40%' }} />
                    <Handle type="source" position={Position.Right} id="sr2" style={{ top: '60%' }} />
                    <Handle type="target" position={Position.Right} id="tr2" style={{ top: '70%' }} />
                </div>
            </div>
        </div>
    );
};

export default memo(BaseNode);
