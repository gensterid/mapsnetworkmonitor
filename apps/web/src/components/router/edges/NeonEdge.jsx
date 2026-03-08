import React from 'react';
import { getSmoothStepPath, EdgeText } from '@xyflow/react';
import { clsx } from 'clsx';

const NeonEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
    markerEnd,
}) => {
    // Path offset shifts the cable perpendicular to the source→target direction
    // This separates overlapping cables between the same two nodes
    const offset = parseFloat(data?.pathOffset) || 0;

    // Calculate perpendicular direction for the offset
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Normal vector (perpendicular): rotate 90° → (-dy, dx)
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX: sourceX + nx,
        sourceY: sourceY + ny,
        sourcePosition,
        targetX: targetX + nx,
        targetY: targetY + ny,
        targetPosition,
        borderRadius: 16,
        offset: 20,
    });

    const isUp = data?.status === 'up' || data?.status === 'online';

    // Format bitrate for display
    const formatBitrate = (bits) => {
        if (!bits || isNaN(bits)) return '0 bps';
        if (bits >= 1000000000) return `${(bits / 1000000000).toFixed(2)} Gbps`;
        if (bits >= 1000000) return `${(bits / 1000000).toFixed(1)} Mbps`;
        if (bits >= 1000) return `${(bits / 1000).toFixed(1)} Kbps`;
        return `${Math.round(bits)} bps`;
    };

    // Calculate dynamic animation duration based on traffic (100bps base, faster at higher speeds)
    const totalTraffic = (data?.txRate || 0) + (data?.rxRate || 0);
    const speedFactor = Math.min(5, Math.max(1, totalTraffic / 1000000)); // Faster up to 5x at 5Mbps+
    const animationDuration = `${2 / speedFactor}s`;

    return (
        <>
            {/* Background path for the cable look */}
            <path
                id={id}
                style={{ ...style, strokeOpacity: 0.1, strokeWidth: 4 }}
                className="react-flow__edge-path base-path"
                d={edgePath}
                markerEnd={markerEnd}
                pathLength="100"
            />

            {/* Glow Path */}
            <path
                className={clsx("neon-glow-path", !isUp && "down")}
                d={edgePath}
                fill="none"
                strokeWidth={2}
                pathLength="100"
            />

            {/* Neon Flow Animation Points - Always show if animation is enabled */}
            {data?.animationType !== 'none' && (
                <path
                    key={`${id}-${data?.animationType || 'pulse'}`}
                    className={clsx(
                        "neon-flow-animation",
                        data?.animationType || 'pulse',
                        !isUp && "down"
                    )}
                    style={{ 
                        animationDuration: data?.isLiveMode ? animationDuration : undefined 
                    }}
                    d={edgePath}
                    fill="none"
                    pathLength="100"
                />
            )}

            {/* Wider invisible path for better hover detection */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={20}
                stroke="transparent"
                className="edge-hover-area"
                onClick={(e) => data?.isEditMode && e.stopPropagation()}
            />

            {data?.notes && (
                <foreignObject
                    width={200}
                    height={100}
                    x={labelX - 100}
                    y={labelY - 60}
                    className="edge-tooltip-container"
                    style={{ pointerEvents: 'none', overflow: 'visible' }}
                >
                    <div className="edge-tooltip">
                        <div className="tooltip-header">Link Notes</div>
                        <div className="tooltip-body">
                            <div className="text-[10px] text-slate-300 leading-relaxed italic">"{data.notes}"</div>
                        </div>
                    </div>
                </foreignObject>
            )}

            {(data?.label || (data?.txRate > 0 || data?.rxRate > 0) || data?.isLiveMode) && (
                <g>
                    {data?.label && (
                        <EdgeText
                            x={labelX}
                            y={(data?.txRate > 0 || data?.rxRate > 0 || data?.isLiveMode) ? labelY - 10 : labelY}
                            label={data.label}
                            labelStyle={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                            labelShowBg
                            labelBgStyle={{ fill: '#0b0e14', fillOpacity: 0.8 }}
                            labelBgPadding={[4, 2]}
                            labelBgBorderRadius={4}
                        />
                    )}
                    {(data?.txRate > 0 || data?.rxRate > 0 || data?.isLiveMode) && (
                        <EdgeText
                            x={labelX}
                            y={data?.label ? labelY + 8 : labelY}
                            label={`TX: ${formatBitrate(data.txRate)} | RX: ${formatBitrate(data.rxRate)}`}
                            labelStyle={{ 
                                fill: totalTraffic > 0 ? '#fbbf24' : '#64748b', 
                                fontSize: 9, 
                                fontWeight: 800,
                                fontFamily: 'monospace'
                            }}
                            labelShowBg
                            labelBgStyle={{ fill: '#0b0e14', fillOpacity: 0.9 }}
                            labelBgPadding={[3, 1]}
                            labelBgBorderRadius={2}
                        />
                    )}
                </g>
            )}
        </>
    );
};

export default NeonEdge;
