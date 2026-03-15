export function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

export function toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

export function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = toRadians(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
    const x =
        Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
        Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

    let bearing = toDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360; // Normalize to 0–360
}

/** Approximate distance in meters between two points (haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function calculateCentroid(coords: { lat: number; lon: number }[]): { lat: number; lon: number } {
    let totalLat = 0;
    let totalLon = 0;

    coords.forEach(coord => {
        totalLat += coord.lat;
        totalLon += coord.lon;
    });

    return { lat: totalLat / coords.length, lon: totalLon / coords.length };
}
