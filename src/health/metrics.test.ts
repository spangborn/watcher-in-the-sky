import { describe, it, expect } from 'vitest';
import { metrics, incrementCircling, incrementZigzag, increment429, incrementNon429 } from './metrics';

describe('metrics', () => {
    it('increments circling and zigzag counters', () => {
        const startCircling = metrics.circlingDetected;
        const startZigzag = metrics.zigzagDetected;
        incrementCircling();
        incrementCircling();
        incrementZigzag();
        expect(metrics.circlingDetected).toBe(startCircling + 2);
        expect(metrics.zigzagDetected).toBe(startZigzag + 1);
    });

    it('increments 429 and non-429 error counters', () => {
        const start429 = metrics.errors429;
        const startNon429 = metrics.errorsNon429;
        increment429();
        incrementNon429();
        incrementNon429();
        expect(metrics.errors429).toBe(start429 + 1);
        expect(metrics.errorsNon429).toBe(startNon429 + 2);
    });

    it('has a startedAt date set', () => {
        expect(metrics.startedAt instanceof Date).toBe(true);
    });
});

