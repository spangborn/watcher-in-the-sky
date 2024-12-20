import axios from 'axios';
import { TAR1090_DATA_URL, USER_AGENT } from '../constants';
import { setupCache } from 'axios-cache-interceptor';

const axiosCache = setupCache(axios, {
    debug: console.log,
    ttl: 5000,
    interpretHeader: false // ignore cache-control headers from the service
});

export async function fetchAircraftData(): Promise<any[]> {
    const headers = {
        "User-Agent":
          `watcher-in-the-sky ${USER_AGENT || 'Watcher'}`,
      };
    try {
        
        const response = await axiosCache.get(TAR1090_DATA_URL);
        console.log(`Got ${response.cached ? 'cached' : 'fresh'} data from: ${TAR1090_DATA_URL}.`);
        return response.data.ac || [];
    } catch (error: any) {
        console.error('Error fetching aircraft data:', error.message);
        return [];
    }
}
