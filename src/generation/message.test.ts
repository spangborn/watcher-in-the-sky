import { describe, it, expect } from 'vitest';
import { buildCirclingMessage, buildImagingMessage, buildScreenshotAlt } from './message';

const url = 'https://example.com/map?icao=ABC123';

/** Pick first weighted option every time (for deterministic tests). */
const first = () => 0;
/** Pick last weighted option (e.g. 0.999 so last option wins). */
const last = () => 0.999;

describe('buildCirclingMessage', () => {
    it('includes aircraft with unknown registration when no r', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC123' },
            null,
            url
        );
        expect(msg).toContain('Aircraft with unknown registration, hex/ICAO ABC123');
        expect(msg).toContain('is circling');
        expect(msg).toContain(url);
        expect(msg).toMatch(/\nhttps?:\/\//);
    });

    it('includes registration or icao phrase when r is set', () => {
        const msg = buildCirclingMessage(
            { hex: 'A1B2C3', r: 'N352HP' },
            null,
            url
        );
        expect(msg).toMatch(/^(#N352HP is circling|Aircraft with unknown registration, hex\/ICAO A1B2C3, is circling)/);
        expect(msg).toContain(url);
    });

    it('includes call sign when flight differs from registration', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', r: 'N123', flight: 'PAT456' },
            null,
            url
        );
        expect(msg).toContain('call sign #PAT456');
    });

    it('omits call sign when flight equals registration', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', r: 'N123', flight: 'N123' },
            null,
            url
        );
        expect(msg).not.toContain('call sign');
    });

    it('includes operator when set (circling): " operated by X" (no comma so "F-16 operated by USAF" reads cleanly)', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', r: 'N352HP', operator: 'Acme Survey Co' },
            null,
            url
        );
        expect(msg).toContain(' operated by Acme Survey Co');
        expect(msg).toContain('is circling');
        expect(msg).toMatch(/^#N352HP operated by Acme Survey Co is circling\n/);
    });

    it('includes altitude when alt_baro is set', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', alt_baro: 3500 },
            null,
            url
        );
        expect(msg).toContain('at 3500 feet');
    });

    it('omits altitude when alt_baro is ground', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', alt_baro: 'ground' },
            null,
            url
        );
        expect(msg).not.toContain('feet');
    });

    it('includes speed in MPH when gs (knots) is set', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', gs: 100 },
            null,
            url
        );
        expect(msg).toContain('speed');
        expect(msg).toContain('MPH');
        expect(msg).toMatch(/speed \d+ MPH/);
    });

    it('includes squawk when set', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', squawk: '4521' },
            null,
            url
        );
        expect(msg).toContain('squawking 4521');
    });

    it('includes location from reverse geo (locality)', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC' },
            { locality: 'Los Angeles' },
            url
        );
        expect(msg).toContain('circling over Los Angeles');
    });

    it('includes location from neighbourhood and locality', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC' },
            { neighbourhood: 'Silver Lake', locality: 'Los Angeles' },
            url
        );
        expect(msg).toMatch(/circling over (Silver Lake, Los Angeles|Los Angeles|Silver Lake)/);
    });

    it('ends with URL', () => {
        const msg = buildCirclingMessage(
            { hex: 'X', r: 'N1' },
            null,
            'https://link.example/'
        );
        expect(msg).toBe(msg.trim());
        expect(msg.endsWith('https://link.example/')).toBe(true);
    });

    it('handles full optional fields', () => {
        const msg = buildCirclingMessage(
            {
                hex: 'A1B2C3',
                r: 'N352HP',
                flight: 'SKW123',
                alt_baro: 5200,
                gs: 120,
                squawk: '4521',
            },
            { locality: 'Burbank', county: 'Los Angeles' },
            url
        );
        expect(msg).toContain('call sign #SKW123');
        expect(msg).toContain('at 5200 feet');
        expect(msg).toContain('speed');
        expect(msg).toContain('MPH');
        expect(msg).toContain('squawking 4521');
        expect(msg).toContain(url);
    });

    it('uses military phrasing when isMilitary and registration', () => {
        const msg = buildCirclingMessage(
            { hex: 'AE1234', r: '08-1234', isMilitary: true },
            null,
            url
        );
        expect(msg).toContain('#08-1234, a military');
        expect(msg).toContain('is circling');
    });

    it('uses military unknown registration when isMilitary and no r', () => {
        // With no reg we have two options (unknown 1, military unknown 2); use last to pick military
        const msg = buildCirclingMessage(
            { hex: 'AE1234', isMilitary: true },
            null,
            url,
            { random: last }
        );
        expect(msg).toContain('Military aircraft with unknown registration, hex/ICAO AE1234');
    });

    it('uses type with registration when type is set', () => {
        const msg = buildCirclingMessage(
            { hex: 'A1B2C3', r: 'N123', type: 'Cessna 172' },
            null,
            url
        );
        expect(msg).toMatch(/^(#N123 is circling|#N123, a Cessna 172, is circling)/);
    });

    it('uses type with unknown registration when type set and no r', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC', type: 'Boeing 737' },
            null,
            url
        );
        expect(msg).toMatch(/(Boeing 737 with unknown registration, hex\/ICAO ABC|Aircraft with unknown registration, hex\/ICAO ABC)/);
    });

    it('includes landmark when provided in options', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC' },
            { locality: 'LA' },
            url,
            { landmark: { name: 'Dodger Stadium', distanceMiles: 2.1 } }
        );
        expect(msg).toContain('2.1 miles from Dodger Stadium');
    });

    it('includes fire when provided in options', () => {
        const msg = buildCirclingMessage(
            { hex: 'ABC' },
            null,
            url,
            { fire: { name: 'Bobcat Fire', distanceMiles: 5.0 } }
        );
        expect(msg).toContain('5.0 miles from the Bobcat Fire');
    });
});

