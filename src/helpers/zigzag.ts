import { computeBearing, distanceMeters } from './coordinateUtils';

/** Minimum turn angle (degrees) to count as a leg reversal. Survey turns can be gradual; 70° avoids circles. */
const MIN_TURN_DEG = 70;
/** Minimum number of alternating reversals (parallel legs) for imaging pattern. 3 reversals = 4 legs (survey). */
const MIN_REVERSALS = 3;
/** Minimum leg length in meters (path distance). Ensures back-and-forth is over real distance, not just wiggles. */
const MIN_LEG_DISTANCE_M = 2000;
/** Min ratio of smaller to larger direction distance (so flight is more back-and-forth than one-sided). */
const MIN_DIRECTION_BALANCE_RATIO = 0.4;
/** Turn must be toward opposite direction (not shallow); survey ~180°, circles ~90°. */
const MIN_OPPOSITE_DEG = 80;
/** Max bearing spread (degrees) for legs in the same direction to count as parallel. */
const PARALLEL_TOLERANCE_DEG = 25;
/** Min angle (degrees) between the two leg directions for imaging (should be ~180). */
const MIN_OPPOSITE_LEG_DEG = 150;

/** Number of bearing segments on each side of a turn to compute cumulative direction change (for gradual turns). */
const TURN_WINDOW = 3;
/** Max bearing deviation (deg) from leg mean to count as still on the straight leg; trim turn portions at each end (works for any direction). */
const TRIM_LEG_BEARING_DEG = 35;

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

