import { fetchAircraftData } from '../adsb/adsb';
import { insertFlightData, getRecentCoordinates, clearAircraft } from '../database/database';
import { calculateCentroid, computeBearing } from '../helpers/coordinateUtils';
import { reverse } from '../pelias/pelias';
import { postToBluesky } from '../bluesky/bluesky';
import { TAR1090_URL, TOTAL_CHANGE, TIME_WINDOW } from '../constants';

export async function isCircling(coords: { lat: number; lon: number }[]): Promise<boolean> {
    if (coords.length < 2) return false;

    let totalChange = 0;

    for (let i = 1; i < coords.length; i++) {
        const { lat: lat1, lon: lon1 } = coords[i - 1];
        const { lat: lat2, lon: lon2 } = coords[i];

        const bearing1 = computeBearing(lat1, lon1, lat2, lon2);
        const bearing2 = i > 1 ? computeBearing(coords[i - 2].lat, coords[i - 2].lon, lat1, lon1) : 0;

        let diff = bearing2 - bearing1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        totalChange += diff;
    }

    return Math.abs(totalChange) >= TOTAL_CHANGE;
}
export async function detectCirclingAircraft(): Promise<void> {
    console.log('Starting aircraft circling detection...');
    const aircraftData = await fetchAircraftData();
    const now = Date.now();
    const cutoff = now - TIME_WINDOW;

    let found = 0;
    for (const ac of aircraftData) {
        const { hex, flight, alt_baro, lat, lon } = ac;
        if (hex && lat !== undefined && lon !== undefined && alt_baro !== "ground") {
            insertFlightData(hex, now, flight, alt_baro, lat, lon);
            found++;
            const recentCoords = await getRecentCoordinates(hex, cutoff);
            if (await isCircling(recentCoords)) {
                const centroid = calculateCentroid(recentCoords); // Use this to ask Pelias what is there


                const reverseResult = await reverse(lat,lon, {});
                console.log(reverseResult);
                

                const link = `${TAR1090_URL}?icao=${hex}&zoom=14`;
                const message = `Detected circling aircraft!\nHex: #${hex}\nFlight: #${flight || 'Unknown'}\nAltitude: ${alt_baro || 'N/A'} ft\nCentroid: Lat ${centroid.lat.toFixed(4)}, Lon ${centroid.lon.toFixed(4)}\nView more: ${link}`;
                await postToBluesky(message);

                await clearAircraft(hex);
            }
        }
    }
    console.log(`Aircraft detection completed. ${found} aircraft found. Excluded ${aircraftData.length - found} from check.`);
}
