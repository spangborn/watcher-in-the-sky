import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./aircraft.db');

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
            } else {
                //console.log('Aircraft removed from history successfully: ', hex);
            }
        });
    });
}