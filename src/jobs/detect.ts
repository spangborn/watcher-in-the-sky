import { fetchAircraftData } from '../adsb/adsb';
import { insertFlightData, getRecentCoordinates, clearAircraft } from '../database/database';
import { calculateCentroid, computeBearing } from '../helpers/coordinateUtils';
import { reverse } from '../pelias/pelias';
import { postToBluesky } from '../bluesky/bluesky';
import { TAR1090_URL, TOTAL_CHANGE, TIME_WINDOW } from '../constants';
import { captureScreenshot } from '../screenshot/screenshot';

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
            
            // Save the flight data in the database for a later check
            insertFlightData(hex, now, flight, alt_baro, lat, lon);

            found++;

            // Retrieve the data from the database
            const recentCoords = await getRecentCoordinates(hex, cutoff);

            // If the data looks like a circling flight
            if (await isCircling(recentCoords)) {
                const centroid = calculateCentroid(recentCoords); // Use this to ask Pelias what is there

                // TODO: Move this out into a method that takes the data and generates the message based on what information it has available
                let description;
                try {
                    const reverseResult = await reverse(lat,lon, {}); // The call to Pelias
                    if (reverseResult && reverseResult.features.length > 0) {
                        description = `${reverseResult.features[0].properties.label}`
                    }
                }
                catch (err) {
                    console.log("Error atempting to reverse geocode: ", err);
                }
                
                const link = `${TAR1090_URL}?icao=${hex}&zoom=13&lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}`;
                const screenshotUrl = `${link}&hideButtons&hideSidebar`;

                const screenshot_data = await captureScreenshot(hex, screenshotUrl);
                const message = `Detected circling aircraft!\nHex: #${hex}\nFlight: #${flight || 'Unknown'}\nAltitude: ${alt_baro || 'N/A'} ft\nNear: ${description || 'Unknown'}\nView more: ${link}`;
                await postToBluesky(ac, message, screenshot_data);

                await clearAircraft(hex);
            }
        }
    }
    console.log(`Aircraft detection completed. ${found} aircraft found. Excluded ${aircraftData.length - found} from check.`);
}
