/**
 * Check whether points (default: six Utah airports) return aerodromes from your Pelias instance.
 * Run with:
 *   npx ts-node scripts/check-pelias-airport.ts
 *   npx ts-node scripts/check-pelias-airport.ts 41.7881 -111.8509
 *
 * Requires PELIAS_INSTANCE in .env (e.g. http://localhost:4000/v1 or http://pelias-instance:4000/v1).
 */

import 'dotenv/config';
import axios from 'axios';

const AIRPORTS: { name: string; lat: number; lon: number }[] = [
    { name: 'KSLC (Salt Lake City Intl)', lat: 40.7883, lon: -111.9778 },
    { name: 'U42 (South Valley Regional)', lat: 40.6195, lon: -111.9929 },
    { name: 'Provo Airport (KPVU)', lat: 40.219, lon: -111.722 },
    { name: 'Spanish Fork Airport (KSPK)', lat: 40.14194, lon: -111.66333 },
    { name: 'Logan-Cache Airport (LGU)', lat: 41.7881, lon: -111.8509 },
    { name: 'Ogden-Hinckley Airport (KOGD)', lat: 41.19556, lon: -112.01306 },
];

const CATEGORIES = 'aeroway:aerodrome,transport:air:aerodrome';
const RADIUS_KM = '5';

async function checkNearby(base: string, lat: number, lon: number): Promise<{ count: number; firstLabel?: string }> {
    const url = new URL('/v1/nearby', base);
    url.searchParams.set('point.lat', String(lat));
    url.searchParams.set('point.lon', String(lon));
    url.searchParams.set('categories', CATEGORIES);
    url.searchParams.set('size', '10');
    url.searchParams.set('boundary.circle.radius', RADIUS_KM);
    const res = await axios.get(url.toString());
    const features = res.data?.features ?? [];
    const first = features[0];
    const firstLabel = first?.properties?.label ?? first?.properties?.name ?? undefined;
    return { count: features.length, firstLabel };
}

async function main(): Promise<void> {
    const base = process.env.PELIAS_INSTANCE?.trim();
    if (!base) {
        console.error('PELIAS_INSTANCE is not set in .env');
        process.exit(1);
    }

    const latArg = process.argv[2];
    const lonArg = process.argv[3];
    const singlePoint = latArg != null && lonArg != null && !Number.isNaN(parseFloat(latArg)) && !Number.isNaN(parseFloat(lonArg));

    if (singlePoint) {
        const lat = parseFloat(latArg!);
        const lon = parseFloat(lonArg!);
        await runSinglePoint(base, lat, lon);
        return;
    }

    if (latArg != null || lonArg != null) {
        console.error('Usage: npx ts-node scripts/check-pelias-airport.ts [lat] [lon]');
        process.exit(1);
    }

    // Test all airports
    console.log(`Pelias: ${base}`);
    console.log(`Query: /v1/nearby?categories=${CATEGORIES}&boundary.circle.radius=${RADIUS_KM}km\n`);
    let passed = 0;
    let failed = 0;
    for (const apt of AIRPORTS) {
        try {
            const { count, firstLabel } = await checkNearby(base, apt.lat, apt.lon);
            const ok = count > 0;
            if (ok) passed++;
            else failed++;
            const status = ok ? '✓' : '✗';
            const detail = ok ? ` → ${firstLabel ?? 'aerodrome'}` : ' → NOT FOUND (would not filter)';
            console.log(`${status} ${apt.name}: ${count} feature(s)${detail}`);
        } catch (err: unknown) {
            failed++;
            console.log(`✗ ${apt.name}: ${err instanceof Error ? err.message : err}`);
        }
    }
    console.log(`\n${passed}/${AIRPORTS.length} airports returned aerodromes. ${failed} missing.`);
}

async function runSinglePoint(base: string, lat: number, lon: number): Promise<void> {
    console.log(`Checking Pelias at ${base} for point (${lat}, ${lon})...\n`);

    const nearbyUrl = new URL('/v1/nearby', base);
    nearbyUrl.searchParams.set('point.lat', String(lat));
    nearbyUrl.searchParams.set('point.lon', String(lon));
    nearbyUrl.searchParams.set('categories', CATEGORIES);
    nearbyUrl.searchParams.set('size', '10');
    nearbyUrl.searchParams.set('boundary.circle.radius', RADIUS_KM);

    console.log('1) Nearby (categories=aeroway:aerodrome,transport:air:aerodrome, radius=5km):');
    console.log('   ', nearbyUrl.toString());
    try {
        const nearbyRes = await axios.get(nearbyUrl.toString());
        const features = nearbyRes.data?.features ?? [];
        console.log('   Features returned:', features.length);
        features.forEach((f: any, i: number) => {
            const props = f?.properties ?? {};
            const name = props.label ?? props.name ?? props.addendum?.osm?.name ?? '—';
            const cats = props.addendum?.osm?.category ?? props.category ?? [];
            const catList = Array.isArray(cats) ? cats.join(', ') : String(cats);
            console.log(`   [${i + 1}] ${name}`);
            console.log(`       categories/layer: ${catList || (props.layer ?? '—')}`);
        });
        console.log(features.length === 0 ? '   → No aerodromes found.' : '   → Aerodrome(s) found; would filter.');
    } catch (err: any) {
        console.error('   Error:', err.message || err);
    }

    console.log('\n2) Reverse (layers=coarse,venue) at same point:');
    const reverseUrl = new URL('/v1/reverse', base);
    reverseUrl.searchParams.set('point.lat', String(lat));
    reverseUrl.searchParams.set('point.lon', String(lon));
    reverseUrl.searchParams.set('layers', 'coarse,venue');
    console.log('   ', reverseUrl.toString());
    try {
        const reverseRes = await axios.get(reverseUrl.toString());
        const revFeatures = reverseRes.data?.features ?? [];
        console.log('   Features returned:', revFeatures.length);
        revFeatures.slice(0, 3).forEach((f: any, i: number) => {
            const props = f?.properties ?? {};
            const name = props.label ?? props.name ?? '—';
            console.log(`   [${i + 1}] ${name} (layer: ${props.layer ?? '—'})`);
        });
    } catch (err: any) {
        console.error('   Error:', err.message || err);
    }
}

main();
