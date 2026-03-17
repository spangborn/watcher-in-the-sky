/**
 * One-off: add missing `description` column to aircraft_info.db so it matches
 * the schema expected by the app (create-aircraft-db.ts and aircraftInfo.ts).
 * Safe to run on DBs that already have the column.
 *
 * Usage: npx ts-node scripts/add-description-column.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import sqlite3 from 'sqlite3';

dotenv.config();

const DATA_DIR = (process.env.DATA_DIR || './data').replace(/\/$/, '');
const AIRCRAFT_INFO_DB =
    process.env.AIRCRAFT_INFO_DB !== undefined
        ? process.env.AIRCRAFT_INFO_DB
        : path.join(DATA_DIR, 'aircraft_info.db');

function main(): void {
    const dbPath = path.resolve(process.cwd(), AIRCRAFT_INFO_DB);
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error(`Cannot open DB at ${dbPath}: ${(err as Error).message}`);
            process.exit(1);
        }
    });

    db.run('ALTER TABLE aircraft ADD COLUMN description TEXT', (err) => {
        if (err) {
            if ((err as Error).message.includes('duplicate column name')) {
                console.log('Column "description" already exists. Nothing to do.');
            } else {
                console.error((err as Error).message);
                process.exit(1);
            }
        } else {
            console.log('Added column "description" to aircraft table.');
        }
        db.close();
    });
}

main();
