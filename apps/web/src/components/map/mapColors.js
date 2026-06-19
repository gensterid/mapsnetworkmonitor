/**
 * Default Map Colors
 *
 * Hex values aligned dengan status token di `src/constants/status.js`:
 *   online  → STATUS_CLASSES.online.hex   (#22c55e green-500)
 *   offline → STATUS_CLASSES.offline.hex  (#ef4444 red-500)
 *   warning → STATUS_CLASSES.issue.hex    (#eab308 yellow-500)
 *   unknown → STATUS_CLASSES.unknown.hex  (#6b7280 gray-500)
 *
 * Note: nama kunci `warning` di mapColors disengaja tidak di-rename jadi
 * `issue` (matching status token) — itu breaking change ke
 * `settings.mapColors.warning` yang sudah tersimpan di DB user. Kunci
 * tetap, hex value yang di-update. Alias `issue` ditambahkan untuk
 * forward-compat code baru yang pakai vocabulary status token.
 *
 * Device-type colors (router, pppoe, odp) bukan status — tetap dengan
 * brand-tone berbeda.
 */
export const DEFAULT_MAP_COLORS = {
    // Status — aligned dengan src/constants/status.js
    online: '#22c55e',  // green-500 (status token online)
    offline: '#ef4444', // red-500 (status token offline)
    warning: '#eab308', // yellow-500 (status token issue) — kunci `warning` legacy
    issue: '#eab308',   // alias forward-compat untuk vocabulary status token
    unknown: '#6b7280', // gray-500 (status token unknown)

    // Device type indicators (bukan status, brand-tone)
    pppoe: '#d946ef',   // Fuchsia 500 (Purple)
    odp: '#f97316',     // Orange 500
    router: '#3b82f6',  // Blue 500 (sesuai primary color app)

    // Traffic Load (Heatmap) — green-500 untuk normal supaya match online
    trafficyIdle: '#3b82f6',  // < 1M (Blue, idle traffic)
    trafficNormal: '#22c55e', // < 20M (green-500, match online)
    trafficHigh: '#eab308',   // < 50M (yellow-500, match warning)
    trafficPeak: '#d946ef',   // > 50M (Fuchsia, peak load)

    // Links — green-500 untuk active match online
    linkActive: '#22c55e',
    linkDown: '#ef4444',

    // Traffic Thresholds (Mbps) - Defaults
    trafficThresholdIdle: 1,    // < 1 Mbps
    trafficThresholdNormal: 20, // < 20 Mbps
    trafficThresholdHigh: 50,   // < 50 Mbps
};

/**
 * Helper untuk ambil warna dari settings (kalau user customize via
 * MapColorsSettings) atau fallback ke default di file ini.
 *
 * Backward compat: signature tidak berubah. Saat user pakai warna lama
 * (emerald #10b981) yang sudah tersimpan di DB, tetap dihormati.
 */
export const getMapColor = (settings, key) => {
    if (!settings || !settings.mapColors) return DEFAULT_MAP_COLORS[key];
    return settings.mapColors[key] || DEFAULT_MAP_COLORS[key];
};
