import { describe, it, expect } from 'vitest';
import { formatLocalTime } from './dateUtils';

describe('formatLocalTime', () => {
    it('formats date as YYYY-MM-DDTHH:mm:ss.sss with zero padding', () => {
        const d = new Date(2024, 0, 2, 3, 4, 5, 6); // Jan=0
        const s = formatLocalTime(d);
        expect(s).toBe('2024-01-02T03:04:05.006');
    });
});

