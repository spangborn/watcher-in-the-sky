const screenshot = require("./screenshot/screenshot");

(async () => {
    console.log("Attempting screenshot");
    try {
        const screenshot_data = await screenshot.captureScreenshot("abcd123", "https://globe.airplanes.live/?icao=ae0dbf");
        console.log("Screenshot data:", screenshot_data);
    }
    catch (err) {
        console.log("Error getting screenshot:", err);
    }
})();