/**
 * Generate example post messages for manual verification of operator/grammar behavior.
 * Run: npx ts-node scripts/generate-message-examples.ts
 */

import { buildCirclingMessage, buildImagingMessage } from '../src/generation/message';

const url = 'https://example.com/map';
const loc = { locality: 'Ogden', county: 'Weber County' };

/** Pick first weighted option. */
const first = () => 0;
/** Pick last option (e.g. to get "reg + type" id instead of "reg" only). */
const last = () => 0.999;

function line(msg: string): string {
    return msg.split('\n')[0];
}

const examples: { label: string; ac: Parameters<typeof buildCirclingMessage>[0]; hasLocation?: boolean; random?: () => number }[] = [
    // --- Civil, registration only ---
    { label: 'Civil, reg only, no operator', ac: { hex: 'A1B2C3', r: 'N352HP' } },
    { label: 'Civil, reg only, with operator', ac: { hex: 'A1B2C3', r: 'N352HP', operator: 'Acme Survey Co' } },
    { label: 'Civil, reg only, operator + location', ac: { hex: 'A1B2C3', r: 'N352HP', operator: 'Acme Survey Co' }, hasLocation: true },

    // --- Civil, registration + type (first = reg only; last = "reg, a Boeing 737") ---
    { label: 'Civil, reg + type, no operator (id = reg only)', ac: { hex: 'A1B2C3', r: 'N352HP', type: 'Boeing 737' } },
    { label: 'Civil, reg + type, with operator, id=reg only → comma before "operated by"', ac: { hex: 'A1B2C3', r: 'N352HP', type: 'Boeing 737', operator: 'Acme Survey Co' } },
    { label: 'Civil, reg + type + operator, id=reg+type → NO comma ("737 operated by")', ac: { hex: 'A1B2C3', r: 'N352HP', type: 'Boeing 737', operator: 'Acme Survey Co' }, hasLocation: false, random: last },
    { label: 'Civil, reg + type + operator + location', ac: { hex: 'A1B2C3', r: 'N352HP', type: 'Boeing 737', operator: 'Acme Survey Co' }, hasLocation: true },

    // --- Civil, registration + call sign ---
    { label: 'Civil, reg + call sign, no operator', ac: { hex: 'A1B2C3', r: 'N123', flight: 'PAT456' } },
    { label: 'Civil, reg + call sign, with operator', ac: { hex: 'A1B2C3', r: 'N123', flight: 'PAT456', operator: 'Patriot Aviation' } },

    // --- Civil, unknown registration ---
    { label: 'Civil, unknown reg (icao only), no operator', ac: { hex: 'ABC123' } },
    { label: 'Civil, unknown reg, with operator', ac: { hex: 'ABC123', operator: 'Unknown Operator LLC' } },
    { label: 'Civil, unknown reg + type, with operator', ac: { hex: 'ABC123', type: 'Cessna 172', operator: 'Flight School Inc' } },

    // --- Military, registration only ---
    { label: 'Military, reg only, no operator', ac: { hex: 'AE1234', r: '08-1234', isMilitary: true } },
    { label: 'Military, reg only, with operator', ac: { hex: 'AE1234', r: '08-1234', isMilitary: true, operator: 'United States Air Force' } },

    // --- Military, registration + type ---
    { label: 'Military, reg + type, no operator', ac: { hex: 'AE1234', r: '08-1234', type: 'F-16', isMilitary: true } },
    { label: 'Military, reg + type, with operator (no comma before "operated by")', ac: { hex: 'AE1234', r: '08-1234', type: 'F-16', isMilitary: true, operator: 'United States Air Force' } },
    { label: 'Military, reg + type + operator + location', ac: { hex: 'AE1234', r: '08-1234', type: 'F-16', isMilitary: true, operator: 'United States Air Force' }, hasLocation: true },

    // --- Military, unknown registration ---
    { label: 'Military, unknown reg, no operator', ac: { hex: 'AE5678', isMilitary: true } },
    { label: 'Military, unknown reg, with operator', ac: { hex: 'AE5678', isMilitary: true, operator: 'United States Army' } },

    // --- With extra clauses (alt, speed, squawk) ---
    { label: 'Civil, reg + operator + alt', ac: { hex: 'A1B2C3', r: 'N352HP', operator: 'Acme', alt_baro: 5500 } },
    { label: 'Civil, reg + type + operator + alt + speed', ac: { hex: 'A1B2C3', r: 'N352HP', type: 'B738', operator: 'Acme', alt_baro: 5500, gs: 120 } },
];

console.log('================================================================================');
console.log('CIRCLING MESSAGE EXAMPLES');
console.log('================================================================================\n');

for (const ex of examples) {
    const { label, ac, hasLocation, random: exRandom } = ex;
    const msg = buildCirclingMessage(ac, hasLocation ? loc : null, url, { random: exRandom ?? first });
    console.log(`--- ${label} ---`);
    console.log(line(msg));
    console.log('');
}

console.log('================================================================================');
console.log('IMAGING MESSAGE EXAMPLES');
console.log('================================================================================\n');

for (const ex of examples) {
    const { label, ac, hasLocation, random: exRandom } = ex;
    const msg = buildImagingMessage(ac, hasLocation ? loc : null, url, { random: exRandom ?? first });
    console.log(`--- ${label} ---`);
    console.log(line(msg));
    console.log('');
}

console.log('================================================================================');
console.log('OPERATOR COMMA RULE (verify manually)');
console.log('  • Id has NO comma (e.g. just #N352HP)           → use comma: "#N352HP, operated by X"');
console.log('  • Id HAS comma (e.g. #N352HP, a Boeing 737)       → no comma:  "#N352HP, a Boeing 737 operated by X"');
console.log('================================================================================');
