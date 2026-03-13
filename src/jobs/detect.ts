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


/** Altitude (ft) below which we consider aircraft on ground; excluded from curviness. */
const GROUND_ALT_FT = 0;

export interface CurvyPeriodLogInfo {
    minutes: number;
    seconds: string;
}

/** Filter to airborne positions only (alt_baro > 0). */
function filterAirborne<T extends { alt_baro?: number | null }>(coords: T[]): T[] {
    return coords.filter((c) => (c.alt_baro ?? 0) > GROUND_ALT_FT);
}

/**
 * Build the single 25-minute segment from recent coords (no sliding window).
 * Excludes ground points.
 */
export function getCirclingSegment(
    coords: { lat: number; lon: number; timestamp: number; r: string | null; alt_baro: number | null }[],
    timeWindow: number
): { segment: { lat: number; lon: number; timestamp: number }[]; curviness: number; logInfo?: CurvyPeriodLogInfo } | null {
    const airborne = filterAirborne(coords);
    if (airborne.length < 2) return null;

    const segment = airborne.map((c) => ({ lat: c.lat, lon: c.lon, timestamp: c.timestamp }));
    const curviness = calculateCurviness(segment);

    const first = segment[0];
    const last = segment[segment.length - 1];
    const durationMs = last.timestamp - first.timestamp;
    const clampedMs = Math.min(durationMs, timeWindow);
    const logInfo: CurvyPeriodLogInfo = {
        minutes: Math.floor(clampedMs / 60000),
        seconds: ((clampedMs % 60000) / 1000).toFixed(0),
    };
    return { segment, curviness, logInfo };
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

/** Cumulative turn (degrees) at which we consider the aircraft "in the circle" for centroid. */
const CIRCLE_START_TURN_DEG = 720;

/**
 * Find the "circle start" index: first index where cumulative signed bearing-delta sum reaches ±720°.
 * Returns the segment from that index to end for centroid.
 */
export function getCircleSegmentForCentroid(
    segment: { lat: number; lon: number; timestamp: number }[]
): { lat: number; lon: number; timestamp: number }[] {
    if (segment.length < 2) return segment;

    let cumulative = 0;
    for (let i = 1; i < segment.length; i++) {
        const { lat: lat1, lon: lon1 } = segment[i - 1];
        const { lat: lat2, lon: lon2 } = segment[i];
        const bearing1 = computeBearing(lat1, lon1, lat2, lon2);
        const bearing2 =
            i > 1 ? computeBearing(segment[i - 2].lat, segment[i - 2].lon, lat1, lon1) : 0;
        let diff = bearing2 - bearing1;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        cumulative += diff;
        if (Math.abs(cumulative) >= CIRCLE_START_TURN_DEG) {
            return segment.slice(i);
        }
    }
    return segment;
}

/**
 * Determines whether a flight is circling based on its curviest time period.
 * @param segment Segment of the flight path with timestamps.
 * @returns Whether the flight is circling based on its curviness.
 */
function isCircling(segment: { lat: number; lon: number }[]): boolean {
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

            // Single 25-minute window, airborne only
            const curvyPeriod = getCirclingSegment(recentCoords, TIME_WINDOW);

            if (curvyPeriod?.logInfo && curvyPeriod.curviness > TOTAL_CHANGE / 4) {
                const regFromCoords = recentCoords[0]?.r?.trim();
                const regFromDb = regFromCoords ? null : (await getAircraftInfo(hex))?.registration ?? null;
                const displayLabel = regFromCoords || regFromDb || hex || '?';
                const curvinessStr = log.curvinessColor(curvyPeriod.curviness, TOTAL_CHANGE);
                const linkPart = hex ? ` ${log.link(`${TAR1090_URL}?icao=${hex}`)}` : '';
                log.dim(`Flight: ${displayLabel} Curviness: ${curvinessStr} Window Length: ${curvyPeriod.logInfo.minutes} minutes and ${curvyPeriod.logInfo.seconds} seconds${linkPart}`);
            }

            if (curvyPeriod && isCircling(curvyPeriod.segment)) {
                incrementCircling();
                const { segment } = curvyPeriod;
                const centroidSegment = getCircleSegmentForCentroid(segment);
                const centroid = calculateCentroid(centroidSegment);

                try {
                    const isNearAirport = await isNearbyAirport(centroid.lat, centroid.lon, {});
                    if (isNearAirport) {
                        await clearAircraft(hex);
                        log.warn(`Aircraft ${hex} ${rFromApi} was circling near airport, not posting.`);
                        continue;
                    }
                } catch (err) {
                    log.warn(`Pelias airport check failed (skipping post to be safe): ${err}`);
                    await clearAircraft(hex);
                    continue;
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
                const link = `${TAR1090_URL}?icao=${hex}&showTrace=${dateStr}`;
                // Screenshot URL is separate: center and zoom for framing.
                const screenshotUrl = `${TAR1090_URL}?icao=${hex}&showTrace=${dateStr}&zoom=13&lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&hideButtons&hideSidebar&screenshot&nowebgl`;

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
                        const desc = mictronics.description ?? null;
                        const typ = mictronics.type ?? null;
                        aircraftType = aircraftType ?? (desc && typ ? `${desc} (${typ})` : desc ?? typ ?? null);
                    }
                }
                if (await wasPostedRecently(hex)) {
                    log.warn(`Aircraft ${hex} was posted in the last 30 minutes, skipping.`);
                    await clearAircraft(hex);
                    continue;
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
                    try {
                        await recordPosted(hex);
                    } catch (err) {
                        log.warn(`Failed to record post time for ${hex}: ${err}`);
                    }
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