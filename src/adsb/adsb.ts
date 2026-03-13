import axios from 'axios';
import { TAR1090_DATA_URL, AIRCRAFT_CACHE_TTL_MS } from '../constants';
import { increment429, incrementNon429 } from '../health/metrics';
import { setupCache } from 'axios-cache-interceptor';
import * as log from '../log';

export interface AircraftApi {
    hex?: string;
    r?: string | null;
    registration?: string | null;
    flight?: string | null;
    alt_baro?: number | string | null;
    lat?: number;
    lon?: number;
    t?: string | null;
    gs?: number | null;
    squawk?: string | null;
    dbFlags?: number | null;
}

const axiosCache = setupCache(axios, {
    debug: process.env.DEBUG_ADSBX_CACHE === '1' ? console.log : undefined,
    ttl: AIRCRAFT_CACHE_TTL_MS,
    interpretHeader: false, // ignore cache-control headers from the service
    cachePredicate: {
        // Only cache successful responses; never cache 429 or other errors
        statusCheck: (status) => status >= 200 && status < 300,
    },
});

const DEFAULT_MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function isRateLimited(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 429;
}

function getRetryAfterMs(error: unknown): number | null {
    if (!axios.isAxiosError(error) || !error.response) return null;
    const retryAfter = error.response.headers?.['retry-after'];
    if (retryAfter == null) return null;
    const seconds = parseInt(String(retryAfter), 10);
    return Number.isNaN(seconds) ? null : seconds * 1000;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown when TAR1090 returns 429 and all retries are exhausted. Used by cron to back off. */
export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}

async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = DEFAULT_MAX_RETRIES): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (isRateLimited(error)) {
                increment429();
            } else {
                incrementNon429();
            }
            if (!isRateLimited(error) || attempt === maxRetries) {
                if (isRateLimited(error) && attempt === maxRetries) {
                    throw new RateLimitError('TAR1090 rate limited after retries');
                }
                throw error;
            }
            const retryAfter = getRetryAfterMs(error);
            const delayMs = retryAfter ?? Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 60000);
            log.warn(`TAR1090 rate limited (429), retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(delayMs);
        }
    }
    throw lastError;
}

export async function fetchAircraftData(): Promise<AircraftApi[]> {
    try {
        const response = await fetchWithRetry(() => axiosCache.get(TAR1090_DATA_URL));
        log.info(`Got ${response.cached ? 'cached' : 'fresh'} data from: ${TAR1090_DATA_URL}.`);
        // Support both "ac" (airplanes.live) and "aircraft" (readsb/tar1090) response keys
        const list = response.data?.ac ?? response.data?.aircraft;
        return Array.isArray(list) ? (list as AircraftApi[]) : [];
    } catch (error: unknown) {
        if (error instanceof RateLimitError) throw error;
        log.err(`Error fetching aircraft data: ${(error as Error).message}`);
        return [];
    }
}
