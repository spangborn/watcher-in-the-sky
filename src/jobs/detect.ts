import { fetchAircraftData } from '../adsb/adsb';
import { insertFlightData, getRecentCoordinates, clearAircraft, wasPostedRecently, recordPosted } from '../database/database';
import { calculateCentroid, computeBearing } from '../helpers/coordinateUtils';
import { isNearbyAirport, reverse, getClosestLandmark } from '../pelias/pelias';
import { postToBluesky } from '../bluesky/bluesky';
import { TAR1090_URL, TOTAL_CHANGE, TIME_WINDOW } from '../constants';
import { captureScreenshot } from '../screenshot/screenshot';
import { buildCirclingMessage, type ReverseGeoProperties } from '../generation/message';
import { getRecord as getAircraftInfo } from '../aircraftInfo/aircraftInfo';
import { incrementCircling } from '../health/metrics';
import { formatLocalTime } from '../helpers/dateUtils';
import * as log from '../log';


export interface CurvyPeriodLogInfo {
    minutes: number;
    seconds: string;
}

export function findCurviestTimePeriod(
        coords: { lat: number; lon: number; timestamp: number; r: string }[],
        timeWindow: number,
        hex?: string
    ): { segment: { lat: number; lon: number; timestamp: number ; }[]; curviness: number; logInfo?: CurvyPeriodLogInfo } | null {
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

    let logInfo: CurvyPeriodLogInfo | undefined;
    if (curviestSegment && maxCurviness > TOTAL_CHANGE / 4) {
        const timestampDifference = curviestSegment[curviestSegment.length - 1].timestamp - curviestSegment[0].timestamp;
        logInfo = {
            minutes: Math.floor(timestampDifference / 60000),
            seconds: ((timestampDifference % 60000) / 1000).toFixed(0),
        };
    }
    return curviestSegment
        ? { segment: curviestSegment, curviness: maxCurviness, logInfo }
        : null;
}

