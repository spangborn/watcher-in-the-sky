/**
 * Render a readsb-style trace JSON to an SVG image of the flight path.
 * Optionally highlights the zigzag detection window (same params as run-zigzag-on-trace).
 *
 * Usage: npx ts-node scripts/render-trace-to-svg.ts <path-to-trace.json> [output.svg] [stride] [windowMin]
 */

import * as fs from 'fs';
import * as path from 'path';
import { TIME_WINDOW } from '../src/constants';
import { findZigzagPeriod, getZigzagSubSegment, trimLegsToStraightWithGroupDirection } from '../src/helpers/zigzag';
import { calculateCentroid, computeBearing, distanceMeters } from '../src/helpers/coordinateUtils';

interface TraceFile {
    icao?: string;
    timestamp?: number;
    trace: [number, number, number, ...unknown[]][];
}

const PAD_PCT = 0.08;
const WIDTH = 900;
const HEIGHT = 600;

/** Web Mercator (EPSG:3857), same as airplanes.live / OpenStreetMap / Mapbox. */
const WGS84_R = 6378137;
function latLonToWebMercator(lat: number, lon: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const x = WGS84_R * lonRad;
    const y = WGS84_R * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    return { x, y };
}

function loadTrace(filePath: string): { lat: number; lon: number; timestamp: number }[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as TraceFile;
    if (!Array.isArray(data.trace)) throw new Error('Missing or invalid trace array');
    const baseTsSec = typeof data.timestamp === 'number' ? data.timestamp : 0;
    return data.trace.map((row) => {
        const [offsetSec, lat, lon] = row;
        return {
            lat: Number(lat),
            lon: Number(lon),
            timestamp: (baseTsSec + Number(offsetSec)) * 1000,
        };
    });
}

function downsampleByInterval(
    coords: { lat: number; lon: number; timestamp: number }[],
    intervalSec: number
): { lat: number; lon: number; timestamp: number }[] {
    if (intervalSec <= 0 || coords.length <= 1) return coords;
    const out: typeof coords = [coords[0]];
    let lastTs = coords[0].timestamp;
    for (let i = 1; i < coords.length; i++) {
        if (coords[i].timestamp - lastTs >= intervalSec * 1000) {
            out.push(coords[i]);
            lastTs = coords[i].timestamp;
        }
    }
    return out;
}

/** Bounds in Web Mercator (meters). */
function mercatorBounds(points: { lat: number; lon: number }[]): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const p of points) {
        const { x, y } = latLonToWebMercator(p.lat, p.lon);
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
    }
    return { xMin, xMax, yMin, yMax };
}

/** Fit mercator bounds into viewport with uniform scale (preserve aspect, no stretch). */
function fitMercatorToViewport(
    b: { xMin: number; xMax: number; yMin: number; yMax: number },
    width: number,
    height: number
): { scale: number; centerX: number; centerY: number } {
    const padX = (b.xMax - b.xMin) * PAD_PCT || 1;
    const padY = (b.yMax - b.yMin) * PAD_PCT || 1;
    const rangeX = (b.xMax + padX) - (b.xMin - padX);
    const rangeY = (b.yMax + padY) - (b.yMin - padY);
    const scale = Math.min(width / rangeX, height / rangeY);
    const centerX = (b.xMin + b.xMax) / 2;
    const centerY = (b.yMin + b.yMax) / 2;
    return { scale, centerX, centerY };
}

/** Map lat/lon to SVG coords: Web Mercator + uniform scale + center (matches map shape). */
function latLonToXY(
    lat: number,
    lon: number,
    fit: { scale: number; centerX: number; centerY: number },
    width: number,
    height: number
): { x: number; y: number } {
    const { x: mx, y: my } = latLonToWebMercator(lat, lon);
    const x = width / 2 + (mx - fit.centerX) * fit.scale;
    const y = height / 2 - (my - fit.centerY) * fit.scale;
    return { x, y };
}

function pathToPoints(
    seg: { lat: number; lon: number }[],
    fit: { scale: number; centerX: number; centerY: number }
): string {
    return seg
        .map((p) => latLonToXY(p.lat, p.lon, fit, WIDTH, HEIGHT))
        .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
}

