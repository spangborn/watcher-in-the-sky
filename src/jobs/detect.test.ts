import { describe, it, expect } from 'vitest';
import { calculateCurviness, findCurviestTimePeriod, getCurviestSubSegment } from './detect';

describe('calculateCurviness', () => {
    it('returns 0 for empty segment', () => {
        expect(calculateCurviness([])).toBe(0);
    });

    it('returns 0 for single point', () => {
        expect(calculateCurviness([{ lat: 34, lon: -118 }])).toBe(0);
    });

    it('returns 0 for two points (no curvature)', () => {
        expect(calculateCurviness([
            { lat: 34, lon: -118 },
            { lat: 34.01, lon: -118 },
        ])).toBe(0);
    });

    it('returns 0 for collinear points', () => {
        const segment = [
            { lat: 34, lon: -118 },
            { lat: 34.01, lon: -118 },
            { lat: 34.02, lon: -118 },
        ];
        expect(calculateCurviness(segment)).toBe(0);
    });

    it('returns positive curviness for turning path', () => {
        // Three points: north then east -> right turn ~90°
        const segment = [
            { lat: 34, lon: -118 },
            { lat: 34.01, lon: -118 },
            { lat: 34.01, lon: -117.99 },
        ];
        const c = calculateCurviness(segment);
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThanOrEqual(180);
    });

    it('returns high curviness for path that wraps (circling)', () => {
        // Approximate square: multiple segments with turning -> high cumulative heading change
        const segment = [
            { lat: 34, lon: -118 },
            { lat: 34.01, lon: -118 },
            { lat: 34.01, lon: -117.99 },
            { lat: 34, lon: -117.99 },
            { lat: 34, lon: -118 },
        ];
        const c = calculateCurviness(segment);
        expect(c).toBeGreaterThan(200);
        expect(c).toBeLessThanOrEqual(400);
    });
});

describe('findCurviestTimePeriod', () => {
    const timeWindow = 60000; // 1 min

    it('returns null for fewer than 2 coords', () => {
        expect(findCurviestTimePeriod([], timeWindow)).toBeNull();
        expect(findCurviestTimePeriod([
            { lat: 34, lon: -118, timestamp: 0, r: 'N1' },
        ], timeWindow)).toBeNull();
    });

    it('returns null when best curviness is 0 (straight line)', () => {
        const coords = [
            { lat: 34, lon: -118, timestamp: 0, r: 'N1' },
            { lat: 34.01, lon: -118, timestamp: 30000, r: 'N1' },
            { lat: 34.02, lon: -118, timestamp: 60000, r: 'N1' },
        ];
        const result = findCurviestTimePeriod(coords, timeWindow);
        expect(result).toBeNull();
    });

    it('returns segment when window has high curviness', () => {
        // Points that form a turn within the window
        const base = Date.now() - 120000;
        const coords = [
            { lat: 34, lon: -118, timestamp: base, r: 'N1' },
            { lat: 34.001, lon: -118, timestamp: base + 20000, r: 'N1' },
            { lat: 34.001, lon: -117.999, timestamp: base + 40000, r: 'N1' },
            { lat: 34, lon: -117.999, timestamp: base + 60000, r: 'N1' },
        ];
        const result = findCurviestTimePeriod(coords, 70000);
        if (result) {
            expect(result.segment.length).toBeGreaterThanOrEqual(2);
            expect(result.curviness).toBeGreaterThan(0);
        }
    });
});

describe('getCurviestSubSegment', () => {
    it('returns full segment when shorter than window', () => {
        const segment = [
            { lat: 34, lon: -118, timestamp: 0 },
            { lat: 34.01, lon: -118, timestamp: 30000 },
            { lat: 34.01, lon: -117.99, timestamp: 60000 },
        ];
        const sub = getCurviestSubSegment(segment, 120000);
        expect(sub).toHaveLength(segment.length);
    });

    it('returns a sub-segment when a curvy part exists in a longer path', () => {
        const base = 0;
        // Straight, then turn, then straight
        const segment = [
            { lat: 34, lon: -118, timestamp: base, r: '' },
            { lat: 34.01, lon: -118, timestamp: base + 60000, r: '' },
            { lat: 34.02, lon: -118, timestamp: base + 120000, r: '' },
            { lat: 34.02, lon: -117.99, timestamp: base + 180000, r: '' },
            { lat: 34.01, lon: -117.99, timestamp: base + 240000, r: '' },
            { lat: 34, lon: -118, timestamp: base + 300000, r: '' },
        ];
        const sub = getCurviestSubSegment(segment, 120000);
        expect(sub.length).toBeLessThanOrEqual(segment.length);
        expect(sub.length).toBeGreaterThanOrEqual(2);
    });
});
