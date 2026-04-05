import L from 'leaflet';

// Custom cluster icon creator
const createClusterCustomIcon = (cluster) => {
    const markers = cluster.getAllChildMarkers();
    let hasDown = false;
    let hasIssue = false;
    let downCount = 0;
    let issueCount = 0;

    for (const marker of markers) {
        // Access options passed to Marker via DraggableMarker
        const status = marker.options.status;
        const latency = marker.options.latency;
        const packetLoss = marker.options.packetLoss;
        const lastRxPower = marker.options.lastRxPower;

        // Check Down
        if (['down', 'offline', 'lost', 'power_down', 'dying_gasp'].includes(status)) {
            hasDown = true;
            downCount++;
        }
        // Check Issue (if not down)
        else {
            const signalPower = lastRxPower !== null ? parseFloat(lastRxPower) : null;
            const hasPerformanceIssue =
                (latency !== null && latency > 100) ||
                (packetLoss !== null && packetLoss > 0) ||
                (signalPower !== null && signalPower < -24);

            // Is it a full ODP? (New Consistency Logic)
            const isFullOdp = marker.options.type === 'odp' && marker.options.portCapacity && marker.options.usedPorts >= marker.options.portCapacity;

            // Smart Warning: ODP only shows warning if it has an IP host (monitored via latency/loss) OR if it is full
            const isWarning = (hasPerformanceIssue && (marker.options.type !== 'odp' || (marker.options.host))) || isFullOdp;

            if (isWarning) {
                hasIssue = true;
                issueCount++;
            }
        }
    }

    const childCount = cluster.getChildCount();

    // Color logic: Red (Offline) > Yellow (Warning/Full ODP) > Blue (Default)
    let bgColor = 'rgba(59, 130, 246, 0.9)'; // Blue (Default)
    if (hasDown) {
        bgColor = 'rgba(239, 68, 68, 0.9)'; // Red
    } else if (hasIssue) {
        bgColor = 'rgba(234, 179, 8, 0.9)'; // Yellow (Amber-500)
    }

    // Pulse Logic Consistency: Pulse if there is an offline device OR an ODP at capacity
    const shouldPulse = hasDown || hasIssue;

    return L.divIcon({
        html: `
                <div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                width: 100%; 
                height: 100%; 
                background-color: ${bgColor}; 
                border: 1.5px solid white; 
                border-radius: 50%; 
                color: white; 
                font-weight: bold; 
                font-size: 12px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                position: relative;
                ${shouldPulse ? 'animation: pulse-ring 2s infinite;' : ''}
            ">
                    <span>${childCount}</span>
                    ${hasDown ? `
                    <span style="
                        position: absolute; 
                        top: -4px; 
                        right: -4px; 
                        background-color: #7f1d1d; 
                        color: white; 
                        font-size: 9px; 
                        width: 14px; 
                        height: 14px; 
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        border: 1px solid white;
                    ">${downCount}</span>
                ` : ''}
                    ${!hasDown && hasIssue ? `
                    <span style="
                        position: absolute; 
                        top: -4px; 
                        right: -4px; 
                        background-color: #ca8a04; 
                        color: white; 
                        font-size: 9px; 
                        width: 14px; 
                        height: 14px; 
                        border-radius: 50%; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        border: 1px solid white;
                    ">${issueCount}</span>
                ` : ''}
                </div>
                `,
        className: 'custom-cluster-marker',
        iconSize: L.point(30, 30, true),
    });
};

export default createClusterCustomIcon;
