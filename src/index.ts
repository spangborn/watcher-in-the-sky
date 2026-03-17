import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import express from 'express';
import { fetchAircraftData } from './adsb/adsb';
import { detectCirclingAircraft } from './jobs/detect';
import { detectZigzagAircraft } from './jobs/detectZigzag';
import { pruneOldRecords } from './database/database';
import { CronJob } from 'cron';
import {
    PRUNE_TIME,
    DETECTION_INTERVAL_MS,
    ENABLE_CIRCLING_DETECTION,
    ENABLE_ZIGZAG_DETECTION,
    AIRCRAFT_INFO_DB,
    HEALTH_PORT,
} from './constants';
import { RateLimitError } from './adsb/adsb';
import { healthHandler } from './health/route';
import * as log from './log';

const app = express();
app.get('/health', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    healthHandler(req, res).catch(next);
});
app.listen(HEALTH_PORT, () => log.info(`Health server listening on port ${HEALTH_PORT}`));

function ensureAircraftInfoDb(): void {
    if (!AIRCRAFT_INFO_DB) return;
    const resolved = path.resolve(process.cwd(), AIRCRAFT_INFO_DB);
    if (fs.existsSync(resolved)) return;
    log.info(`Aircraft info DB not found at ${resolved}; downloading and building...`);
    const r = spawnSync('npx', ['ts-node', 'scripts/create-aircraft-db.ts', resolved], {
        stdio: 'inherit',
        shell: true,
    });
    if (r.status !== 0) {
        log.warn(`Aircraft DB build failed (status ${r.status}); continuing without it.`);
    }
}

const MAX_BACKOFF_MS = 300_000; // 5 min

let detectionIntervalMs = DETECTION_INTERVAL_MS;

function scheduleDetection(): void {
    setTimeout(async () => {
        try {
            if (!ENABLE_CIRCLING_DETECTION && !ENABLE_ZIGZAG_DETECTION) {
                scheduleDetection();
                return;
            }
            const aircraftData = await fetchAircraftData();
            if (ENABLE_CIRCLING_DETECTION) await detectCirclingAircraft(detectionIntervalMs, aircraftData);
            if (ENABLE_ZIGZAG_DETECTION) await detectZigzagAircraft(detectionIntervalMs, aircraftData);
            detectionIntervalMs = DETECTION_INTERVAL_MS;
        } catch (err) {
            if (err instanceof RateLimitError) {
                detectionIntervalMs = Math.min(detectionIntervalMs * 2, MAX_BACKOFF_MS);
                log.warn(`Rate limited; next detection in ${detectionIntervalMs / 1000}s`);
            } else {
                log.err(`Detection run failed: ${err}`);
            }
        }
        scheduleDetection();
    }, detectionIntervalMs);
}

new CronJob('*/30 * * * * *', () => pruneOldRecords(Date.now() - PRUNE_TIME)).start();

(async () => {
    ensureAircraftInfoDb();
    log.info('Running initial detection...');
    try {
        if (!ENABLE_CIRCLING_DETECTION && !ENABLE_ZIGZAG_DETECTION) {
            log.warn(
                'All detection jobs are disabled (ENABLE_CIRCLING_DETECTION and ENABLE_ZIGZAG_DETECTION).',
            );
        } else {
            const aircraftData = await fetchAircraftData();
            if (ENABLE_CIRCLING_DETECTION) await detectCirclingAircraft(detectionIntervalMs, aircraftData);
            if (ENABLE_ZIGZAG_DETECTION) await detectZigzagAircraft(detectionIntervalMs, aircraftData);
        }
    } catch (err) {
        if (err instanceof RateLimitError) {
            detectionIntervalMs = Math.min(detectionIntervalMs * 2, MAX_BACKOFF_MS);
            log.warn(`Rate limited; next detection in ${detectionIntervalMs / 1000}s`);
        } else {
            log.err(`Initial detection failed: ${err}`);
        }
    }
    scheduleDetection();
})();
