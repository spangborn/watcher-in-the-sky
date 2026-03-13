/**
 * Detects aircraft flying zig-zag (imaging/survey) patterns and posts to Bluesky.
 */

import { fetchAircraftData } from '../adsb/adsb';
import { insertFlightData, getRecentCoordinates, clearAircraft, wasPostedRecently, recordPosted } from '../database/database';
import { calculateCentroid } from '../helpers/coordinateUtils';
import { findZigzagPeriod, isZigzagPattern, getZigzagSubSegment } from '../helpers/zigzag';
import { isNearbyAirport, reverse, getClosestLandmark } from '../pelias/pelias';
import { postToBluesky } from '../bluesky/bluesky';
import { TAR1090_URL, TIME_WINDOW } from '../constants';
import { captureScreenshot } from '../screenshot/screenshot';
import { buildImagingMessage, type ReverseGeoProperties } from '../generation/message';
import { getRecord as getAircraftInfo } from '../aircraftInfo/aircraftInfo';
import { incrementZigzag } from '../health/metrics';
import { formatLocalTime } from '../helpers/dateUtils';
import * as log from '../log';

export async function detectZigzagAircraft(nextCheckInMs?: number, aircraftData?: any[]): Promise<void> {
    log.info('Starting zig-zag (imaging) pattern detection...');
    const data = aircraftData ?? await fetchAircraftData();
    const useSharedData = aircraftData != null; // data already inserted by circling job
    const now = Date.now();
    const cutoff = now - TIME_WINDOW;

    let found = 0;
    for (const ac of data) {
        const rFromApi = ac.r ?? ac.registration ?? null;
        const { hex, flight, alt_baro, lat, lon } = ac;
        if (!hex || lat === undefined || lon === undefined || alt_baro === 'ground') continue;

        if (!useSharedData) {
            insertFlightData(hex, now, rFromApi, alt_baro, lat, lon);
        }
        found++;

        const recentCoords = await getRecentCoordinates(hex, cutoff);
        const zigzagPeriod = findZigzagPeriod(
            recentCoords.map(c => ({ lat: c.lat, lon: c.lon, timestamp: c.timestamp })),
            TIME_WINDOW
        );

        if (zigzagPeriod) {
            const regFromCoords = recentCoords[0]?.r?.trim();
            const regFromDb = regFromCoords ? null : (await getAircraftInfo(hex))?.registration ?? null;
            const displayLabel = regFromCoords || regFromDb || hex || '?';
            const linkPart = hex ? ` ${log.link(`${TAR1090_URL}?icao=${hex}`)}` : '';
            const timestampDiff = zigzagPeriod.segment[zigzagPeriod.segment.length - 1].timestamp - zigzagPeriod.segment[0].timestamp;
            const minutes = Math.floor(timestampDiff / 60000);
            const seconds = ((timestampDiff % 60000) / 1000).toFixed(0);
            log.dim(`Flight: ${displayLabel} Zig-zags: ${zigzagPeriod.reversals} Window Length: ${minutes} minutes and ${seconds} seconds${linkPart}`);
        }

        if (!zigzagPeriod || !isZigzagPattern(zigzagPeriod.segment)) continue;

        incrementZigzag();
        const { segment } = zigzagPeriod;
        const zigzagOnly = getZigzagSubSegment(segment);
        const centroid = calculateCentroid(zigzagOnly);

        try {
            const isNearAirport = await isNearbyAirport(centroid.lat, centroid.lon, {});
            if (isNearAirport) {
                await clearAircraft(hex);
                log.warn(`Aircraft ${hex} ${rFromApi} was on imaging pattern near airport, not posting.`);
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

        const dateStr = new Date().toISOString().slice(0, 10);
        const link = `${TAR1090_URL}?icao=${hex}&showTrace=${dateStr}`;
        // Screenshot URL is separate: center and zoom for framing.
        const screenshotUrl = `${TAR1090_URL}?icao=${hex}&showTrace=${dateStr}&zoom=13&lat=${centroid.lat.toFixed(4)}&lon=${centroid.lon.toFixed(4)}&hideButtons&hideSidebar&screenshot&nowebgl`;

        log.success(`Found imaging pattern aircraft ${hex} (${zigzagPeriod.reversals} reversals): ${log.link(link)}`);
        const screenshot_data = await captureScreenshot(hex, screenshotUrl);

        const rFromHistory = recentCoords.length > 0
            ? [...recentCoords].reverse().find((c) => c.r != null && c.r.trim() !== '')?.r ?? null
            : null;
        let registration = rFromApi ?? rFromHistory ?? null;
        let aircraftType = ac.type_desc ?? ac.desc ?? ac.t ?? null;
        if (hex) {
            const mictronics = await getAircraftInfo(hex);
            if (mictronics) {
                registration = registration ?? mictronics.registration ?? null;
                const desc = mictronics.description ?? null;
                const typ = mictronics.type ?? null;
                aircraftType = aircraftType ?? desc ?? typ ?? ac.t ?? null;
                if (desc && typ && aircraftType === desc) aircraftType = `${desc} (${typ})`;
            }
        }

        if (await wasPostedRecently(hex)) {
            log.warn(`Aircraft ${hex} was posted in the last 30 minutes, skipping.`);
            await clearAircraft(hex);
            continue;
        }

        const message = buildImagingMessage(
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
            log.success(`Posting to Bsky (imaging): ${message}`);
            await clearAircraft(hex);
        }
    }

    const msg = `Zig-zag detection completed. ${found} aircraft checked.`;
    const nextPart = nextCheckInMs != null
        ? ` Next check in ${nextCheckInMs / 1000}s at ${formatLocalTime(new Date(Date.now() + nextCheckInMs)).slice(11, 19)}.`
        : '';
    log.success(msg + nextPart);
}
