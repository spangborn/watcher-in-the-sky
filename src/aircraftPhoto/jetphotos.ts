import axios from 'axios';
import * as log from '../log';
import { USER_AGENT, AIRCRAFT_PHOTO_USE_JETPHOTOS } from '../constants';
import type { AircraftPhoto } from './airportData';

type JetPhotosApiPhoto = {
    photoId: string;
    thumbnailUrl: string;
    imageUrl: string;
    photoPageUrl: string;
    registration?: string;
    photographer?: string;
};

type JetPhotosApiResponse = {
    photos?: JetPhotosApiPhoto[];
};

const DEFAULT_JETPHOTOS_BASE = 'https://jp.rewis.workers.dev';

function jetPhotosBaseUrl(): string {
    const fromEnv = process.env.JETPHOTOS_API_BASE;
    return (fromEnv && fromEnv.trim()) || DEFAULT_JETPHOTOS_BASE;
}

export async function getJetPhotosPhoto(registration: string | null): Promise<AircraftPhoto | null> {
    if (!AIRCRAFT_PHOTO_USE_JETPHOTOS) return null;
    const reg = registration?.trim();
    if (!reg) return null;

    const base = jetPhotosBaseUrl();
    const url = `${base}/search`;

    try {
        const resp = await axios.get<JetPhotosApiResponse>(url, {
            params: { registration: reg, limit: 1 },
            timeout: 4000,
            headers: { 'User-Agent': USER_AGENT || 'Watcher in the Sky' },
            validateStatus: (s) => s >= 200 && s < 500,
        });

        if (resp.status !== 200) {
            log.warn(`${reg}: JetPhotos API returned ${resp.status}`);
            return null;
        }

        const photo = resp.data?.photos?.[0];
        if (!photo?.imageUrl) {
            return null;
        }

        const imgResp = await axios.get<ArrayBuffer>(photo.imageUrl, {
            responseType: 'arraybuffer',
            timeout: 6000,
            headers: { 'User-Agent': USER_AGENT || 'Watcher in the Sky' },
            validateStatus: (s) => s >= 200 && s < 500,
        });

        if (imgResp.status !== 200) {
            log.warn(`${reg}: JetPhotos image fetch returned ${imgResp.status}`);
            return null;
        }

        const bytes = new Uint8Array(imgResp.data);

        return {
            bytes,
            mimeType: 'image/jpeg',
            photographer: photo.photographer ?? null,
            link: photo.photoPageUrl ?? null,
        };
    } catch (err) {
        log.warn(`JetPhotos fetch failed for ${reg}: ${err}`);
        return null;
    }
}
