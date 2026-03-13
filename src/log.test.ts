import { describe, it, vi, expect } from 'vitest';
import * as log from './log';

describe('log helpers', () => {
    it('call the console wrappers without throwing', () => {
        const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        log.info('info');
        log.success('success');
        log.dim('dim');
        log.warn('warn');
        log.err('err');
        const colored = log.link('http://example.com');

        expect(typeof colored).toBe('string');
        expect(infoSpy).toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        expect(errSpy).toHaveBeenCalled();

        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errSpy.mockRestore();
    });

    it('colors curviness based on threshold', () => {
        const low = log.curvinessColor(100, 1000);
        const mid = log.curvinessColor(600, 1000);
        const high = log.curvinessColor(800, 1000);
        const over = log.curvinessColor(1200, 1000);

        expect(typeof low).toBe('string');
        expect(typeof mid).toBe('string');
        expect(typeof high).toBe('string');
        expect(typeof over).toBe('string');
    });
});

