/**
 * Check whether a given point (default: Logan-Cache Airport) returns an aerodrome
 * from your Pelias instance. Run with:
 *   npx ts-node scripts/check-pelias-airport.ts
 *   npx ts-node scripts/check-pelias-airport.ts 41.7881 -111.8509
 *
 * Requires PELIAS_INSTANCE in .env (e.g. http://localhost:4000/v1 or http://pelias-instance:4000/v1).
 */

import 'dotenv/config';
import axios from 'axios';

const LOGAN_CACHE_LAT = 41.7881;
const LOGAN_CACHE_LON = -111.8509;

async function main(): Promise<void> {
    const base = process.env.PELIAS_INSTANCE?.trim();
    if (!base) {
        console.error('PELIAS_INSTANCE is not set in .env');
        process.exit(1);
    }

    const lat = process.argv[2] ? parseFloat(process.argv[2]) : LOGAN_CACHE_LAT;
    const lon = process.argv[3] ? parseFloat(process.argv[3]) : LOGAN_CACHE_LON;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
        console.error('Usage: npx ts-node scripts/check-pelias-airport.ts [lat] [lon]');
        process.exit(1);
    }

    console.log(`Checking Pelias at ${base} for point (${lat}, ${lon})${lat === LOGAN_CACHE_LAT && lon === LOGAN_CACHE_LON ? ' (Logan-Cache Airport)' : ''}...\n`);

    // 1) Nearby with aerodrome category (what the app uses)
    const nearbyUrl = new URL('/v1/nearby', base);
    nearbyUrl.searchParams.set('point.lat', String(lat));
    nearbyUrl.searchParams.set('point.lon', String(lon));
    nearbyUrl.searchParams.set('categories', 'transport:air:aerodrome');
    nearbyUrl.searchParams.set('size', '10');
    nearbyUrl.searchParams.set('boundary.circle.radius', '5');

    console.log('1) Nearby (categories=transport:air:aerodrome, radius=5km, Pelias max):');
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
            if (props.addendum?.osm) {
                console.log('       addendum.osm:', JSON.stringify(props.addendum.osm).slice(0, 120) + '...');
            }
        });
        if (features.length === 0) {
            console.log('   → No aerodromes found; aircraft near this point would NOT be filtered as "near airport".');
        } else {
            console.log('   → Aerodrome(s) found; aircraft near this point WOULD be filtered.');
        }
    } catch (err: any) {
        console.error('   Error:', err.message || err);
    }

    // 2) Reverse at the same point (to see what Pelias returns for the location)
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
            const layer = props.layer ?? '—';
            console.log(`   [${i + 1}] ${name} (layer: ${layer})`);
        });
    } catch (err: any) {
        console.error('   Error:', err.message || err);
    }

    // 3) Optional: search by name to see if Logan-Cache exists at all
    if (lat === LOGAN_CACHE_LAT && lon === LOGAN_CACHE_LON) {
        console.log('\n3) Search (text=Logan-Cache Airport):');
        const searchUrl = new URL('/v1/search', base);
        searchUrl.searchParams.set('text', 'Logan-Cache Airport');
        searchUrl.searchParams.set('size', '5');
        console.log('   ', searchUrl.toString());
        try {
            const searchRes = await axios.get(searchUrl.toString());
            const searchFeatures = searchRes.data?.features ?? [];
            console.log('   Features returned:', searchFeatures.length);
            searchFeatures.forEach((f: any, i: number) => {
                const props = f?.properties ?? {};
                const name = props.label ?? props.name ?? '—';
                const layer = props.layer ?? '—';
                const cat = (props.addendum?.osm?.category ?? props.category ?? []);
                console.log(`   [${i + 1}] ${name} (layer: ${layer}, category: ${JSON.stringify(cat)})`);
            });
        } catch (err: any) {
            console.error('   Error:', err.message || err);
        }
    }
}

main();
