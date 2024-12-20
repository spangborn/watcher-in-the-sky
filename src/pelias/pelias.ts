import axios from 'axios';
import { PELIAS_INSTANCE } from '../constants';

export async function reverse(lat: number, lon: number, options: Record<string, any> = {}): Promise<any> {
    const requestUrl = new URL("/v1/reverse", PELIAS_INSTANCE);
    
    Object.entries({ ...options, 'point.lat': lat, 'point.lon': lon , "layers": "coarse,venue"}).forEach(([key, value]) => {
        requestUrl.searchParams.append(key, String(value));
    });
    console.log(`Querying ${requestUrl}`);
    try {
        const response = await axios.get(requestUrl.toString());
        return response.data;
    } catch (error) {
        console.error('Error during reverse query:', error);
        throw error;
    }
}

export async function isNearbyAirport(lat: number, lon: number, options: Record<string, any> = {}): Promise<any> {
    const requestUrl = new URL("/v1/nearby", PELIAS_INSTANCE);
    
    Object.entries({ ...options, 'point.lat': lat, 'point.lon': lon , "categories": "transport:air:aerodrome", size: '10'}).forEach(([key, value]) => {
        requestUrl.searchParams.append(key, String(value));
    });
    console.log(`Querying ${requestUrl}`);
    try {
        const response = await axios.get(requestUrl.toString());

        if (response.data?.features.length > 0) {
            return true;
        }
        else 
            return false;

    } catch (error) {
        console.error('Error during nearby query:', error);
        throw error;
    }
}