function bearingDiff(b1: number, b2: number): number {
    let d = Math.abs(b1 - b2);
    if (d > 180) d = 360 - d;
    return d;
}

/**
 * For visualization, we want to show each straight survey "pass" as its own leg.
 * The detector's reversal logic intentionally ignores some turns (e.g. too short / too gradual),
 * which can merge two passes into one. This splitter is render-only and more permissive.
 */
function splitIntoLegsForRender(segment: { lat: number; lon: number }[]): { lat: number; lon: number }[][] {
    if (segment.length < 3) return [segment];
    const MIN_LEG_M = 1200;
    const TURN_WINDOW = 3;
    const MIN_TURN_DIFF_DEG = 110;

    const splitIdxs: number[] = [];
    let lastSplit = 0;

    const pathDistSince = (fromIdx: number, toIdx: number): number => {
        let d = 0;
        for (let k = fromIdx; k < toIdx && k < segment.length - 1; k++) {
            d += distanceMeters(segment[k].lat, segment[k].lon, segment[k + 1].lat, segment[k + 1].lon);
        }
        return d;
    };

    const bearings: number[] = [];
    for (let i = 0; i < segment.length - 1; i++) {
        bearings.push(computeBearing(segment[i].lat, segment[i].lon, segment[i + 1].lat, segment[i + 1].lon));
    }

    const circMean = (arr: number[]): number => {
        let s = 0, c = 0;
        for (const d of arr) {
            const r = (d * Math.PI) / 180;
            s += Math.sin(r);
            c += Math.cos(r);
        }
        const rad = Math.atan2(s / arr.length, c / arr.length);
        return ((rad * 180) / Math.PI + 360) % 360;
    };

    for (let i = TURN_WINDOW; i <= bearings.length - TURN_WINDOW; i++) {
        const before = circMean(bearings.slice(i - TURN_WINDOW, i));
        const after = circMean(bearings.slice(i, i + TURN_WINDOW));
        if (bearingDiff(before, after) < MIN_TURN_DIFF_DEG) continue;
        if (pathDistSince(lastSplit, i) < MIN_LEG_M) continue;
        splitIdxs.push(i);
        lastSplit = i;
    }

    if (splitIdxs.length === 0) return [segment];
    const legs: { lat: number; lon: number }[][] = [];
    let start = 0;
    for (const idx of splitIdxs) {
        legs.push(segment.slice(start, idx + 1));
        start = idx;
    }
    if (start < segment.length - 1) legs.push(segment.slice(start));
    return legs.filter((l) => l.length >= 2);
}

