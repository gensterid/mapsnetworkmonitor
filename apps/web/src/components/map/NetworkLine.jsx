import React, { useMemo } from 'react';
import { TrafficContext, HoveredItemContext } from './MapStyles';
import AnimatedPath from './AnimatedPath';
import AntPath from './AntPath';
import { getAnimationStyle } from './animationStyles';

// Escape untuk nilai dinamis (nama device) yang masuk ke string HTML popup.
const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Id device yang aman diselipkan ke atribut onclick popup (mencegah injeksi).
// Hanya izinkan karakter id (UUID/slug); kalau tidak cocok → '' (tombol disembunyikan).
const safeId = (v) => (/^[\w-]+$/.test(String(v ?? '')) ? String(v) : '');

// Helper to format bitrate
export const formatBitrate = (bits) => {
    if (!bits) return '0 bps';
    if (bits >= 1000000) return `${(bits / 1000000).toFixed(1)} Mbps`;
    if (bits >= 1000) return `${(bits / 1000).toFixed(1)} Kbps`;
    return `${bits} bps`;
};

// Memoized Line Component for Performance
const NetworkLineOriginal = ({
    line,
    txRate, // Throttled (4s)
    rxRate, // Throttled (4s)
    isHeatmapMode,
    lineThickness,
    mapColors,
    currentUser,
    enableAnimation,
    lowPerfMode,
    timezone,
    onMouseOver,
    onMouseOut,
    onLineClick, // klik garis → buka panel ukur jarak (cek putus)
    highlightColor, // override warna garis saat sorot 1 core fiber
    tick,
    isLiveMode, // New prop
    trafficMapRef // Removed: now consumed from context
}) => {
    const { displayTrafficMap, trafficMapRef: contextTrafficMapRef } = React.useContext(TrafficContext);
    // Removed HoveredItemContext subscription to preventing re-renders on hover
    // const { hoveredLineId } = React.useContext(HoveredItemContext);
    // const isHovered = hoveredLineId === line.id;

    const activeTrafficMapRef = contextTrafficMapRef || trafficMapRef; // Fallback

    // Safety check for coordinates
    const isValidCoordinate = (coord) => Array.isArray(coord) && coord.length === 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]);
    if (!line || !isValidCoordinate(line.from) || !isValidCoordinate(line.to)) {
        return null; // Skip rendering invalid lines
    }

    // 1. Tooltip Content (Always calculated but values based on isLiveMode)
    const tooltipContent = useMemo(() => {
        const iface = line.targetInterface;
        let txRateLive = line.txRate || 0;
        let rxRateLive = line.rxRate || 0;

        if (isLiveMode) {
            const map = activeTrafficMapRef.current;
            const routerPrefixedKey = line.routerId ? `${line.routerId}:${iface}` : null;
            const stats = iface ? (map.get(routerPrefixedKey) || map.get(iface)) : null;
            txRateLive = stats?.tx ?? txRate;
            rxRateLive = stats?.rx ?? rxRate;
        }

        const formatBitrate = (bitsPerSecond) => {
            if (!bitsPerSecond || isNaN(bitsPerSecond)) return '0 bps';
            const bps = Number(bitsPerSecond);
            if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(2)} Gbps`;
            if (bps >= 1000000) return `${(bps / 1000000).toFixed(2)} Mbps`;
            if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
            return `${bps.toFixed(0)} bps`;
        };

        const isUp = ['up', 'online', 'active'].includes(line.status);

        // Info core yang mewarnai garis ini (ditugaskan device parent).
        const coreRow = line.coreColorHex ? `
                    <div class="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
                        <span class="text-slate-400">Core</span>
                        <span class="flex items-center gap-1.5 text-slate-200">
                            <span style="width:12px;height:12px;border-radius:3px;background:${line.coreColorHex};border:1px solid rgba(255,255,255,0.4);display:inline-block"></span>
                            ${line.coreIndex ? `Core ${escapeHtml(line.coreIndex)}` : 'Core'}${line.coreName ? ` · ${escapeHtml(line.coreName)}` : ''}
                        </span>
                    </div>` : '';

        // Kabel multi-core: titik warna tiap core yang LEWAT ruas ini + jumlah.
        const lc = Array.isArray(line.lineCores) ? line.lineCores : [];
        const trunkRow = (lc.length > 1) ? `
                    <div class="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
                        <span class="text-slate-400">Kabel</span>
                        <span class="flex items-center gap-1 text-slate-200">
                            ${lc.map((c) => `<span title="Core ${escapeHtml(c.i)}${c.dest ? ' → ' + escapeHtml(c.dest) : ''}" style="width:9px;height:9px;border-radius:2px;background:${c.hex};border:1px solid rgba(255,255,255,0.35);display:inline-block"></span>`).join('')}
                            <span class="text-[10px] text-slate-400 ml-1">${lc.length} core</span>
                        </span>
                    </div>` : '';

        // Tombol Edit Source/Destination di dalam popup (di kedua tempat: panel +
        // popup). Klik → CustomEvent 'map-edit-device' ditangkap NetworkMap.
        const srcId = safeId(line.sourceId);
        const dstId = safeId(line.netwatchId || line.pppoeId);
        const editBtn = (id, label) => id
            ? `<button type="button" onclick="window.dispatchEvent(new CustomEvent('map-edit-device',{detail:'${id}'}))" style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:5px 8px;color:#e2e8f0;font-size:11px;font-weight:600;cursor:pointer"><span class="material-symbols-outlined" style="font-size:14px">edit_location</span>${label}</button>`
            : '';
        const editRow = (srcId || dstId) ? `
                <div style="display:flex;gap:6px;padding:8px 12px;background:#1e293b;border-top:1px solid rgba(148,163,184,0.15)">
                    ${editBtn(srcId, 'Edit Source')}
                    ${editBtn(dstId, 'Edit Destination')}
                </div>` : '';

        return `
            <div class="flex flex-col min-w-[220px] bg-slate-900 rounded-lg shadow-xl border border-slate-700 overflow-hidden font-sans">
                <div class="px-3 py-2 flex items-center justify-between ${isUp ? 'bg-indigo-600' : 'bg-slate-600'}">
                    <div class="flex items-center gap-2 text-white">
                        <span class="material-symbols-outlined text-[16px]">cable</span>
                        <span class="font-bold text-xs truncate max-w-[140px]">${line.destName || 'Link'}</span>
                    </div>
                    <div class="px-1.5 py-0.5 bg-black/20 rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        ${line.deviceType || 'Link'}
                    </div>
                </div>
                <div class="p-3 bg-slate-800 space-y-3">
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Status</span>
                        <span class="font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}">${line.status.toUpperCase()}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs border-t border-slate-700/50 pt-2">
                        <span class="text-slate-400">Source</span>
                        <span class="text-slate-200 truncate max-w-[120px]">${line.sourceName || '-'}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Destination</span>
                        <span class="text-slate-200 truncate max-w-[120px]">${line.destName || '-'}</span>
                    </div>
                    ${coreRow}
                    ${trunkRow}
                    ${line.distance ? `
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">Distance</span>
                        <span class="text-slate-200 font-mono text-[10px]">${line.distance.toFixed(2)} m</span>
                    </div>
                    ` : ''}
                    ${isHeatmapMode && line.targetInterface ? `
                    <div class="flex items-center justify-between text-xs border-b border-slate-700/50 pb-2">
                        <span class="text-slate-400">Interface</span>
                        <span class="text-slate-200 font-mono text-[10px]">${line.targetInterface}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="bg-slate-900/50 p-2 rounded border border-slate-700/30 flex flex-col items-center shadow-inner">
                            <span class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">RX</span>
                            <span class="text-emerald-400 font-mono font-bold text-xs">${formatBitrate(rxRateLive)}</span>
                        </div>
                        <div class="bg-slate-900/50 p-2 rounded border border-slate-700/30 flex flex-col items-center shadow-inner">
                            <span class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TX</span>
                            <span class="text-blue-400 font-mono font-bold text-xs">${formatBitrate(txRateLive)}</span>
                        </div>
                    </div>
                    ` : ''}
                </div>
                ${editRow}
            </div>
        `;
    }, [line, txRate, rxRate, timezone, isLiveMode, isHeatmapMode]);

    // 2. Derive visual props
    const renderOptions = useMemo(() => {
        const styleConfig = getAnimationStyle(currentUser?.animationStyle || 'default');

        const latency = line.latency || 0;
        const packetLoss = line.packetLoss || 0;
        const isHighLatency = latency > 100;
        const isPacketLoss = packetLoss > 5;
        const isAlert = isHighLatency || isPacketLoss;

        // Use the throttled rates for visual calculations
        const maxRate = Math.max(txRate, rxRate);
        const isHeatmapActive = isHeatmapMode && ['up', 'online', 'active'].includes(line.status);

        let railColor = "#06b6d4";
        const thresholdIdle = (Number(mapColors.trafficThresholdIdle) || 1) * 1000000;
        const thresholdNormal = (Number(mapColors.trafficThresholdNormal) || 20) * 1000000;
        const thresholdHigh = (Number(mapColors.trafficThresholdHigh) || 50) * 1000000;

        const lineStatusLower = line.status ? String(line.status).toLowerCase() : '';
        const isLineOffline = lineStatusLower && !['up', 'online', 'active', 'warning'].includes(lineStatusLower);

        if (isLineOffline) {
            // Status offline menang atas deviceType=odp — line ke ODP yg derived-down akan merah
            railColor = mapColors.offline;
        } else if (lineStatusLower === 'warning') {
            // ODP partial / perangkat warning — pakai warna warning (kuning)
            railColor = mapColors.warning;
        } else if (line.deviceType === 'odp') {
            railColor = mapColors.odp;
        } else if (isHeatmapActive) {
            if (maxRate < thresholdIdle) railColor = mapColors.trafficyIdle;
            else if (maxRate < thresholdNormal) railColor = mapColors.trafficNormal;
            else if (maxRate < thresholdHigh) railColor = mapColors.trafficHigh;
            else railColor = mapColors.trafficPeak;
        } else if (line.deviceType === 'pppoe') {
            railColor = mapColors.pppoe;
        } else if (isAlert) {
            railColor = mapColors.warning;
        } else if (line.status === 'up' || line.status === 'online') {
            railColor = mapColors.online;
        }

        let effectiveThickness = lineThickness;
        if (isHeatmapActive) {
            if (maxRate < thresholdIdle) effectiveThickness = Math.max(1, lineThickness - 1);
            else if (maxRate > thresholdHigh) effectiveThickness = lineThickness + 3;
            else if (maxRate > thresholdNormal) effectiveThickness = lineThickness + 1;
        }

        let motionColor = railColor;
        // Prioritize motionType from styleConfig, otherwise fall back to status-based defaults
        let motionType = styleConfig.motionType;

        if (!motionType) {
            motionType = 'orb';
            if (isHeatmapActive || isAlert) {
                motionType = 'packet';
            } else if (line.deviceType === 'pppoe') {
                motionType = 'orb';
            } else if (line.deviceType === 'odp') {
                motionType = 'comet';
            }
        }

        return {
            styleConfig,
            railColor,
            effectiveThickness,
            motionColor,
            motionType,
            isAlert,
            isAntPath: styleConfig.isAntPath && !lowPerfMode
        };
    }, [line.status, line.deviceType, line.latency, line.packetLoss, txRate, rxRate, isHeatmapMode, lineThickness, mapColors, currentUser?.animationStyle, lowPerfMode]);

    let { styleConfig, railColor, effectiveThickness, motionColor, motionType, isAlert, isAntPath } = renderOptions;
    // Warna core fiber: seluruh segmen pakai warna core itu — TAPI status DOWN
    // menang (garis putus tetap merah supaya jelas saat troubleshooting).
    const lineDown = line.status && !['up', 'online', 'active', 'warning'].includes(String(line.status).toLowerCase());
    if (highlightColor && !lineDown) {
        railColor = highlightColor;
        motionColor = highlightColor;
        effectiveThickness = effectiveThickness + 2;
    }

    if (isAntPath) {
        return (
            <AntPath
                positions={[line.from, ...(line.waypoints || []), line.to]}
                options={{
                    delay: styleConfig.delay,
                    dashArray: styleConfig.dashArray,
                    weight: effectiveThickness,
                    color: styleConfig.color || railColor,
                    pulseColor: styleConfig.pulseColor || "transparent",
                    paused: !enableAnimation,
                    reverse: false
                }}
                tooltip={tooltipContent}
                popup={tooltipContent}
                onClick={() => onLineClick?.(line)}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            />
        );
    }

    return (
        <AnimatedPath
            positions={[line.from, ...(line.waypoints || []), line.to]}
            status={line.status}
            type={line.deviceType}
            animationStyle={currentUser?.animationStyle || 'default'}
            delay={styleConfig.delay}
            dashArray={styleConfig.dashArray}
            weight={effectiveThickness}
            enableAnimation={enableAnimation}
            lineCap={styleConfig.lineCap || 'butt'}
            color={railColor}
            pulseColor={(line.status === 'down' || isAlert) ? railColor : (styleConfig.pulseColor ?? railColor)}
            motionColor={motionColor}
            motionType={motionType}
            disableMotionPath={lowPerfMode}
            lowPerfMode={lowPerfMode}
            paused={!enableAnimation}
            tooltip={tooltipContent}
            popup={tooltipContent}
            onClick={() => onLineClick?.(line)}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
        />
    );
};

