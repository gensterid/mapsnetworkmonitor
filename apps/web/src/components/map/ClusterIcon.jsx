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
        const latency = marker.options.icon?.options?.latency;
        const packetLoss = marker.options.icon?.options?.packetLoss;

        // Check Down
        if (['down', 'offline', 'lost', 'power_down', 'dying_gasp'].includes(status)) {
            hasDown = true;
            downCount++;
        }
        // Check Issue (if not down)
        else {
            const isWarning = (latency !== undefined && latency > 100) || (packetLoss !== undefined && packetLoss > 0);
            if (isWarning) {
                hasIssue = true;
                issueCount++;
            }
        }
    }

    const childCount = cluster.getChildCount();

    // Color logic: Red > Yellow > Blue
    let bgColor = 'rgba(59, 130, 246, 0.9)'; // Blue (Default)
    if (hasDown) {
        bgColor = 'rgba(239, 68, 68, 0.9)'; // Red
    } else if (hasIssue) {
        bgColor = 'rgba(234, 179, 8, 0.9)'; // Yellow (Amber-500)
    }

    return L.divIcon({
        html: `
                <div style="
                display: flex; 
                align-items: center; 
                justify-content: center; 
                width: 100%; 
                height: 100%; 
                background-color: ${bgColor}; 
                border: 2px solid white; 
                border-radius: 50%; 
                color: white; 
                font-weight: bold; 
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                position: relative;
                ${hasDown ? 'animation: pulse-ring 2s infinite;' : ''}
            ">
                    <span>${childCount}</span>
                    ${hasDown ? `
                    <span style="
                        position: absolute; 
                        top: -5px; 
                        right: -5px; 
                        background-color: #7f1d1d; 
                        color: white; 
                        font-size: 10px; 
                        width: 16px; 
                        height: 16px; 
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
                        top: -5px; 
                        right: -5px; 
                        background-color: #ca8a04; 
                        color: white; 
                        font-size: 10px; 
                        width: 16px; 
                        height: 16px; 
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
        iconSize: L.point(40, 40, true),
    });
};

export default createClusterCustomIcon;
