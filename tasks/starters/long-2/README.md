# tidewell-api

Tidewell's public API: TypeScript on Node 24, Express 5, Postgres through Prisma, tests in Jest.

This copy is cut down to organisations, projects and invites, the routes support uses, and the worker that runs background jobs.

```
npm install
npm run prisma:generate
npm run dev          # the API, on :8080
npm run dev:worker   # the worker
npm test
npm run lint
npm run format
```

## Layout

- `src/server.ts` and `src/worker.ts` are the two processes. Each runs as its own ECS service, from the same image.
- `src/routes/v2/` is the public API. Every route is scoped to one organisation through its API key (`src/middleware/auth.ts`), and rate-limited per key (`src/middleware/rateLimit.ts`).
- `src/routes/v2/admin/` is for Tidewell's own staff: the support console calls it with a staff token (`src/middleware/admin.ts`). Customers never reach it.
- `src/services/` holds the queries.
- `src/jobs/` is the background work. `queue.ts` claims rows from the `jobs` table, `schedule.ts` enqueues the nightly jobs, and `handlers/` has one file per kind of job.
- `src/flags.ts` asks Unleash whether a flag is on for an organisation.
- `prisma/migrations/` holds one folder per migration.
- `docs/worker.md` covers the jobs table; `docs/runbook.md` covers logs and the settings.

Conventions for branches, pull requests, reviews and deploys are in the team handbook.
