export const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const calculatePathLength = (positions) => {
    if (!positions || positions.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < positions.length - 1; i++) {
        total += calculateDistance(
            positions[i][0], positions[i][1],
            positions[i + 1][0], positions[i + 1][1]
        );
    }
    return total;
};

export const formatDistance = (meters) => {
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
};
