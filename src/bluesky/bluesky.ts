import { AtpAgent, RichText } from '@atproto/api';
import { BLUESKY_USERNAME, BLUESKY_PASSWORD } from '../constants';

const agent = new AtpAgent({ service: 'https://bsky.social' });

export async function loginToBluesky(): Promise<void> {
    await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });
}

export async function postToBluesky(message: string, screenshot_data?: Uint8Array): Promise<void> {
    await loginToBluesky();


    const rt = new RichText({ text: message });
    await rt.detectFacets(agent);


    // If we have a screenshot, upload it and post it with the BSky Post
    if (screenshot_data) {
        const { data } = await agent.uploadBlob(screenshot_data, {
            encoding: "image/jpg",
        });
        const postRecord = {
            $type: 'app.bsky.feed.post',
            langs: ["en-US"],
            text: rt.text,
            facets: rt.facets,
            createdAt: new Date().toISOString(),
            embed: {
                $type: 'app.bsky.embed.images',
                images: [{
                    alt: `Screenshot of the flight path.`,
                    image: data.blob
                }]
            }
        };
        await agent.post(postRecord);

    }
    // Otherwise just post the text
    else {
        const postRecord = {
            $type: 'app.bsky.feed.post',
            langs: ["en-US"],
            text: rt.text,
            facets: rt.facets,
            createdAt: new Date().toISOString(),
        };
        await agent.post(postRecord);

    }

}
