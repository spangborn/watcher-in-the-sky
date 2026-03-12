#!/bin/sh
set -e
if [ -n "$AIRCRAFT_INFO_DB" ] && [ ! -f "$AIRCRAFT_INFO_DB" ]; then
    echo "Aircraft info DB not found at $AIRCRAFT_INFO_DB; downloading and building..."
    npm run create-aircraft-db -- "$AIRCRAFT_INFO_DB"
fi
exec "$@"
