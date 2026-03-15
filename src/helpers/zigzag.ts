import { computeBearing } from './coordinateUtils';

/** Minimum turn angle (degrees) to count as a leg reversal. Survey turns can be gradual; 70° avoids circles. */
const MIN_TURN_DEG = 70;
/** Minimum number of alternating reversals (parallel legs) for imaging pattern. 3 reversals = 4 legs (survey). */
const MIN_REVERSALS = 3;
/** Minimum points between reversals (sustained leg); filters tight circuits and noisy tracks. */
const MIN_POINTS_PER_LEG = 3;
/** Turn must be toward opposite direction (not shallow); survey ~180°, circles ~90°. */
const MIN_OPPOSITE_DEG = 80;
/** Max bearing spread (degrees) for legs in the same direction to count as parallel. */
const PARALLEL_TOLERANCE_DEG = 25;
/** Min angle (degrees) between the two leg directions for imaging (should be ~180). */
const MIN_OPPOSITE_LEG_DEG = 150;

/** Number of bearing segments on each side of a turn to compute cumulative direction change (for gradual turns). */
const TURN_WINDOW = 3;

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

/** Max bearing spread (degrees) in an array of leg bearings. */
function maxSpread(arr: number[]): number {
    if (arr.length < 2) return 0;
    let max = 0;
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            max = Math.max(max, bearingDiff(arr[i], arr[j]));
        }
    }
    return max;
}

/**
 * Leg bearings and reversal indices for a segment (for parallelism scoring).
 * Legs are between reversals; odd-indexed legs (0,2,4...) one direction, even (1,3,5...) the other.
 */
function getLegBearings(segment: { lat: number; lon: number }[]): {
    legBearings: number[];
    reversalIndices: number[];
} {
    const { reversalIndices } = findReversalIndices(segment);
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
    return { legBearings, reversalIndices };
}

/**
 * Parallelism score: higher = legs more parallel and opposite (~180°).
 * Uses: low spread in same-direction legs + opposite direction ~180°.
 * Returns -Infinity if too few legs to score.
 */
export function computeParallelismScore(segment: { lat: number; lon: number }[]): number {
    const { legBearings, reversalIndices } = getLegBearings(segment);
    if (reversalIndices.length < 2 || legBearings.length < 2) return -Infinity;

    const oddBearings = legBearings.filter((_, i) => i % 2 === 0);
    const evenBearings = legBearings.filter((_, i) => i % 2 === 1);
    const spreadOdd = maxSpread(oddBearings);
    const spreadEven = maxSpread(evenBearings);
    const meanOdd = circularMeanDeg(oddBearings);
    const meanEven = circularMeanDeg(evenBearings);
    const oppositeAngle = Math.abs(normalizeBearingDelta(meanEven - meanOdd));
    const oppositeError = Math.abs(180 - oppositeAngle);
    return 540 - spreadOdd - spreadEven - oppositeError;
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
 * Uses cumulative bearing change over TURN_WINDOW segments so gradual survey turns are detected.
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

    const w = TURN_WINDOW;
    if (bearings.length < w * 2) return result;

    let prevTurnSign: number | null = null;
    let lastReversalIdx = -MIN_POINTS_PER_LEG - 1;

    for (let i = w; i <= bearings.length - w; i++) {
        const beforeMean = circularMeanDeg(bearings.slice(i - w, i));
        const afterMean = circularMeanDeg(bearings.slice(i, i + w));
        const delta = normalizeBearingDelta(afterMean - beforeMean);
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
    const { legBearings, reversalIndices } = getLegBearings(segment);
    if (reversalIndices.length < 2 || legBearings.length < 2) return true;

    const oddBearings = legBearings.filter((_, i) => i % 2 === 0);
    const evenBearings = legBearings.filter((_, i) => i % 2 === 1);

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

/** Downsample to every stride-th point for bearing computation (makes gradual turns look sharp). */
function stridedSegment<T extends { lat: number; lon: number }>(segment: T[], stride: number): T[] {
    if (stride <= 1) return segment;
    const out: T[] = [];
    for (let i = 0; i < segment.length; i += stride) out.push(segment[i]);
    return out;
}

/**
 * Find the time window where flight legs are most parallel (best imaging pattern).
 * Uses a sliding window: only windows with reversals >= minReversals are considered;
 * among those, the one with the highest parallelism score is returned.
 * @param stride If > 1, downsample to every stride-th point for detection (for high-rate data).
 */
export function findZigzagPeriod(
    coords: { lat: number; lon: number; timestamp: number }[],
    timeWindowMs: number,
    minReversals: number = MIN_REVERSALS,
    stride: number = 1
): ZigzagPeriod | null {
    if (coords.length < 3) return null;

    let best: { segment: typeof coords; reversals: number; score: number } | null = null;

    for (let i = 0; i < coords.length; i++) {
        const endIdx = coords.findIndex(
            (c, idx) => idx > i && c.timestamp - coords[i].timestamp > timeWindowMs
        );
        const window = endIdx === -1
            ? coords.slice(i)
            : coords.slice(i, endIdx === -1 ? undefined : endIdx);

        if (window.length < 3) continue;

        const forDetection = stridedSegment(window, stride);
        if (forDetection.length < 3) continue;

        const reversals = countZigzagReversals(forDetection);
        if (reversals < minReversals) continue;

        const score = computeParallelismScore(forDetection);
        const isBetter =
            !best ||
            score > best.score ||
            (score === best.score && reversals > best.reversals);
        if (isBetter) {
            best = { segment: window, reversals, score };
        }
    }

    if (!best) return null;
    return { segment: best.segment, reversals: best.reversals };
}

/** Whether the segment has enough reversals and roughly parallel legs (imaging pattern). */
export function isZigzagPattern(
    segment: { lat: number; lon: number }[],
    minReversals: number = MIN_REVERSALS,
    stride: number = 1
): boolean {
    const seg = stridedSegment(segment, stride);
    if (seg.length < 3) return false;
    const count = countZigzagReversals(seg);
    if (count < minReversals) return false;
    if (count >= 6) return legsAreRoughlyParallel(seg);
    return true;
}

/**
 * Return only the portion of the segment between the first and last zig-zag reversal.
 * Use this for centroid so location/links reflect the actual imaging pattern, not approach/exit.
 */
export function getZigzagSubSegment<T extends { lat: number; lon: number }>(segment: T[], stride: number = 1): T[] {
    const seg = stridedSegment(segment, stride);
    const { firstReversalIdx, lastReversalIdx } = findReversalIndices(seg);
    if (firstReversalIdx === null || lastReversalIdx === null || firstReversalIdx >= lastReversalIdx) {
        return segment;
    }
    const start = stride > 1 ? firstReversalIdx * stride : firstReversalIdx;
    const end = stride > 1 ? Math.min(lastReversalIdx * stride + 1, segment.length) : lastReversalIdx + 1;
    return segment.slice(start, end);
}
