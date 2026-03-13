import { computeBearing } from './coordinateUtils';

/** Minimum turn angle (degrees) to count as a leg reversal. Imaging uses ~180°; circuits use ~90°. */
const MIN_TURN_DEG = 120;
/** Minimum number of alternating reversals (parallel legs) for imaging pattern. 5 reversals = 6 legs. */
const MIN_REVERSALS = 5;
/** Minimum points between reversals (sustained leg); filters tight circuits. */
const MIN_POINTS_PER_LEG = 6;
/** Turn must be near 180° (opposite direction); circles have ~90° turns. */
const MIN_OPPOSITE_DEG = 140;
/** Max bearing spread (degrees) for legs in the same direction to count as parallel. */
const PARALLEL_TOLERANCE_DEG = 20;
/** Min angle (degrees) between the two leg directions for imaging (should be ~180). */
const MIN_OPPOSITE_LEG_DEG = 162;

/**
 * Normalize bearing difference to -180..180.
 */
function normalizeBearingDelta(delta: number): number {
    let d = delta;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
}

/**
 * Smallest angular distance between two bearings (0..180).
 */
function bearingDiff(b1: number, b2: number): number {
    let d = Math.abs(b1 - b2);
    if (d > 180) d = 360 - d;
    return d;
}

interface ReversalIndices {
    count: number;
    firstReversalIdx: number | null;
    lastReversalIdx: number | null;
    /** All reversal indices in order (bearing-array indices). */
    reversalIndices: number[];
}

/**
 * Find reversal indices: count and first/last point indices where direction flips (~180°).
 */
function findReversalIndices(segment: { lat: number; lon: number }[]): ReversalIndices {
    const result: ReversalIndices = { count: 0, firstReversalIdx: null, lastReversalIdx: null, reversalIndices: [] };
    if (segment.length < 3) return result;

    const bearings: number[] = [];
    for (let i = 0; i < segment.length - 1; i++) {
        const a = segment[i];
        const b = segment[i + 1];
        bearings.push(computeBearing(a.lat, a.lon, b.lat, b.lon));
    }

    let prevTurnSign: number | null = null;
    let lastReversalIdx = -MIN_POINTS_PER_LEG - 1;

    for (let i = 1; i < bearings.length; i++) {
        const delta = normalizeBearingDelta(bearings[i] - bearings[i - 1]);
        if (Math.abs(delta) < MIN_TURN_DEG) continue;

        const sign = Math.sign(delta);
        const isAlternating = prevTurnSign !== null && sign !== 0 && sign !== prevTurnSign;
        const legLongEnough = i - lastReversalIdx >= MIN_POINTS_PER_LEG;
        const oppositeDirection = Math.abs(delta) >= MIN_OPPOSITE_DEG;

        if (isAlternating && legLongEnough && oppositeDirection) {
            if (result.firstReversalIdx === null) result.firstReversalIdx = i;
            result.lastReversalIdx = i;
            result.reversalIndices.push(i);
            result.count++;
            lastReversalIdx = i;
        }
        prevTurnSign = sign;
    }

    return result;
}

/**
 * Mean bearing for a leg (bearing indices start..end-1). Returns 0-360.
 */
function meanBearing(bearings: number[], start: number, end: number): number {
    if (start >= end) return 0;
    let sumSin = 0;
    let sumCos = 0;
    for (let i = start; i < end; i++) {
        const b = (bearings[i] * Math.PI) / 180;
        sumSin += Math.sin(b);
        sumCos += Math.cos(b);
    }
    const n = end - start;
    const rad = Math.atan2(sumSin / n, sumCos / n);
    return ((rad * 180) / Math.PI + 360) % 360;
}

/** Circular mean of bearings in degrees (0-360). */
function circularMeanDeg(bearingsDeg: number[]): number {
    if (bearingsDeg.length === 0) return 0;
    let sumSin = 0;
    let sumCos = 0;
    for (const b of bearingsDeg) {
        const r = (b * Math.PI) / 180;
        sumSin += Math.sin(r);
        sumCos += Math.cos(r);
    }
    const n = bearingsDeg.length;
    const rad = Math.atan2(sumSin / n, sumCos / n);
    return ((rad * 180) / Math.PI + 360) % 360;
}

