import { detectCirclingAircraft } from './jobs/detect';
import { pruneOldRecords } from './database/database';
import { CronJob } from 'cron';
import { PRUNE_TIME } from './constants';
import { detectAircraftFromList } from './jobs/watcher';

new CronJob('* * * * *', detectCirclingAircraft).start();
new CronJob('* * * * *', () => pruneOldRecords(Date.now() - PRUNE_TIME)).start();
new CronJob('* * * * *', () => detectAircraftFromList()).start();

(async () => {
    console.log('Running initial detection...');
    await detectCirclingAircraft();
})();