import puppeteer from 'puppeteer';

function delay(time: number) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

export async function captureScreenshot(hex: string, url: string): Promise<Uint8Array> {
// Create a browser instance
    let browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
        defaultViewport: {
            width: 1600,
            height: 800,
          },
        headless: true
    });
    try {

        // Create a new page
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: 'networkidle2' });

        await delay(4000);

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
    catch (err) {
        console.log("Encountered an error while trying to screenshot: ", err);
        return new Uint8Array();

    }
    finally {
        await browser.close();
    }
}
