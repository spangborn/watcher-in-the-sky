import dotenv from 'dotenv';

dotenv.config();

export const TOTAL_CHANGE = parseFloat(process.env.TOTAL_CHANGE || '1440');
export const TIME_WINDOW = parseInt(process.env.TIME_WINDOW || '1500000'); // Default 5 minutes
export const PRUNE_TIME = parseInt(process.env.PRUNE_TIME || '1500000'); // Default 20 minutes
export const TAR1090_DATA_URL = process.env.TAR1090_DATA_URL || '';
export const TAR1090_URL = process.env.TAR1090_URL || '';
export const PELIAS_INSTANCE = process.env.PELIAS_INSTANCE || '';
export const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME || '';
export const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD || '';
export const BLUESKY_DEBUG = Boolean(process.env.BLUESKY_DEBUG || "false");
export const USER_AGENT = process.env.USER_AGENT || 'Watcher in the Sky';
