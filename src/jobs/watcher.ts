import { TAR1090_URL } from "../constants";
import { fetchAircraftData } from "../adsb/adsb";
import { captureScreenshot } from "../screenshot/screenshot";
import { postToBluesky } from "../bluesky/bluesky";


export async function detectAircraftFromList(): Promise<void> {
    const aircraftData = await fetchAircraftData();
    const watchlist = ["N352HP", "N353HP", "N354HP"];
    
    console.log("Checking for aircraft on watchlist...");
    for (const aircraft of aircraftData) {
        const { hex, flight, alt_baro, lat, lon } = aircraft;
        if (flight && watchlist.includes(flight.trim()) && alt_baro !== "ground") {
            // We found an aircraft on the watchlist
            console.log(`Found ${flight} on the watchlist`);

            const link = `${TAR1090_URL}?icao=${hex}&zoom=13&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
            const screenshotUrl = `${link}&hideButtons&hideSidebar&screenshot`;

            const screenshot_data = await captureScreenshot(hex, screenshotUrl);
            const message = `${'#' + flight} was detected in the air. \nView more: ${link}`;
            await postToBluesky(hex, message);
        }
    }
}
