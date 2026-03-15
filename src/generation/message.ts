/**
 * Grammar-style message generation for circling aircraft posts.
 * Weights: militaryregistration=4, registration=3, militaryicao=2, icao=1.
 */

export interface AircraftFields {
    hex: string;
    r?: string | null;
    flight?: string | null;
    /** Aircraft type (e.g. from API "t" or mictronics DB) */
    type?: string | null;
    /** Operator (e.g. from aircraft DB); shown in post when present */
    operator?: string | null;
    /** Military flag (e.g. from API dbFlags & 1) */
    isMilitary?: boolean;
    alt_baro?: number | string | null;
    gs?: number | null;
    squawk?: string | null;
}

export interface ReverseGeoProperties {
    label?: string;
    name?: string;
    locality?: string;
    neighbourhood?: string;
    county?: string;
    localadmin?: string;
}

/** Optional landmark: "X miles from Y" */
export interface LandmarkInfo {
    name: string;
    distanceMiles: number;
}

/** Optional wildfire: "X miles from the Y" */
export interface FireInfo {
    name: string;
    distanceMiles: number;
}

function pickWeighted<T>(options: [T, number][], random: () => number = Math.random): T {
    const total = options.reduce((sum, [, w]) => sum + w, 0);
    let r = random() * total;
    for (const [value, weight] of options) {
        r -= weight;
        if (r <= 0) return value;
    }
    return options[options.length - 1][0];
}

function articleForType(type: string): string {
    const first = type.trim().charAt(0).toLowerCase();
    return /[aeiou]/.test(first) ? 'an' : 'a';
}

/**
 * Id and type phrase per tweet.genx id_and_type rule and WEIGHTS:
 * militaryregistration=4, registration=3, militaryicao=2, icao=1.
 * Registration is emitted as a hashtag (e.g. #N616LM).
 */
function idAndType(ac: AircraftFields, random: () => number = Math.random): string {
    const registration = ac.r?.trim();
    const icao = ac.hex;
    const acType = ac.type?.trim() ?? null;
    const isMilitary = Boolean(ac.isMilitary);
    const options: [string, number][] = [];
    const regTag = registration ? `#${registration}` : '';

    if (isMilitary && registration) {
        options.push([`${regTag}, a military aircraft`, 4]);
        if (acType) options.push([`${regTag}, a military ${acType}`, 4]);
    }
    if (!isMilitary && registration) {
        options.push([regTag, 3]);
        if (acType) options.push([`${regTag}, ${articleForType(acType)} ${acType}`, 3]);
    }
    if (!registration) {
        options.push([`Aircraft with unknown registration, hex/ICAO ${icao}`, 1]);
        if (acType) options.push([`${acType} with unknown registration, hex/ICAO ${icao}`, 1]);
        if (isMilitary) options.push([`Military aircraft with unknown registration, hex/ICAO ${icao}`, 2]);
    }

    if (options.length === 0) return `Aircraft with unknown registration, hex/ICAO ${icao}`;
    return pickWeighted(options, random);
}

