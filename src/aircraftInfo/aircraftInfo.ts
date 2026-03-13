/**
 * Lookup aircraft registration and type from the Mictronics aircraft database.
 * Use a SQLite DB created from the Mictronics/readsb JSON export (see scripts/create-aircraft-db.ts).
 * Schema: aircraft(icao TEXT PRIMARY KEY, registration TEXT, type TEXT, description TEXT)
 */

import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { formatLocalTime } from '../helpers/dateUtils';

let db: sqlite3.Database | null = null;
let dbPath: string | null = null;

/** Resolve path at runtime so tests can override process.env.AIRCRAFT_INFO_DB. Uses DATA_DIR when AIRCRAFT_INFO_DB unset. */
function getPathEnv(): string {
    if (process.env.AIRCRAFT_INFO_DB !== undefined) return process.env.AIRCRAFT_INFO_DB;
    const dataDir = (process.env.DATA_DIR || './data').replace(/\/$/, '');
    return dataDir + '/aircraft_info.db';
}

function getResolvedDbPath(): string {
    const pathEnv = getPathEnv();
    return pathEnv ? path.resolve(process.cwd(), pathEnv) : '';
}

function getDb(): sqlite3.Database | null {
    const pathEnv = getPathEnv();
    if (!pathEnv) {
        if (db) {
            db.close();
            db = null;
            dbPath = null;
        }
        return null;
    }
    const resolvedPath = getResolvedDbPath();
    // Reopen if path changed (e.g. in tests)
    if (db && dbPath !== resolvedPath) {
        db.close();
        db = null;
        dbPath = null;
    }
    if (db) return db;
    dbPath = resolvedPath;
    try {
        db = new sqlite3.Database(resolvedPath, sqlite3.OPEN_READONLY);
        return db;
    } catch (e) {
        console.error('Aircraft info DB open failed:', (e as Error).message);
        return null;
    }
}

export interface AircraftRecord {
    registration: string | null;
    type: string | null;
    /** Full description from DB (e.g. "BLACKSHAPE BS100 Prime"); use for display when available. */
    description: string | null;
}

/**
 * Look up registration, type, and description by ICAO (hex). Returns null if DB not configured or not found.
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
            'SELECT registration, type, description FROM aircraft WHERE icao = ?',
            [key],
            (err: Error | null, row: { registration: string | null; type: string | null; description?: string | null } | undefined) => {
                if (err) {
                    // Old DB may lack description column; fall back to type-only
                    database.get('SELECT registration, type FROM aircraft WHERE icao = ?', [key], (_e: Error | null, r: { registration: string | null; type: string | null } | undefined) => {
                        if (_e || !r) {
                            resolve(null);
                            return;
                        }
                        resolve({
                            registration: r.registration?.trim() || null,
                            type: r.type?.trim() || null,
                            description: null,
                        });
                    });
                    return;
                }
                if (!row) {
                    resolve(null);
                    return;
                }
                const reg = row.registration?.trim() || null;
                const type = row.type?.trim() || null;
                const description = (row.description != null && row.description !== '') ? row.description.trim() || null : null;
                resolve({ registration: reg, type, description });
            }
        );
    });
}

/** Returns the number of rows in the aircraft table, or 0 if DB not configured or unavailable. */
export function getAircraftInfoRowCount(): Promise<number> {
    return new Promise((resolve) => {
        const database = getDb();
        if (!database) {
            resolve(0);
            return;
        }
        database.get('SELECT COUNT(*) AS n FROM aircraft', [], (err: Error | null, row: { n: number } | undefined) => {
            if (err || row == null) {
                resolve(0);
                return;
            }
            resolve(Number(row.n));
        });
    });
}

export interface AircraftDbStats {
    count: number;
    fileSizeBytes: number;
    lastUpdated: string | null;
}

/** Returns row count, file size, and last-modified time of the aircraft DB file. Uses same config as app (env at runtime). */
export function getAircraftDbStats(): Promise<AircraftDbStats> {
    if (!getPathEnv()) {
        return Promise.resolve({ count: 0, fileSizeBytes: 0, lastUpdated: null });
    }
    const resolvedPath = getResolvedDbPath();
    return new Promise((resolve) => {
        const database = getDb();
        if (!database) {
            let lastUpdated: string | null = null;
            let fileSizeBytes = 0;
            try {
                if (fs.existsSync(resolvedPath)) {
                    const stat = fs.statSync(resolvedPath);
                    lastUpdated = formatLocalTime(stat.mtime);
                    fileSizeBytes = stat.size;
                }
            } catch {
                // ignore
            }
            resolve({ count: 0, fileSizeBytes, lastUpdated });
            return;
        }
        database.get('SELECT COUNT(*) AS n FROM aircraft', [], (err: Error | null, row: { n: number } | undefined) => {
            if (err || row == null) {
                resolve({ count: 0, fileSizeBytes: 0, lastUpdated: null });
                return;
            }
            let lastUpdated: string | null = null;
            let fileSizeBytes = 0;
            try {
                if (fs.existsSync(resolvedPath)) {
                    const stat = fs.statSync(resolvedPath);
                    lastUpdated = formatLocalTime(stat.mtime);
                    fileSizeBytes = stat.size;
                }
            } catch {
                // ignore
            }
            resolve({ count: row.n, fileSizeBytes, lastUpdated });
        });
    });
}