export function calculateCurviness(segment: { lat: number; lon: number }[]): number {
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

/** Sub-window (ms) used to find the curviest part within the curviest period for centroid. */
const CURVY_CENTROID_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Within a segment, find the sub-segment with highest curviness using a sliding time window.
 * Use this for centroid so the point is in the tight circling core, not diluted by entry/exit.
 */
export function getCurviestSubSegment(
    segment: { lat: number; lon: number; timestamp: number }[],
    timeWindowMs: number = CURVY_CENTROID_WINDOW_MS
): { lat: number; lon: number; timestamp: number }[] {
    if (segment.length < 2) return segment;

    let maxCurviness = 0;
    let curviest: typeof segment = segment;

    for (let i = 0; i < segment.length; i++) {
        const endIdx = segment.findIndex(
            (c, idx) => idx > i && c.timestamp - segment[i].timestamp > timeWindowMs
        );
        const window = endIdx === -1 ? segment.slice(i) : segment.slice(i, endIdx);
        if (window.length < 2) continue;

        const curviness = calculateCurviness(window);
        if (curviness > maxCurviness) {
            maxCurviness = curviness;
            curviest = window;
        }
    }

    return curviest;
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


export async function detectCirclingAircraft(nextCheckInMs?: number, aircraftData?: any[]): Promise<void> {
    log.info('Starting aircraft circling detection...');
    const data = aircraftData ?? await fetchAircraftData();
    const now = Date.now();
    const cutoff = now - TIME_WINDOW;

    let found = 0;
    for (const ac of data) {
        // Registration: API may use "r" (readsb) or "registration"; we store whatever we have
        const rFromApi = ac.r ?? ac.registration ?? null;
        const { hex, flight, alt_baro, lat, lon } = ac;
        if (hex && lat !== undefined && lon !== undefined && alt_baro !== 'ground') {
            insertFlightData(hex, now, rFromApi, alt_baro, lat, lon);
            found++;

            // Retrieve the recent coordinates from the database
            const recentCoords = await getRecentCoordinates(hex, cutoff);

            // Find the curviest 25-minute time period
            const curvyPeriod = findCurviestTimePeriod(recentCoords, TIME_WINDOW, hex);

            if (curvyPeriod?.logInfo) {
                const regFromCoords = recentCoords[0]?.r?.trim();
                const regFromDb = regFromCoords ? null : (await getAircraftInfo(hex))?.registration ?? null;
                const displayLabel = regFromCoords || regFromDb || hex || '?';
                const curvinessStr = log.curvinessColor(curvyPeriod.curviness, TOTAL_CHANGE);
                const linkPart = hex ? ` ${log.link(`${TAR1090_URL}?icao=${hex}`)}` : '';
                log.dim(`Flight: ${displayLabel} Curviness: ${curvinessStr} Window Length: ${curvyPeriod.logInfo.minutes} minutes and ${curvyPeriod.logInfo.seconds} seconds${linkPart}`);
            }

            if (curvyPeriod && (await isCircling(curvyPeriod.segment))) {
                incrementCircling();
                const { segment } = curvyPeriod;
                const curviestSub = getCurviestSubSegment(segment);
                const centroid = calculateCentroid(curviestSub);

                try {
                    const isNearAirport = await isNearbyAirport(centroid.lat, centroid.lon, {});
                    if (isNearAirport) {
                        await clearAircraft(hex);
                        log.warn(`Aircraft ${hex} ${rFromApi} was circling near airport, not posting.`);
                        return;
                    }
                } catch (err) {
                    log.warn(`Pelias airport check failed (skipping post to be safe): ${err}`);
                    await clearAircraft(hex);
                    return;
                }

                let reverseGeoProps: ReverseGeoProperties | null = null;
                try {
                    const reverseResult = await reverse(centroid.lat, centroid.lon, {});
                    if (reverseResult?.features?.length > 0) {
                        reverseGeoProps = reverseResult.features[0].properties ?? null;
                    }
                } catch (err) {
                    log.err(`Error attempting to reverse geocode: ${err}`);
                }

                let landmark: { name: string; distanceMiles: number } | null = null;
                try {
                    landmark = await getClosestLandmark(centroid.lat, centroid.lon);
                } catch (err) {
                    log.warn(`Error fetching closest landmark: ${err}`);
                }

                const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
                const urlParams = new URLSearchParams({
                    icao: hex,
                    zoom: '13',
                    lat: centroid.lat.toFixed(4),
                    lon: centroid.lon.toFixed(4),
                    showTrace: dateStr,
                });
                const link = `${TAR1090_URL}?${urlParams}`;
                const screenshotUrl = `${link}&hideButtons&hideSidebar&screenshot&nowebgl`;

                log.success(`Found circling aircraft ${hex}: ${log.link(link)}`);
                const screenshot_data = await captureScreenshot(hex, screenshotUrl);
                // Use registration from API, or last known from our position history, or Mictronics DB
                const rFromHistory = recentCoords.length > 0
                    ? [...recentCoords].reverse().find((c) => c.r != null && c.r.trim() !== '')?.r ?? null
                    : null;
                let registration = rFromApi ?? rFromHistory ?? null;
                // Aircraft type: use "t" (from API); "type" is message type (adsb_icao, mlat, etc.)
                let aircraftType = ac.t ?? null;
                // Fill in from Mictronics aircraft DB when missing
                if ((registration == null || aircraftType == null) && hex) {
                    const mictronics = await getAircraftInfo(hex);
                    if (mictronics) {
                        registration = registration ?? mictronics.registration ?? null;
                        aircraftType = aircraftType ?? mictronics.type ?? null;
                    }
                }
                if (await wasPostedRecently(hex)) {
                    log.warn(`Aircraft ${hex} was posted in the last 30 minutes, skipping.`);
                    await clearAircraft(hex);
                    return;
                }

                const message = buildCirclingMessage(
                    {
                        hex,
                        r: registration,
                        flight,
                        type: aircraftType,
                        isMilitary: typeof ac.dbFlags === 'number' && (ac.dbFlags & 1) === 1,
                        alt_baro,
                        gs: ac.gs,
                        squawk: ac.squawk,
                    },
                    reverseGeoProps,
                    link,
                    { landmark }
                );
                const success = await postToBluesky(ac, message, screenshot_data);

                if (success) {
                    await recordPosted(hex);
                    log.success(`Posting to Bsky: ${message}`);
                    await clearAircraft(hex);
                }
            }
        }
    }
    const msg = `Aircraft detection completed. ${found} aircraft found. Excluded ${data.length - found} from check.`;
    const nextPart = nextCheckInMs != null
        ? ` Next check in ${nextCheckInMs / 1000}s at ${formatLocalTime(new Date(Date.now() + nextCheckInMs)).slice(11, 19)}.`
        : '';
    log.success(msg + nextPart);
}