import { detectCirclingAircraft } from './jobs/detect';
import { pruneOldRecords } from './database/database';
import { CronJob } from 'cron';
import { PRUNE_TIME } from './constants';

new CronJob('*/30 * * * * *', detectCirclingAircraft).start();
new CronJob('* * * * *', () => pruneOldRecords(Date.now() - PRUNE_TIME)).start();

(async () => {
    console.log('Running initial detection...');
    await detectCirclingAircraft();
})();