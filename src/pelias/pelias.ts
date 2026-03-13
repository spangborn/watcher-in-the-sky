import axios from 'axios';
import { PELIAS_INSTANCE } from '../constants';

/** Closest venue/landmark from Pelias nearby (for message text). Distance in km from API, returned as miles. */
export interface ClosestLandmark {
    name: string;
    distanceMiles: number;
}

export async function reverse(lat: number, lon: number, options: Record<string, any> = {}): Promise<any> {
    const requestUrl = new URL("/v1/reverse", PELIAS_INSTANCE);

    Object.entries({ ...options, 'point.lat': lat, 'point.lon': lon, "layers": "coarse" }).forEach(([key, value]) => {
        requestUrl.searchParams.append(key, String(value));
    });
    console.log(`Querying ${requestUrl}`);
    try {
        const response = await axios.get(requestUrl.toString());
        return response.data;
    } catch (error: any) {
        console.error('Error during reverse query:', error.message);
        throw error;
    }
}

/** Radius in km when checking for nearby airports. Pelias API clamps boundary.circle.radius to 5km max. */
const AIRPORT_NEARBY_RADIUS_KM = 5;

/**
 * Returns true if an aerodrome (airport) is within AIRPORT_NEARBY_RADIUS_KM of the point.
 * Uses Pelias /v1/nearby with categories=aeroway:aerodrome,transport:air:aerodrome (OR) to support both taxonomies.
 * Requires Pelias to be built with venue/POI data that includes airports (e.g. whosonfirst).
 */
export async function isNearbyAirport(lat: number, lon: number, options: Record<string, unknown> = {}): Promise<boolean> {
    const requestUrl = new URL("/v1/nearby", PELIAS_INSTANCE);

    const params: Record<string, string> = {
        'point.lat': String(lat),
        'point.lon': String(lon),
        'categories': 'aeroway:aerodrome,transport:air:aerodrome',
        'size': '10',
        'boundary.circle.radius': String(AIRPORT_NEARBY_RADIUS_KM),
        ...Object.fromEntries(
            Object.entries(options).map(([k, v]) => [k, String(v)])
        ),
    };
    Object.entries(params).forEach(([key, value]) => {
        requestUrl.searchParams.set(key, value);
    });
    console.log(`Querying ${requestUrl}`);
    try {
        const response = await axios.get(requestUrl.toString());
        return (response.data?.features?.length ?? 0) > 0;
    } catch (error: unknown) {
        console.error('Error during airport nearby query:', error instanceof Error ? error.message : error);
        throw error;
    }
}

/** Approximate distance in km between two points (haversine). */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/** Get the closest venue/landmark near a point (for "X miles from [landmark]" in posts). Uses venue layer only; separate from reverse (coarse). */
export async function getClosestLandmark(lat: number, lon: number): Promise<ClosestLandmark | null> {
    const requestUrl = new URL('/v1/nearby', PELIAS_INSTANCE);
    requestUrl.searchParams.set('point.lat', String(lat));
    requestUrl.searchParams.set('point.lon', String(lon));
    requestUrl.searchParams.set('layers', 'venue');
    requestUrl.searchParams.set('size', '50');
    requestUrl.searchParams.set('boundary.circle.radius', '100');
    try {
        const response = await axios.get(requestUrl.toString());
        const features = response.data?.features;
        if (!Array.isArray(features) || features.length === 0) return null;
        const f = features[0];
        const props = f?.properties ?? {};
        const name = props.label ?? props.name ?? '';
        if (!name) return null;
        let distKm = props.distance;
        if (typeof distKm !== 'number' && f?.geometry?.coordinates?.length >= 2) {
            const [lon2, lat2] = f.geometry.coordinates;
            distKm = distanceKm(lat, lon, lat2, lon2);
        }
        const distanceMiles = typeof distKm === 'number' ? distKm * 0.621371 : 0;
        return { name, distanceMiles };
    } catch (error: any) {
        console.error('Error fetching closest landmark:', error.message);
        return null;
    }
}
