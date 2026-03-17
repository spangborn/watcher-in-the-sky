import { describe, it, expect } from 'vitest';
import { countZigzagReversals, findZigzagPeriod, isZigzagPattern, getZigzagSubSegment, zigzagFailureReason } from './zigzag';

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

    it('requires turnpoints to progress perpendicular to legs (passes steady sweep)', () => {
        // Parallel N/S legs; turnpoints march eastward each leg.
        const pts: { lat: number; lon: number }[] = [];
        const baseLat = 40;
        const baseLon = -111;
        const legs = 5; // 4 reversals
        const legLen = 0.03; // ~3.3km
        const lonStep = 0.01; // ~0.85km at this lat
        for (let leg = 0; leg < legs; leg++) {
            const lon = baseLon + leg * lonStep;
            const goingNorth = leg % 2 === 0;
            const startLat = goingNorth ? baseLat : baseLat + legLen;
            const endLat = goingNorth ? baseLat + legLen : baseLat;

            // Straight leg (N/S).
            const legSteps = 60;
            for (let i = 0; i < legSteps; i++) {
                const t = i / (legSteps - 1);
                pts.push({ lat: startLat + (endLat - startLat) * t, lon });
            }

            // Turn: small perpendicular move (E/W) so reversal detection has a real turn segment.
            if (leg < legs - 1) {
                const nextLon = baseLon + (leg + 1) * lonStep;
                const turnSteps = 4;
                for (let i = 1; i <= turnSteps; i++) {
                    const t = i / turnSteps;
                    pts.push({ lat: endLat, lon: lon + (nextLon - lon) * t });
                }
            }
        }
        expect(isZigzagPattern(pts)).toBe(true);
    });

    it('rejects zigzags that do not steadily sweep (perpendicular progression backtracks)', () => {
        // Parallel N/S legs but turnpoints oscillate east/west (no monotonic sweep).
        const pts: { lat: number; lon: number }[] = [];
        const baseLat = 40;
        const baseLon = -111;
        const legs = 5; // 4 reversals
        const legLen = 0.03;
        const lonOffsets = [0, 0.01, 0, 0.01, 0]; // back-and-forth instead of marching
        for (let leg = 0; leg < legs; leg++) {
            const lon = baseLon + lonOffsets[leg];
            const goingNorth = leg % 2 === 0;
            const startLat = goingNorth ? baseLat : baseLat + legLen;
            const endLat = goingNorth ? baseLat + legLen : baseLat;
            const legSteps = 60;
            for (let i = 0; i < legSteps; i++) {
                const t = i / (legSteps - 1);
                pts.push({ lat: startLat + (endLat - startLat) * t, lon });
            }
            if (leg < legs - 1) {
                const nextLon = baseLon + lonOffsets[leg + 1];
                const turnSteps = 4;
                for (let i = 1; i <= turnSteps; i++) {
                    const t = i / turnSteps;
                    pts.push({ lat: endLat, lon: lon + (nextLon - lon) * t });
                }
            }
        }
        expect(isZigzagPattern(pts)).toBe(false);
    });

    it('rejects zigzags with inconsistent leg spacing (perpendicular step size varies too much)', () => {
        // Parallel N/S legs; sweep is monotonic but spacing is irregular (small steps then a big jump).
        const pts: { lat: number; lon: number }[] = [];
        const baseLat = 40;
        const baseLon = -111;
        const legs = 6; // 5 reversals
        const legLen = 0.03;
        const lonOffsets = [0, 0.003, 0.006, 0.03, 0.033, 0.036]; // big jump between 0.006 -> 0.03
        for (let leg = 0; leg < legs; leg++) {
            const lon = baseLon + lonOffsets[leg];
            const goingNorth = leg % 2 === 0;
            const startLat = goingNorth ? baseLat : baseLat + legLen;
            const endLat = goingNorth ? baseLat + legLen : baseLat;

            const legSteps = 60;
            for (let i = 0; i < legSteps; i++) {
                const t = i / (legSteps - 1);
                pts.push({ lat: startLat + (endLat - startLat) * t, lon });
            }
            if (leg < legs - 1) {
                const nextLon = baseLon + lonOffsets[leg + 1];
                const turnSteps = 4;
                for (let i = 1; i <= turnSteps; i++) {
                    const t = i / turnSteps;
                    pts.push({ lat: endLat, lon: lon + (nextLon - lon) * t });
                }
            }
        }
        expect(isZigzagPattern(pts)).toBe(false);
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
