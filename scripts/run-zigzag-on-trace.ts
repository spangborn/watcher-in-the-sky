/**
 * Run zig-zag (imaging) detection on a readsb-style trace JSON file.
 * Trace format: { icao, timestamp (Unix sec), trace: [ [offset_sec, lat, lon, ...], ... ] }
 *
 * High-rate traces are downsampled to ~intervalSec so turns show up as sharp bearing changes
 * (our app sees ~1 point per 20s, so 180° turns appear between consecutive segments).
 *
 * Usage: npx ts-node scripts/run-zigzag-on-trace.ts <path-to-trace.json> [intervalSec] [stride] [windowMin]
 */

import * as fs from 'fs';
import * as path from 'path';
import { TIME_WINDOW } from '../src/constants';
import {
    findZigzagPeriod,
    isZigzagPattern,
    countZigzagReversals,
    getZigzagSubSegment,
} from '../src/helpers/zigzag';
import { calculateCentroid } from '../src/helpers/coordinateUtils';

interface TraceFile {
    icao?: string;
    r?: string;
    timestamp?: number;
    trace: [number, number, number, ...unknown[]][]; // [offset_sec, lat, lon, ...]
}

const DEFAULT_INTERVAL_SEC = 20;

function loadTrace(
    filePath: string,
    intervalSec: number = DEFAULT_INTERVAL_SEC
): { lat: number; lon: number; timestamp: number }[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as TraceFile;
    if (!Array.isArray(data.trace)) throw new Error('Missing or invalid trace array');
    const baseTsSec = typeof data.timestamp === 'number' ? data.timestamp : 0;
    const all = data.trace.map((row) => {
        const [offsetSec, lat, lon] = row;
        return {
            lat: Number(lat),
            lon: Number(lon),
            timestamp: (baseTsSec + Number(offsetSec)) * 1000,
        };
    });
    if (intervalSec <= 0 || all.length <= 1) return all;
    const downsampled: typeof all = [all[0]];
    let lastTs = all[0].timestamp;
    for (let i = 1; i < all.length; i++) {
        if (all[i].timestamp - lastTs >= intervalSec * 1000) {
            downsampled.push(all[i]);
            lastTs = all[i].timestamp;
        }
    }
    return downsampled;
}

function main(): void {
    const filePath = process.argv[2];
    const intervalArg = process.argv[3];
    if (!filePath) {
        console.error('Usage: npx ts-node scripts/run-zigzag-on-trace.ts <path-to-trace.json> [intervalSec]');
        process.exit(1);
    }
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
        console.error('File not found:', resolved);
        process.exit(1);
    }
    const intervalSec = intervalArg != null ? parseInt(intervalArg, 10) : DEFAULT_INTERVAL_SEC;
    const strideArg = process.argv[4];
    const windowMinArg = process.argv[5];
    const stride = strideArg != null ? Math.max(1, parseInt(strideArg, 10)) : 1;
    const windowMin = windowMinArg != null ? parseInt(windowMinArg, 10) : null;
    const windowMs = windowMin != null && !Number.isNaN(windowMin) ? windowMin * 60 * 1000 : TIME_WINDOW;
    if (intervalSec > 0 || stride > 1 || windowMin != null) {
        const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as TraceFile;
        console.log('Raw trace points:', raw.trace?.length ?? 0, '| Interval:', intervalSec, 's', '| Stride:', stride, '| Window:', windowMin != null ? windowMin + ' min' : TIME_WINDOW / 60000 + ' min');
    }

    const coords = loadTrace(resolved, intervalSec);
    console.log('Loaded', coords.length, 'points');
    if (coords.length < 3) {
        console.log('Not enough points for zig-zag detection.');
        process.exit(0);
    }

    const period = findZigzagPeriod(coords, windowMs, undefined, stride);

    if (!period) {
        let maxReversals = 0;
        for (let i = 0; i < coords.length; i++) {
            const endIdx = coords.findIndex(
                (c, idx) => idx > i && c.timestamp - coords[i].timestamp > windowMs
            );
            const window = endIdx === -1 ? coords.slice(i) : coords.slice(i, endIdx);
            if (window.length >= 3) {
                const rev = countZigzagReversals(
                    stride > 1 ? window.filter((_, j) => j % stride === 0) : window
                );
                maxReversals = Math.max(maxReversals, rev);
            }
        }
        console.log('No window with >= 6 reversals. Max reversals in any', windowMs / 60000, 'min window:', maxReversals);
        process.exit(0);
    }

    console.log('Best window: reversals =', period.reversals, 'points =', period.segment.length);
    const passed = isZigzagPattern(period.segment, undefined, stride);
    console.log('Passes isZigzagPattern (parallel legs etc.):', passed);

    if (passed) {
        const sub = getZigzagSubSegment(period.segment, stride);
        const centroid = calculateCentroid(sub);
        console.log('Centroid (lat, lon):', centroid.lat.toFixed(5), centroid.lon.toFixed(5));
    }
}

main();
