import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('axios', () => {
    return {
        default: {
            get: vi.fn(),
        },
    };
});

vi.mock('../constants', async () => {
    const actual = await vi.importActual<any>('../constants');
    return {
        ...actual,
        AIRCRAFT_PHOTO_USE_JETPHOTOS: true,
    };
});

import axios from 'axios';
import { getJetPhotosPhoto } from './jetphotos';

describe('getJetPhotosPhoto', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns null when registration is missing', async () => {
        const photo = await getJetPhotosPhoto(null);
        expect(photo).toBeNull();
    });

    it('fetches the first JetPhotos image when available', async () => {
        (axios.get as any)
            .mockResolvedValueOnce({
                status: 200,
                data: {
                    photos: [
                        {
                            imageUrl: 'https://cdn.jetphotos.com/full/test.jpg',
                            photographer: 'Spotter One',
                            photoPageUrl: 'https://www.jetphotos.com/photo/123',
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                status: 200,
                data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
                headers: { 'content-type': 'image/jpeg' },
            });

        const photo = await getJetPhotosPhoto('N123AB');
        expect(photo).not.toBeNull();
        expect(photo?.mimeType).toBe('image/jpeg');
        expect(photo?.bytes.length).toBeGreaterThan(0);
        expect(photo?.photographer).toBe('Spotter One');
        expect(photo?.link).toBe('https://www.jetphotos.com/photo/123');
        expect((axios.get as any).mock.calls.length).toBe(2);
        expect((axios.get as any).mock.calls[0][0]).toContain('/search');
        expect((axios.get as any).mock.calls[1][0]).toBe('https://cdn.jetphotos.com/full/test.jpg');
    });
});
