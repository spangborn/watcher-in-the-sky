/**
 * Create the aircraft info SQLite DB from a Mictronics/readsb JSON export.
 *
 * With no args: downloads and extracts the zip from Mictronics, then builds the DB.
 * With a path: uses that JSON file (e.g. already-extracted).
 *
 * Usage:
 *   npx ts-node scripts/create-aircraft-db.ts
 *   npx ts-node scripts/create-aircraft-db.ts [output.db]
 *   npx ts-node scripts/create-aircraft-db.ts path/to/aircraft.json [output.db]
 *
 * JSON format: object with ICAO (hex) keys and values like { r: "N12345", d: "B738" }
 * (r = registration, d = type/description).
 */

import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as new (buf?: Buffer) => {
    getEntries: () => Array<{ entryName: string; isDirectory: boolean; header: { size: number }; getData: () => Buffer }>;
};

const MICTRONICS_ZIP_URL = 'https://www.mictronics.de/aircraft-database/indexedDB_old.php';

const argv = process.argv.slice(2);
const jsonPath = argv[0]?.endsWith('.json') ? argv[0] : undefined;
const outPath = argv.length === 0
    ? path.join(process.cwd(), 'aircraft_info.db')
    : argv.length === 1
        ? (jsonPath ? path.join(process.cwd(), 'aircraft_info.db') : argv[0])
        : argv[1];

interface MictronicsEntry {
    r?: string;
    d?: string;
    t?: string;
}

function buildDb(data: Record<string, MictronicsEntry>, outputPath: string): void {
    const entries: [string, string | null, string | null][] = [];
    for (const [icao, entry] of Object.entries(data)) {
        if (!entry || typeof entry !== 'object') continue;
        const reg = (entry.r ?? '').trim() || null;
        const type = (entry.d ?? entry.t ?? '').trim() || null;
        const key = icao.replace(/^~/, '').toUpperCase();
        entries.push([key, reg, type]);
    }

    const db = new sqlite3.Database(outputPath);

    db.serialize(() => {
        db.run('DROP TABLE IF EXISTS aircraft');
        db.run(`
            CREATE TABLE aircraft (
                icao TEXT NOT NULL PRIMARY KEY,
                registration TEXT,
                type TEXT
            )
        `);
        db.run('CREATE UNIQUE INDEX idx_aircraft_icao ON aircraft (icao)');

        const insert = db.prepare(
            'INSERT INTO aircraft (icao, registration, type) VALUES (?, ?, ?)'
        );
        let done = 0;
        for (let i = 0; i < entries.length; i++) {
            const [key, reg, type] = entries[i];
            insert.run(key, reg, type, (err: Error | null) => {
                if (err) console.error(err);
                done++;
                if (done % 100000 === 0) console.log(`Inserted ${done} records...`);
                if (done === entries.length) {
                    insert.finalize();
                    db.close((closeErr) => {
                        if (closeErr) console.error(closeErr);
                        console.log(`Created ${outputPath} with ${entries.length} aircraft. Set AIRCRAFT_INFO_DB=${outputPath} in .env`);
                    });
                }
            });
        }
        if (entries.length === 0) {
            insert.finalize();
            db.close(() => console.log('No entries; created empty DB.'));
        }
    });
}

async function downloadAndExtract(): Promise<Record<string, MictronicsEntry>> {
    console.log('Downloading Mictronics aircraft database...');
    const res = await fetch(MICTRONICS_ZIP_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    interface ZipEntry {
        entryName: string;
        isDirectory: boolean;
        header: { size: number };
        getData(): Buffer;
    }
    const jsonFiles = entries.filter(
        (e: ZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.json')
    );
    if (jsonFiles.length === 0) throw new Error('No JSON file found in zip');
    const jsonEntry = jsonFiles.sort(
        (a: ZipEntry, b: ZipEntry) => b.header.size - a.header.size
    )[0];
    console.log(`Using ${jsonEntry.entryName}`);
    const raw = jsonEntry.getData().toString('utf-8');
    return JSON.parse(raw) as Record<string, MictronicsEntry>;
}

async function main(): Promise<void> {
    let data: Record<string, MictronicsEntry>;

    if (jsonPath) {
        console.log(`Reading ${jsonPath}...`);
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        data = JSON.parse(raw) as Record<string, MictronicsEntry>;
    } else if (argv.length <= 1) {
        data = await downloadAndExtract();
    } else {
        console.error('Usage: npx ts-node scripts/create-aircraft-db.ts [path-to-mictronics.json] [output.db]');
        process.exit(1);
    }

    buildDb(data, outPath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
