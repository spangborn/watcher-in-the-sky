import puppeteer from 'puppeteer';
import * as log from '../log';

function delay(time: number) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

export async function captureScreenshot(hex: string, url: string): Promise<Uint8Array> {
    let browser;
    try {
        browser = await puppeteer.launch({
        args: ['--no-sandbox', '--window-size=1920,1080', '--ignore-certificate-errors', '--ignore-certificate-errors-spki-list', '--disable-dev-shm-usage'],
        defaultViewport: {
            width: 1600,
            height: 800,
          },
	    timeout: 0,
        headless: true
        });
    } catch (launchErr: unknown) {
        log.warn(`Screenshot skipped (Chrome not available): ${launchErr instanceof Error ? launchErr.message : launchErr}`);
        return new Uint8Array(0);
    }

    try {
        // Create a new page
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(0);
        await page.goto(url, { waitUntil: 'networkidle2' });

        await delay(4000);

        await page.evaluate(() => {
            let attribution = document.querySelector('div.ol-attribution');
            attribution?.parentNode?.removeChild(attribution)
        })

        await page.evaluate(() => {
            let sidebar = document.querySelector('#selected_infoblock');
            sidebar?.parentNode?.removeChild(sidebar)
        });

        // Capture screenshot
        let screenshotData = await page.screenshot({
            clip: {
                x: 200,
                y: 0,
                width: 1200,
                height: 800
            },
            quality: 100, type: 'jpeg'
        });

        return screenshotData;
    }
    catch (err: unknown) {
        log.warn(`Screenshot failed: ${err instanceof Error ? err.message : err}`);
        return new Uint8Array(0);
    }
    finally {
        await browser.close();
    }
}
