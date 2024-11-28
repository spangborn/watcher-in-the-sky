const dotenv = require('dotenv');
const axios = require('axios');
const sqlite3 = require('sqlite3');
const { CronJob } = require('cron');
const { BskyAgent, RichText } = require('@atproto/api');

// Load environment variables
dotenv.config();

// Environment variables with defaults
const TOTAL_CHANGE = parseFloat(process.env.TOTAL_CHANGE || '180');
const TIME_WINDOW = parseInt(process.env.TIME_WINDOW || '300000'); // Default 5 minutes
const PRUNE_TIME = parseInt(process.env.PRUNE_TIME || '1200000'); // Default 20 minutes in milliseconds
const TAR1090_DATA_URL = process.env.TAR1090_DATA_URL || '';
const TAR1090_URL = process.env.TAR1090_URL || '';
const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME || '';
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD || '';

// Initialize SQLite database
const db = new sqlite3.Database('./aircraft.db');

// Create table if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS aircraft_data (
            hex TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            flight TEXT,
            alt_baro REAL,
            lat REAL,
            lon REAL,
            PRIMARY KEY (hex, timestamp)
        );
    `);
});


// BlueSky login
const agent = new BskyAgent({
    service: 'https://bsky.social'
});
agent.login({
    identifier: BLUESKY_USERNAME,
    password: BLUESKY_PASSWORD
});

// Helper function to fetch aircraft data
async function fetchAircraftData(): Promise<any[]> {
    try {
        console.log(`Getting data from: ${TAR1090_DATA_URL}`);
        const response = await axios.get(TAR1090_DATA_URL);
        return response.data.ac || [];
    } catch (error: any) {
        console.error('Error fetching aircraft data:', error.message);
        return [];
    }
}

// Helper: Convert degrees to radians
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

// Helper: Convert radians to degrees
function toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

// Helper: Calculate bearing between two geographic points
function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = toRadians(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
    const x =
        Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
        Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

    let bearing = toDegrees(Math.atan2(y, x));
    return (bearing + 360) % 360; // Normalize to 0–360
}

// Helper: Calculate the centroid (center) of a set of coordinates
function calculateCentroid(coords: { lat: number; lon: number }[]): { lat: number; lon: number } {
    let totalLat = 0;
    let totalLon = 0;

    coords.forEach(coord => {
        totalLat += coord.lat;
        totalLon += coord.lon;
    });

    const centroidLat = totalLat / coords.length;
    const centroidLon = totalLon / coords.length;

    return { lat: centroidLat, lon: centroidLon };
}

// Main logic to detect if an aircraft is circling
function isCircling(coords: { lat: number; lon: number }[]): boolean {
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

// Insert flight data into the database to calculate "circle-ness"
function insertFlightData(
    hex: string,
    timestamp: number,
    flight: string | null,
    alt_baro: number | null,
    lat: number | null,
    lon: number | null
): void {
    db.run(
        `INSERT OR IGNORE INTO aircraft_data (hex, timestamp, flight, alt_baro, lat, lon) VALUES (?, ?, ?, ?, ?, ?)`,
        [hex, timestamp, flight, alt_baro, lat, lon],
        (err: Error | null) => { // Explicitly type the `err` parameter
            if (err) console.error('Database insert error:', err.message);
        }
    );
}


// Retrieve recent coordinates for an aircraft
function getRecentCoordinates(hex: string, cutoff: number): Promise<{ lat: number; lon: number }[]> {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT lat, lon FROM aircraft_data WHERE hex = ? AND timestamp >= ? ORDER BY timestamp ASC`,
            [hex, cutoff],
            (err: Error | null, rows: { lat: number; lon: number }[]) => { // Explicitly type `err`
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({ lat: row.lat, lon: row.lon })));
                }
            }
        );
    });
}



// Post to Bluesky
async function postToBluesky(message: string): Promise<void> {
    //TODO: use puppeteer to get a screenshot
    //TODO: get photo from airportdata if available
    //TODO: call pelias API to get reverse geocode results


    /* how to embed images

        const image = 'data:image/png;base64,...'
        const { data } = await agent.uploadBlob(convertDataURIToUint8Array(image), {
        encoding,
        })

    //  Add this to the post object
    
      embed: {
    $type: 'app.bsky.embed.images',
    images: [
      // can be an array up to 4 values
      {
        alt: 'My cat mittens', // the alt text
        image: data.blob,
        aspectRatio: {
          // a hint to clients
          width: 1000,
          height: 500
        }
    }],
    */


   const rt = new RichText({
        text: message,
    });

    await rt.detectFacets(agent) // automatically detects mentions and links

    const postRecord = {
        $type: 'app.bsky.feed.post',
        langs: ["en-US"],
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
    }
    console.log('Posting to Bluesky:', message);
    agent.post(postRecord);
}

// Prune old records from the database
function pruneOldRecords(): void {
    const cutoff = Date.now() - PRUNE_TIME;
    db.run(
        `DELETE FROM aircraft_data WHERE timestamp < ?`,
        [cutoff],
        (err: Error | null) => { // Explicitly type the `err` parameter
            if (err) {
                console.error('Error pruning old records:', err.message);
            } else {
                console.log('Old records pruned successfully.');
            }
        }
    );
}


// Main job to detect circling aircraft
async function detectCirclingAircraft(): Promise<void> {
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
            if (isCircling(recentCoords)) {
                const centroid = calculateCentroid(recentCoords);
                
                const link = `${TAR1090_URL}?icao=${hex}`;
                const message = `Detected circling aircraft!\nHex: ${hex}\nFlight: ${flight || 'Unknown'}\nAltitude: ${alt_baro || 'N/A'} ft\nCentroid: Lat ${centroid.lat.toFixed(4)}, Lon ${centroid.lon.toFixed(4)}\nView more: ${link}`;
                await postToBluesky(message);
            }
        }
    }
    console.log(`Aircraft detection completed. ${found} aircraft found. Excluded ${aircraftData.length - found} from check.`);
}

// Schedule the circling detection job
const detectionJob = new CronJob('*/30 * * * * *', detectCirclingAircraft);
detectionJob.start();

// Schedule the pruning job
const pruningJob = new CronJob('* * * * *', pruneOldRecords);
pruningJob.start();

// Run the detection immediately on startup
(async () => {
    console.log('Running initial detection...');
    await detectCirclingAircraft();
})();

export { };
