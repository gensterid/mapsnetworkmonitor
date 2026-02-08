/**
 * Default Map Colors
 * These values match the current hardcoded colors in NetworkMap.jsx and map.css
 */
export const DEFAULT_MAP_COLORS = {
    // Status
    online: '#10b981', // Emerald 500
    offline: '#ef4444', // Red 500
    warning: '#facc15', // Yellow 400

    // Devices
    pppoe: '#d946ef', // Fuchsia 500 (Purple)
    odp: '#f97316',   // Orange 500
    router: '#3b82f6', // Blue 500

    // Traffic Load (Heatmap)
    trafficyIdle: '#3b82f6',   // < 1M (Blue)
    trafficNormal: '#10b981',  // < 20M (Green)
    trafficHigh: '#facc15',    // < 50M (Yellow)
    trafficPeak: '#d946ef',    // > 50M (Purple)

    // Links
    linkActive: '#10b981',
    linkDown: '#ef4444',

    // Traffic Thresholds (Mbps) - Defaults
    trafficThresholdIdle: 1,   // < 1 Mbps
    trafficThresholdNormal: 20, // < 20 Mbps
    trafficThresholdHigh: 50,   // < 50 Mbps
};

// Helper to get color from settings or fallback to default
export const getMapColor = (settings, key) => {
    if (!settings || !settings.mapColors) return DEFAULT_MAP_COLORS[key];
    return settings.mapColors[key] || DEFAULT_MAP_COLORS[key];
};
