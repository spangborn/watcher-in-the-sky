import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('axios', () => {
    return {
        default: {
            get: vi.fn(),
        },
    };
});

// Avoid interacting with real /tmp between test runs
vi.mock('fs/promises', () => {
    const err: any = new Error('ENOENT');
    err.code = 'ENOENT';
    return {
        readFile: vi.fn(async () => { throw err; }),
        writeFile: vi.fn(async () => { /* noop */ }),
        mkdir: vi.fn(async () => { /* noop */ }),
    };
});

// Keep cache writes from touching disk in tests
vi.mock('../constants', async () => {
    const actual = await vi.importActual<any>('../constants');
    return {
        ...actual,
        AIRCRAFT_PHOTO_ENABLED: true,
        AIRCRAFT_PHOTO_CACHE_DIR: '/tmp/watcher-test-aircraft-photos',
    };
});

import axios from 'axios';
import { getAirportDataPhoto } from './airportData';

describe('getAirportDataPhoto', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns null when the API returns no data', async () => {
        (axios.get as any).mockResolvedValueOnce({ status: 200, data: { data: [] } });
        const photo = await getAirportDataPhoto('ABC123');
        expect(photo).toBeNull();
    });

    it('fetches the image bytes when available', async () => {
        (axios.get as any)
            .mockResolvedValueOnce({
                status: 200,
                data: { data: [{ image: 'https://airport-data.com/img.jpg', photographer: 'Jane Doe', link: 'https://airport-data.com/aircraft/abc' }] },
            })
            .mockResolvedValueOnce({
                status: 200,
                data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
                headers: { 'content-type': 'image/jpeg' },
            });

        const photo = await getAirportDataPhoto('a1b2c3');
        expect(photo).not.toBeNull();
        expect(photo?.mimeType).toBe('image/jpeg');
        expect(photo?.bytes.length).toBeGreaterThan(0);
        expect(photo?.photographer).toBe('Jane Doe');
        expect(photo?.link).toBe('https://airport-data.com/aircraft/abc');
        expect((axios.get as any).mock.calls.length).toBe(2);
    });
});

