import puppeteer from 'puppeteer';


export async function captureScreenshot(hex:string, url: string): Promise<Uint8Array> {
    // Create a browser instance
    const browser = await puppeteer.launch();

    // Create a new page
    const page = await browser.newPage();

    // Set viewport width and height
    await page.setViewport({ width: 1600, height: 800 });

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Capture screenshot
    return page.screenshot({
        clip: {
          x: 300,
          y: 0,
          width: 1200,
          height: 800
        },
        quality: 100, type: 'jpeg'
      });
}
