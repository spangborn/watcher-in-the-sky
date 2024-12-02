# Watcher in the Sky

Inspired by [Advisory Circular](https://gitlab.com/jjwiseman/advisory-circular) by [John Wiseman](https://gitlab.com/jjwiseman). After running Advisory Circular myself for a while (back in the Twitter days), I decided I'd try my hand at writing a similar bot but adding the ability to use different "jobs" to detect various different types of flights.

John's original code was written in Clojure, with a current rewrite in Rust. I decided to build mine in TypeScript to brush up on and improve my TypeScript skills.

As of now, the bot only monitors circular-ish flights, looking for aircraft that are circling using the Airplanes.live API (ADSBExchange has locked down their API in the recent past and has started to charge for access to the new v2 API). The bot then uses the BlueSky API to post the details of the flight and a screenshot of the flightpath.

Data is sourced from two APIs:
- Airplanes.live
- A local Pelias instance

## What's in a name?
The name "Watcher in the Sky" is inspired by the band Ghost.

## WIP
This code is very much a work in progress and will be refined as I work on it.
