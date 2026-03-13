import { computeBearing } from './coordinateUtils';

/** Minimum turn angle (degrees) to count as a leg reversal. Imaging uses ~180°; circuits use ~90°. */
const MIN_TURN_DEG = 120;
/** Minimum number of alternating reversals (parallel legs) for imaging pattern. 5 reversals = 6 legs. */
const MIN_REVERSALS = 5;
/** Minimum points between reversals (sustained leg); filters tight circuits. */
const MIN_POINTS_PER_LEG = 6;
/** Turn must be near 180° (opposite direction); circles have ~90° turns. */
const MIN_OPPOSITE_DEG = 140;

/**
 * Normalize bearing difference to -180..180.
 */
function normalizeBearingDelta(delta: number): number {
    let d = delta;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
}

interface ReversalIndices {
    count: number;
    firstReversalIdx: number | null;
    lastReversalIdx: number | null;
}

/**
 * Find reversal indices: count and first/last point indices where direction flips (~180°).
 */
function findReversalIndices(segment: { lat: number; lon: number }[]): ReversalIndices {
    const result: ReversalIndices = { count: 0, firstReversalIdx: null, lastReversalIdx: null };
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
            result.count++;
            lastReversalIdx = i;
        }
        prevTurnSign = sign;
    }

    return result;
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

/** Whether the segment has enough reversals to be considered an imaging/zig-zag pattern. */
export function isZigzagPattern(segment: { lat: number; lon: number }[], minReversals: number = MIN_REVERSALS): boolean {
    return countZigzagReversals(segment) >= minReversals;
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
