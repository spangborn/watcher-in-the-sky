# Watcher in the Sky

Inspired by [Advisory Circular](https://gitlab.com/jjwiseman/advisory-circular) by [John Wiseman](https://gitlab.com/jjwiseman). After running Advisory Circular myself for a while (back in the Twitter days), I decided I'd try my hand at writing a similar bot but adding the ability to use different "jobs" to detect various different types of flights.

John's original code was written in Clojure, with a current rewrite in Rust. I decided to build mine in TypeScript for fun.

The bot runs two detection jobs: (1) **circling** — aircraft flying circular patterns; (2) **zig-zag (imaging)** — back-and-forth survey/imaging patterns. It uses the Airplanes.live API (or a network tar1090 aircraft.json) and posts to Bluesky with a screenshot of the flight path.

Data is sourced from:
- [Airplanes.live](https://airplanes.live/) for live aircraft positions
- A local [Pelias](https://github.com/pelias/docker) instance for reverse geocoding and landmarks
- Optional: [Mictronics aircraft database](https://www.mictronics.de/aircraft-database/) for registration and type lookups when the API doesn’t provide them (see below)

## What's in a name?
The name "[Watcher in the Sky](https://www.youtube.com/watch?v=0mGr5bMItQY)" is inspired by the band Ghost.

## How it works

Watcher polls the API for positions, stores them in SQLite, and runs two detection jobs each cycle. **Circling** detection finds aircraft whose heading change over a time window indicates a circular pattern. **Zig-zag (imaging)** detection finds aircraft with alternating left/right turns typical of survey or aerial imaging. When a pattern is detected (and not near an airport, and not posted in the last 30 minutes), it takes a screenshot and posts to Bluesky with reverse-geocoded location.

Screenshots use Puppeteer’s bundled Chrome. Install it once with `npm run install:browser` (or `npx puppeteer browsers install chrome`) so the app can capture flight-path images; otherwise posts are text-only.

To test without posting, set `BLUESKY_DEBUG=true` or `BLUESKY_DRY_RUN=true` in `.env`; the app will print each message to the terminal instead of posting to Bluesky. Leave both unset (or false) to post for real. `npm run dev` runs with debug mode on (no posting) by default.

You can turn detection jobs on or off in `.env`: set `ENABLE_CIRCLING_DETECTION=false` or `ENABLE_ZIGZAG_DETECTION=false` to disable circling or zig-zag (imaging) detection. Both default to enabled.

Another WIP job looks for specific aircraft and will post about them when they're seen in the area.

## WIP
This code is very much a work in progress and will be refined as I work on it.

## Mictronics aircraft database (optional)

To show registration and aircraft type in posts when the live API doesn’t provide them, you can use the Mictronics database:

**Option A – download and build (recommended)**  
`npx ts-node scripts/create-aircraft-db.ts`  
This downloads the zip from Mictronics, extracts it, and writes `aircraft_info.db` in the project root.

**Option B – from a local JSON file**  
If you already have the extracted JSON:  
`npx ts-node scripts/create-aircraft-db.ts path/to/aircraft.json [aircraft_info.db]`

Set in `.env`: `AIRCRAFT_INFO_DB=./aircraft_info.db`

**Docker (ensure DB is built on start):**  
Both compose files set `AIRCRAFT_INFO_DB=/home/node/app/aircraft_info.db`, so the app builds the DB on first start when the file is missing. You don’t need to set it in `.env` for Docker.

- **`.env`** – Use for local (non-Docker) runs and secrets (Bluesky, API URLs, etc.). For local: `AIRCRAFT_INFO_DB=./aircraft_info.db` so the script writes into your project dir.
- **`docker-compose.yml`** (dev) and **`docker-compose.prod.yml`** (prod) – Each sets `AIRCRAFT_INFO_DB` and mounts a named volume `aircraft_db` at that path so the DB is created on first start and persists across container restarts.
- **`make up`** or **`make up-prod`** – Either will create the DB on first run; the volume keeps it for later runs.

## To-do:
1. Pull photo of aircraft from airport-data (if available)
2. Write nicer-reading post text
3. Create configuration of watched aircraft list for specific tail numbers or icao

## Example
This code is periodically running and posts to the BSky account [@skycirclesslc.bsky.social](https://bsky.app/profile/skycirclesslc.bsky.social). I can be found on BSky as [@sawyer.bike](https://bsky.app/profile/sawyer.bike).