/**
 * True if legs are roughly parallel in two directions (~180° apart).
 * Odd-indexed legs (0,2,4...) should be parallel; even-indexed (1,3,5...) parallel; the two groups ~180° apart.
 */
function legsAreRoughlyParallel(segment: { lat: number; lon: number }[]): boolean {
    const { reversalIndices } = findReversalIndices(segment);
    if (reversalIndices.length < 2) return true; // not enough legs to check

    const bearings: number[] = [];
    for (let i = 0; i < segment.length - 1; i++) {
        const a = segment[i];
        const b = segment[i + 1];
        bearings.push(computeBearing(a.lat, a.lon, b.lat, b.lon));
    }

    const legBearings: number[] = [];
    const starts = [0, ...reversalIndices];
    const ends = [...reversalIndices, bearings.length];
    for (let i = 0; i < starts.length && i < ends.length; i++) {
        if (ends[i] > starts[i]) {
            legBearings.push(meanBearing(bearings, starts[i], ends[i]));
        }
    }

    if (legBearings.length < 2) return true;

    const oddBearings = legBearings.filter((_, i) => i % 2 === 0);
    const evenBearings = legBearings.filter((_, i) => i % 2 === 1);

    const maxSpread = (arr: number[]) => {
        if (arr.length < 2) return 0;
        let max = 0;
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                max = Math.max(max, bearingDiff(arr[i], arr[j]));
            }
        }
        return max;
    };

    if (oddBearings.length >= 2 && maxSpread(oddBearings) > PARALLEL_TOLERANCE_DEG) return false;
    if (evenBearings.length >= 2 && maxSpread(evenBearings) > PARALLEL_TOLERANCE_DEG) return false;

    if (oddBearings.length >= 1 && evenBearings.length >= 1) {
        const meanOdd = circularMeanDeg(oddBearings);
        const meanEven = circularMeanDeg(evenBearings);
        const diff = Math.abs(normalizeBearingDelta(meanEven - meanOdd));
        if (diff < MIN_OPPOSITE_LEG_DEG) return false;
    }

    return true;
}

/**
 * Count bearing reversals where each new leg is roughly opposite direction (~180°) to the previous.
 * Imaging: back-and-forth; circles: same turn direction, so bearing never flips 180°.
 */
export function countZigzagReversals(segment: { lat: number; lon: number }[]): number {
    return findReversalIndices(segment).count;
}

export interface ZigzagPeriod {
    segment: { lat: number; lon: number; timestamp: number }[];
    reversals: number;
}

/**
 * Find a time window in the path with the most zig-zag reversals.
 * Returns the segment and reversal count if reversals >= MIN_REVERSALS, else null.
 */
export function findZigzagPeriod(
    coords: { lat: number; lon: number; timestamp: number }[],
    timeWindowMs: number,
    minReversals: number = MIN_REVERSALS
): ZigzagPeriod | null {
    if (coords.length < 3) return null;

    let best: { segment: typeof coords; reversals: number } | null = null;

    for (let i = 0; i < coords.length; i++) {
        const endIdx = coords.findIndex(
            (c, idx) => idx > i && c.timestamp - coords[i].timestamp > timeWindowMs
        );
        const window = endIdx === -1
            ? coords.slice(i)
            : coords.slice(i, endIdx === -1 ? undefined : endIdx);

        if (window.length < 3) continue;

        const reversals = countZigzagReversals(window);
        if (reversals >= minReversals && (!best || reversals > best.reversals)) {
            best = { segment: window, reversals };
        }
    }

    return best;
}

/** Whether the segment has enough reversals and roughly parallel legs (imaging pattern). */
export function isZigzagPattern(segment: { lat: number; lon: number }[], minReversals: number = MIN_REVERSALS): boolean {
    if (countZigzagReversals(segment) < minReversals) return false;
    return legsAreRoughlyParallel(segment);
}

/**
 * Return only the portion of the segment between the first and last zig-zag reversal.
 * Use this for centroid so location/links reflect the actual imaging pattern, not approach/exit.
 */
export function getZigzagSubSegment<T extends { lat: number; lon: number }>(segment: T[]): T[] {
    const { firstReversalIdx, lastReversalIdx } = findReversalIndices(segment);
    if (firstReversalIdx === null || lastReversalIdx === null || firstReversalIdx >= lastReversalIdx) {
        return segment;
    }
    return segment.slice(firstReversalIdx, lastReversalIdx + 1);
}
