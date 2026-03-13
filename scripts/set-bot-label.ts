/**
 * One-time script to mark the Bluesky account as an automated/bot account.
 * Uses profile self-labels so the app shows the bot badge (see
 * https://github.com/bluesky-social/social-app/pull/10008).
 *
 * One-off: npx ts-node scripts/set-bot-label.ts
 * Requires BLUESKY_USERNAME and BLUESKY_PASSWORD in env (or .env).
 */
import { AtpAgent } from '@atproto/api';
import dotenv from 'dotenv';

dotenv.config();

const BLUESKY_USERNAME = process.env.BLUESKY_USERNAME || '';
const BLUESKY_PASSWORD = process.env.BLUESKY_PASSWORD || '';

const BOT_SELF_LABELS = {
    $type: 'com.atproto.label.defs#selfLabels' as const,
    values: [{ val: 'bot' }],
};

async function main() {
    if (!BLUESKY_USERNAME || !BLUESKY_PASSWORD) {
        console.error('Set BLUESKY_USERNAME and BLUESKY_PASSWORD (e.g. in .env)');
        process.exit(1);
    }

    const agent = new AtpAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });

    await agent.upsertProfile((existing) => {
        const profile = existing ?? {};
        return {
            ...profile,
            labels: BOT_SELF_LABELS,
        };
    });

    console.log('Profile updated: bot self-label set. Your account should now show the automated account badge.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
