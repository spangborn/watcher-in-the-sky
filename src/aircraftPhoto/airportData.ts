import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIRCRAFT_PHOTO_CACHE_DIR, AIRCRAFT_PHOTO_ENABLED } from '../constants';
import * as log from '../log';

export interface AircraftPhoto {
    bytes: Uint8Array;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    /** Photographer credit from Airport-Data.com (when provided). */
    photographer?: string | null;
    /** Source page link from Airport-Data.com (when provided). */
    link?: string | null;
}

type AirportDataApiResponse = {
    data?: Array<{
        image?: string;
        link?: string;
        photographer?: string;
    }>;
};

const MISS_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function normalizeHex(hex: string): string {
    return hex.replace(/^~/, '').toLowerCase();
}

function cachePaths(hex: string): { jpg: string; miss: string } {
    const key = normalizeHex(hex);
    return {
        jpg: path.join(AIRCRAFT_PHOTO_CACHE_DIR, `${key}.jpg`),
        // Sidecar metadata for attribution (photographer/link). Kept separate from bytes so cache hits retain attribution.
        // We don't attempt to validate freshness; a photo's attribution rarely changes and the miss TTL protects us from requery storms.
        meta: path.join(AIRCRAFT_PHOTO_CACHE_DIR, `${key}.meta.json`),
        miss: path.join(AIRCRAFT_PHOTO_CACHE_DIR, `${key}.miss.json`),
    };
}

async function ensureCacheDir(): Promise<void> {
    await fs.mkdir(AIRCRAFT_PHOTO_CACHE_DIR, { recursive: true });
}

async function readFreshMiss(missPath: string): Promise<boolean> {
    try {
        const raw = await fs.readFile(missPath, 'utf-8');
        const parsed = JSON.parse(raw) as { ts: number };
        return typeof parsed.ts === 'number' && (Date.now() - parsed.ts) < MISS_TTL_MS;
    } catch {
        return false;
    }
}

async function writeMiss(missPath: string): Promise<void> {
    try {
        await ensureCacheDir();
        await fs.writeFile(missPath, JSON.stringify({ ts: Date.now() }), 'utf-8');
    } catch {
        // ignore cache failures
    }
}

async function readCachedJpg(jpgPath: string): Promise<Uint8Array | null> {
    try {
        const buf = await fs.readFile(jpgPath);
        return new Uint8Array(buf);
    } catch {
        return null;
    }
}

async function writeCachedJpg(jpgPath: string, bytes: Uint8Array): Promise<void> {
    try {
        await ensureCacheDir();
        await fs.writeFile(jpgPath, Buffer.from(bytes));
    } catch {
        // ignore cache failures
    }
}

async function readCachedMeta(metaPath: string): Promise<{ photographer: string | null; link: string | null } | null> {
    try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        const parsed = JSON.parse(raw) as { photographer?: string | null; link?: string | null };
        return {
            photographer: typeof parsed.photographer === 'string' ? parsed.photographer : (parsed.photographer ?? null),
            link: typeof parsed.link === 'string' ? parsed.link : (parsed.link ?? null),
        };
    } catch {
        return null;
    }
}

async function writeCachedMeta(metaPath: string, meta: { photographer: string | null; link: string | null }): Promise<void> {
    try {
        await ensureCacheDir();
        await fs.writeFile(metaPath, JSON.stringify(meta), 'utf-8');
    } catch {
        // ignore cache failures
    }
}

function mimeTypeFromHeaders(contentType: unknown): AircraftPhoto['mimeType'] | null {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'image/jpeg';
    if (ct.includes('image/png')) return 'image/png';
    if (ct.includes('image/webp')) return 'image/webp';
    return null;
}

/**
 * Fetch an aircraft photo via Airport-Data.com (same service Advisory Circular uses).
 * Returns null if no photo exists or the provider is unavailable.
 *
 * Note: we cache the downloaded JPG bytes on disk, and also cache misses for a short TTL.
 */
export async function getAirportDataPhoto(hex: string): Promise<AircraftPhoto | null> {
    if (!AIRCRAFT_PHOTO_ENABLED) return null;
    if (!hex) return null;
    const { jpg, meta, miss } = cachePaths(hex);

    const cached = await readCachedJpg(jpg);
    if (cached) {
        const cachedMeta = await readCachedMeta(meta);
        return {
            bytes: cached,
            mimeType: 'image/jpeg',
            photographer: cachedMeta?.photographer ?? null,
            link: cachedMeta?.link ?? null,
        };
    }
    if (await readFreshMiss(miss)) return null;

    try {
        // API: https://airport-data.com/api/ac_thumb.json?m=<ICAO>&n=1
        const apiUrl = 'https://airport-data.com/api/ac_thumb.json';
        const resp = await axios.get<AirportDataApiResponse>(apiUrl, {
            params: { m: normalizeHex(hex), n: '1' },
            timeout: 3000,
            headers: { 'User-Agent': 'Watcher in the Sky' },
            validateStatus: (s) => s >= 200 && s < 500,
        });

        if (resp.status !== 200) {
            log.warn(`${hex}: airport-data photo API returned ${resp.status}`);
            await writeMiss(miss);
            return null;
        }

        const entry = resp.data?.data?.[0];
        const imageUrl = entry?.image;
        if (!imageUrl) {
            await writeMiss(miss);
            return null;
        }

        const imgResp = await axios.get<ArrayBuffer>(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'Watcher in the Sky' },
            validateStatus: (s) => s >= 200 && s < 500,
        });

        if (imgResp.status !== 200) {
            log.warn(`${hex}: airport-data image fetch returned ${imgResp.status}`);
            await writeMiss(miss);
            return null;
        }

        const mimeType =
            mimeTypeFromHeaders(imgResp.headers?.['content-type']) ??
            'image/jpeg';
        const bytes = new Uint8Array(imgResp.data);

        // Only cache JPGs (airport-data almost always returns jpg); fall back to no cache for others.
        if (mimeType === 'image/jpeg') {
            await writeCachedJpg(jpg, bytes);
            await writeCachedMeta(meta, {
                photographer: entry?.photographer?.trim() || null,
                link: entry?.link?.trim() || null,
            });
        }
        return {
            bytes,
            mimeType,
            photographer: entry?.photographer?.trim() || null,
            link: entry?.link?.trim() || null,
        };
    } catch (err) {
        log.warn(`${hex}: aircraft photo fetch failed: ${err}`);
        await writeMiss(miss);
        return null;
    }
}

