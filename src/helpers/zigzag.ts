import { computeBearing, distanceMeters } from './coordinateUtils';

/** Minimum turn angle (degrees) to count as a leg reversal. Survey turns can be gradual; 70° avoids circles. */
const MIN_TURN_DEG = 70;
/** Minimum number of alternating reversals (parallel legs) for imaging pattern. 3 reversals = 4 legs (survey). */
const MIN_REVERSALS = 3;
/** Minimum leg length in meters (path distance). Ensures back-and-forth is over real distance, not just wiggles. */
const MIN_LEG_DISTANCE_M = 2000;
/**
 * Minimum leg length (m) required *only to count a reversal*.
 * Keep this a bit lower than MIN_LEG_DISTANCE_M so we don't accidentally merge two real survey passes
 * into one "leg" when one pass is shorter (or partially trimmed by turns / sampling).
 *
 * We still enforce MIN_LEG_DISTANCE_M elsewhere (balance, consistency), so this mainly affects leg splitting.
 */
const MIN_REVERSAL_LEG_DISTANCE_M = MIN_LEG_DISTANCE_M;
/** Min ratio of smaller to larger direction distance (so flight is more back-and-forth than one-sided). */
const MIN_DIRECTION_BALANCE_RATIO = 0.4;
/** Turn must be toward opposite direction (not shallow); survey ~180°, circles ~90°. */
const MIN_OPPOSITE_DEG = 80;
/** Max bearing spread (degrees) for legs in the same direction to count as parallel. Legs must be almost completely parallel. */
const PARALLEL_TOLERANCE_DEG = 10;
/** Min angle (degrees) between the two leg directions for imaging (should be ~180). */
const MIN_OPPOSITE_LEG_DEG = 165;
/** Max ratio of longest to shortest leg length (among legs >= MIN_LEG_DISTANCE_M). Rejects one long transit + short wiggles. */
const MAX_LEG_LENGTH_RATIO = 5;
/** Median straight-leg length (m) required for imaging; rejects short wiggles that look parallel. */
const MIN_MEDIAN_LEG_DISTANCE_M = 8000;
/**
 * Imaging survey passes typically alternate directions; adjacent straight legs should mostly be
 * in opposite heading groups (A/B/A/B). Allow a small number of "same direction twice" events
 * for noisy data / missed turns.
 */
const MAX_SAME_DIRECTION_ADJACENT = 1;
/** When checking leg consistency, extend the window by this many points on each side to catch long transit legs. */
const LEG_CHECK_EXTEND_POINTS = 30;

/** Number of bearing segments on each side of a turn to compute cumulative direction change (for gradual turns). */
const TURN_WINDOW = 3;
/** Max bearing deviation (deg) from leg mean to count as still on the straight leg; trim turn portions at each end (works for any direction). */
const TRIM_LEG_BEARING_DEG = 35;
/** When validating on an extended window, pad around chosen window by this much time (ms). */
const VALIDATION_PAD_MS = 2 * 60 * 1000;
/**
 * Imaging/survey patterns should "march" across the area: the turn points progress steadily
 * along the axis perpendicular to the parallel legs (in either direction).
 *
 * These thresholds are intentionally small vs leg length; we just want to reject stationary
 * back-and-forth over the same line or oscillation that doesn't cover new swaths.
 */
const MIN_PERP_STEP_M = 50;
const MIN_PERP_SPAN_M = 400;
/** Minimum separation (m) between adjacent legs to evaluate spacing consistency. */
const MIN_PERP_SPACING_M = 150;
/** Max ratio of largest to smallest adjacent leg spacing along perpendicular axis. */
const MAX_PERP_SPACING_RATIO = 2.5;

const EARTH_RADIUS_M = 6371000;

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

function degToRad(d: number): number {
    return (d * Math.PI) / 180;
}

