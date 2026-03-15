import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sqlite3 from 'sqlite3';
import { getRecord } from './aircraftInfo';

describe('aircraftInfo getRecord', () => {
    let tempDbPath: string;
    const originalEnv = process.env.AIRCRAFT_INFO_DB;

    beforeAll(() => {
        tempDbPath = path.join(os.tmpdir(), `aircraft_info_test_${Date.now()}.db`);
        const db = new sqlite3.Database(tempDbPath);
        return new Promise<void>((resolve, reject) => {
            db.run(`
                CREATE TABLE aircraft (
                    icao TEXT NOT NULL PRIMARY KEY,
                    registration TEXT,
                    type TEXT
                )
            `, (err) => {
                if (err) return reject(err);
                db.run(
                    'INSERT INTO aircraft (icao, registration, type) VALUES (?, ?, ?)',
                    ['ABC123', 'N352HP', 'B738'],
                    (err) => {
                        if (err) return reject(err);
                        db.run(
                            'INSERT INTO aircraft (icao, registration, type) VALUES (?, ?, ?)',
                            ['AE4567', null, 'F-16'],
                            (err) => {
                                if (err) return reject(err);
                                db.run(
                                    'INSERT INTO aircraft (icao, registration, type) VALUES (?, ?, ?)',
                                    ['000000', '', ''],
                                    (err) => {
                                        if (err) return reject(err);
                                        db.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    });

    afterAll(() => {
        try {
            if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
        } catch (_) {}
        process.env.AIRCRAFT_INFO_DB = originalEnv;
    });

    beforeEach(() => {
        process.env.AIRCRAFT_INFO_DB = '';
    });

    it('returns null when AIRCRAFT_INFO_DB is not set', async () => {
        process.env.AIRCRAFT_INFO_DB = '';
        expect(await getRecord('ABC123')).toBeNull();
    });

    it('returns null when icao is not in the database', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        expect(await getRecord('NOTFOUND')).toBeNull();
    });

    it('returns registration and type when found', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        const record = await getRecord('ABC123');
        expect(record).not.toBeNull();
        expect(record).toEqual({ registration: 'N352HP', type: 'B738', description: null, operator: null });
    });

    it('normalizes icao to uppercase for lookup', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        const record = await getRecord('abc123');
        expect(record).toEqual({ registration: 'N352HP', type: 'B738', description: null, operator: null });
    });

    it('strips leading ~ from icao', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        const record = await getRecord('~abc123');
        expect(record).toEqual({ registration: 'N352HP', type: 'B738', description: null, operator: null });
    });

    it('returns type only when registration is null in DB', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        const record = await getRecord('AE4567');
        expect(record).toEqual({ registration: null, type: 'F-16', description: null, operator: null });
    });

    it('returns null registration and type when both are empty in DB', async () => {
        process.env.AIRCRAFT_INFO_DB = tempDbPath;
        const record = await getRecord('000000');
        expect(record).toEqual({ registration: null, type: null, description: null, operator: null });
    });
});
