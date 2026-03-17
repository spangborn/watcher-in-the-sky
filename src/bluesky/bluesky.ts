import { AppBskyFeedPost, AtpAgent, RichText } from '@atproto/api';
import { BLUESKY_USERNAME, BLUESKY_PASSWORD, BLUESKY_DEBUG, BLUESKY_DRY_RUN } from '../constants';
import * as log from '../log';

const agent = new AtpAgent({ service: 'https://bsky.social' });

export type BlueskyImage = {
    data: Uint8Array;
    /** MIME type for the upload (e.g. image/jpeg). */
    mimeType: string;
    alt: string;
    aspectRatio?: { width: number; height: number };
};

export async function loginToBluesky(): Promise<void> {
    try {
        await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });
    }
    catch (err) {
        log.err(`Error logging into Bluesky: ${err}`);
    }
}

export async function postToBluesky(
    aircraft: any,
    message: string,
    images?: BlueskyImage[]
): Promise<boolean> {
    const dryRun = BLUESKY_DRY_RUN || BLUESKY_DEBUG;
    if (dryRun) {
        log.info('\n--- BLUESKY DRY RUN (not posting) ---');
        log.dim(message);
        if (images && images.length > 0) {
            log.dim(`(images: ${images.length})`);
        }
        log.info('---\n');
        return true;
    }
    if (!agent.sessionManager.hasSession) {
        await loginToBluesky();
    }

    const rt = new RichText({ text: message });
    await rt.detectFacets(agent);

    try {

        const validImages = (images ?? []).filter((img) => img.data && img.data.length > 0).slice(0, 4);
        if (validImages.length > 0) {
            const uploaded = [];
            for (const img of validImages) {
                const { data } = await agent.uploadBlob(img.data, {
                    encoding: img.mimeType,
                });
                uploaded.push({
                    alt: img.alt,
                    image: data.blob,
                    ...(img.aspectRatio ? { aspectRatio: img.aspectRatio } : {}),
                });
            }
            const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, 'createdAt'> = {
                $type: "app.bsky.feed.post",
                langs: ["en-US"],
                text: rt.text,
                facets: rt.facets,
                embed: {
                    $type: 'app.bsky.embed.images',
                    images: uploaded
                }
            };
            await agent.post(postRecord);
            return true;
        }
        const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, 'createdAt'> = {
            $type: "app.bsky.feed.post",
            langs: ["en-US"],
            text: rt.text,
            facets: rt.facets,
        };
        await agent.post(postRecord);
        return true;
    }
    catch (err) {
        log.err(`Error posting to Bsky: ${err}`);
        return false;

    }
}