describe('buildCirclingMessage (deterministic grammar branches)', () => {
    const url = 'https://example.com/map';
    const first = () => 0;
    const last = () => 0.999;

    describe('id_and_type', () => {
        it('exact: registration only when random picks first', () => {
            const msg = buildCirclingMessage(
                { hex: 'A1B2C3', r: 'N352HP' },
                null,
                url,
                { random: first }
            );
            expect(msg).toMatch(/^#N352HP is circling\nhttps?:\/\//);
        });

        it('exact: aircraft with unknown registration when no reg and random picks first', () => {
            const msg = buildCirclingMessage(
                { hex: 'A1B2C3' },
                null,
                url,
                { random: first }
            );
            expect(msg).toMatch(/^Aircraft with unknown registration, hex\/ICAO A1B2C3, is circling\nhttps?:\/\//);
        });

        it('exact: registration + type when type set and first', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', r: 'N123', type: 'Cessna 172' },
                null,
                url,
                { random: first }
            );
            expect(msg).toMatch(/^#N123 is circling\nhttps?:\/\//);
        });

        it('exact: registration, a type when type set and random picks second', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', r: 'N123', type: 'Cessna 172' },
                null,
                url,
                { random: () => 0.76 }
            );
            expect(msg).toMatch(/^#N123, a Cessna 172, is circling\nhttps?:\/\//);
        });

        it('exact: military + registration (first option)', () => {
            const msg = buildCirclingMessage(
                { hex: 'AE1', r: '08-1234', isMilitary: true },
                null,
                url,
                { random: first }
            );
            expect(msg).toMatch(/^#08-1234, a military aircraft, is circling\nhttps?:\/\//);
        });

        it('exact: military + registration + type (second option)', () => {
            const msg = buildCirclingMessage(
                { hex: 'AE1', r: '08-1234', type: 'F-16', isMilitary: true },
                null,
                url,
                { random: () => 0.6 }
            );
            expect(msg).toMatch(/^#08-1234, a military F-16, is circling\nhttps?:\/\//);
        });

        it('exact: type with unknown registration', () => {
            const msg = buildCirclingMessage(
                { hex: 'ABC', type: 'Boeing 737' },
                null,
                url,
                { random: () => 0.6 }
            );
            expect(msg).toMatch(/^Boeing 737 with unknown registration, hex\/ICAO ABC, is circling\nhttps?:\/\//);
        });

        it('exact: military unknown registration', () => {
            const msg = buildCirclingMessage(
                { hex: 'AE1234', isMilitary: true },
                null,
                url,
                { random: last }
            );
            expect(msg).toMatch(/^Military aircraft with unknown registration, hex\/ICAO AE1234, is circling\nhttps?:\/\//);
        });
    });

    describe('location', () => {
        it('exact: neighbourhood, locality when first', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                { neighbourhood: 'Silver Lake', locality: 'Los Angeles', county: 'LA County' },
                url,
                { random: first }
            );
            expect(msg).toContain('circling over Silver Lake, Los Angeles');
        });

        it('exact: locality only when only locality set', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                { locality: 'Burbank' },
                url,
                { random: first }
            );
            expect(msg).toContain('circling over Burbank');
        });

        it('exact: localadmin when no neighbourhood/locality', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                { localadmin: 'Some District', name: 'Place' },
                url,
                { random: () => 0.6 }
            );
            expect(msg).toContain('circling over Some District');
        });

        it('exact: name/label fallback', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                { name: 'Downtown' },
                url,
                { random: last }
            );
            expect(msg).toContain('circling over Downtown');
        });

        it('unknown location when props empty and no name', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                {},
                url,
                { random: first }
            );
            expect(msg).toContain('circling over unknown location');
        });
    });

    describe('optional clauses', () => {
        it('altitude: string number and decimal rounded', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', alt_baro: '3500' },
                null,
                url,
                { random: first }
            );
            expect(msg).toContain('at 3500 feet');
        });

        it('altitude: number rounded', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', alt_baro: 4200.7 },
                null,
                url,
                { random: first }
            );
            expect(msg).toContain('at 4201 feet');
        });

        it('speed: knots to MPH conversion', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', gs: 100 },
                null,
                url,
                { random: first }
            );
            expect(msg).toMatch(/speed 115 MPH/);
        });

        it('landmark distance formatted to one decimal', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                null,
                url,
                { landmark: { name: 'Stadium', distanceMiles: 2.456 }, random: first }
            );
            expect(msg).toContain('2.5 miles from Stadium');
        });

        it('fire distance formatted', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                null,
                url,
                { fire: { name: 'Fire', distanceMiles: 10 }, random: first }
            );
            expect(msg).toContain('10.0 miles from the Fire');
        });
    });

    describe('structure', () => {
        it('exactly one "is circling"', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', r: 'N1', alt_baro: 5000, gs: 90, squawk: '1200' },
                { locality: 'LA' },
                url,
                { random: first }
            );
            const count = (msg.match(/is circling/g) || []).length;
            expect(count).toBe(1);
        });

        it('always ends with newline + url', () => {
            const msg = buildCirclingMessage(
                { hex: 'X' },
                null,
                'https://link.example',
                { random: first }
            );
            expect(msg).toMatch(/\nhttps:\/\/link\.example$/);
        });

        it('no trailing/leading junk', () => {
            const msg = buildCirclingMessage(
                { hex: 'X', r: 'N1' },
                { locality: 'LA' },
                url,
                { random: first }
            );
            expect(msg).toBe(msg.trim());
            expect(msg).not.toMatch(/^\s/);
            expect(msg).not.toMatch(/\s$/);
        });
    });

    describe('edge cases', () => {
        it('minimal: hex only, no location', () => {
            const msg = buildCirclingMessage(
                { hex: 'ABC123' },
                null,
                url,
                { random: first }
            );
            expect(msg).toBe('Aircraft with unknown registration, hex/ICAO ABC123, is circling\n' + url);
        });

        it('all optional parts: location, altitude, speed, squawk, landmark, fire', () => {
            const msg = buildCirclingMessage(
                {
                    hex: 'X',
                    r: 'N1',
                    flight: 'FLT',
                    type: 'B738',
                    alt_baro: 35000,
                    gs: 450,
                    squawk: '7700',
                },
                { neighbourhood: 'N', locality: 'L' },
                url,
                {
                    landmark: { name: 'LM', distanceMiles: 1 },
                    fire: { name: 'Wildfire', distanceMiles: 5 },
                    random: first,
                }
            );
            expect(msg).toContain('#N1, call sign #FLT, is circling over N, L');
            expect(msg).toContain('at 35000 feet');
            expect(msg).toContain('speed');
            expect(msg).toContain('MPH');
            expect(msg).toContain('squawking 7700');
            expect(msg).toContain('1.0 miles from LM');
            expect(msg).toContain('5.0 miles from the Wildfire');
            expect(msg).toContain(url);
        });
    });
});

