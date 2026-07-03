import React from 'react';
import { getSmoothStepPath, getBezierPath, getStraightPath, EdgeText } from '@xyflow/react';
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

    // Gaya garis dipilih operator (global): lengkung (bezier) / siku
    // (smoothstep) / lurus. Default lengkung.
    const lineStyle = data?.lineStyle || 'curved';
    const pp = {
        sourceX: sourceX + nx,
        sourceY: sourceY + ny,
        sourcePosition,
        targetX: targetX + nx,
        targetY: targetY + ny,
        targetPosition,
    };
    let edgePath, labelX, labelY;
    if (lineStyle === 'straight') {
        [edgePath, labelX, labelY] = getStraightPath({ sourceX: pp.sourceX, sourceY: pp.sourceY, targetX: pp.targetX, targetY: pp.targetY });
    } else if (lineStyle === 'stepped') {
        [edgePath, labelX, labelY] = getSmoothStepPath({ ...pp, borderRadius: 16, offset: 20 });
    } else {
        [edgePath, labelX, labelY] = getBezierPath(pp);
    }

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
    // live mode). Jumlah + kecepatan ikut utilisasi. Dibatasi 2..5 per edge
    // supaya total SMIL <animateMotion> tetap terkendali di topology besar
    // (SMIL jalan di main-thread, tidak di-compositor).
    const showParticles = isUp && (data?.isLiveMode || totalTraffic > 0);
    const particleCount = showParticles ? 2 + Math.round(util * 3) : 0; // 2..5
    const particleDur = 3 - util * 1.8; // detik: 3s idle → ~1.2s penuh

    // Edge id bisa mengandung karakter (mis. ':') yang membuat fragment ref
    // `#id` gagal resolve di SVG → partikel diam. Sanitasi untuk id path+mpath.
    const pathId = `edgep-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const arrowColor = isUp ? heatColor : '#ef4444';
    const arrowId = `arrow-${pathId}`;

    return (
        <>
            {/* Panah arah di ujung target — perjelas source→target. */}
            <defs>
                <marker id={arrowId} markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L6,3 L0,6 Z" fill={arrowColor} />
                </marker>
            </defs>

            {/* Background path for the cable look */}
            <path
                id={pathId}
                style={{ ...style, strokeOpacity: 0.1, strokeWidth: 4 }}
                className="react-flow__edge-path base-path"
                d={edgePath}
                pathLength="100"
            />

            {/* Glow Path — warna & tebal ikut utilisasi (heatmap). Saat down,
                pakai class .down (merah, berkedip). Saat up, override inline
                dengan heat. Panah arah di ujung target. */}
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
                markerEnd={`url(#${arrowId})`}
                pathLength="100"
            />

            {/* Partikel traffic mengalir — bentuk comet (ellipse memanjang +
                rotate="auto" ikut arah lintasan) supaya arah aliran jelas. */}
            {particleCount > 0 && Array.from({ length: particleCount }).map((_, i) => (
                <ellipse
                    key={`${id}-particle-${i}`}
                    rx={3 + util * 3}
                    ry={1.3 + util * 1}
                    fill={heatColor}
                    style={{ filter: `drop-shadow(0 0 4px ${heatColor})` }}
                >
                    <animateMotion
                        dur={`${particleDur}s`}
                        begin={`-${(particleDur / particleCount) * i}s`}
                        repeatCount="indefinite"
                        rotate="auto"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                    >
                        <mpath href={`#${pathId}`} />
                    </animateMotion>
                </ellipse>
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
