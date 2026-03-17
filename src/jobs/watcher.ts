import { TAR1090_URL } from "../constants";
import { fetchAircraftData, RateLimitError, AircraftApi } from "../adsb/adsb";
import { captureScreenshot } from "../screenshot/screenshot";
import { postToBluesky } from "../bluesky/bluesky";
import * as log from "../log";

export async function detectAircraftFromList(): Promise<void> {
    let aircraftData: AircraftApi[];
    try {
        aircraftData = await fetchAircraftData();
    } catch (err) {
        if (err instanceof RateLimitError) {
            log.warn('Watchlist check skipped (rate limited)');
            return;
        }
        throw err;
    }
    const watchlist = ["N352HP", "N353HP", "N354HP"];
    
    log.info("Checking for aircraft on watchlist...");
    for (const aircraft of aircraftData) {
        const { hex, flight, alt_baro, lat, lon } = aircraft;
        if (flight && lat !== undefined && lon !== undefined && watchlist.includes(flight.trim()) && alt_baro !== "ground") {
            // We found an aircraft on the watchlist
            log.success(`Found ${flight.trim()} on the watchlist`);

            const link = `${TAR1090_URL}?icao=${hex}&zoom=13&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
            const screenshotUrl = `${link}&hideButtons&hideSidebar&screenshot`;

            const screenshot_data = await captureScreenshot(hex!, screenshotUrl);
            const message = `${'#' + flight.trim()} was detected in the air.\nView more: ${link}`;
            await postToBluesky(
                { flight },
                message,
                [{
                    data: screenshot_data,
                    mimeType: 'image/jpeg',
                    alt: `Screenshot of the flight path of the flight ${flight.trim()}`,
                    aspectRatio: { width: 1200, height: 800 },
                }]
            );
        }
    }
}
