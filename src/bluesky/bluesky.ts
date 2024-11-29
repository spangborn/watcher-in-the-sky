import { AtpAgent, RichText } from '@atproto/api';
import { BLUESKY_USERNAME, BLUESKY_PASSWORD } from '../constants';

const agent = new AtpAgent({ service: 'https://bsky.social' });

export async function loginToBluesky(): Promise<void> {
    await agent.login({ identifier: BLUESKY_USERNAME, password: BLUESKY_PASSWORD });
}

export async function postToBluesky(message: string): Promise<void> {
    await loginToBluesky();
    const rt = new RichText({ text: message });
    await rt.detectFacets(agent);

    const postRecord = {
        $type: 'app.bsky.feed.post',
        langs: ["en-US"],
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
    };
    await agent.post(postRecord);
}
