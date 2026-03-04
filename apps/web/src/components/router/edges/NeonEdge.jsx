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

            {data?.label && (
                <EdgeText
                    x={labelX}
                    y={labelY}
                    label={data.label}
                    labelStyle={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                    labelShowBg
                    labelBgStyle={{ fill: '#0b0e14', fillOpacity: 0.8 }}
                    labelBgPadding={[4, 2]}
                    labelBgBorderRadius={4}
                />
            )}
        </>
    );
};

export default NeonEdge;
