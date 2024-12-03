import { fetchAircraftData } from "../adsb/adsb";


export async function detectAircraftFromList(): Promise<void> {
    const aircraftData = await fetchAircraftData();
    const watchlist = ["N352HP", "N354HP"];
    

    for (const aircraft of aircraftData) {
        const { hex, flight, alt_baro, lat, lon } = aircraft;
        if (hex && watchlist.includes(hex) ) {
            // We found an aircraft on the watchlist
            console.log(`Found ${flight} on the watchlist`);
        }
    }
}