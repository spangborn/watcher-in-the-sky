import { fetchAircraftData } from '../adsb/adsb';
import { insertFlightData, getRecentCoordinates, clearAircraft } from '../database/database';
import { calculateCentroid, computeBearing } from '../helpers/coordinateUtils';
import { isNearbyAirport, reverse } from '../pelias/pelias';
import { postToBluesky } from '../bluesky/bluesky';
import { TAR1090_URL, TOTAL_CHANGE, TIME_WINDOW } from '../constants';
import { captureScreenshot } from '../screenshot/screenshot';


function findCurviestTimePeriod(
        coords: { lat: number; lon: number; timestamp: number; r: string }[],
        timeWindow: number
    ): { segment: { lat: number; lon: number; timestamp: number ; }[]; curviness: number } | null {
    if (coords.length < 2) return null;

    let maxCurviness = 0;
    let curviestSegment: { lat: number; lon: number; timestamp: number }[] | null = null;

    for (let i = 0; i < coords.length; i++) {
        // Define the window: start at i, end where timestamp difference is <= timeWindow
        const window = coords.slice(
            i,
            coords.findIndex(
                (c, index) => index > i && c.timestamp - coords[i].timestamp > timeWindow
            )
        );

        // Calculate curviness of the window
        const curviness = calculateCurviness(window);

        if (curviness > maxCurviness) {
            maxCurviness = curviness;
            curviestSegment = window;
        }
    }

    if (curviestSegment && maxCurviness > TOTAL_CHANGE / 2) {
        const timestampDifference = curviestSegment[curviestSegment.length - 1].timestamp - curviestSegment[0].timestamp;
        const minutes = Math.floor(timestampDifference / 60000);
        const seconds = ((timestampDifference % 60000) / 1000).toFixed(0);
    
        //console.log(`Flight: ${coords[0].r} Curviness: ${maxCurviness.toFixed(0)} Window Length: ${minutes} minutes and ${seconds} seconds`);
    }
    return curviestSegment ? { segment: curviestSegment, curviness: maxCurviness } : null;
}

function calculateCurviness(segment: { lat: number; lon: number }[]): number {
    let totalChange = 0;

    for (let i = 1; i < segment.length; i++) {
        const { lat: lat1, lon: lon1 } = segment[i - 1];
        const { lat: lat2, lon: lon2 } = segment[i];

        const bearing1 = computeBearing(lat1, lon1, lat2, lon2);
        const bearing2 =
            i > 1 ? computeBearing(segment[i - 2].lat, segment[i - 2].lon, lat1, lon1) : 0;

        let diff = bearing2 - bearing1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        totalChange += diff;
    }

    return Math.abs(totalChange);
}

/**
 * Determines whether a flight is circling based on its curviest time period.
 * @param segment Segment of the flight path with timestamps.
 * @returns Whether the flight is circling based on its curviness.
 */
async function isCircling(segment: { lat: number; lon: number }[]): Promise<boolean> {
    const curviness = calculateCurviness(segment);
    return curviness >= TOTAL_CHANGE;
}


export async function detectCirclingAircraft(): Promise<void> {
    console.log('Starting aircraft circling detection...');
    const aircraftData = await fetchAircraftData();
    const now = Date.now();
    const cutoff = now - TIME_WINDOW;

    let found = 0;
    for (const ac of aircraftData) {
        const { hex, flight, r, alt_baro, lat, lon } = ac;
        if (hex && lat !== undefined && lon !== undefined && alt_baro !== 'ground') {
            insertFlightData(hex, now, r, alt_baro, lat, lon);
            found++;

            // Retrieve the recent coordinates from the database
            const recentCoords = await getRecentCoordinates(hex, cutoff);

            // Find the curviest 25-minute time period
            const curvyPeriod = findCurviestTimePeriod(recentCoords, TIME_WINDOW); 

            if (curvyPeriod && (await isCircling(curvyPeriod.segment))) {
                const { segment } = curvyPeriod;
                const centroid = calculateCentroid(segment);

                try {
                    const isNearAirport = await isNearbyAirport(centroid.lat, centroid.lon, {});

                    if (isNearAirport) {
                        await clearAircraft(hex);
                        console.log(`Aircraft ${hex} ${r} was circling near airport, not posting.`);
                        return;
                    }
                } catch (err) {
                    console.log('Pelias nearby query failed: ', err);
                }

                let description;
                try {
                    const reverseResult = await reverse(centroid.lat, centroid.lon, {});
                    if (reverseResult && reverseResult.features.length > 0) {
                        description = `${reverseResult.features[0].properties.label}`;
                    }
                } catch (err) {
                    console.log('Error attempting to reverse geocode: ', err);
                }

                const urlParams = {
                    icao: `${hex}`,
                    zoom: `13`,
                    lat: `${centroid.lat.toFixed(4)}`,
                    lon: `${centroid.lon.toFixed(4)}`,
                };

                const built = new URLSearchParams(urlParams);
                const link = `${TAR1090_URL}?${built}`;
                const screenshotUrl = `${link}&hideButtons&hideSidebar&screenshot`;

                const screenshot_data = await captureScreenshot(hex, screenshotUrl);
                const message = `Detected circling aircraft!\nHex: #${hex}\nRegistration: #${r || 'Unknown'
                    }\nAltitude: ${alt_baro || 'N/A'} ft\nNear: ${description || 'Unknown'
                    }\nView more: ${link}`;
                const success = await postToBluesky(ac, message, screenshot_data);

                if (success) {
                    console.log(`Posting to Bsky: ${message}`);
                    await clearAircraft(hex);
                }
            }
        }
    }
    console.log(
        `Aircraft detection completed. ${found} aircraft found. Excluded ${aircraftData.length - found
        } from check.`
    );
}