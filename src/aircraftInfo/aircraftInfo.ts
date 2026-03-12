/**
 * Lookup aircraft registration and type from the Mictronics aircraft database.
 * Use a SQLite DB created from the Mictronics/readsb JSON export (see scripts/create-aircraft-db.ts).
 * Schema: aircraft(icao TEXT PRIMARY KEY, registration TEXT, type TEXT)
 */

import sqlite3 from 'sqlite3';

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
