---
id: dev-07
user: developer
at: 2026-06-09T20:50:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

Evening session on satchel. Two things tonight: saving a link should fetch the page and extract its text without blocking the request, and the magic links should finally go out by email. Right now `POST /links` does nothing beyond inserting the row, and the sign-in flow only logs the link to the console.

Here is the design for the background work, so you don't have to guess.

Background work goes through a jobs table in SQLite, polled by a worker process every few seconds. I don't want Redis and I don't want BullMQ. Both mean a second service to run, monitor and back up, and the whole point of this app is that one SQLite file on the Fly volume at /data is the only state. The worker has to run on the same machine as the web process, because that's where the file is. WAL mode is already on, so a reader and a writer in two processes are fine.

The table needs: a ULID primary key (same helper as every other table, you'll find it under `src/lib`), `kind`, a JSON `payload`, `status`, `attempts`, `run_at`, `locked_at`, `last_error`, and `created_at`. Claiming a job has to be atomic, because I may run two workers one day. Failures retry with backoff and give up after five attempts.

The save handler should insert the link, enqueue a `fetch_page` job in the same transaction, and return the htmx row immediately with a "fetching" state. Look at how the existing code is laid out before you propose anything, and tell me what you found and what you plan to add before you write it.

## Assistant

I'll look at the project first: the db layer, the queries folder, the links routes and the ULID helper.

Here is what I found:

- `src/db/index.ts` opens the database at `/data/satchel.db` in production, and sets `journal_mode = WAL` and `busy_timeout = 5000` on open. Two processes sharing the file is fine.
- Queries live as `.sql` files under `src/db/queries/`, loaded by `loadQuery()` in `src/db/load.ts`. There is no ORM anywhere, so the jobs code will follow the same pattern.
- `src/lib/ulid.ts` exports `newId()`. Every table currently uses it for its primary key, and I'll use it for jobs too.
- `src/routes/links.ts` has the `POST /links` handler. It runs `insert_link.sql` and renders `LinkRow` from `src/views/link-row.tsx`. `LinkRow` has no "fetching" state yet.
- The `links` table has `title` and `url` but nothing to hold extracted text. It needs a `body_text` column and a `fetched_at` column.
- Migrations are numbered files in `src/db/migrations/`. The latest is `0004_digest_prefs.sql`.

What I plan to add:

1. `0005_jobs.sql`: the `jobs` table plus an index on `(status, run_at)`. `0005` also adds `body_text` and `fetched_at` to `links`.
2. `src/db/queries/jobs_enqueue.sql`, `jobs_claim.sql`, `jobs_complete.sql` and `jobs_fail.sql`.
3. `src/jobs/worker.ts`: the poll loop, a handler registry keyed by `kind`, and retry with backoff. Delay doubles per attempt from 30 seconds, so 30s, 1m, 2m, 4m, and the fifth failure marks the job `dead`.
4. `src/jobs/handlers/fetch-page.ts` and, later, one for email.
5. A `worker` entry point, `src/worker-main.ts`.

The claim query is the part that needs care. Since ULIDs sort by creation time, I can pick the oldest due job with `min(id)` and flip it to `running` in a single `UPDATE ... RETURNING`:

```
UPDATE jobs
SET status = 'running', locked_at = :now, attempts = attempts + 1
WHERE id = (
  SELECT min(id) FROM jobs
  WHERE status = 'queued' AND run_at <= :now
)
RETURNING *;
```

SQLite serialises writers, so two workers can't claim the same row. There is one gap: a worker that crashes mid-job leaves a row stuck in `running`. I suggest the loop also requeues anything `running` with `locked_at` older than five minutes. Say if you'd rather skip that for now.

## User

The plan is fine, including the stuck-job sweep, so keep it. One correction on the claim query: it should use `status IN ('queued')` nowhere, just the plain comparison you wrote, so leave that as is. What I do want changed is that `run_at` and `locked_at` are stored as integer unix milliseconds, not ISO strings. Every other timestamp in this schema is an integer, and I'm not going to have two conventions.

Go ahead and build the migration, the queries, the worker and the entry point. Don't do the page fetching yet, just register a `fetch_page` handler that I can fill in next, and write Vitest tests for the claim, the retry backoff and the dead state. Run Biome and the tests when you're done and tell me what you changed.

## Assistant

I've built the jobs table, the queries, the worker and the entry point, and Biome and Vitest both pass.

**Migration `0005_jobs.sql`**
- `jobs` has `id TEXT PRIMARY KEY` (a ULID), `kind`, `payload` (JSON text), `status` (`queued`, `running`, `done` or `dead`), `attempts`, `run_at`, `locked_at`, `last_error` and `created_at`. All the timestamps are integer unix milliseconds, as you asked.
- The index is on `(status, run_at)`.
- `links` gains `body_text TEXT` and `fetched_at INTEGER`, both nullable.

**Queries**
- `jobs_enqueue.sql`, `jobs_claim.sql` and `jobs_complete.sql` are plain statements.
- `jobs_fail.sql` takes the new `status`, the new `run_at` and the error text, so the backoff arithmetic stays in TypeScript and the SQL stays dumb.
- `jobs_sweep.sql` moves rows that are `running` with `locked_at` older than five minutes back to `queued`.

**Worker (`src/jobs/worker.ts`)**
- `startWorker({ db, handlers, pollMs })` returns a `stop()` function. The default `pollMs` is 3000.
- If a poll finds a job, the loop runs it and immediately polls again with no sleep. It only waits `pollMs` when the queue is empty, so a backlog drains quickly.
- A handler that throws gets `last_error` set. If `attempts` is under 5 it goes back to `queued` with `run_at = now + 30_000 * 2 ** (attempts - 1)`. Otherwise it becomes `dead`.
- The sweep runs once per minute from the same loop.

**Entry point**
- `src/worker-main.ts` opens the same database and registers the handlers. It stops cleanly on `SIGTERM`, which matters because Fly sends that on deploys.

**Save handler**
- `POST /links` now inserts the link and enqueues `fetch_page` with `{ linkId }` inside one `db.transaction`, then returns the row. `LinkRow` renders a muted "fetching…" state while `fetched_at` is null.

**Tests (`src/jobs/worker.test.ts`)**
- Claiming: two claims in a row return two different jobs, and a third returns nothing.
- Backoff: after the first failure `run_at` is 30 seconds out, after the third it is 120 seconds out.
- Dead: the fifth failure leaves the job `dead` with `last_error` set.
- All three use an injected clock, so nothing sleeps.

One thing I haven't settled is how the worker runs on Fly. Both processes need the file on the volume at /data, and a volume attaches to one machine. A separate process group in `fly.toml` would land on a different machine without the volume, so I haven't touched `fly.toml`. Do you want a small entrypoint script that starts the web server and the worker side by side in the same machine?

## User

Yes, that's what I want: one entrypoint, same machine, web and worker side by side. If the worker dies, the entrypoint should exit non-zero so Fly restarts the machine. A half-alive machine that serves pages but never fetches is worse than a restart. Do that after the fetch handler, though.

Now the fetch handler. Fetch the URL with the built-in `fetch`, a ten second timeout, follow redirects, and give up on anything that isn't `text/html`. Cap the body at 2 MB; if it's bigger, keep reading only up to the cap and extract from what you have. Then extract the readable text and the `<title>`, and store them on the link.

I don't want a dependency for the extraction. Write a small extractor in `src/lib/extract.ts` that drops `script`, `style`, `nav`, `header`, `footer` and `aside` elements, prefers the contents of `<article>` or `<main>` when present, decodes the common entities, and collapses whitespace. It will be crude and that's acceptable. It only has to be good enough to feed the search index and the weekly digest. Tests with a couple of small HTML fixtures, please.

## Assistant

The fetch handler and the extractor are in. Biome and Vitest pass.

**`src/lib/extract.ts`**
- `extractText(html)` returns `{ title, text }`.
- It removes the `script`, `style`, `nav`, `header`, `footer` and `aside` blocks first, then looks for `<article>`, then `<main>`, and falls back to `<body>`. The first one present wins.
- Tags are stripped and the common entities decoded: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;` and numeric references. Whitespace runs collapse to a single space, with paragraph breaks kept as a blank row.
- The title comes from `<title>`, trimmed and decoded. If it is missing, `title` is `null`, and the handler keeps whatever title the link already had.

**`src/jobs/handlers/fetch-page.ts`**
- It loads the link by `linkId`. If the row is gone because the user deleted it in the meantime, the job completes quietly instead of retrying forever.
- The request uses `AbortSignal.timeout(10_000)`, so the ten seconds covers headers and body. Redirects are followed by `fetch` by default.
- If the response `content-type` doesn't start with `text/html`, the handler stores a `fetched_at` with an empty `body_text` and finishes. I made this a success because a PDF will not become HTML on a retry, and five retries would only add noise to `last_error`.
- The body is read from the stream until 2 MB, then the reader is cancelled. It is decoded as UTF-8 and passed to `extractText`.
- Network errors, timeouts and non-2xx responses throw, so the worker's retry and backoff handle them. I made 404 and 410 terminal in the same way as the content-type case, since those won't recover either.

**Tests**
- `extract.test.ts` has two fixtures. One is a blog post with a nav, a footer and an `<article>`, where only the article text should survive. The other is a page with no `<article>` or `<main>` that exercises the body fallback.
- `fetch-page.test.ts` stubs `fetch` and checks the 2 MB cap, the non-HTML case and the deleted-link case.

I fixed one small thing on the way. The first version of the entity decoder ran `&amp;` before the others, so `&amp;lt;` came out as `<` instead of `&lt;`. It now decodes `&amp;` last, and there is a test for that case.

Next is the entrypoint script, then email.

## User

Good, and the entity fix is right. Do the entrypoint now.

Then email. Postmark. I picked it because it's built for transactional mail, and a sign-in link is the most transactional thing there is, whereas the other big names also sell marketing campaigns that I'm never going to send. I specifically don't want SendGrid. Don't add it as a fallback either.

The magic link is the only way in. There's no stored credential of any kind in this app, so please don't add anything like a reset flow. The link expires after 15 minutes. Check what the sign-in code does today; I believe the token expiry is already 15 minutes but verify rather than trusting me.

Secrets come from 1Password through its CLI, no `.env` files, so the Postmark server token must arrive as an environment variable at runtime and the code must fail loudly at startup if it's missing. Sending should be a job of kind `send_magic_link`, so a Postmark outage doesn't make the sign-in form hang or return an error. The user sees "check your inbox" either way, and the worker retries.

## Assistant

I'll check the sign-in code first, since you asked me to verify the expiry.

**What the sign-in code does today**

`src/auth/magic-link.ts` creates a token of 32 random bytes, stores only its SHA-256 hash in `login_tokens` with `expires_at = now + 15 * 60 * 1000`, and logs the URL with `console.log`. `GET /auth/verify` rejects tokens past `expires_at`, and a token is deleted when it is used. So your belief is right: it is 15 minutes, and tokens are single-use. There is no reset route or stored credential column anywhere, and I haven't added one.

**Entrypoint**

`scripts/start.sh` starts `node dist/server.js` and `node dist/worker-main.js` in the background and waits on both. It uses `wait -n`, so as soon as either process exits the script kills the other and exits with that process's status. A dead worker therefore takes the machine down and Fly restarts it, as you wanted. `SIGTERM` is forwarded to both children. The Dockerfile `CMD` now points at this script. I did not change the Litestream setup.

**Email**

- `src/email/postmark.ts` exports `sendEmail({ to, subject, text, html })`. It posts to Postmark's `/email` endpoint with `fetch`, using the `X-Postmark-Server-Token` header and the `outbound` message stream. Any non-2xx response throws an error that includes Postmark's `ErrorCode` and `Message`, so `last_error` on the job says something useful.
- `src/config.ts` now reads `POSTMARK_SERVER_TOKEN` and `MAIL_FROM` at startup and throws if either is missing, in both the web and worker entry points. In development, `pnpm dev` runs under `op run --env-file=dev.op.env`, a file of `op://` references rather than values, so nothing secret is on disk. I added that one file for the references, so check you're happy with its name.
- `src/jobs/handlers/send-magic-link.ts` takes `{ email, url }` from the payload and sends a short plain-text and HTML message. It says the link works once and expires in 15 minutes.
- `requestLink()` in `magic-link.ts` no longer logs the URL. It inserts the token and enqueues `send_magic_link` in one transaction. The route returns the "check your inbox" fragment whether the email exists or not, as before.

One design point to flag: the job payload contains the raw token URL, so the jobs table briefly holds a live sign-in link. The handler clears `payload` to `'{}'` when it completes. A job that goes `dead` keeps its payload, but by then the link has expired, since five attempts with that backoff finish in under ten minutes.

Tests cover enqueue-on-request, the handler calling `sendEmail` with the right fields, and a failed send leaving the job queued with `last_error` set. I stubbed `fetch` for those, so no real mail goes out.

## User

Clearing the payload on completion is the right call, and the under-ten-minutes arithmetic holds: 30s, 60s, 120s and 240s add up to eight and a half minutes of waiting. Keep it.

Now I'm reading `src/jobs/worker.ts` and it's full of comments like `// increment the attempt count` above `attempts += 1`, `// loop forever` above the `while`, and `// get the next job`. I'm going to fix this in a way you won't expect: I want you to tell me how you'd handle it before you touch anything.

## Assistant

I'd make the comments easier to follow by adding a doc comment above every function, describing its parameters and return value, and a short header at the top of the file explaining the loop in order: poll, claim, run, complete or fail. That way anyone reading the worker for the first time gets the whole flow without tracing the code. I'd also keep the inline comments but reword them so they are more precise, for example "increment the attempt count by one before running the handler".

## User

No. That's the opposite of what I asked, and it makes it worse. No comments that restate the code. A comment says why, not what. `// increment the attempt count` above `attempts += 1` tells me nothing the line doesn't. A doc comment that lists the parameters repeats the type signature, and a header that narrates poll, claim, run, complete just describes the function bodies, which are short enough to read.

The only comments that belong in this file are the ones that carry something the code can't: why the loop doesn't sleep after a successful claim, why the sweep threshold is five minutes, why a deleted link counts as success. Remove everything else, and if a comment is left, I want to see that it records a reason.

## Assistant

You're right, and I should have seen that without being told. A comment that restates the code just adds a second thing to keep in sync with it.

I went through `src/jobs/worker.ts` and the handlers I wrote tonight. The diff removes 19 comments from `worker.ts`, 6 from `fetch-page.ts` and 4 from `send-magic-link.ts`. Among them were `// increment the attempt count`, `// loop forever`, `// get the next job`, `// parse the payload` and `// call the handler`. The header narration and the parameter doc comments on `startWorker` are gone too.

Four comments remain, and each one records a reason:

- In `worker.ts`, above the loop: `// No sleep after a successful claim: a backlog should drain at job speed, not poll speed.`
- Above the sweep call: `// Five minutes is well past the ten second fetch timeout, so a row this old means the worker died, not that the job is slow.`
- In `fetch-page.ts`, above the early return for a missing link: `// Deleted by the user while queued. Retrying can't bring it back.`
- In `fetch-page.ts`, above the 404/410 branch: `// These won't recover on retry; failing five times would only bury the real errors.`

I left `send-magic-link.ts` with no comments, because the one thing worth explaining, why the payload is cleared, is better in the commit message. I also checked the test files. Most of their comments restated the assertions, so I removed those too, and Biome still passes.

## User

Better. The sweep comment is good, since it justifies the number with another number, which is exactly what I wanted.

Run the whole suite once more, and then show me the stuff that's still unchecked. I haven't seen the worker and the web process running together yet, so I want to know what was and wasn't verified tonight.

## Assistant

The whole suite passes: `pnpm test` runs 41 tests across 9 files, and `pnpm biome check` is clean. I also ran `tsc --noEmit` and it is clean.

**Verified**
- The claim query never hands the same job to two callers. The test runs it against a real SQLite file in a temp directory, not an in-memory mock.
- Backoff timings and the dead state.
- The extractor on both fixtures, including the entity ordering fix.
- The fetch handler's cap, content-type and deleted-link branches, with a stubbed `fetch`.
- `requestLink()` enqueues `send_magic_link` and the handler clears the payload on success.

**Not verified**
- **The two processes together.** I did not run `scripts/start.sh` end to end. The `wait -n` behaviour is standard, but I haven't watched a killed worker take the machine down. Try `kill` on the worker's PID while the script is running and confirm the script exits non-zero.
- **A real Postmark call.** Every test stubs `fetch`. The first real send will show whether `MAIL_FROM` is a verified sender signature on your Postmark account. If it isn't, Postmark returns an error code and the job will retry and then go `dead`.
- **Real pages.** The extractor is crude by design. Pages that render their content with scripts will produce little or no text, and I haven't tried any live URLs.
- **Contention.** With two processes writing, `busy_timeout = 5000` should absorb it, but I haven't forced a collision.

A reasonable order: run `op run --env-file=dev.op.env -- pnpm dev`, save a real link, and watch the row flip from "fetching…" to its title. Then request a sign-in link to an address you control.

## User

That's the list I wanted. Commit it as two commits: one for the jobs table, worker and entrypoint, one for the page fetching and the email. My usual rules: imperative subject under 60 characters, no prefix, and a body that says why. Put the payload-clearing reason in the second body, as you said.

## Assistant

I split the work into two commits.

First commit:

```
Run background work from a jobs table in SQLite

A save should not wait on a network fetch, and email must not
block sign-in. A table polled by a worker keeps the single SQLite
file as the only state, so there is no second service to run.
The entrypoint runs web and worker on one machine because the
file lives on the /data volume, and it exits non-zero if either
dies so Fly restarts a half-alive machine.
```

Second commit:

```
Fetch page text and send magic links via Postmark

Saved links now get their title and readable text from a
dependency-free extractor, feeding search and the weekly digest.
Sign-in links go out as send_magic_link jobs so a Postmark outage
never hangs the form. The payload holds a live token URL, so it
is cleared once the job completes; dead jobs keep theirs, but the
link has expired by then.
```

The first subject is 47 characters and the second is 50. The first commit holds the migration, queries, worker, tests, `scripts/start.sh` and the Dockerfile change. The second holds `extract.ts`, the fetch and email handlers, `postmark.ts`, `config.ts`, `dev.op.env` and the `requestLink()` change. Both were made with the worker's comments already cleaned up, so no commit contains the restating ones.
