const RiTa = require('rita');

// Define the grammar
const rules = {
    "start": [
      "$id_and_type <call_sign>? is circling over <location>? <altitude>? <speed>? <squawk>? <landmark>? <fire>? <adsbx_url>"
    ],
    "id_and_type": [
      { rule: "#registration#", weight: 3 },
      { rule: "#registration#, #type|a#", weight: 3 },
      { rule: "#militaryregistration#, a military aircraft", weight: 4 },
      { rule: "#militaryregistration#, a military #type#", weight: 4 },
      { rule: "Aircraft with unknown registration, hex/ICAO #icao#", weight: 1 },
      { rule: "#type# with unknown registration, hex/ICAO #icao#", weight: 1 },
      { rule: "Military aircraft with unknown registration, hex/ICAO #militaryicao#", weight: 2 }
    ],
    "call_sign": [
      { rule: "call sign #call_sign#", weight: 1 }
    ],
    "location": [
      { rule: "#neighbourhood#, #locality#", weight: 3 },
      { rule: "#neighbourhood#, #county#", weight: 3 },
      { rule: "#locality#", weight: 3 },
      { rule: "#localadmin#", weight: 1 },
      { rule: "#name#", weight: 0.5 }
    ],
    "altitude": [
      { rule: "at #alt# feet,", weight: 1 }
    ],
    "speed": [
      { rule: "speed #speed# MPH,", weight: 1 }
    ],
    "squawk": [
      { rule: "squawking #squawk#,", weight: 1 }
    ],
    "landmark": [
      { rule: "#landmark_distance# miles from #landmark_name#", weight: 1 }
    ],
    "fire": [
      { rule: "#fire_distance# miles from the #fire_name#", weight: 1 }
    ],
    "adsbx_url": [
      { rule: "https://globe.adsbexchange.com/?icao=#icao#&zoom=13", weight: 1 }
    ]
  };
  

const grammar = RiTa.RiTa.grammar(rules);
// Expand the grammar
const result = grammar.expand();
console.log(result);
