---
id: dev-22
user: developer
at: 2026-08-24T21:15:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

Evening. Today's job is the weekly digest, then a few loose ends. Background: I live in Lisbon, so the digest runs on Lisbon time. It goes out on Saturdays at 08:00, Lisbon time, not UTC. I want it scheduled through the existing jobs table, which the worker polls. No Redis and no cron library, and ask me before adding any dependency. Mail goes through Postmark as before.

Please read how the jobs table and the worker are set up first and tell me what you find before writing anything.

## Assistant

I'll look at the migrations, the worker and the mail code first.

What I found:

- `db/migrations/0004_jobs.sql` defines `jobs` with `id` (ULID), `kind`, `payload` (JSON text), `run_at`, `attempts`, `done_at` and `last_error`.
- `src/worker.js` polls every 5 seconds. It claims one due row with a single `UPDATE ... RETURNING` and dispatches on `kind` to a handler in `src/jobs/handlers/`. Today there is only `fetch_article`.
- `src/mail/postmark.js` wraps the Postmark HTTP API with `fetch`. It has one function, `sendMail({ to, subject, html, text })`, which the magic-link flow uses.
- Queries live in `src/sql/*.sql` and are loaded by `src/sql/load.js`.

Proposed shape: a `weekly_digest` handler that builds and sends the email, then inserts the next `weekly_digest` row before it marks itself done. That keeps one pending row alive at all times. The one thing I want to get right is the next Saturday 08:00 in `Europe/Lisbon`. Fixed offset arithmetic would be wrong half the year, so I'd use `Intl.DateTimeFormat` with the time zone to find the offset on the target date. That needs no dependency.

Does that match what you want?

## User

Yes, with one correction. Don't insert the next row from inside the handler before the send finishes. If the send throws and the job retries, I'd end up with two pending rows and double digests. Insert the next row only after Postmark accepts the message, and do both the insert and the `done_at` update in one transaction. Also seed the first row from a migration or a small script, so a fresh database isn't silent forever.

## Assistant

Agreed. Retries with the insert up front would duplicate the chain, and I should have seen that.

Done:

- `src/jobs/schedule.js` exports `nextDigestTime(from)`. It returns the next Saturday at 08:00 in `Europe/Lisbon`, as an ISO UTC string. It works from the Lisbon calendar date, then finds that date's offset, so the clock changes in March and October are handled.
- `src/jobs/handlers/weekly_digest.js` loads the users due a digest, sends each one, and only then runs a transaction. The transaction inserts the next row and sets `done_at` on the current one.
- `src/sql/digest_users.sql` selects users with at least one unread link saved in the last seven days. People with nothing unread get no email.
- `scripts/seed-digest.js` inserts the first row if no pending `weekly_digest` exists. It is idempotent.

I wrote three `node:test` cases for `nextDigestTime`: a Saturday at 07:59, a Saturday at 08:01, and the week the clocks change. All pass. From now, the next run lands on Saturday 29 August at 08:00 Lisbon time, which is 07:00 UTC while summer time lasts.

## User

Good. Now the email itself. Plain HTML, inline styles only, because mail clients ignore most else. Use the brand colour #B4462F for the heading rule and links. Subject line: "Your week in Satchel". Include a plain-text part. Each link shows its title, the domain, and a link back to the reader view in the app, not to the original site.

## Assistant

Built in `src/mail/digest.js`, with a pure function `renderDigest({ user, links })` returning `{ subject, html, text }`, so it can be tested without sending anything.

- The subject is "Your week in Satchel".
- The HTML is a single column, 560px wide, with inline styles throughout. The heading rule and the link colour are `#B4462F`. Everything else is dark grey on white.
- Each entry has the title as a link to `/read/:id` on the app's domain, with the domain of the original page underneath in small grey text.
- The text part is a numbered list of title, domain and reader URL.
- Titles are HTML-escaped. I found that one saved page had `<` in its title, so I added a test with that title.

I also added a small footer line saying the digest goes out on Saturdays. I haven't added an unsubscribe link, because the settings page has no such switch yet. Do you want that on the list?

## User

Not tonight, it goes on the list for later. Next, a question of direction for the rest of the evening. I'm making Satchel installable. Before you suggest otherwise: no native app. Satchel is a PWA. I looked hard at React Native and ruled it out. It would mean a second codebase, a build pipeline and store review for a read-later app whose whole UI is server-rendered HTML with htmx. A manifest plus a service worker gives me the home-screen icon and the share target, and I keep one deploy.

## Assistant

That's consistent with the project. The app is Hono rendering HTML with htmx, so a native shell would duplicate screens that already work in the browser. I won't suggest one.