describe('buildImagingMessage', () => {
    it('includes operator when set (imaging): ", operated by X" (comma for imaging; no-comma only for circling)', () => {
        const msg = buildImagingMessage(
            { hex: 'ABC', r: 'N352HP', operator: 'Acme Survey Co' },
            null,
            url
        );
        expect(msg).toContain(', operated by Acme Survey Co');
        expect(msg).toContain('appears to be on an imaging/survey pattern');
        expect(msg).toMatch(/^#N352HP, operated by Acme Survey Co, appears to be on an imaging\/survey pattern\n/);
        expect(msg).toContain(url);
    });
});

describe('buildScreenshotAlt', () => {
    it('includes flight and location when present', () => {
        const alt = buildScreenshotAlt(
            { locality: 'Salt Lake City' },
            null,
            'N12345'
        );
        expect(alt).toContain('Screenshot of the flight path of N12345');
        expect(alt).toContain('over Salt Lake City');
        expect(alt).toMatch(/\.$/);
    });

    it('includes landmark when present', () => {
        const alt = buildScreenshotAlt(
            { locality: 'LA' },
            { name: 'Currant Creek', distanceMiles: 5.2 },
            'N1'
        );
        expect(alt).toContain('over LA');
        expect(alt).toContain('5.2 miles from Currant Creek');
    });

    it('uses "aircraft" when flight is missing', () => {
        const alt = buildScreenshotAlt(null, null, null);
        expect(alt).toBe('Screenshot of the flight path of aircraft.');
    });
});
