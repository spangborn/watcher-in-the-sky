import { describe, it, expect } from 'vitest';
import { calculateCurviness, getCirclingSegment, getCircleSegmentForCentroid } from './detect';

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

function withAlt(coords: { lat: number; lon: number; timestamp: number; r: string }[], alt: number): { lat: number; lon: number; timestamp: number; r: string; alt_baro: number | null }[] {
    return coords.map((c) => ({ ...c, alt_baro: alt }));
}

describe('getCirclingSegment', () => {
    const timeWindow = 60000; // 1 min

    it('returns null for fewer than 2 coords', () => {
        expect(getCirclingSegment([], timeWindow)).toBeNull();
        expect(getCirclingSegment(withAlt([{ lat: 34, lon: -118, timestamp: 0, r: 'N1' }], 1000), timeWindow)).toBeNull();
    });

    it('returns null when all points are on ground', () => {
        const coords = withAlt([
            { lat: 34, lon: -118, timestamp: 0, r: 'N1' },
            { lat: 34.01, lon: -118, timestamp: 30000, r: 'N1' },
        ], 0);
        expect(getCirclingSegment(coords, timeWindow)).toBeNull();
    });

    it('returns segment with curviness 0 for straight line (airborne)', () => {
        const coords = withAlt([
            { lat: 34, lon: -118, timestamp: 0, r: 'N1' },
            { lat: 34.01, lon: -118, timestamp: 30000, r: 'N1' },
            { lat: 34.02, lon: -118, timestamp: 60000, r: 'N1' },
        ], 1000);
        const result = getCirclingSegment(coords, timeWindow);
        expect(result).not.toBeNull();
        expect(result!.segment.length).toBe(3);
        expect(result!.curviness).toBe(0);
    });

    it('returns segment when path has curvature (airborne)', () => {
        const base = Date.now() - 120000;
        const coords = withAlt([
            { lat: 34, lon: -118, timestamp: base, r: 'N1' },
            { lat: 34.001, lon: -118, timestamp: base + 20000, r: 'N1' },
            { lat: 34.001, lon: -117.999, timestamp: base + 40000, r: 'N1' },
            { lat: 34, lon: -117.999, timestamp: base + 60000, r: 'N1' },
        ], 1000);
        const result = getCirclingSegment(coords, 70000);
        expect(result).not.toBeNull();
        expect(result!.segment.length).toBeGreaterThanOrEqual(2);
        expect(result!.curviness).toBeGreaterThan(0);
    });
});

describe('getCircleSegmentForCentroid', () => {
    it('returns full segment when cumulative turn never reaches 720°', () => {
        const segment = [
            { lat: 34, lon: -118, timestamp: 0 },
            { lat: 34.01, lon: -118, timestamp: 30000 },
            { lat: 34.01, lon: -117.99, timestamp: 60000 },
        ];
        const sub = getCircleSegmentForCentroid(segment);
        expect(sub).toHaveLength(segment.length);
    });

    it('returns slice from circle-start when path has enough cumulative turn', () => {
        const base = 0;
        const segment = [
            { lat: 34, lon: -118, timestamp: base },
            { lat: 34.01, lon: -118, timestamp: base + 60000 },
            { lat: 34.02, lon: -118, timestamp: base + 120000 },
            { lat: 34.02, lon: -117.99, timestamp: base + 180000 },
            { lat: 34.01, lon: -117.99, timestamp: base + 240000 },
            { lat: 34, lon: -118, timestamp: base + 300000 },
        ];
        const sub = getCircleSegmentForCentroid(segment);
        expect(sub.length).toBeLessThanOrEqual(segment.length);
        expect(sub.length).toBeGreaterThanOrEqual(2);
    });
});