/**
 * Convert lat/lon to local tangent-plane meters (x east, y north) relative to origin.
 * Equirectangular approximation is fine for our small windows.
 */
function toLocalXYm(
    p: { lat: number; lon: number },
    origin: { lat: number; lon: number }
): { x: number; y: number } {
    const lat0 = degToRad(origin.lat);
    const x = degToRad(p.lon - origin.lon) * Math.cos(lat0) * EARTH_RADIUS_M;
    const y = degToRad(p.lat - origin.lat) * EARTH_RADIUS_M;
    return { x, y };
}

/** Unit vector (east,north) from bearing degrees (0=N,90=E). */
function bearingUnitEN(bearingDeg: number): { ue: number; un: number } {
    const t = degToRad(bearingDeg);
    return { ue: Math.sin(t), un: Math.cos(t) };
}

/**
 * True if turn points progress monotonically along the axis perpendicular to leg direction.
 * Accepts either direction (increasing or decreasing), but rejects backtracking above tolerance.
 */
function progressesPerpendicularToLegs(segment: { lat: number; lon: number }[]): boolean {
    // Use trimmed straight legs and their endpoints as turnpoints.
    const rawLegs = getLegSegments(segment, 1);
    const trimmedLegs = trimLegsToStraightWithGroupDirection(rawLegs);
    if (trimmedLegs.length < 2) return true;

    const usableLegs = trimmedLegs.filter((leg) => {
        if (leg.length < 2) return false;
        let d = 0;
        for (let i = 0; i < leg.length - 1; i++) {
            d += distanceMeters(leg[i].lat, leg[i].lon, leg[i + 1].lat, leg[i + 1].lon);
        }
        return d >= MIN_LEG_DISTANCE_M;
    });
    if (usableLegs.length < 2) return false;

    const bearings = usableLegs.map((leg) => legMeanBearing(leg));
    // Determine axis from one direction cluster (avoid cancellation between opposite headings).
    let meanA = bearings[0]!;
    let meanB = (meanA + 180) % 360;
    let groupA: number[] = [];
    let groupB: number[] = [];
    for (let iter = 0; iter < 2; iter++) {
        groupA = [];
        groupB = [];
        for (const b of bearings) {
            const dA = bearingDiff(b, meanA);
            const dB = bearingDiff(b, meanB);
            (dA <= dB ? groupA : groupB).push(b);
        }
        if (groupA.length > 0) meanA = circularMeanDeg(groupA);
        if (groupB.length > 0) meanB = circularMeanDeg(groupB);
    }
    const axisBearing = meanA;
    const perpBearing = (axisBearing + 90) % 360;
    const perpUnit = bearingUnitEN(perpBearing);

    const origin = segment[Math.floor(segment.length / 2)];
    const turnPoints = usableLegs.map((leg) => leg[leg.length - 1]!);
    if (turnPoints.length < 2) return true;

    const perpCoords = turnPoints.map((p) => {
        const { x, y } = toLocalXYm(p, origin);
        return x * perpUnit.ue + y * perpUnit.un;
    });

    const span = Math.max(...perpCoords) - Math.min(...perpCoords);
    if (span < MIN_PERP_SPAN_M) return false;

    // Determine intended progression direction from significant steps.
    const deltas = perpCoords.slice(1).map((v, i) => v - perpCoords[i]);
    const significant = deltas.filter((d) => Math.abs(d) >= MIN_PERP_STEP_M);
    if (significant.length === 0) return false;

    const direction = Math.sign(significant.reduce((acc, d) => acc + d, 0));
    if (direction === 0) return false;

    for (const d of deltas) {
        if (Math.abs(d) < MIN_PERP_STEP_M) continue;
        if (Math.sign(d) !== direction) return false;
    }

    // Spacing consistency: adjacent perpendicular steps should be reasonably uniform.
    const spacings = deltas
        .map((d) => Math.abs(d))
        .filter((d) => d >= MIN_PERP_SPACING_M);
    if (spacings.length >= 2) {
        const minS = Math.min(...spacings);
        const maxS = Math.max(...spacings);
        if (minS <= 0) return false;
        if (maxS / minS > MAX_PERP_SPACING_RATIO) return false;
    }
    return true;
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

function sliceByTimestamp<T extends { timestamp: number }>(coords: T[], startTs: number, endTs: number): T[] {
    if (coords.length === 0) return coords;
    const s = startTs - VALIDATION_PAD_MS;
    const e = endTs + VALIDATION_PAD_MS;
    return coords.filter((c) => c.timestamp >= s && c.timestamp <= e);
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

    let lastReversalIdx = -1;

    let prevTurnSign: number | null = null;

    for (let i = w; i <= bearings.length - w; i++) {
        const beforeMean = circularMeanDeg(bearings.slice(i - w, i));
        const afterMean = circularMeanDeg(bearings.slice(i, i + w));
        const delta = normalizeBearingDelta(afterMean - beforeMean);
        if (Math.abs(delta) < MIN_TURN_DEG) continue;

        const legStartPoint = lastReversalIdx + 1;
        const legEndPoint = i;
        const legDistM = pathDistanceM(segment, legStartPoint, legEndPoint);
        const legLongEnough = legDistM >= MIN_REVERSAL_LEG_DISTANCE_M;

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

/** Per-leg path distances in meters (between reversals). */
function getLegDistancesM(segment: { lat: number; lon: number }[]): number[] {
    const { reversalIndices } = findReversalIndices(segment);
    if (reversalIndices.length === 0) return [];
    const starts = [0, ...reversalIndices.map((r) => r + 1)];
    const ends = [...reversalIndices, segment.length - 1];
    const out: number[] = [];
    for (let i = 0; i < starts.length && i < ends.length; i++) {
        out.push(pathDistanceM(segment, starts[i], ends[i]));
    }
    return out;
}

/** True if leg lengths are reasonably consistent (imaging has similar-length passes, not one long leg + short wiggles). */
export function legsHaveConsistentLength(segment: { lat: number; lon: number }[]): boolean {
    // Use trimmed straight legs for consistency; turn arcs and missed reversals can skew raw distances.
    const rawLegs = getLegSegments(segment, 1);
    const trimmed = trimLegsToStraightWithGroupDirection(rawLegs);
    const distances = trimmed
        .filter((leg) => leg.length >= 2)
        .map((leg) => {
            let d = 0;
            for (let i = 0; i < leg.length - 1; i++) {
                d += distanceMeters(leg[i].lat, leg[i].lon, leg[i + 1].lat, leg[i + 1].lon);
            }
            return d;
        });
    const qualifying = distances.filter((d) => d >= MIN_LEG_DISTANCE_M);
    if (qualifying.length < 2) return true;
    const minD = Math.min(...qualifying);
    const maxD = Math.max(...qualifying);
    if (minD <= 0) return false;
    return maxD / minD <= MAX_LEG_LENGTH_RATIO;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid]!;
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function legsHaveSufficientMedianLength(segment: { lat: number; lon: number }[]): boolean {
    const rawLegs = getLegSegments(segment, 1);
    const trimmed = trimLegsToStraightWithGroupDirection(rawLegs);
    const distances = trimmed
        .filter((leg) => leg.length >= 2)
        .map((leg) => {
            let d = 0;
            for (let i = 0; i < leg.length - 1; i++) {
                d += distanceMeters(leg[i].lat, leg[i].lon, leg[i + 1].lat, leg[i + 1].lon);
            }
            return d;
        })
        .filter((d) => d >= MIN_LEG_DISTANCE_M);
    if (distances.length < 3) return false;
    return median(distances) >= MIN_MEDIAN_LEG_DISTANCE_M;
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
    // Use trimmed legs so turn arcs don't pollute the bearing spread.
    const rawLegs = getLegSegments(segment, 1);
    if (rawLegs.length < 2) return true;
    const trimmed = trimLegsToStraightWithGroupDirection(rawLegs);
    const usable = trimmed
        .map((leg, i) => {
            if (leg.length < 2) return null;
            // Ignore very short legs; they are often turn artifacts and can skew parallelism.
            let d = 0;
            for (let k = 0; k < leg.length - 1; k++) {
                d += distanceMeters(leg[k].lat, leg[k].lon, leg[k + 1].lat, leg[k + 1].lon);
            }
            if (d < MIN_LEG_DISTANCE_M) return null;
            return { b: legMeanBearing(leg), i };
        })
        .filter((x): x is { b: number; i: number } => x != null && x.b !== 0);
    if (usable.length < 2) return true;

    // Don't rely on leg index parity; if a turn is missed, parity grouping can mix opposite legs.
    // Instead, cluster bearings into two opposite directions.
    const allBearings = usable.map((x) => x.b);
    const clusterTwoOpposite = (bearings: number[]): { a: number[]; b: number[] } => {
        if (bearings.length === 0) return { a: [], b: [] };
        let meanA = bearings[0]!;
        let meanB = (meanA + 180) % 360;
        let groupA: number[] = [];
        let groupB: number[] = [];
        for (let iter = 0; iter < 2; iter++) {
            groupA = [];
            groupB = [];
            for (const brg of bearings) {
                const dA = bearingDiff(brg, meanA);
                const dB = bearingDiff(brg, meanB);
                (dA <= dB ? groupA : groupB).push(brg);
            }
            if (groupA.length > 0) meanA = circularMeanDeg(groupA);
            if (groupB.length > 0) meanB = circularMeanDeg(groupB);
        }
        return { a: groupA, b: groupB };
    };
    const { a: oddBearings, b: evenBearings } = clusterTwoOpposite(allBearings);

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

function legsAlternateDirections(segment: { lat: number; lon: number }[]): boolean {
    const rawLegs = getLegSegments(segment, 1);
    if (rawLegs.length < 4) return true; // need enough legs to say anything meaningful
    const trimmed = trimLegsToStraightWithGroupDirection(rawLegs);

    const usable = trimmed
        .map((leg) => {
            if (leg.length < 2) return null;
            let d = 0;
            for (let i = 0; i < leg.length - 1; i++) {
                d += distanceMeters(leg[i].lat, leg[i].lon, leg[i + 1].lat, leg[i + 1].lon);
            }
            if (d < MIN_LEG_DISTANCE_M) return null;
            return legMeanBearing(leg);
        })
        .filter((b): b is number => b != null && b !== 0);

    if (usable.length < 4) return true;

    // Initialize two opposite clusters from the first bearing.
    let meanA = usable[0]!;
    let meanB = (meanA + 180) % 360;

    // One refinement pass: assign -> recompute means.
    let groupA: number[] = [];
    let groupB: number[] = [];
    for (let iter = 0; iter < 2; iter++) {
        groupA = [];
        groupB = [];
        for (const b of usable) {
            const dA = bearingDiff(b, meanA);
            const dB = bearingDiff(b, meanB);
            (dA <= dB ? groupA : groupB).push(b);
        }
        if (groupA.length > 0) meanA = circularMeanDeg(groupA);
        if (groupB.length > 0) meanB = circularMeanDeg(groupB);
    }

    // Label sequence and count adjacent same-direction events.
    const labels: number[] = usable.map((b) => (bearingDiff(b, meanA) <= bearingDiff(b, meanB) ? 0 : 1));
    let sameAdj = 0;
    for (let i = 1; i < labels.length; i++) {
        if (labels[i] === labels[i - 1]) sameAdj++;
    }
    return sameAdj <= MAX_SAME_DIRECTION_ADJACENT;
}

function lawnMowerPatternFailureReason(segment: { lat: number; lon: number }[]): string | null {
    // Lawn-mower is simply: back-and-forth alternation + a steady perpendicular sweep.
    // Those checks are already implemented (on trimmed straight legs) elsewhere; we keep this
    // helper for clearer failure messages.
    if (!legsAlternateDirections(segment)) return 'legs do not alternate directions (not back-and-forth)';
    if (!progressesPerpendicularToLegs(segment)) return 'no steady perpendicular sweep';
    return null;
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
    /** When set, this segment was used for leg-length validation (extended window). Use for pass/fail so it matches findZigzagPeriod. */
    segmentForValidation?: { lat: number; lon: number; timestamp: number }[];
    reversals: number;
}

/**
 * Validate a found zigzag period. Uses the chosen window for "shape" checks (reversals/parallel/balance)
 * and uses the optionally-extended window for checks that benefit from extra context (leg consistency/sweep).
 * Returns a failure reason string, or null if it passes.
 */
export function zigzagPeriodFailureReason(
    period: ZigzagPeriod,
    minReversals: number = MIN_REVERSALS,
    stride: number = 1
): string | null {
    const seg = stridedSegment(period.segment, stride);
    if (seg.length < 3) return 'too few points';
    const count = countZigzagReversals(seg);
    if (count < minReversals) return `reversals ${count} < ${minReversals}`;
    if (!backAndForthBalanced(seg)) return 'direction not balanced (not enough back-and-forth)';
    if (!legsAreRoughlyParallel(seg)) return 'legs not roughly parallel';
    if (!legsAlternateDirections(seg)) return 'legs do not alternate directions (passes not adjacent)';
    if (!legsHaveSufficientMedianLength(seg)) return 'legs too short (median pass length too small)';
    const validateSeg = stridedSegment(period.segmentForValidation ?? period.segment, stride);
    {
        const lawn = lawnMowerPatternFailureReason(validateSeg);
        if (lawn) return `not a lawn-mower pattern (${lawn})`;
    }
    if (!legsHaveConsistentLength(validateSeg)) return 'leg lengths too inconsistent (not uniform imaging passes)';
    if (!progressesPerpendicularToLegs(validateSeg)) return 'legs do not progress perpendicular to their direction (no steady sweep)';
    return null;
}

/** Downsample to every stride-th point for bearing computation (makes gradual turns look sharp). */
function stridedSegment<T extends { lat: number; lon: number }>(segment: T[], stride: number): T[] {
    // Stride is temporarily disabled: we already time-downsample traces (and bot data is ~10s),
    // and additional striding can erase zig-zag structure and break parallelism checks.
    // Keep the parameter so we can re-enable later without churn.
    return segment;
}

function effectiveStride(stride: number): number {
    // While striding is disabled, treat all callers as if stride === 1 for index mapping.
    // This prevents reversal indices (computed on the "strided" segment) from being mis-mapped
    // into the full segment.
    void stride;
    return 1;
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
    let best: {
        segment: typeof coords;
        segmentForValidation: typeof coords;
        reversals: number;
        score: number;
        endTs: number;
    } | null = null;

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
            // Short windows are more prone to false positives (e.g. a few wiggles on transit).
            // Require more reversals unless the pattern persists for most of the max window.
            const requiredReversals =
                targetDur < maxWindowMs * 0.6 ? Math.max(minReversals, 5) : minReversals;
            if (reversals < requiredReversals) continue;
            if (!legsAreRoughlyParallel(forDetection)) continue;
            if (!backAndForthBalanced(forDetection)) continue;
            const iExt = Math.max(0, i - LEG_CHECK_EXTEND_POINTS);
            const jExt = Math.min(coords.length - 1, j + LEG_CHECK_EXTEND_POINTS);
            const extendedWindow = coords.slice(iExt, jExt + 1);
            // Validate using only the portion of the extended window that overlaps the chosen window,
            // plus a small time pad, so we don't fail due to unrelated transit legs.
            const tStart = window[0]!.timestamp;
            const tEnd = window[window.length - 1]!.timestamp;
            const validationWindow = sliceByTimestamp(extendedWindow, tStart, tEnd);
            const forDetectionExtended = stridedSegment(validationWindow, stride);
            if (!legsHaveConsistentLength(forDetectionExtended)) continue;
            if (!progressesPerpendicularToLegs(forDetectionExtended)) continue;

            const score = computeParallelismScore(forDetection);
            const endTs = window[window.length - 1]!.timestamp;
            // Prefer the most recent qualifying zigzag window (latest end timestamp).
            // Only when windows end at the same time do we fall back to "best geometry" (score/reversals).
            const isBetter =
                !best ||
                endTs > best.endTs ||
                (endTs === best.endTs && (
                    score > best.score ||
                    (score === best.score && reversals > best.reversals)
                ));
            if (isBetter) {
                best = { segment: window, segmentForValidation: validationWindow, reversals, score, endTs };
            }
        }
    }

    if (!best) return null;
    return {
        segment: best.segment,
        segmentForValidation: best.segmentForValidation,
        reversals: best.reversals,
    };
}

/** Reason the segment is not considered a zigzag pattern, or null if it passes. */
export function zigzagFailureReason(
    segment: { lat: number; lon: number }[],
    minReversals: number = MIN_REVERSALS,
    stride: number = 1
): string | null {
    const seg = stridedSegment(segment, stride);
    if (seg.length < 3) return 'too few points';
    const count = countZigzagReversals(seg);
    if (count < minReversals) return `reversals ${count} < ${minReversals}`;
    if (!backAndForthBalanced(seg)) return 'direction not balanced (not enough back-and-forth)';
    if (!legsAreRoughlyParallel(seg)) return 'legs not roughly parallel';
    if (!legsAlternateDirections(seg)) return 'legs do not alternate directions (passes not adjacent)';
    if (!legsHaveSufficientMedianLength(seg)) return 'legs too short (median pass length too small)';
    {
        const lawn = lawnMowerPatternFailureReason(seg);
        if (lawn) return `not a lawn-mower pattern (${lawn})`;
    }
    if (!legsHaveConsistentLength(seg)) return 'leg lengths too inconsistent (not uniform imaging passes)';
    if (!progressesPerpendicularToLegs(seg)) return 'legs do not progress perpendicular to their direction (no steady sweep)';
    return null;
}

/** Whether the segment has enough reversals and roughly parallel legs (imaging pattern). */
export function isZigzagPattern(
    segment: { lat: number; lon: number }[],
    minReversals: number = MIN_REVERSALS,
    stride: number = 1
): boolean {
    return zigzagFailureReason(segment, minReversals, stride) === null;
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
    const s = effectiveStride(stride);
    const seg = stridedSegment(segment, s);
    const { reversalIndices } = findReversalIndices(seg);
    if (reversalIndices.length === 0) return [segment];
    const legs: T[][] = [];
    let start = 0;
    for (const r of reversalIndices) {
        const endIdx = s > 1 ? Math.min(r * s + 1, segment.length) : r + 1;
        legs.push(segment.slice(start, endIdx));
        start = s > 1 ? Math.min(r * s + 1, segment.length) : r + 1;
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
    const s = effectiveStride(stride);
    const seg = stridedSegment(segment, s);
    const { firstReversalIdx, lastReversalIdx } = findReversalIndices(seg);
    if (firstReversalIdx === null || lastReversalIdx === null || firstReversalIdx >= lastReversalIdx) {
        return segment;
    }
    const start = s > 1 ? firstReversalIdx * s : firstReversalIdx;
    const end = s > 1 ? Math.min(lastReversalIdx * s + 1, segment.length) : lastReversalIdx + 1;
    return segment.slice(start, end);
}