I checked what exists: `public/` has no manifest and no service worker, and the base layout in `src/views/layout.js` has no `<link rel="manifest">`.

Plan for the PWA:

1. `public/manifest.webmanifest` with name, `start_url: "/"`, `display: "standalone"`, `theme_color: "#B4462F"`, `background_color: "white"`, and the icon list.
2. A `share_target` entry pointing at the existing save route, so a shared link from the phone's share sheet lands in Satchel.
3. Manifest link and theme-color meta tag in the layout.
4. A minimal service worker caching only the static assets, never the HTML pages, since those are per-user.

Do you have icon artwork, or should I draw placeholders?

## User

Not placeholders. Inês, a designer friend, drew the logo for Satchel. It's in `assets/logo/`, with the SVG source and her exports at 192 and 512 pixels. Use her files for the icons, don't regenerate or redraw them. One more thing on the service worker: do not cache anything under `/read/` or `/api/`. I want that written as a test, not just a comment. And no comments that restate the code.

## Assistant

I found `assets/logo/satchel.svg`, `satchel-192.png` and `satchel-512.png`. I'm using Inês's exports as they are.

Done:

- Copied the two PNGs to `public/icons/` and listed them in the manifest with `purpose: "any"`. I did not touch the artwork. Her files have no padding for a maskable icon, so I left out a maskable entry.
- Added the manifest link and theme-color meta tag to `src/views/layout.js`.
- `public/sw.js` precaches `/css/app.css`, the htmx file and the two icons. It answers fetches from the cache only for those exact paths. Everything else goes to the network untouched.
- `test/sw.test.js` loads the service worker's `shouldCache(url)` function and asserts false for `/read/01J...`, `/api/links` and `/`, and true for `/css/app.css`. It passes.

I kept the service worker free of comments, since the names say what they do. I used no new dependency.

## User

Fine. Now logging. At the moment there's a mixture of `console.log` strings and a few `console.error` calls, and I can't search any of it. What I want: JSON logs to stdout, shipped to Axiom. One JSON object per line, with `level`, `time`, `msg`, and whatever fields the call site adds. Don't reach for a logging library. A forty-line helper is enough, and I'd rather own it.

## Assistant

I'll replace the scattered calls with a small helper and leave the shipping side to configuration.

`src/log.js` is 31 lines. It exports `log.info`, `log.warn` and `log.error`, each taking `(msg, fields)`. Each call writes one line to stdout:

```
{"level":"info","time":"2026-08-24T20:41:07.512Z","msg":"digest sent","user":"01J...","links":7}
```

Errors passed in `fields.err` are flattened to `message` and `stack`, because `JSON.stringify` drops them otherwise. Errors also go to stdout, not stderr, so a single stream feeds the shipper.

I converted the calls in `src/worker.js`, the digest handler, the Postmark wrapper and the request logger. The worker now logs `job claimed`, `job done` and `job failed` with the `kind` and `attempts` fields, so those can be searched in Axiom by job kind. A test checks that the output is valid JSON and that an `Error` survives.

Shipping to Axiom needs an API token and a dataset name. Where do you want me to read the token from?

## User

Nowhere in the code. The shipper runs beside the app on Fly and takes its token from the secrets, which I set from 1Password with the CLI, as with everything else. No `.env` file, so don't add one. Just add a short section to `docs/ops.md` saying logs are JSON on stdout and shipped to Axiom, with the dataset name as a placeholder.

## Assistant

Understood, so the code never touches the token.

I added a "Logs" section to `docs/ops.md`:

```
## Logs

The app writes one JSON object per line to stdout (`src/log.js`).
Logs are shipped to Axiom; the token comes from Fly secrets,
set from 1Password. Dataset: <dataset-name>.
Useful fields: level, msg, kind, attempts, user.
```

I also checked that nothing in the repo reads an Axiom variable and that no env file was created. Both are true.

Before you push: the pre-push hook runs `node --test`, and the full suite passes with the new tests (schedule, digest rendering, service worker, logger). A suggested message for the digest work:

```
Schedule the weekly digest through the jobs table

The next row is inserted only after Postmark accepts the send,
in the same transaction that marks the job done, so a retry
cannot create two chains.
```

Anything else tonight?

## User

One last thing. Add the digest's first run to the seed script's output so I can see it, then I'm done. Print the run time in Lisbon time and in UTC.

## Assistant

Done. `scripts/seed-digest.js` now prints both times when it inserts a row, and prints the existing row's times if one is already pending. I ran it against a scratch database:

```
weekly_digest scheduled
  Lisbon: Saturday 29 August 2026, 08:00
  UTC:    2026-08-29T07:00:00.000Z
```

Running it a second time reported the pending row and inserted nothing. The tests still pass, so the push should go through.
