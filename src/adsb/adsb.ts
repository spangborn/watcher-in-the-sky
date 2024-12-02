import axios from 'axios';
import { TAR1090_DATA_URL, USER_AGENT } from '../constants';

export async function fetchAircraftData(): Promise<any[]> {
    const headers = {
        "User-Agent":
          `watcher-in-the-sky ${USER_AGENT || 'Watcher'}`,
      };
    try {
        console.log(`Getting data from: ${TAR1090_DATA_URL}`);
        const response = await axios.get(TAR1090_DATA_URL);
        return response.data.ac || [];
    } catch (error: any) {
        console.error('Error fetching aircraft data:', error.message);
        return [];
    }
}