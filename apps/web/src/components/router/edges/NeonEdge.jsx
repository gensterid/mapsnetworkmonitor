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

    // ── Utilization heatmap ────────────────────────────────────────────────
    // Beban link = total traffic vs kapasitas referensi. Kalau data.capacityBps
    // tidak ada, pakai default 100 Mbps. util 0..1 → warna cyan→amber→merah +
    // kabel makin tebal saat makin sibuk.
    const totalTraffic = (data?.txRate || 0) + (data?.rxRate || 0);
    const refCapacity = data?.capacityBps || 100_000_000; // 100 Mbps default
    const util = Math.min(1, totalTraffic / refCapacity);

    // Hue 190 (cyan, idle) → 0 (merah, penuh). Lewat hijau/kuning di tengah.
    const heatHue = Math.round(190 - util * 190);
    const heatColor = `hsl(${heatHue}, 90%, 55%)`;
    const heatWidth = 2 + util * 4; // 2px idle → 6px penuh
    const heatGlow = 6 + util * 10;

    // Dynamic animation duration (faster at higher speeds)
    const speedFactor = Math.min(5, Math.max(1, totalTraffic / 1000000));
    const animationDuration = `${2 / speedFactor}s`;

    // Partikel traffic mengalir — tampil saat link UP dan ada traffic (atau
    // live mode). Jumlah + kecepatan ikut utilisasi.
    const showParticles = isUp && (data?.isLiveMode || totalTraffic > 0);
    const particleCount = showParticles ? 3 + Math.round(util * 5) : 0; // 3..8
    const particleDur = 3 - util * 1.8; // detik: 3s idle → ~1.2s penuh

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

            {/* Glow Path — warna & tebal ikut utilisasi (heatmap). Saat down,
                pakai class .down (merah). Saat up, override inline dengan heat. */}
            <path
                className={clsx("neon-glow-path", !isUp && "down")}
                style={isUp ? {
                    stroke: heatColor,
                    strokeWidth: heatWidth,
                    strokeOpacity: 0.35 + util * 0.35,
                    filter: `drop-shadow(0 0 ${heatGlow}px ${heatColor})`,
                } : undefined}
                d={edgePath}
                fill="none"
                strokeWidth={2}
                pathLength="100"
            />

            {/* Partikel traffic mengalir sepanjang kabel (SMIL animateMotion). */}
            {particleCount > 0 && Array.from({ length: particleCount }).map((_, i) => (
                <circle
                    key={`${id}-particle-${i}`}
                    r={1.6 + util * 1.4}
                    fill={heatColor}
                    style={{ filter: `drop-shadow(0 0 3px ${heatColor})` }}
                >
                    <animateMotion
                        dur={`${particleDur}s`}
                        begin={`-${(particleDur / particleCount) * i}s`}
                        repeatCount="indefinite"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                    >
                        <mpath href={`#${id}`} />
                    </animateMotion>
                </circle>
            ))}

            {/* Neon dash pulse — hanya saat TIDAK ada partikel (idle) supaya
                kabel tetap "hidup" tapi tidak terlalu ramai. */}
            {data?.animationType !== 'none' && !showParticles && (
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
