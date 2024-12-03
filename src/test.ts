const puppeteer = require('puppeteer');

(async () => {
    function delay(time: Number) {
        return new Promise(function(resolve) { 
            setTimeout(resolve, time)
        });
     }
     
    console.log("Attempting screenshot");
    try {
        // Create a browser instance
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
            headless: false
        });

        // Create a new page
        const page = await browser.newPage();

        // Set viewport width and height
        await page.setViewport({ width: 1600, height: 800 });

        await page.goto("https://globe.airplanes.live/?icao=ae0dbf&zoom=13&", { waitUntil: 'networkidle0' });

        // Sigh, wait 4 seconds
        await delay(4000);

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

    // Make sure the build doesn't get hung
    return process.exit(0);
})();