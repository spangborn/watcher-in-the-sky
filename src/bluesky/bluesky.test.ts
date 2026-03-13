import { describe, it, expect, vi } from 'vitest';
import { postToBluesky } from './bluesky';
import * as constants from '../constants';

describe('postToBluesky', () => {
    it('returns true in dry-run mode and does not throw', async () => {
        const dryRunSpy = vi.spyOn(constants, 'BLUESKY_DRY_RUN', 'get').mockReturnValue(true);
        const ok = await postToBluesky({ flight: 'FLT' }, 'msg');
        expect(ok).toBe(true);
        dryRunSpy.mockRestore();
    });
});

