import { describe, it, expect } from 'vitest';
import {
    toRadians,
    toDegrees,
    computeBearing,
    calculateCentroid,
    getBoundsZoomCenter,
} from './coordinateUtils';

describe('toRadians', () => {
    it('converts 0 degrees to 0 radians', () => {
        expect(toRadians(0)).toBe(0);
    });
    it('converts 180 degrees to PI radians', () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI);
    });
    it('converts 90 degrees to PI/2 radians', () => {
        expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
    });
    it('converts 360 degrees to 2*PI radians', () => {
        expect(toRadians(360)).toBeCloseTo(2 * Math.PI);
    });
});

describe('toDegrees', () => {
    it('converts 0 radians to 0 degrees', () => {
        expect(toDegrees(0)).toBe(0);
    });
    it('converts PI radians to 180 degrees', () => {
        expect(toDegrees(Math.PI)).toBeCloseTo(180);
    });
    it('converts PI/2 radians to 90 degrees', () => {
        expect(toDegrees(Math.PI / 2)).toBeCloseTo(90);
    });
});

describe('computeBearing', () => {
    it('returns 0 for same point', () => {
        expect(computeBearing(34, -118, 34, -118)).toBe(0);
    });
    it('returns 90 for due east', () => {
        expect(computeBearing(0, 0, 0, 1)).toBe(90);
    });
    it('returns 270 for due west', () => {
        expect(computeBearing(0, 0, 0, -1)).toBe(270);
    });
    it('returns 0 for due north', () => {
        expect(computeBearing(0, 0, 1, 0)).toBe(0);
    });
    it('returns 180 for due south', () => {
        expect(computeBearing(0, 0, -1, 0)).toBe(180);
    });
    it('returns bearing in 0-360 range', () => {
        const b = computeBearing(34.05, -118.25, 34.06, -118.24);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
    });
});

describe('calculateCentroid', () => {
    it('returns the single point for one coordinate', () => {
        const coords = [{ lat: 34.05, lon: -118.25 }];
        expect(calculateCentroid(coords)).toEqual({ lat: 34.05, lon: -118.25 });
    });
    it('returns midpoint for two coordinates', () => {
        const coords = [
            { lat: 0, lon: 0 },
            { lat: 2, lon: 4 },
        ];
        expect(calculateCentroid(coords)).toEqual({ lat: 1, lon: 2 });
    });
    it('returns centroid for three points', () => {
        const coords = [
            { lat: 34, lon: -118 },
            { lat: 34.01, lon: -118 },
            { lat: 34.005, lon: -117.99 },
        ];
        const c = calculateCentroid(coords);
        expect(c.lat).toBeCloseTo(34.005, 5);
        expect(c.lon).toBeCloseTo(-117.996667, 5);
    });
});

describe('getBoundsZoomCenter', () => {
    it('returns center at centroid of points and zoom that fits viewport', () => {
        const points = [
            { lat: 41, lon: -112 },
            { lat: 41.1, lon: -111.9 },
        ];
        const r = getBoundsZoomCenter(points, 1200, 800);
        expect(r.lat).toBeCloseTo(41.05, 2);
        expect(r.lon).toBeCloseTo(-111.95, 2);
        expect(r.zoom).toBeGreaterThanOrEqual(0);
        expect(r.zoom).toBeLessThanOrEqual(18);
    });
    it('returns higher zoom for smaller extent', () => {
        const small = [
            { lat: 41, lon: -112 },
            { lat: 41.01, lon: -111.99 },
        ];
        const large = [
            { lat: 40, lon: -113 },
            { lat: 42, lon: -111 },
        ];
        const rSmall = getBoundsZoomCenter(small, 1200, 800);
        const rLarge = getBoundsZoomCenter(large, 1200, 800);
        expect(rSmall.zoom).toBeGreaterThan(rLarge.zoom);
    });
});
