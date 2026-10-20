---
id: dev-17
user: developer
at: 2026-07-22T20:20:00+01:00
surface: terminal
project: satchel
kind: distractor
---

## User

Satchel's worker and web process are both throwing `SqliteError: database is locked` when an import saves a lot of links at once. It's easy to reproduce with an import of a few hundred links: the import page returns a 500, and the worker log shows the same error on its poll query.

Some context so you don't have to guess. Everything is SQLite, in WAL mode, with the file on the Fly volume. There's no Redis. Background work is a jobs table that the worker polls. So the worker and the web process are two processes writing to one file.

Please find out why the write lock is being held so long. Don't add a retry wrapper around the failing calls. I want the cause first, and then we decide on the fix. Don't change anything yet.

## Assistant

I'll start with the connection setup and the import path.

Findings:

1. `src/db/connection.ts` sets `journal_mode = WAL` and `foreign_keys = ON`, but **no `busy_timeout`**. Any writer that finds the lock taken fails immediately with `SQLITE_BUSY`, instead of waiting its turn.
2. `src/import/run.ts` wraps the whole import in a single transaction. Inside it, for each link, the loop awaits `fetchTitle(url)`, a network call, and then runs the insert. The write lock is taken at the first insert and held across every one of those fetches, so for a few hundred links it stays held for tens of seconds.
3. `src/worker/poll.ts` claims a job with an `UPDATE jobs SET status = 'running' ...` every second. That is a write, so it collides with the import's long transaction. The web process fails the same way when it writes a session or a link.
4. Each insert goes through `src/db/queries/insert_link.sql` one row at a time, with a ULID generated per call. That part is fine, but it means hundreds of separate statements inside the long transaction.

So WAL is working as intended. Readers aren't blocked, but WAL still allows only one writer at a time, and the import holds that slot far too long.

My proposed fix, in order of importance:

- Fetch titles **before** opening any transaction.
- Insert in batches of, say, 50 links per short transaction.
- Set `busy_timeout` so brief contention waits instead of failing.

I haven't changed anything yet. Should I go ahead?

## User

Yes, go ahead, with two constraints.

First, for the batching, I know a small queue/concurrency library would do it in one line, but I ask before adding any dependency and the answer here is no. A plain chunk helper is ten lines.

Second, pick the busy timeout deliberately. I don't want a huge number that hides a slow transaction. The worker polls every second, so a wait longer than a few seconds just stacks up polls. Tell me what you picked and why.

## Assistant

No new dependency. Here's what I did:

- `src/util/chunk.ts` is a small `chunk(items, size)` helper with a Vitest case in `chunk.test.ts` covering an empty array, an exact multiple and a remainder.
- `src/import/run.ts` now works in three stages. It parses the input, then fetches titles with no transaction open, then writes in chunks of 50. Each chunk is its own `BEGIN IMMEDIATE ... COMMIT`, so a chunk takes the write lock up front rather than upgrading from a read halfway through, which is another way to get `SQLITE_BUSY`. Each chunk's lock is held for milliseconds.
- `src/db/connection.ts` now sets `busy_timeout = 3000`.

I chose 3000 ms for these reasons:

- A 50-row chunk commits in a few milliseconds, so a writer should never wait more than a few chunks' worth.
- It is shorter than the worker's idle gap of a few polls. If a wait ever approaches 3 seconds, something is holding the lock far too long and the error should surface, not be hidden.
- A larger value would have made the original bug look fixed while leaving the 30-second transaction in place.

I also moved the title fetch out of the inserts, so a failed fetch now stores the link with the bare URL as its title instead of aborting the batch. That is a small behaviour change. Say so if you want the old all-or-nothing behaviour back.

Biome is clean on the changed files and the Vitest suite passes. I haven't load-tested yet.

## User

The fallback title is fine, keep it. Different from before, though: I'd rather a failed fetch also be logged once per import with a count, not per link. A few hundred warnings would bury the real lines.

Then load-test it. Seed an import of 2,000 links and run it while the worker is polling. I want to see the errors gone, not just assume it.

## Assistant

Done on the logging. `run.ts` counts failed fetches and writes one line at the end, for example `import finished: 1994 saved, 6 used url as title`. The per-link warnings are gone.

For the load test I added `scripts/load-import.ts`. It stubs `fetchTitle` with a 20 ms delay so the timing is realistic, starts the worker loop in a second process, and imports 2,000 generated links through the same path the web route uses. Results on this machine:

| | Before | After |
|---|---|---|
| Import of 2,000 links | failed with `database is locked` after about 4 s | completed in about 9 s |
| `database is locked` errors, web | 11 | 0 |
| `database is locked` errors, worker | 38 | 0 |
| Longest single write transaction | about 41 s | about 12 ms |

I ran the "after" case five times in a row, and then once more with the poll interval cut to 100 ms to put the worker under more pressure. There were no errors in any run.

The import is slower in wall-clock terms than a failure would suggest, because titles are fetched in sequence. That is not the lock problem, but it is where the 9 seconds goes.

## User

Good. That's what I wanted to see. The 9 seconds I can live with; most of it is the fetches, and an import is a background job anyway.

One correction to something I almost let through: your table says "longest single write transaction about 12 ms" for after. Is that from the run with the 100 ms poll, or from the normal runs? I don't want a number that only holds in the easy case.

## Assistant

It comes from the harder case. I took the maximum across all six runs, including the one with the 100 ms poll interval. In the five normal runs the longest chunk was about 8 ms, and the 100 ms run produced the 12 ms figure, because the worker's claim writes were interleaved with the chunks. So the table already shows the worst case, not the easy one.

I'd call the fix sound for this load. If imports of tens of thousands of links ever matter, the chunk size is a single constant in `run.ts` and is easy to tune.

## User

Fine. Commit it. Imperative subject under 60 characters, and a body that says why. No prefix.

## Assistant

Committed. The message:

```
Batch import writes and set a busy timeout

Imports held one write transaction across every title fetch,
so the worker's poll and web writes hit "database is locked"
for the whole import. Fetch titles first, write in chunks of
50 with BEGIN IMMEDIATE, and wait up to 3s on contention.
```

The subject is 41 characters. The commit includes the connection change, the new chunk helper and its test, the import rewrite, and the load script.
