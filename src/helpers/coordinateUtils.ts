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

    coords.forEach((coord) => {
        totalLat += coord.lat;
        totalLon += coord.lon;
    });

    return { lat: totalLat / coords.length, lon: totalLon / coords.length };
}

/** Web Mercator (EPSG:3857), same as airplanes.live / OSM. */
const WGS84_R = 6378137;

function latLonToWebMercator(lat: number, lon: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const x = WGS84_R * lonRad;
    const y = WGS84_R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return { x, y };
}

function webMercatorToLatLon(x: number, y: number): { lat: number; lon: number } {
    const lon = (x / WGS84_R) * (180 / Math.PI);
    const latRad = 2 * Math.atan(Math.exp(y / WGS84_R)) - Math.PI / 2;
    const lat = latRad * (180 / Math.PI);
    return { lat, lon };
}

/**
 * Compute center (lat, lon) and zoom level so the given path fits in the viewport.
 * Uses Web Mercator; zoom is the standard 0–18 web map zoom (same as airplanes.live).
 * @param points Path points (lat/lon)
 * @param viewportWidthPx Screenshot width (e.g. 1200)
 * @param viewportHeightPx Screenshot height (e.g. 800)
 * @param paddingFactor Multiply bounds by this so path isn't at edge (e.g. 1.15)
 */
export function getBoundsZoomCenter(
    points: { lat: number; lon: number }[],
    viewportWidthPx: number,
    viewportHeightPx: number,
    paddingFactor = 1.15,
): { lat: number; lon: number; zoom: number } {
    if (points.length === 0) {
        return { lat: 0, lon: 0, zoom: 2 };
    }
    let xMin = Infinity,
        xMax = -Infinity,
        yMin = Infinity,
        yMax = -Infinity;
    for (const p of points) {
        const { x, y } = latLonToWebMercator(p.lat, p.lon);
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
    }
    const pad = paddingFactor;
    const widthM = Math.max((xMax - xMin) * pad, 1);
    const heightM = Math.max((yMax - yMin) * pad, 1);
    const worldCircumference = 2 * Math.PI * WGS84_R;
    const zoomW = Math.log2((viewportWidthPx / 256) * (worldCircumference / widthM));
    const zoomH = Math.log2((viewportHeightPx / 256) * (worldCircumference / heightM));
    let zoom = Math.floor(Math.min(zoomW, zoomH));
    zoom = Math.max(0, Math.min(18, zoom));
    const centerX = (xMin + xMax) / 2;
    const centerY = (yMin + yMax) / 2;
    const { lat, lon } = webMercatorToLatLon(centerX, centerY);
    return { lat, lon, zoom };
}