/** Path distance in meters from point startIdx to point endIdx (inclusive) along segment. */
function pathDistanceM(segment: { lat: number; lon: number }[], startIdx: number, endIdx: number): number {
    let d = 0;
    for (let k = startIdx; k < endIdx && k < segment.length - 1; k++) {
        d += distanceMeters(segment[k].lat, segment[k].lon, segment[k + 1].lat, segment[k + 1].lon);
    }
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
    let lastReversalIdx = -1;

    for (let i = w; i <= bearings.length - w; i++) {
        const beforeMean = circularMeanDeg(bearings.slice(i - w, i));
        const afterMean = circularMeanDeg(bearings.slice(i, i + w));
        const delta = normalizeBearingDelta(afterMean - beforeMean);
        if (Math.abs(delta) < MIN_TURN_DEG) continue;

        const legStartPoint = lastReversalIdx + 1;
        const legEndPoint = i;
        const legDistM = pathDistanceM(segment, legStartPoint, legEndPoint);
        const legLongEnough = legDistM >= MIN_LEG_DISTANCE_M;

        const sign = Math.sign(delta);
        const isFirstOrAlternating = (prevTurnSign === null || (sign !== 0 && sign !== prevTurnSign));
        const oppositeDirection = Math.abs(delta) >= MIN_OPPOSITE_DEG;

        if (isFirstOrAlternating && legLongEnough && oppositeDirection) {
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
 * Total path distance in meters for odd-indexed legs (0,2,4...) and even (1,3,5...).
 * Returns { distanceOddM, distanceEvenM } so we can require back-and-forth is balanced.
 */
function legDistancesByDirection(segment: { lat: number; lon: number }[]): {
    distanceOddM: number;
    distanceEvenM: number;
} {
    const { reversalIndices } = findReversalIndices(segment);
    if (reversalIndices.length === 0) return { distanceOddM: 0, distanceEvenM: 0 };
    const starts = [0, ...reversalIndices.map((r) => r + 1)];
    const ends = [...reversalIndices, segment.length - 1];
    let distanceOddM = 0;
    let distanceEvenM = 0;
    for (let i = 0; i < starts.length && i < ends.length; i++) {
        const d = pathDistanceM(segment, starts[i], ends[i]);
        if (i % 2 === 0) distanceOddM += d;
        else distanceEvenM += d;
    }
    return { distanceOddM, distanceEvenM };
}

/** True if the two directions have substantial and balanced distance (more back-and-forth than one-sided). */
function backAndForthBalanced(segment: { lat: number; lon: number }[]): boolean {
    const { distanceOddM, distanceEvenM } = legDistancesByDirection(segment);
    const total = distanceOddM + distanceEvenM;
    if (total < MIN_LEG_DISTANCE_M * 2) return false;
    const minD = Math.min(distanceOddM, distanceEvenM);
    const maxD = Math.max(distanceOddM, distanceEvenM);
    if (maxD <= 0) return false;
    return minD / maxD >= MIN_DIRECTION_BALANCE_RATIO;
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
 * Find the segment where flight legs are most parallel (best imaging pattern).
 * Uses a sliding variable-length window: for each start, tries window lengths from minWindowMs
 * up to maxWindowMs (stepping by ~2 min), keeps segments with reversals >= minReversals,
 * and returns the one with the highest parallelism score.
 * When minWindowMs === maxWindowMs (e.g. caller passes same value twice), behaves as a fixed-length window.
 * @param maxWindowMs Max window duration (ms).
 * @param minWindowMs Min window duration (ms); default max/4. Set equal to max for fixed window.
 */
export function findZigzagPeriod(
    coords: { lat: number; lon: number; timestamp: number }[],
    maxWindowMs: number,
    minReversals: number = MIN_REVERSALS,
    stride: number = 1,
    minWindowMs: number = Math.floor(maxWindowMs / 4)
): ZigzagPeriod | null {
    if (coords.length < 3) return null;

    const stepMs = minWindowMs >= maxWindowMs ? maxWindowMs + 1 : 2 * 60 * 1000;
    let best: { segment: typeof coords; reversals: number; score: number } | null = null;

    for (let i = 0; i < coords.length; i++) {
        const t0 = coords[i].timestamp;
        let j = i;
        for (let targetDur = minWindowMs; targetDur <= maxWindowMs; targetDur += stepMs) {
            while (j < coords.length && coords[j].timestamp - t0 < targetDur) j++;
            if (j <= i + 1) continue;
            const window = coords.slice(i, j + 1);
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
    if (!backAndForthBalanced(seg)) return false;
    return legsAreRoughlyParallel(seg);
}

/**
 * Trim a leg to only the straight portion (exclude turn at each end).
 * If expectedBearingDeg is provided, trim relative to that (e.g. group direction); otherwise use the leg's mean bearing.
 */
export function trimLegToStraight<T extends { lat: number; lon: number }>(
    leg: T[],
    maxDeviationDeg: number = TRIM_LEG_BEARING_DEG,
    expectedBearingDeg?: number
): T[] {
    if (leg.length < 3) return leg;
    const bearings: number[] = [];
    for (let i = 0; i < leg.length - 1; i++) {
        const a = leg[i];
        const b = leg[i + 1];
        bearings.push(computeBearing(a.lat, a.lon, b.lat, b.lon));
    }
    const legMean = expectedBearingDeg !== undefined ? expectedBearingDeg : circularMeanDeg(bearings);
    let start = 0;
    let end = leg.length - 1;
    while (start < end && start < bearings.length) {
        if (bearingDiff(bearings[start], legMean) <= maxDeviationDeg) break;
        start++;
    }
    while (end > start && end > 0) {
        const segIdx = end - 1;
        if (bearingDiff(bearings[segIdx], legMean) <= maxDeviationDeg) break;
        end--;
    }
    if (end <= start + 1) return leg;
    return leg.slice(start, end + 1);
}

/**
 * Mean bearing for a single leg (0-360). Used to compute group directions.
 */
function legMeanBearing(leg: { lat: number; lon: number }[]): number {
    if (leg.length < 2) return 0;
    const bearings: number[] = [];
    for (let i = 0; i < leg.length - 1; i++) {
        const a = leg[i];
        const b = leg[i + 1];
        bearings.push(computeBearing(a.lat, a.lon, b.lat, b.lon));
    }
    return circularMeanDeg(bearings);
}

/**
 * Trim all legs using the segment's two parallel directions (group A = even legs, group B = odd legs).
 * So the first leg trims the diagonal approach to the first straight survey leg; works for any heading.
 */
export function trimLegsToStraightWithGroupDirection<T extends { lat: number; lon: number }>(
    legs: T[][],
    maxDeviationDeg: number = TRIM_LEG_BEARING_DEG
): T[][] {
    if (legs.length === 0) return legs;
    const means = legs.map((leg) => (leg.length >= 2 ? legMeanBearing(leg) : 0));
    const groupAMeans = means.filter((_, i) => i % 2 === 0).filter((m) => m !== 0);
    const groupBMeans = means.filter((_, i) => i % 2 === 1).filter((m) => m !== 0);
    const dirA = groupAMeans.length > 0 ? circularMeanDeg(groupAMeans) : undefined;
    const dirB = groupBMeans.length > 0 ? circularMeanDeg(groupBMeans) : undefined;
    return legs.map((leg, i) => {
        const expected = i % 2 === 0 ? dirA : dirB;
        return trimLegToStraight(leg, maxDeviationDeg, expected);
    });
}

/**
 * Split segment into legs (portions between reversals). Returns array of point arrays.
 * Leg 0 = from start to first reversal, leg 1 = first reversal to second, etc.
 * When stride > 1, reversals are found on the strided segment (same as detection) and
 * mapped back to full segment so gradual turns are detected and we get 4+ legs for imaging.
 */
export function getLegSegments<T extends { lat: number; lon: number }>(segment: T[], stride: number = 1): T[][] {
    const seg = stridedSegment(segment, stride);
    const { reversalIndices } = findReversalIndices(seg);
    if (reversalIndices.length === 0) return [segment];
    const legs: T[][] = [];
    let start = 0;
    for (const r of reversalIndices) {
        const endIdx = stride > 1 ? Math.min(r * stride + 1, segment.length) : r + 1;
        legs.push(segment.slice(start, endIdx));
        start = stride > 1 ? Math.min(r * stride + 1, segment.length) : r + 1;
    }
    if (start <= segment.length - 1) {
        legs.push(segment.slice(start, segment.length));
    }
    return legs;
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
