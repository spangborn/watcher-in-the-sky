import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { reverse, isNearbyAirport, getClosestLandmark } from './pelias';

vi.mock('axios');

describe('pelias helpers', () => {
    const getMock = vi.mocked(axios.get);

    beforeEach(() => {
        getMock.mockReset();
    });

    afterEach(() => {
        getMock.mockReset();
    });

    it('reverse returns data on success', async () => {
        getMock.mockResolvedValueOnce({ data: { features: [] } } as any);
        const data = await reverse(40, -111, {});
        expect(data).toEqual({ features: [] });
        expect(getMock).toHaveBeenCalled();
    });

    it('isNearbyAirport true when features exist', async () => {
        getMock.mockResolvedValueOnce({ data: { features: [{}, {}] } } as any);
        const ok = await isNearbyAirport(40, -111, {});
        expect(ok).toBe(true);
    });

    it('isNearbyAirport false when no features', async () => {
        getMock.mockResolvedValueOnce({ data: { features: [] } } as any);
        const ok = await isNearbyAirport(40, -111, {});
        expect(ok).toBe(false);
    });

    it('getClosestLandmark returns null when none', async () => {
        getMock.mockResolvedValueOnce({ data: { features: [] } } as any);
        const lm = await getClosestLandmark(40, -111);
        expect(lm).toBeNull();
    });

    it('getClosestLandmark returns name and miles when present', async () => {
        getMock.mockResolvedValueOnce({
            data: {
                features: [
                    {
                        properties: { name: 'Place', distance: 10 },
                        geometry: { coordinates: [-111, 40] },
                    },
                ],
            },
        } as any);
        const lm = await getClosestLandmark(40, -111);
        expect(lm).not.toBeNull();
        expect(lm!.name).toBe('Place');
        expect(lm!.distanceMiles).toBeCloseTo(6.2137, 3);
    });

    it('getClosestLandmark shortens long label to part before first comma', async () => {
        getMock.mockResolvedValueOnce({
            data: {
                features: [
                    {
                        properties: { name: 'Currant Creek, Utah County, UT, USA', distance: 5 },
                        geometry: { coordinates: [-111, 40] },
                    },
                ],
            },
        } as any);
        const lm = await getClosestLandmark(40, -111);
        expect(lm).not.toBeNull();
        expect(lm!.name).toBe('Currant Creek');
    });
});
