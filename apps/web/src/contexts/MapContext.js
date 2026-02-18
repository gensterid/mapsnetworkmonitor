import React from 'react';

export const TrafficContext = React.createContext({
    hoverTick: 0,
    displayTrafficMap: new Map(),
    trafficMapRef: { current: new Map() },
    timezone: 'UTC',
    isHeatmapMode: false,
    isLiveMode: false
});

export const HoveredItemContext = React.createContext({
    hoveredMarkerId: null,
    hoveredLineId: null
});
