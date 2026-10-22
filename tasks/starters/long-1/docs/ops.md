# Running Satchel

## Where it runs

One Fly.io machine in `ams`, next to the Backblaze B2 bucket Litestream replicates to. The SQLite file is `/data/satchel.db` on the `satchel_data` volume. `scripts/start.sh` restores the database from the replica if the volume is empty, then runs the worker and the web server under `litestream replicate`, so both processes share the one file.

## Secrets

Every secret lives in 1Password and is set on Fly with the CLI, for example:

```
fly secrets set POSTMARK_TOKEN="$(op read 'op://Private/satchel postmark/server token')"
```

The app reads them from the environment. There is no `.env` file, and there must never be one. Locally, `scripts/run.sh` resolves the same items with `op run`.

## Deploys

`fly deploy`. The machine restarts, `start.sh` runs again, and the migrations in `migrations/` run at start-up in both processes. A migration is never edited once it has been deployed.

## Backups

Litestream replicates the WAL to B2 continuously and keeps a week of snapshots. To check a backup really restores:

```
fly ssh console -C "litestream restore -config /etc/litestream.yml -o /tmp/restore-check/satchel.db /data/satchel.db"
fly ssh console -C "sqlite3 /tmp/restore-check/satchel.db 'PRAGMA integrity_check; SELECT count(*) FROM links;'"
```

## Jobs

Background work is the `jobs` table, polled by `src/worker.js` every 5 seconds. One job at a time, oldest `run_at` first. A failed job is retried with backoff and given up after five attempts; it keeps its `last_error`. To see what is waiting:

```
fly ssh console -C "sqlite3 /data/satchel.db \"SELECT kind, count(*) FROM jobs WHERE done_at IS NULL GROUP BY kind\""
```

The weekly digest is a `weekly_digest` job that schedules the next one when it has sent. On a fresh database, `pnpm seed:digest` creates the first.

## Logs

The app writes one JSON object per line to stdout (`src/log.js`), with `level`, `time`, `msg` and the fields of the call. The log shipper runs beside the app on Fly and sends everything to Axiom, dataset `satchel-<env>`. Search by `msg`, or by `kind` for jobs.
