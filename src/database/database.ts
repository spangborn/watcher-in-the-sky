import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./aircraft.db');

const POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS aircraft_data (
            hex TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            r TEXT,
            alt_baro REAL,
            lat REAL,
            lon REAL,
            PRIMARY KEY (hex, timestamp)
        );
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS last_posted (
            hex TEXT PRIMARY KEY,
            posted_at INTEGER NOT NULL
        );
    `);
});

export function insertFlightData(
    hex: string,
    timestamp: number,
    r: string | null,
    alt_baro: number | null,
    lat: number | null,
    lon: number | null
): void {
    db.run(
        `INSERT OR IGNORE INTO aircraft_data (hex, timestamp, r, alt_baro, lat, lon) VALUES (?, ?, ?, ?, ?, ?)`,
        [hex, timestamp, r, alt_baro, lat, lon],
        (err: Error | null) => { // Explicitly type `err`
            if (err) console.error('Database insert error:', err.message);
        }
    );
}

export function getRecentCoordinates(hex: string, cutoff: number): Promise<{ lat: number; lon: number; timestamp: number; r: string }[]> {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT lat, lon, timestamp, r FROM aircraft_data WHERE hex = ? AND timestamp >= ? ORDER BY timestamp ASC`,
            [hex, cutoff],
            (err: Error | null, rows: { lat: number; lon: number; timestamp: number; r: string }[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

export function pruneOldRecords(cutoff: number): void {
    db.run(`DELETE FROM aircraft_data WHERE timestamp < ?`, [cutoff], (err: Error | null) => {
        if (err) {
            console.error('Error pruning old records:', err.message);
        } else {
            //console.log('Old records pruned successfully.');
        }
    });
}

export function clearAircraft(hex: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM aircraft_data WHERE hex = ?`, [hex], (err: Error | null) => {
            if (err) {
                console.error('Error removing aircraft from history:', err.message);
            }
            resolve();
        });
    });
}

/** True if this hex was posted within the last 30 minutes. */
export function wasPostedRecently(hex: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT posted_at FROM last_posted WHERE hex = ?`,
            [hex],
            (err: Error | null, row: { posted_at: number } | undefined) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!row) {
                    resolve(false);
                    return;
                }
                resolve(Date.now() - row.posted_at < POST_COOLDOWN_MS);
            }
        );
    });
}

/** Record that this aircraft was just posted (starts 30-min cooldown). */
export function recordPosted(hex: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO last_posted (hex, posted_at) VALUES (?, ?)`,
            [hex, Date.now()],
            (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}