function main(): void {
    const filePath = process.argv[2];
    const outPath = process.argv[3] || null;
    const strideArg = process.argv[4];
    const windowMinArg = process.argv[5];
    if (!filePath) {
        console.error('Usage: npx ts-node scripts/render-trace-to-svg.ts <trace.json> [output.svg] [stride] [windowMin]');
        process.exit(1);
    }
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
        console.error('File not found:', resolved);
        process.exit(1);
    }

    const stride = strideArg != null ? Math.max(1, parseInt(strideArg, 10)) : 5;
    const windowMin = windowMinArg != null ? parseInt(windowMinArg, 10) : 60;
    const windowMs = windowMin * 60 * 1000;

    // Match the bot-like 10s cadence used by the trace harness.
    const coords = downsampleByInterval(loadTrace(resolved), 10);
    if (coords.length < 2) {
        console.error('Not enough points in trace.');
        process.exit(1);
    }

    // Dynamic window; additional false-positive protection is handled inside findZigzagPeriod.
    const period = findZigzagPeriod(coords, windowMs, undefined, stride);
    let zigzagSegment = period?.segment ?? null;
    if (zigzagSegment && zigzagSegment.length > 0) {
        const t0 = zigzagSegment[0].timestamp;
        const tLast = zigzagSegment[zigzagSegment.length - 1].timestamp;
        const startIdx = coords.findIndex((c) => c.timestamp === t0);
        const endIdx = coords.findIndex((c) => c.timestamp === tLast);
        if (startIdx >= 0 && endIdx >= 0) {
            const extendBack = Math.min(250, startIdx);
            const extendForward = Math.min(250, coords.length - 1 - endIdx);
            zigzagSegment = coords.slice(
                startIdx - extendBack,
                endIdx + extendForward + 1
            );
        }
    }
    // For rendering, prefer the best detected window itself. `getZigzagSubSegment` relies on the
    // stricter reversal logic (intended for classification) and can drop/merge legs we want to visualize.
    const legBaseSegment = period ? period.segment : null;
    const centroid = legBaseSegment && legBaseSegment.length > 0 ? calculateCentroid(legBaseSegment) : null;

    // Render-only leg splitting + aggressive trimming to straight portions.
    const rawLegs = legBaseSegment ? splitIntoLegsForRender(legBaseSegment) : [];
    const TRIM_DEG_FOR_RENDER = 15;
    // Only show meaningful survey passes as "legs" in the overlay.
    const MIN_RENDER_LEG_M = 8000;
    const legSegments = trimLegsToStraightWithGroupDirection(rawLegs, TRIM_DEG_FOR_RENDER)
        .filter((leg) => leg.length >= 2)
        .filter((leg) => {
            let d = 0;
            for (let i = 0; i < leg.length - 1; i++) {
                d += distanceMeters(leg[i].lat, leg[i].lon, leg[i + 1].lat, leg[i + 1].lon);
            }
            return d >= MIN_RENDER_LEG_M;
        });

    const drawBounds = zigzagSegment && zigzagSegment.length > 0 ? mercatorBounds(zigzagSegment) : mercatorBounds(coords);
    const fit = fitMercatorToViewport(drawBounds, WIDTH, HEIGHT);
    const pt = (lat: number, lon: number) => latLonToXY(lat, lon, fit, WIDTH, HEIGHT);

    const fullPathPoints = pathToPoints(coords, fit);
    const start = pt(coords[0].lat, coords[0].lon);
    const end = pt(coords[coords.length - 1].lat, coords[coords.length - 1].lon);

    const LEG_COLOR_A = '#1a73e8';
    const LEG_COLOR_B = '#ea4335';
    const legPolylines = legSegments
        .map((leg, i) => {
            const points = pathToPoints(leg, fit);
            const color = i % 2 === 0 ? LEG_COLOR_A : LEG_COLOR_B;
            return `<polyline fill="none" stroke="${color}" stroke-width="3" points="${points}" />`;
        })
        .join('\n  ');

    const legLabels = legSegments
        .map((leg, i) => {
            if (leg.length === 0) return '';
            const mid = Math.floor(leg.length / 2);
            const { lat, lon } = leg[mid];
            const { x, y } = pt(lat, lon);
            return `<text x="${x}" y="${y}" font-size="14" font-weight="bold" fill="#111" stroke="#fff" stroke-width="2" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
        })
        .filter(Boolean)
        .join('\n  ');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <title>Flight path ${path.basename(filePath)}</title>
  <style>
    .full-path { fill: none; stroke: #ccc; stroke-width: 1.5; }
    .start { fill: #0f9d58; }
    .end { fill: #d93025; }
    .centroid { fill: #f9ab00; stroke: #333; stroke-width: 1; }
  </style>
  <!-- Full path (faded) -->
  <polyline class="full-path" points="${fullPathPoints}" />
  <!-- Legs (alternating colors with count) -->
  ${legPolylines}
  ${legLabels}
  <!-- Start (green) / End (red) -->
  <circle class="start" cx="${start.x}" cy="${start.y}" r="6" />
  <circle class="end" cx="${end.x}" cy="${end.y}" r="6" />
  ${centroid ? `<!-- Centroid -->\n  <circle class="centroid" cx="${pt(centroid.lat, centroid.lon).x}" cy="${pt(centroid.lat, centroid.lon).y}" r="8" />` : ''}
</svg>`;

    const out = outPath
        ? path.resolve(process.cwd(), outPath)
        : path.join(path.dirname(resolved), `flight_path_${path.basename(filePath, '.json')}.svg`);
    fs.writeFileSync(out, svg, 'utf-8');
    console.log('Wrote', out);
}

main();
