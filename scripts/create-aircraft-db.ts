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
 * JSON format: object with ICAO (hex) keys and values like { r, t, d, m, e, c, o, ... }.
 * We include every key present in the export. Known mappings: r=registration, t=type, d=description,
 * m=manufacturer, e=serial, c=country, o=operator; other keys become columns by name.
 */

import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip') as new (buf?: Buffer) => {
    getEntries: () => Array<{
        entryName: string;
        isDirectory: boolean;
        header: { size: number };
        getData: () => Buffer;
    }>;
};

const MICTRONICS_ZIP_URL = 'https://www.mictronics.de/aircraft-database/indexedDB_old.php';

const argv = process.argv.slice(2);
const jsonPath = argv[0]?.endsWith('.json') ? argv[0] : undefined;
const outPath =
    argv.length === 0
        ? path.join(process.cwd(), 'aircraft_info.db')
        : argv.length === 1
          ? jsonPath
              ? path.join(process.cwd(), 'aircraft_info.db')
              : argv[0]
          : argv[1];

/** JSON key → SQL column name (so we use readable names for known short keys). */
const KEY_TO_COLUMN: Record<string, string> = {
    r: 'registration',
    t: 'type',
    d: 'description',
    m: 'manufacturer',
    e: 'serial',
    c: 'country',
    o: 'operator',
};

function sqlIdent(s: string): string {
    return '`' + s.replace(/`/g, '``') + '`';
}

function buildDb(data: Record<string, Record<string, unknown>>, outputPath: string): void {
    const allKeys = new Set<string>();
    for (const entry of Object.values(data)) {
        if (entry && typeof entry === 'object') {
            for (const k of Object.keys(entry)) {
                if (
                    typeof (entry as Record<string, unknown>)[k] === 'string' ||
                    typeof (entry as Record<string, unknown>)[k] === 'number'
                ) {
                    allKeys.add(k);
                }
            }
        }
    }
    const jsonKeys = [...allKeys].sort();
    const columns = ['icao', ...jsonKeys.map((k) => KEY_TO_COLUMN[k] ?? k)];
    const safeColumns = columns.map((c) => sqlIdent(c));

    const rows: (string | null)[][] = [];
    for (const [icao, entry] of Object.entries(data)) {
        if (!entry || typeof entry !== 'object') continue;
        const key = icao.replace(/^~/, '').toUpperCase();
        const row: (string | null)[] = [key];
        for (const jk of jsonKeys) {
            const v = (entry as Record<string, unknown>)[jk];
            const s = v == null ? null : typeof v === 'string' ? v.trim() || null : String(v).trim() || null;
            row.push(s);
        }
        rows.push(row);
    }

    const db = new sqlite3.Database(outputPath);

    db.serialize(() => {
        db.run('DROP TABLE IF EXISTS aircraft');
        const colDefs = safeColumns
            .map((c, i) => (i === 0 ? `${c} TEXT NOT NULL PRIMARY KEY` : `${c} TEXT`))
            .join(', ');
        db.run(`CREATE TABLE aircraft (${colDefs})`);
        db.run('CREATE UNIQUE INDEX idx_aircraft_icao ON aircraft (icao)');

        const placeholders = columns.map(() => '?').join(', ');
        const insert = db.prepare(
            `INSERT INTO aircraft (${safeColumns.join(', ')}) VALUES (${placeholders})`,
        );
        let done = 0;
        for (let i = 0; i < rows.length; i++) {
            insert.run(rows[i], (err: Error | null) => {
                if (err) console.error(err);
                done++;
                if (done % 100000 === 0) console.log(`Inserted ${done} records...`);
                if (done === rows.length) {
                    insert.finalize();
                    db.close((closeErr) => {
                        if (closeErr) console.error(closeErr);
                        console.log(
                            `Created ${outputPath} with ${rows.length} aircraft. Columns: ${columns.join(', ')}`,
                        );
                    });
                }
            });
        }
        if (rows.length === 0) {
            insert.finalize();
            db.close(() => console.log('No entries; created empty DB.'));
        }
    });
}

async function downloadAndExtract(): Promise<Record<string, Record<string, unknown>>> {
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
        (e: ZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.json'),
    );
    if (jsonFiles.length === 0) throw new Error('No JSON file found in zip');
    const jsonEntry = jsonFiles.sort((a: ZipEntry, b: ZipEntry) => b.header.size - a.header.size)[0];
    console.log(`Using ${jsonEntry.entryName}`);
    const raw = jsonEntry.getData().toString('utf-8');
    return JSON.parse(raw) as Record<string, Record<string, unknown>>;
}

async function main(): Promise<void> {
    let data: Record<string, Record<string, unknown>>;

    if (jsonPath) {
        console.log(`Reading ${jsonPath}...`);
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        data = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    } else if (argv.length <= 1) {
        data = await downloadAndExtract();
    } else {
        console.error(
            'Usage: npx ts-node scripts/create-aircraft-db.ts [path-to-mictronics.json] [output.db]',
        );
        process.exit(1);
    }

    buildDb(data, outPath);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
