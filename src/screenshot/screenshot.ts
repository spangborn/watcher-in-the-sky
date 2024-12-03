import puppeteer from 'puppeteer';


export async function captureScreenshot(hex:string, url: string): Promise<Uint8Array> {
    try {
        // Create a browser instance
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
        });

        // Create a new page
        const page = await browser.newPage();

        // Set viewport width and height
        await page.setViewport({ width: 1600, height: 800 });

        await page.goto(url, { waitUntil: 'networkidle0' });

        // Capture screenshot
        return page.screenshot({
            clip: {
            x: 200,
            y: 0,
            width: 1200,
            height: 800
            },
            quality: 100, type: 'jpeg'
        });
    }
    catch (err) {
        console.log("Encountered an error while trying to screenshot: ", err);
        return new Uint8Array();
    }
}
