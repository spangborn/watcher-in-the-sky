import { Request, Response } from 'express';
import { metrics } from './metrics';
import { getAircraftDbStats } from '../aircraftInfo/aircraftInfo';
import { formatLocalTime } from '../helpers/dateUtils';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
    const dbStats = await getAircraftDbStats();
    res.json({
        circlingDetected: metrics.circlingDetected,
        zigzagDetected: metrics.zigzagDetected,
        errors429: metrics.errors429,
        errorsNon429: metrics.errorsNon429,
        startedAt: formatLocalTime(metrics.startedAt),
        aircraftInfoDbSize: dbStats.count,
        aircraftInfoDbLastUpdated: dbStats.lastUpdated,
    });
}
