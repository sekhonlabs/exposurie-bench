---
id: dev-23
user: developer
at: 2026-08-27T14:00:00+01:00
surface: vscode
project: tidewell-api
kind: distractor
---

## User

The activity feed endpoint, `GET /v2/activity`, got slow this week. p95 is over two seconds for accounts with a long history. My guess is the `include` on the actor relation is causing an N+1 inside `src/feed/feed.service.ts`, but I haven't confirmed it. Please find the actual cause before changing anything. Turn on Prisma query logging in the dev environment, hit the endpoint for the seeded large account, and tell me what queries run and how many. Don't touch the query shape yet.

## Assistant

I'll read the service, then run it with query logging on.

I read `src/feed/feed.service.ts`. The feed is one `findMany` on `ActivityEvent`, filtered by `accountId`, ordered by `createdAt` descending, `take: 50`, with `include: { actor: true }`. I then ran the endpoint against the seeded large account with `log: ['query']` enabled.

Two queries run per request, not 51:

1. The `ActivityEvent` select with `WHERE "accountId" = $1 ORDER BY "createdAt" DESC LIMIT 50`.
2. One batched select on `User` using `WHERE id IN (...)` for the actors.

So there's no N+1. Prisma batches the include. The time is almost all in query 1. I'd like to run `EXPLAIN ANALYZE` on that exact statement through `psql` against the dev database. It's read-only and nothing from it gets committed. Okay to proceed?

## User

Yes, go ahead, and I accept that the N+1 theory was wrong. Two queries settles it. Keep it strictly diagnostic: the psql session is for reading the plan and nothing else. Report the plan nodes and the timing.

## Assistant

Here is the plan for the statement, with the logged parameters substituted in:

- `Limit`
- `Sort` using top-N heapsort on `"createdAt" DESC`
- `Seq Scan on "ActivityEvent"` with filter `"accountId" = ...`, **1,812,406 rows removed by filter**
- Execution time: about 640 ms warm, and over 2 s cold

`prisma/schema.prisma` shows the table has only the primary key and an index on `actorId`. Nothing helps filtering by account or ordering by time, so Postgres reads the whole table and sorts the matches.

I'd add a composite index on `("accountId", "createdAt" DESC)`. Postgres could then walk the index in order and stop after 50 rows, with no sort. The quickest route is to add `@@index([accountId, createdAt(sort: Desc)])` to the model and run `prisma db push` on dev to confirm the effect.

## User

No to `db push`. It skips migration history, and dev would drift from what gets deployed. The schema change goes in as a migration, and Ana on the platform team reviews every migration, so she needs to see the real SQL. Use `prisma migrate dev --create-only`, so you generate it without applying, and then we look at it together. A reminder of the rule here: Prisma for every query, and raw SQL only inside migrations. The index statement belongs in that file and nowhere else.

## Assistant

Understood, no `db push`. I added the `@@index` to the `ActivityEvent` model in `prisma/schema.prisma` and ran `migrate dev --create-only`. It produced `prisma/migrations/20260827140512_add_activity_feed_index/migration.sql`:

```
-- CreateIndex
CREATE INDEX "ActivityEvent_accountId_createdAt_idx"
ON "ActivityEvent"("accountId", "createdAt" DESC);
```

I used a plain `CREATE INDEX` rather than `CONCURRENTLY`. Prisma runs each migration inside a transaction, and Postgres refuses a concurrent build there. A plain build blocks writes to `ActivityEvent` while it runs, and Ana will want to know that. The migration is generated but not applied yet.

## User

Two things. First, how long does that write lock last? The production table is bigger than dev, so estimate from a measurement rather than guessing. Second, the generated index name has to match what Prisma expects for that schema entry. If it doesn't, the next `migrate dev` will report drift.

## Assistant

I applied the migration to a scratch copy of the dev database and timed it. The build took 3.1 s on 1.8M rows. Production is larger, so I'd expect it to scale roughly linearly, but I only measured dev, so treat that as a rough guide and not a promise.

On the name: the generated name is `ActivityEvent_accountId_createdAt_idx`, and that is what Prisma derives for this `@@index`. I checked with `prisma migrate diff` from the migrations to the schema, and it reports no differences, so there's no drift.

I re-ran `EXPLAIN ANALYZE` after applying. The plan is now an `Index Scan` on the new index with no `Sort` node, and execution time is **4 ms**. The endpoint through Prisma, with the same seeded account, returns in about 40 ms including the actor lookup.

## User

Good, that's the evidence I wanted. Run the Jest tests for the feed module and confirm they still pass. Then write me a short note to paste for Ana covering what the index is, the measured build time, and the write-lock caveat. Keep it factual.

## Assistant

I ran the Jest suite for the feed module and all 14 tests pass. None of them depend on the plan, so they only confirm behaviour is unchanged.

Note for Ana:

> **Migration `20260827140512_add_activity_feed_index`**
> Adds a composite index on `ActivityEvent("accountId", "createdAt" DESC)` in PostgreSQL. The activity feed query was doing a sequential scan, with 1.8M rows removed by filter in dev, at about 640 ms warm. With the index, `EXPLAIN ANALYZE` shows an index scan with no sort, at 4 ms.
> The build is a plain `CREATE INDEX`, because `CONCURRENTLY` can't run inside Prisma's migration transaction. It blocks writes to `ActivityEvent` while it builds. It took 3.1 s on dev data, and production is larger, so expect longer. No query changes: the feed still goes through Prisma, and the only raw SQL is the migration file.

The migration is not applied to the shared dev database yet. Do you want me to leave it for after Ana's review?
