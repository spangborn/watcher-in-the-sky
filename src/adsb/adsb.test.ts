import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { fetchAircraftData } from './adsb';

vi.mock('axios');

describe('fetchAircraftData', () => {
    beforeEach(() => {
        (axios.get as vi.Mock).mockReset();
    });

    it('returns list when API responds with ac field', async () => {
        (axios.get as vi.Mock).mockResolvedValueOnce({ data: { ac: [{ hex: 'ABC123' }] }, cached: false });
        const list = await fetchAircraftData();
        expect(Array.isArray(list)).toBe(true);
        expect(list[0].hex).toBe('ABC123');
    });

    it('returns [] and does not throw on non-rate-limit error', async () => {
        (axios.get as vi.Mock).mockRejectedValueOnce(new Error('boom'));
        const list = await fetchAircraftData();
        expect(list).toEqual([]);
    });
});

