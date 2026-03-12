import { Request, Response } from 'express';
import { metrics } from './metrics';
import { getAircraftDbStats, getAircraftInfoRowCount } from '../aircraftInfo/aircraftInfo';
import { getTrackingAircraftCount } from '../database/database';
import { formatLocalTime } from '../helpers/dateUtils';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
    const [dbStats, aircraftInfoRowCount, trackingAircraftCount] = await Promise.all([
        getAircraftDbStats(),
        getAircraftInfoRowCount(),
        getTrackingAircraftCount(),
    ]);
    res.json({
        circlingDetected: metrics.circlingDetected,
        zigzagDetected: metrics.zigzagDetected,
        errors429: metrics.errors429,
        errorsNon429: metrics.errorsNon429,
        startedAt: formatLocalTime(metrics.startedAt),
        aircraftInfoDbSize: dbStats.fileSizeBytes,
        aircraftInfoDbCount: aircraftInfoRowCount,
        aircraftInfoDbLastUpdated: dbStats.lastUpdated,
        trackingAircraftCount,
    });
}
