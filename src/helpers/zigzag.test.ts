import { describe, it, expect } from 'vitest';
import { countZigzagReversals, findZigzagPeriod, isZigzagPattern, getZigzagSubSegment } from './zigzag';

describe('countZigzagReversals', () => {
    it('returns 0 for too few points', () => {
        expect(countZigzagReversals([])).toBe(0);
        expect(countZigzagReversals([{ lat: 40, lon: -111 }])).toBe(0);
        expect(countZigzagReversals([{ lat: 40, lon: -111 }, { lat: 40.01, lon: -111 }])).toBe(0);
    });

    it('returns 0 for straight line', () => {
        const straight = [
            { lat: 40, lon: -111 },
            { lat: 40.01, lon: -111 },
            { lat: 40.02, lon: -111 },
            { lat: 40.03, lon: -111 },
        ];
        expect(countZigzagReversals(straight)).toBe(0);
    });

    it('counts opposite-direction reversals (~180°), not circles', () => {
        // North (7 pts) -> 180° -> south (6 pts) -> 180° -> north (6 pts): two turns, one counted reversal.
        const zigzag = [
            ...Array.from({ length: 7 }, (_, i) => ({ lat: 40 + i * 0.01, lon: -111 })),
            ...Array.from({ length: 6 }, (_, i) => ({ lat: 40.06 - (i + 1) * 0.01, lon: -111 })),
            ...Array.from({ length: 6 }, (_, i) => ({ lat: 40 + (i + 1) * 0.01, lon: -111 })),
        ];
        const r = countZigzagReversals(zigzag);
        expect(r).toBeGreaterThanOrEqual(1);
    });
});

describe('findZigzagPeriod', () => {
    it('returns null for too few points', () => {
        expect(findZigzagPeriod([], 300000)).toBeNull();
        expect(findZigzagPeriod([
            { lat: 40, lon: -111, timestamp: 0 },
            { lat: 40.01, lon: -111, timestamp: 60000 },
        ], 300000)).toBeNull();
    });

    it('returns null when no segment has enough reversals', () => {
        const straight = [
            { lat: 40, lon: -111, timestamp: 0 },
            { lat: 40.01, lon: -111, timestamp: 60000 },
            { lat: 40.02, lon: -111, timestamp: 120000 },
        ];
        expect(findZigzagPeriod(straight, 300000)).toBeNull();
    });
});

describe('isZigzagPattern', () => {
    it('returns false for straight path', () => {
        const straight = [
            { lat: 40, lon: -111 },
            { lat: 40.01, lon: -111 },
            { lat: 40.02, lon: -111 },
        ];
        expect(isZigzagPattern(straight)).toBe(false);
    });
});

describe('getZigzagSubSegment', () => {
    it('returns full segment when no reversals (straight path)', () => {
        const straight = [
            { lat: 40, lon: -111 },
            { lat: 40.01, lon: -111 },
            { lat: 40.02, lon: -111 },
        ];
        expect(getZigzagSubSegment(straight)).toEqual(straight);
    });

    it('returns a contiguous slice for zigzag (sub-segment or full when only one reversal)', () => {
        // North (7) -> south (6) -> north (6): at least one reversal; may have first === last
        const zigzag = [
            ...Array.from({ length: 7 }, (_, i) => ({ lat: 40 + i * 0.01, lon: -111 })),
            ...Array.from({ length: 6 }, (_, i) => ({ lat: 40.06 - (i + 1) * 0.01, lon: -111 })),
            ...Array.from({ length: 6 }, (_, i) => ({ lat: 40 + (i + 1) * 0.01, lon: -111 })),
        ];
        const sub = getZigzagSubSegment(zigzag);
        expect(sub.length).toBeGreaterThan(0);
        expect(sub.length).toBeLessThanOrEqual(zigzag.length);
        // Sub-segment must be contiguous in original (same refs or same coords)
        const startIdx = zigzag.findIndex(p => p.lat === sub[0].lat && p.lon === sub[0].lon);
        expect(startIdx).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < sub.length; i++) {
            expect(sub[i].lat).toBe(zigzag[startIdx + i].lat);
            expect(sub[i].lon).toBe(zigzag[startIdx + i].lon);
        }
    });
});
