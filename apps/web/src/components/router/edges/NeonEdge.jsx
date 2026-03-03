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
    // Path offset is used when multiple links share the same path
    const offset = parseFloat(data?.pathOffset) || 0;

    // To prevent detaching from the device handles, we shouldn't modify sourceX/Y or targetX/Y directly.
    // Instead, we use getSmoothStepPath, but it doesn't natively support shifting the entire path sideways
    // while keeping anchor points.

    // A robust way to handle 'offset' visually in React Flow without complex custom SVG path math 
    // is to adjust the 'offset' parameter of getSmoothStepPath (which controls the routing distance from the node)
    // combined with a slight shift in the center. But since users want to separate overlapping cables,
    // the best approach in getSmoothStepPath is to modify the 'offset' (routing padding) based on the user's offset value.

    // Default routing offset is 20. We add the raw user offset to this padding.
    // This makes the cable route wider or narrower around the devices, separating them.
    const routingPadding = Math.max(5, 20 + offset); // Ensure it doesn't collapse into the node

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 16,
        offset: routingPadding,
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
