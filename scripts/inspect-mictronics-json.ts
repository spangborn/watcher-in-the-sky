/**
 * One-off: download Mictronics indexedDB_old zip and print JSON structure (fields per entry).
 * Run: npx ts-node scripts/inspect-mictronics-json.ts
 */

const MICTRONICS_ZIP_URL = 'https://www.mictronics.de/aircraft-database/indexedDB_old.php';

async function main(): Promise<void> {
    console.log('Downloading...');
    const res = await fetch(MICTRONICS_ZIP_URL);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require('adm-zip') as new (b: Buffer) => {
        getEntries: () => Array<{
            entryName: string;
            isDirectory: boolean;
            header: { size: number };
            getData: () => Buffer;
        }>;
    };
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const jsonFiles = entries.filter(
        (e: { isDirectory: boolean; entryName: string }) =>
            !e.isDirectory && e.entryName.toLowerCase().endsWith('.json'),
    );
    const jsonEntry = jsonFiles.sort(
        (a: { header: { size: number } }, b: { header: { size: number } }) => b.header.size - a.header.size,
    )[0];
    console.log('Using', jsonEntry.entryName);
    const data = JSON.parse(jsonEntry.getData().toString('utf-8')) as Record<string, unknown>;
    const icaos = Object.keys(data);
    console.log('Total entries:', icaos.length);
    const allKeys = new Set<string>();
    for (let i = 0; i < Math.min(20, icaos.length); i++) {
        const entry = data[icaos[i]];
        if (entry && typeof entry === 'object') {
            Object.keys(entry).forEach((k) => allKeys.add(k));
        }
    }
    console.log('\nAll keys seen in first 20 entries:', [...allKeys].sort());
    console.log('\nFirst 3 full entries:');
    for (let i = 0; i < Math.min(3, icaos.length); i++) {
        const entry = data[icaos[i]];
        console.log(
            JSON.stringify({ icao: icaos[i], ...(typeof entry === 'object' && entry ? entry : {}) }, null, 2),
        );
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
