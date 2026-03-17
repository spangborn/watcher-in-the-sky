import dotenv from 'dotenv';

dotenv.config();

type AircraftPhotoMode = 'off' | 'airport-data' | 'jetphotos' | 'both';

function parseAircraftPhotoMode(raw: string | undefined): AircraftPhotoMode {
    if (!raw || raw === 'true' || raw === '1') return 'airport-data';
    const v = raw.toLowerCase();
    if (v === 'false' || v === '0' || v === 'off') return 'off';
    if (v === 'jetphotos') return 'jetphotos';
    if (v === 'both') return 'both';
    if (v === 'airport' || v === 'airport-data') return 'airport-data';
    return 'airport-data';
}

export const TOTAL_CHANGE = parseFloat(process.env.TOTAL_CHANGE || '1440');
/** Max window (ms) for zigzag/imaging and for circling cutoff. Default 40 min. */
export const TIME_WINDOW = parseInt(process.env.TIME_WINDOW || '2400000');
/** Min window (ms) for zigzag sliding variable window. Default 10 min. */
export const MIN_ZIGZAG_WINDOW_MS = parseInt(process.env.MIN_ZIGZAG_WINDOW_MS || '600000');
export const PRUNE_TIME = parseInt(process.env.PRUNE_TIME || '1500000'); // Default 25 minutes
export const TAR1090_DATA_URL = process.env.TAR1090_DATA_URL || '';
export const TAR1090_URL = process.env.TAR1090_URL || 'https://globe.airplanes.live/';
// Default Pelias instance base URL for tests and local runs when not configured.
// In production/Docker, set PELIAS_INSTANCE explicitly; this just avoids Invalid URL errors.
export const PELIAS_INSTANCE = process.env.PELIAS_INSTANCE || 'http://pelias.invalid';
export const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME || '';
export const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD || '';
/** When true, debug mode: do not post, only print message to terminal. Default false. */
export const BLUESKY_DEBUG = process.env.BLUESKY_DEBUG === 'true' || process.env.BLUESKY_DEBUG === '1';
/** When true, dry run: don't post, print message to terminal. */
export const BLUESKY_DRY_RUN = process.env.BLUESKY_DRY_RUN === 'true' || process.env.BLUESKY_DRY_RUN === '1';
export const USER_AGENT = process.env.USER_AGENT || 'Watcher in the Sky';
/** Data directory for both DBs. Default ./data locally; Docker sets /home/node/app/data. Trailing slash stripped. */
const DATA_DIR = (process.env.DATA_DIR || './data').replace(/\/$/, '');

/** String mode for aircraft photo provider, controlled via AIRCRAFT_PHOTO_ENABLED for back-compat.
 *  Allowed values:
 *  - undefined / 'true' / '1' / 'airport' / 'airport-data' → 'airport-data'
 *  - 'false' / '0' / 'off' → 'off'
 *  - 'jetphotos' → 'jetphotos'
 *  - 'both' → 'both'
 */
export const AIRCRAFT_PHOTO_MODE: AircraftPhotoMode = parseAircraftPhotoMode(
    process.env.AIRCRAFT_PHOTO_ENABLED,
);

/** Whether any aircraft photo fetching is enabled at all. */
export const AIRCRAFT_PHOTO_ENABLED = AIRCRAFT_PHOTO_MODE !== 'off';

/** Convenience flags for specific providers. */
export const AIRCRAFT_PHOTO_USE_AIRPORT_DATA =
    AIRCRAFT_PHOTO_MODE === 'airport-data' || AIRCRAFT_PHOTO_MODE === 'both';
export const AIRCRAFT_PHOTO_USE_JETPHOTOS =
    AIRCRAFT_PHOTO_MODE === 'jetphotos' || AIRCRAFT_PHOTO_MODE === 'both';

/** On-disk cache dir for aircraft photos/misses. */
export const AIRCRAFT_PHOTO_CACHE_DIR = process.env.AIRCRAFT_PHOTO_CACHE_DIR || DATA_DIR + '/aircraft_photos';
/** Optional path to SQLite DB from Mictronics aircraft data (see scripts/create-aircraft-db.ts). Derived from DATA_DIR when unset; set to empty string to disable. */
export const AIRCRAFT_INFO_DB =
    process.env.AIRCRAFT_INFO_DB !== undefined
        ? process.env.AIRCRAFT_INFO_DB
        : DATA_DIR + '/aircraft_info.db';
/** Path to SQLite DB for tracking aircraft positions and post cooldowns. Derived from DATA_DIR when unset. */
export const TRACKING_DB = process.env.TRACKING_DB || DATA_DIR + '/aircraft.db';

/** Detection loop interval (ms). Circling and zig-zag jobs run each interval. 10s gives higher data resolution. */
export const DETECTION_INTERVAL_MS = parseInt(process.env.DETECTION_INTERVAL_MS || '10000', 10);
/** Aircraft API response cache TTL (ms). Just under detection interval so each run gets fresh data. */
export const AIRCRAFT_CACHE_TTL_MS = Math.max(1000, DETECTION_INTERVAL_MS - 2000);

/** Set to false to disable circling detection. */
export const ENABLE_CIRCLING_DETECTION = process.env.ENABLE_CIRCLING_DETECTION !== 'false';
/** Set to false to disable zig-zag (imaging) detection. */
export const ENABLE_ZIGZAG_DETECTION = process.env.ENABLE_ZIGZAG_DETECTION !== 'false';

/** Port for the health HTTP server. Default 3000. */
export const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || process.env.PORT || '3000', 10);