// Tanda-tangan ringan cores yang lewat ruas ini (deteksi perubahan tanpa deep-compare).
const lineCoresSig = (line) => {
    const c = line?.lineCores;
    if (!Array.isArray(c)) return '';
    return c.map((x) => `${x.i}:${x.dest || ''}`).join('|');
};

// Custom comparison to prevent re-renders when non-hovered live traffic changes
export const areLinesEqual = (prev, next) => {
    // 1. Check for position changes (Essential for fixing "Centered at Router" bug)
    const fromChanged = prev.line.from[0] !== next.line.from[0] || prev.line.from[1] !== next.line.from[1];
    const toChanged = prev.line.to[0] !== next.line.to[0] || prev.line.to[1] !== next.line.to[1];

    if (fromChanged || toChanged) return false;

    // 2. Check other primitive props
    return (
        prev.line.id === next.line.id &&
        prev.line.status === next.line.status &&
        prev.line.latency === next.line.latency &&
        prev.line.packetLoss === next.line.packetLoss &&
        prev.line.deviceType === next.line.deviceType &&
        prev.line.destName === next.line.destName &&
        prev.line.sourceName === next.line.sourceName &&
        prev.txRate === next.txRate &&
        prev.rxRate === next.rxRate &&
        prev.isHeatmapMode === next.isHeatmapMode &&
        prev.isLiveMode === next.isLiveMode &&
        prev.lineThickness === next.lineThickness &&
        prev.enableAnimation === next.enableAnimation &&
        prev.lowPerfMode === next.lowPerfMode &&
        prev.timezone === next.timezone &&
        prev.highlightColor === next.highlightColor &&
        prev.line.coreColorHex === next.line.coreColorHex &&
        prev.line.coreIndex === next.line.coreIndex &&
        prev.line.sourceId === next.line.sourceId &&
        prev.line.netwatchId === next.line.netwatchId &&
        lineCoresSig(prev.line) === lineCoresSig(next.line) &&
        prev.trafficMapRef === next.trafficMapRef
    );
};

export const MemoizedNetworkLine = React.memo(NetworkLineOriginal, areLinesEqual);

export default MemoizedNetworkLine;
