import { AppBskyFeedPost, AtpAgent, RichText } from '@atproto/api';
import { BLUESKY_USERNAME, BLUESKY_PASSWORD, BLUESKY_DEBUG } from '../constants';

const agent = new AtpAgent({ service: 'https://bsky.social' });

export async function loginToBluesky(): Promise<void> {
    try {
        await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });
    }
    catch (err) {
        console.log("Error logging into Bluesky: ", err);
    }
}

export async function postToBluesky(aircraft: any, message: string, screenshot_data?: Uint8Array): Promise<boolean> {
    if (!BLUESKY_DEBUG) {
        console.log("Debug mode, not posting this message: ", message);
        return true;
    }
    if (!agent.sessionManager.hasSession) {
        await loginToBluesky();
    }

    const rt = new RichText({ text: message });
    await rt.detectFacets(agent);

    try {

        // If we have a screenshot, upload it and post it with the BSky Post
        if (screenshot_data && screenshot_data.length > 0) {
            const { data } = await agent.uploadBlob(screenshot_data, {
                encoding: "image/jpg",
            });
            const postRecord: Partial<AppBskyFeedPost.Record> & Omit<AppBskyFeedPost.Record, 'createdAt'> = {
                $type: "app.bsky.feed.post",
                langs: ["en-US"],
                text: rt.text,
                facets: rt.facets,
                embed: {
                    $type: 'app.bsky.embed.images',
                    images: [{
                        alt: `Screenshot of the flight path of the flight ${aircraft.flight}`,
                        image: data.blob,
                        aspectRatio: {
                            // a hint to clients
                            width: 1200,
                            height: 800
                          }
                    }]
                }
            };
            await agent.post(postRecord);
            return true;

        }
        else {
            return false;
        }
    }
    catch (err) {
        console.log("Error posting to Bsky", err);
        return false;

    }
}
