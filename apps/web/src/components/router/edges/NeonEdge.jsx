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
    const offset = parseFloat(data?.pathOffset) || 0;

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX: sourcePosition === 'left' || sourcePosition === 'right' ? sourceX : sourceX + offset,
        sourceY: sourcePosition === 'top' || sourcePosition === 'bottom' ? sourceY : sourceY + offset,
        sourcePosition,
        targetX: targetPosition === 'left' || targetPosition === 'right' ? targetX : targetX + offset,
        targetY: targetPosition === 'top' || targetPosition === 'bottom' ? targetY : targetY + offset,
        targetPosition,
        borderRadius: 16,
        offset: 20, // Add some default offset for SmoothStep to separate multiple edges
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
            />

            {/* Glow Path */}
            <path
                className={clsx("neon-glow-path", !isUp && "down")}
                d={edgePath}
                fill="none"
                strokeWidth={2}
            />

            {/* Neon Flow Animation Points */}
            {(isUp || data?.isEditMode) && data?.animationType !== 'none' && (
                <path
                    className={clsx(
                        "neon-flow-animation",
                        data?.animationType === 'dash' && "dash"
                    )}
                    d={edgePath}
                    fill="none"
                    strokeWidth={data?.animationType === 'dash' ? 1.5 : 4}
                    strokeDasharray={data?.animationType === 'dash' ? "5, 5" : "4, 46"}
                    pathLength="100"
                />
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
