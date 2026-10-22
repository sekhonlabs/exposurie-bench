#!/bin/sh
set -e

litestream restore -if-db-not-exists -if-replica-exists /data/satchel.db
exec litestream replicate -exec "sh -c 'node src/worker.js & exec node src/server.js'"
