import { timeout } from "cron";

const puppeteer = require('puppeteer');

(async () => {
    function delay(time: number) {
        return new Promise(function(resolve) { 
            setTimeout(resolve, time)
        });
     }
     
    console.log("Attempting screenshot");
    
    // Create a browser instance
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox'],
        headless: true
    });
    try {

        // Create a new page
        const page = await browser.newPage();
        const recorder = await page.screencast({path: 'recording.webm'});

        // Set viewport width and height
        await page.setViewport({ width: 1600, height: 800 });

        await page.goto("https://globe.airplanes.live/?icao=a9ff6d&zoom=13&hideButtons&hideSidebar&screenshot&nowebgl", { waitUntil: 'networkidle0', timeout: 0});

        // Sigh, wait 4 seconds
        //await delay(4000);

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
            quality: 100, type: 'jpeg',
            path: `screenshot.jpg`
        });
        
        // await delay(10000);
        await recorder.stop();
        console.log(screenshotData);

        return screenshotData;
    }
    catch (err) {
        console.log("Encountered an error while trying to screenshot: ", err);
        return new Uint8Array();
    }
    finally {
        await browser.close();
        
        // Make sure the build doesn't get hung
        return process.exit(0);
    }
})();