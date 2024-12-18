# Watcher in the Sky

Inspired by [Advisory Circular](https://gitlab.com/jjwiseman/advisory-circular) by [John Wiseman](https://gitlab.com/jjwiseman). After running Advisory Circular myself for a while (back in the Twitter days), I decided I'd try my hand at writing a similar bot but adding the ability to use different "jobs" to detect various different types of flights.

John's original code was written in Clojure, with a current rewrite in Rust. I decided to build mine in TypeScript for fun.

As of now, the bot only monitors circular-ish flights, looking for aircraft that are circling using the Airplanes.live API but can easily be modified to use a network available tar1090 aircraft.json. The bot then uses the BlueSky API to post the details of the flight and a screenshot of the flightpath.

Data is sourced from two APIs:
- Airplanes.live
- A local [Pelias instance](https://github.com/pelias/docker)

## What's in a name?
The name "[Watcher in the Sky](https://www.youtube.com/watch?v=0mGr5bMItQY)" is inspired by the band Ghost.

## How it works

Watcher in the Sky (or Watcher, for short) polls the Airplanes.live API for data given a lat/lon and radius. It stores aircraft positions in a sqlite database and then looks at the previous data to see if an aircraft has been circling. If it has, it takes a screenshot of the airplanes.live UI and posts about the circling aircraft along with the screen shot to BSky using the atproto API.

Another WIP job looks for specific aircraft and will post about them when they're seen in the area.

## WIP
This code is very much a work in progress and will be refined as I work on it.

## To-do:
1. Pull photo of aircraft from airport-data (if available)
2. Write nicer-reading post text
3. Add detection of aerial photography/imaging flights (zig-zags)
4. Create configuration of watched aircraft list for specific tail numbers or icao

## Example
This code is periodically running and posts to the BSky account [@skycircles.bsky.social](https://app.bsky.social/profile/skycircles.bsky.social). I can be found on BSky as [@sawyer.bike](https://app.bsky.social/profile/sawyer.bike).
