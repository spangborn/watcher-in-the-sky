/**
 * Lookup aircraft registration and type from the Mictronics aircraft database.
 * Use a SQLite DB created from the Mictronics/readsb JSON export (see scripts/create-aircraft-db.ts).
 * Schema: aircraft(icao TEXT PRIMARY KEY, registration TEXT, type TEXT)
 */

import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { AIRCRAFT_INFO_DB } from '../constants';
import { formatLocalTime } from '../helpers/dateUtils';

let db: sqlite3.Database | null = null;
let dbPath: string | null = null;

function getDb(): sqlite3.Database | null {
    const path = process.env.AIRCRAFT_INFO_DB || '';
    if (!path) return null;
    // Reopen if path changed (e.g. in tests)
    if (db && dbPath !== path) {
        db.close();
        db = null;
        dbPath = null;
    }
    if (db) return db;
    dbPath = path;
    try {
        db = new sqlite3.Database(path, sqlite3.OPEN_READONLY);
        return db;
    } catch (e) {
        console.error('Aircraft info DB open failed:', (e as Error).message);
        return null;
    }
}

export interface AircraftRecord {
    registration: string | null;
    type: string | null;
}

/**
 * Look up registration and type by ICAO (hex). Returns null if DB not configured or not found.
 */
export function getRecord(icao: string): Promise<AircraftRecord | null> {
    return new Promise((resolve) => {
        const database = getDb();
        if (!database) {
            resolve(null);
            return;
        }
        const key = icao.replace(/^~/, '').toUpperCase();
        database.get(
            'SELECT registration, type FROM aircraft WHERE icao = ?',
            [key],
            (err: Error | null, row: { registration: string | null; type: string | null } | undefined) => {
                if (err) {
                    console.error('Aircraft info lookup error:', err.message);
                    resolve(null);
                    return;
                }
                if (!row) {
                    resolve(null);
                    return;
                }
                const reg = row.registration?.trim() || null;
                const type = row.type?.trim() || null;
                resolve({ registration: reg, type });
            }
        );
    });
}

export interface AircraftDbStats {
    count: number;
    lastUpdated: string | null;
}

/** Returns row count and last-modified time of the aircraft DB file. Uses same config as app (constants). */
export function getAircraftDbStats(): Promise<AircraftDbStats> {
    if (!AIRCRAFT_INFO_DB) {
        return Promise.resolve({ count: 0, lastUpdated: null });
    }
    const resolvedPath = path.resolve(process.cwd(), AIRCRAFT_INFO_DB);
    return new Promise((resolve) => {
        const database = getDb();
        if (!database) {
            let lastUpdated: string | null = null;
            try {
                if (fs.existsSync(resolvedPath)) {
                    lastUpdated = formatLocalTime(fs.statSync(resolvedPath).mtime);
                }
            } catch {
                // ignore
            }
            resolve({ count: 0, lastUpdated });
            return;
        }
        database.get('SELECT COUNT(*) AS n FROM aircraft', [], (err: Error | null, row: { n: number } | undefined) => {
            if (err || row == null) {
                resolve({ count: 0, lastUpdated: null });
                return;
            }
            let lastUpdated: string | null = null;
            try {
                if (fs.existsSync(resolvedPath)) {
                    lastUpdated = formatLocalTime(fs.statSync(resolvedPath).mtime);
                }
            } catch {
                // ignore
            }
            resolve({ count: row.n, lastUpdated });
        });
    });
}
