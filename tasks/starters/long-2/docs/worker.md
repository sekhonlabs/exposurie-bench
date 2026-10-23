# The worker

`src/worker.ts` runs background work from the `jobs` table. It runs as its own ECS service: two tasks in production, one on staging.

## How a job runs

1. Something enqueues a row with `enqueue(kind, payload)` in `src/jobs/queue.ts`. `run_at` is when it may run; it defaults to now.
2. Each worker polls. It takes the due row with the earliest `run_at` and claims it with a conditional update on `locked_at`, so two workers never both win the same row. A row locked for longer than a minute counts as abandoned, and can be claimed again.
3. The handler for its `kind` runs. On success the row gets `done_at`.
4. On failure the row goes back with `run_at` pushed out by 1, 2, 4 and 8 minutes. The fifth failure gives up: the row gets `failed_at` and its last error.

When nothing is due, a worker sleeps two seconds before it polls again.

## Kinds

| kind | enqueued by | does |
|---|---|---|
| `send_invite_emails` | `POST /v2/organizations/:id/invites/bulk`, one job per 50 invites | sends each invite's email through SES and sets `sent_at` |
| `purge_expired_invites` | the schedule, nightly at 02:30 UTC | deletes invites that expired more than 7 days ago |

## The schedule

`src/jobs/schedule.ts` lists the nightly jobs with their time of day in UTC. On every poll the worker makes sure today's row for each one exists once it is due; `dedupe_key` (`<kind>:<date>`) keeps it to one row a day.

## Looking at jobs

There is no page for jobs. On staging, query the table; in production, ask someone with database access.
