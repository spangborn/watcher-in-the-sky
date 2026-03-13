#!/bin/sh
set -e
DB_PATH="${AIRCRAFT_INFO_DB:-${DATA_DIR}/aircraft_info.db}"
if [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
    echo "Aircraft info DB not found at $DB_PATH; downloading and building..."
    npm run create-aircraft-db -- "$DB_PATH"
fi
exec "$@"
