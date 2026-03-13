/**
 * Look up an aircraft in the Mictronics DB by ICAO (hex).
 * Uses AIRCRAFT_INFO_DB from env (or .env); set it to your DB path if not in data/.
 *
 * Usage:
 *   npx ts-node scripts/lookup-aircraft.ts <icao>
 *   npx ts-node scripts/lookup-aircraft.ts "https://globe.airplanes.live/?icao=abc123&..."
 */

import dotenv from 'dotenv';
import path from 'path';
import sqlite3 from 'sqlite3';

dotenv.config();

const DATA_DIR = (process.env.DATA_DIR || './data').replace(/\/$/, '');
const AIRCRAFT_INFO_DB =
    process.env.AIRCRAFT_INFO_DB !== undefined ? process.env.AIRCRAFT_INFO_DB : path.join(DATA_DIR, 'aircraft_info.db');

function getIcaoFromArg(arg: string): string | null {
    const trimmed = arg.trim();
    if (!trimmed) return null;
    // If it looks like a URL, pull icao= value
    try {
        const url = new URL(trimmed);
        const icao = url.searchParams.get('icao');
        if (icao) return icao.replace(/^~/, '').toUpperCase();
    } catch {
        // not a URL
    }
    return trimmed.replace(/^~/, '').toUpperCase();
}

function main(): void {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: npx ts-node scripts/lookup-aircraft.ts <icao>');
        console.error('   or: npx ts-node scripts/lookup-aircraft.ts "<globe.airplanes.live URL>"');
        console.error('');
        console.error('Set AIRCRAFT_INFO_DB in .env to the path of aircraft_info.db if not in data/');
        process.exit(1);
    }

    const icao = getIcaoFromArg(arg);
    if (!icao) {
        console.error('Could not parse ICAO from argument');
        process.exit(1);
    }

    const dbPath = path.resolve(process.cwd(), AIRCRAFT_INFO_DB);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error(`Cannot open DB at ${dbPath}: ${(err as Error).message}`);
            console.error('Set AIRCRAFT_INFO_DB in .env to the path of your aircraft_info.db');
            process.exit(1);
        }
    });

    db.get(
        'SELECT icao, registration, type FROM aircraft WHERE icao = ?',
        [icao],
        (err: Error | null, row: { icao: string; registration: string | null; type: string | null } | undefined) => {
            db.close();
            if (err) {
                console.error(err.message);
                process.exit(1);
            }
            if (!row) {
                console.log(`No row for ICAO ${icao} in aircraft_info.db`);
                process.exit(0);
            }
            console.log(JSON.stringify({ icao: row.icao, registration: row.registration, type: row.type }, null, 2));
        }
    );
}

main();