/** Location phrase from reverse geo (weighted). */
function locationPhrase(props: ReverseGeoProperties | null, random: () => number = Math.random): string {
    if (!props) return '';
    const n = (props.neighbourhood ?? '').trim();
    const loc = (props.locality ?? '').trim();
    const county = (props.county ?? '').trim();
    const localadmin = (props.localadmin ?? '').trim();
    const name = (props.name ?? '').trim();

    const norm = (s: string) => s.trim().toLowerCase();
    const isDistinct = (a: string, b: string) => a && b && norm(a) !== norm(b);
    const isDistinctOrMissing = (a: string, b: string) => a && (!b || isDistinct(a, b));
    const options: [string, number][] = [];

    // Avoid redundant phrases like "X, X" when Pelias returns matching fields.
    if (n && loc && isDistinct(n, loc)) options.push([`${n}, ${loc}`, 3]);
    if (n && county && isDistinct(n, county)) options.push([`${n}, ${county}`, 3]);
    if (loc) options.push([loc, 3]);
    if (localadmin && isDistinctOrMissing(localadmin, loc)) options.push([localadmin, 1]);
    if (name && isDistinctOrMissing(name, loc) && isDistinctOrMissing(name, localadmin)) options.push([name, 0.5]);

    // De-duplicate identical strings that can still arise via different fields.
    const seen = new Set<string>();
    const deduped = options.filter(([s]) => {
        const k = norm(s);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    if (deduped.length === 0) return name || loc || localadmin || 'unknown location';
    return pickWeighted(deduped, random);
}

/** Optional "call sign #X" if we have a distinct callsign (hashtag) */
/** Operator phrase: for circling use no comma ("F-16 operated by USAF"); for imaging use comma (", operated by X"). */
function operatorPart(ac: AircraftFields, commaBeforeOperated = false): string {
    const op = ac.operator?.trim();
    if (!op) return '';
    return commaBeforeOperated ? `, operated by ${op}` : ` operated by ${op}`;
}

function callSignPart(ac: AircraftFields): string {
    const call = ac.flight?.trim();
    const reg = ac.r?.trim();
    if (!call || call === reg) return '';
    return ` call sign #${call}`;
}

/** Optional "at X feet" (no trailing comma; joined with other clauses) */
function altitudePart(ac: AircraftFields): string {
    const alt = ac.alt_baro;
    if (alt == null || alt === 'ground') return '';
    const n = typeof alt === 'number' ? Math.round(alt) : parseInt(String(alt), 10);
    if (Number.isNaN(n)) return '';
    return ` at ${n} feet`;
}

/** Optional "speed X MPH" (API often gives knots; convert for readability) */
function speedPart(ac: AircraftFields): string {
    const gs = ac.gs;
    if (gs == null || typeof gs !== 'number') return '';
    const mph = Math.round(gs * 1.15078);
    return ` speed ${mph} MPH`;
}

/** Optional "squawking X" */
function squawkPart(ac: AircraftFields): string {
    const sq = ac.squawk;
    if (sq == null || String(sq).trim() === '') return '';
    return ` squawking ${sq}`;
}

function landmarkPart(landmark: LandmarkInfo | null | undefined): string {
    if (!landmark?.name) return '';
    const name = landmark.name.trim();
    const dist = typeof landmark.distanceMiles === 'number'
        ? landmark.distanceMiles.toFixed(1)
        : String(landmark.distanceMiles);
    return ` ${dist} miles from ${name}`;
}

function firePart(fire: FireInfo | null | undefined): string {
    if (!fire?.name) return '';
    const dist = typeof fire.distanceMiles === 'number'
        ? fire.distanceMiles.toFixed(1)
        : String(fire.distanceMiles);
    return ` ${dist} miles from the ${fire.name.trim()}`;
}

/** Collapse multiple spaces to one and trim (fixes API/concatenation spacing). */
function normalizeSpaces(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

/** Optional: provide to get deterministic output (e.g. for tests). 0 = first option, 1 = last. */
export type RandomFn = () => number;

/**
 * Build a circling message:
 * "[id][ call sign X] is circling over [location][ at X feet,][ speed X MPH,][ squawking X,][ landmark][ fire]\nurl"
 */
export function buildCirclingMessage(
    ac: AircraftFields,
    reverseGeoProps: ReverseGeoProperties | null,
    viewMoreUrl: string,
    options?: { landmark?: LandmarkInfo | null; fire?: FireInfo | null; /** For deterministic tests */ random?: RandomFn }
): string {
    const random = options?.random ?? Math.random;
    const id = idAndType(ac, random);
    const call = callSignPart(ac);
    const loc = locationPhrase(reverseGeoProps, random);
    const alt = altitudePart(ac);
    const speed = speedPart(ac);
    const squawk = squawkPart(ac);
    const landmark = landmarkPart(options?.landmark ?? null);
    const fire = firePart(options?.fire ?? null);

    const clauseParts = [alt, speed, squawk].filter(Boolean).join(', ');
    const trailing = [landmark, fire].filter(Boolean).join('').trim();
    const middle = clauseParts + (trailing ? (clauseParts ? ', ' : '') + trailing : '');
    const middleWithSpace = middle ? (middle.startsWith(' ') ? middle : ' ' + middle) : '';
    const idCall = call ? `${id},${call}` : id;
    const idCallOp = idCall + operatorPart(ac);
    const beforeVerb = idCallOp.includes(',') ? ', is circling' : ' is circling';
    const main = loc
        ? `${idCallOp}${beforeVerb} over ${loc}${middleWithSpace}`
        : `${idCallOp}${beforeVerb}${middleWithSpace}`;

    return `${normalizeSpaces(main)}\n${viewMoreUrl}`;
}

/**
 * Build a message for imaging/survey (zig-zag) pattern:
 * "[id][ call sign X] appears to be on an imaging/survey pattern over [location][ at X feet,]...\nurl"
 */
export function buildImagingMessage(
    ac: AircraftFields,
    reverseGeoProps: ReverseGeoProperties | null,
    viewMoreUrl: string,
    options?: { landmark?: LandmarkInfo | null; fire?: FireInfo | null; random?: RandomFn }
): string {
    const random = options?.random ?? Math.random;
    const id = idAndType(ac, random);
    const call = callSignPart(ac);
    const loc = locationPhrase(reverseGeoProps, random);
    const alt = altitudePart(ac);
    const speed = speedPart(ac);
    const squawk = squawkPart(ac);
    const landmark = landmarkPart(options?.landmark ?? null);
    const fire = firePart(options?.fire ?? null);

    const clauseParts = [alt, speed, squawk].filter(Boolean).join(', ');
    const trailing = [landmark, fire].filter(Boolean).join('').trim();
    const middle = clauseParts + (trailing ? (clauseParts ? ', ' : '') + trailing : '');
    const middleWithSpace = middle ? (middle.startsWith(' ') ? middle : ' ' + middle) : '';
    const idCall = call ? `${id},${call}` : id;
    const idCallOp = idCall + operatorPart(ac, true);
    const beforeVerb = idCallOp.includes(',') ? ', appears to be on an imaging/survey pattern' : ' appears to be on an imaging/survey pattern';
    const verb = loc
        ? `${beforeVerb} over ${loc}${middleWithSpace}`
        : `${beforeVerb}${middleWithSpace}`;

    return `${normalizeSpaces(`${idCallOp}${verb}`)}\n${viewMoreUrl}`;
}

/**
 * Build alt text for the screenshot image (includes reverse geocode location and landmark).
 */
export function buildScreenshotAlt(
    reverseGeoProps: ReverseGeoProperties | null,
    landmark: LandmarkInfo | null | undefined,
    flight: string | null | undefined
): string {
    const loc = locationPhrase(reverseGeoProps);
    const flightPart = (flight?.trim()) || 'aircraft';
    let alt = `Screenshot of the flight path of ${flightPart}`;
    if (loc) alt += ` over ${loc}`;
    if (landmark?.name) {
        const dist =
            typeof landmark.distanceMiles === 'number'
                ? landmark.distanceMiles.toFixed(1)
                : String(landmark.distanceMiles);
        alt += `, ${dist} miles from ${landmark.name.trim()}`;
    }
    alt += '.';
    return alt;
}
