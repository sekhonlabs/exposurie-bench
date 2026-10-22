# Satchel

A read-later web app: save links, read them later, search them, and get a weekly digest. One paid plan at $4 a month; the free plan keeps 100 links.

## Stack

- Hono renders the HTML on the server, and htmx does the rest. No single-page app.
- SQLite through better-sqlite3, in WAL mode: one file on a Fly volume, replicated to Backblaze B2 by Litestream. No ORM. Every query is a `.sql` file next to the code that runs it, loaded by `src/sql.js`.
- Background work is the `jobs` table, polled by `src/worker.js`: fetching saved pages (the text is extracted with pagesift), sign-in emails, the weekly digest and Paddle's events. No Redis.
- Sign-in is a magic link by email, sent through Postmark. No passwords.
- Search is SQLite FTS5 over the extracted text.
- Payments go through Paddle, the merchant of record.
- Plain CSS with custom properties. Installable as a PWA; there is no native app.
- JSON logs on stdout, shipped to Axiom.

## Running it

```
pnpm install
git config core.hooksPath .githooks
scripts/run.sh pnpm dev          # http://localhost:3000
scripts/run.sh pnpm dev:worker   # the worker, in a second terminal
pnpm test
pnpm lint
```

`scripts/run.sh` reads the secrets from 1Password; none is ever kept in a file. Without `POSTMARK_TOKEN` an email is logged instead of sent, so the sign-in link shows up in the worker's output.

## Layout

- `src/server.js` and `src/worker.js` are the two processes. `src/app.js` mounts the routes.
- `src/<feature>/` holds a feature's routes and its `.sql` files: `auth`, `links`, `reader`, `highlights`, `tags`, `search`, `import`, `billing` and `account`.
- `src/jobs/` is the queue and the digest's schedule, with one handler per kind of job in `handlers/`.
- `src/views/` is the HTML, and `src/mail/` is Postmark and the emails.
- `src/lib/` holds small helpers: ULIDs, URLs, chunking.
- `migrations/` is numbered SQL, run in order at start-up and never edited once deployed.
- `docs/ops.md` covers deploys, secrets, backups, jobs and logs.

The tests run on Node's own runner against an in-memory database. The pre-push hook runs them; there is no CI.
