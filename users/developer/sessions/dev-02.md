---
id: dev-02
user: developer
at: 2026-05-26T10:15:00+01:00
surface: vscode
project: tidewell-api
kind: build
---

## User

I'm on the Core API team at Tidewell, and this is my first session with you in this repository, so I'll give you the full picture before you touch anything.

The task is Jira ticket TW-1182. Here is the description as written:

> Responses from the public API should carry headers that tell the client how many requests remain in their current rate-limit window. Clients are currently surprised by 429s with no warning. The limiter already exists; this ticket only surfaces its counters. No change to limiting behaviour.

The limiter lives in the middleware layer. Its counters are kept in a PostgreSQL table, one row per client per window, and the middleware reads and increments that row on every request. I don't want new behaviour. I want the numbers the limiter already has to appear on the response.

Please start by reading the rate-limit middleware and whatever it calls, and tell me what you find before you change anything. In particular I want to know where the counter is read, where it is incremented, and whether the remaining count is already computed anywhere or whether you'd have to derive it. The tests in this repo are Jest, so look at how the existing middleware tests are set up, because you'll be adding to them.

## Assistant

I'll read the middleware and its tests first and change nothing yet.

I read `src/middleware/rateLimit.ts`, the data-access module it calls (`src/db/rateLimitStore.ts`), and the existing tests in `test/middleware/rateLimit.test.ts`. Here is what I found.

**Where the counter lives**
- The Postgres table is `rate_limit_windows`, with the columns `client_id`, `window_start`, and `request_count`. There is a unique constraint on `(client_id, window_start)`.
- `rateLimitStore.hit(clientId, now)` runs a single upsert: it inserts the row for the current window or increments it, and returns the new `request_count` together with `window_start`.

**Where it is read and incremented**
- Both happen in that one `hit` call, made from the middleware before the request is passed on. There is no separate read.
- The middleware compares the returned count against `config.rateLimit.max`. If the count is over the maximum it responds 429 with a `Retry-After` header. Otherwise it calls `next()`.

**Is "remaining" already computed?**
- No. The middleware has `count`, `windowStart`, `max` and `config.rateLimit.windowSeconds` in scope, so the three values the ticket needs can be derived without touching the store:
  - limit = `max`
  - remaining = `max - count`, clamped at 0
  - reset = `windowStart + windowSeconds`

**Tests**
- The existing tests are Jest. They mock `rateLimitStore.hit` with `jest.mock` and drive the middleware with fake request and response objects. There is a helper, `makeRes()`, that records `setHeader` calls.

**Proposal**
Set `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` in the middleware right after `hit` returns, so they appear on 429 responses too. I'd put the header logic in a small function in the same file. Does that match what you want?

## User

Mostly, but I have two corrections before you write anything.

First, you said the headers would appear on 429s too. That's right and I want it, since the ticket's whole point is that clients get surprised by 429s. But on a 429, `Remaining` must be exactly 0, not negative, and `Retry-After` must stay as it is today. Don't touch it.

Second, `Reset`. You derived it as `windowStart + windowSeconds`. I want to check what unit `window_start` is stored in before you commit to that. I believe the column is a `timestamptz`, so after it comes out of the driver it's a JavaScript `Date`, not epoch seconds. The header should be epoch seconds, because that's what our clients' existing code expects from the `Retry-After` handling they already wrote. Please verify the column type in the migration, not from memory, and tell me what you find.

Also, one thing I don't want: please don't add a second query or a cache to get these numbers. A teammate once suggested keeping the counts in memory so the header wouldn't need the database. I'm against that. With more than one instance behind the load balancer, the in-memory number would be wrong, and a wrong "remaining" is worse than no header at all. The table is the source of truth, and the `hit` call already returns what we need.

## Assistant

Checking the migration now.

The migration is `db/migrations/0014_rate_limit_windows.sql`, and you're right about the type: `window_start timestamptz NOT NULL`. The store returns it as a `Date`, as you expected. My earlier formula would have added a number of seconds to a `Date`, which in JavaScript gives a string concatenation, so it's good this came up before I wrote it.

Corrected derivation:

- reset = `Math.floor(windowStart.getTime() / 1000) + windowSeconds`

That is epoch seconds, the same unit as the `Retry-After` computation. I checked how `Retry-After` is built in the 429 branch. It uses `Math.ceil` on the seconds left in the window, so it is a relative number of seconds, while `Reset` will be an absolute epoch timestamp. They are different units on purpose, and I'll note that in a comment so nobody "fixes" one to match the other.

Decisions I'm taking from your message:

- Remaining is `Math.max(0, max - count)`, so it is exactly 0 on a 429.
- `Retry-After` and the rest of the 429 branch stay untouched.
- No second query and no cache. The three values come from the single `hit` result already in scope.

I'm making the change now.

## User

Go ahead. When you're done, tell me exactly which files changed and show me the final shape of the middleware's header-setting code, but only that part. I don't need the whole file pasted.

## Assistant

Done. Two files changed in this step:

- `src/middleware/rateLimit.ts`: adds a `setRateLimitHeaders(res, { max, count, windowStart, windowSeconds })` function and one call to it directly after `hit` returns, before the 429 check, so it runs for both outcomes.
- `src/config/index.ts`: no change in the end. I had considered exporting a constant for the header names, but they are used in exactly one place, so I left them inline.

The header-setting part:

```
function setRateLimitHeaders(res, { max, count, windowStart, windowSeconds }) {
  const remaining = Math.max(0, max - count);
  // Reset is an absolute epoch time in seconds. Retry-After is relative.
  const reset = Math.floor(windowStart.getTime() / 1000) + windowSeconds;
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
}
```

Two small things I noticed while in there:

- The middleware skips rate limiting for the health-check route, with an early `return next()`. That path never calls `hit`, so it carries no rate-limit headers. That seems right, since there is no window for it, but you may want to confirm it is acceptable for the ticket.
- `String(...)` is deliberate. `setHeader` accepts numbers, but the existing tests assert on header values as strings, and I'd rather keep them consistent.

## User

The health-check route is fine without the headers. It's not a client-facing call, and the ticket says "responses from the public API". I'll note that in the pull request.

Now the tests. Write them in Jest, in the existing file, following the structure already there. I want these cases, and I'd like you to say which of them you think is the weakest:

1. A request well inside the limit: `Limit` equals the configured max, `Remaining` is `max - count`, and `Reset` is the window start plus the window length in epoch seconds.
2. The request that exactly reaches the limit: `Remaining` is 0, and the request still passes through to `next()`.
3. A request over the limit: the response is 429, `Remaining` is 0 and not negative, and `Retry-After` is still set.
4. The health-check route: no `X-RateLimit-*` header is set at all.

Use a fixed window start so the `Reset` assertion is a literal number, not computed with the same formula as the code. If the test uses the same formula it only proves the formula equals itself.

## Assistant

I'll add them to `test/middleware/rateLimit.test.ts` inside the existing `describe('rateLimit middleware')` block, using the same `jest.mock` of the store and the `makeRes()` helper.

For the fixed window I'm using `new Date('2026-05-26T10:00:00Z')`, which is epoch second 1779789600, with a 60-second window. So the `Reset` assertion is the literal `'1779789660'`, written out by hand and not derived.

The cases:

1. `sets limit, remaining and reset on a normal request`: the mock returns `count: 3`, the configured max is 100, and the assertions are `'100'`, `'97'`, `'1779789660'`.
2. `allows the request that exactly reaches the limit`: `count: 100` gives `Remaining` of `'0'`, and `next` is called once.
3. `returns 429 with remaining 0 when over the limit`: `count: 140` gives status 429, `Remaining` of `'0'`, and `Retry-After` still defined. I also assert that `next` was not called.
4. `sets no rate-limit headers on the health-check route`: `makeRes()` records no `X-RateLimit-*` calls, and `hit` is never called.

Which one is weakest? Case 4. It checks that nothing happened, so it would also pass if the health-check route were broken in some unrelated way, for example if the route never reached the middleware at all. I made it a little stronger by asserting that `hit` was not called and that `next` was, so it proves the early return and not just an absence of headers. Without those two assertions I wouldn't trust it.

I haven't run them yet. Shall I?

## User

Yes, run the whole Jest suite, not only that file. I want to know I haven't broken anything elsewhere, and report the real output, including anything that fails.

## Assistant

I ran the full suite with `npm test`.

Result: 1 failure, 86 tests passing across 14 suites.

The failing test is in `test/routes/clients.test.ts`:

```
● GET /clients/:id › returns the client with no extra headers
  Expected: undefined
  Received: "100"
  at expect(res.headers['x-ratelimit-limit']).toBeUndefined()
```

That test was written before the limiter was mounted on that route, and it asserts that a response has no rate-limit headers. Now it correctly has them, so the test's old assumption is out of date and the code is behaving as the ticket intends. I did not change the middleware to satisfy it.

I changed that one assertion to check that `x-ratelimit-limit` equals the configured max, and I left the rest of the test alone. I reran the full suite after that: 87 passing, 0 failing, 14 suites. All four new tests pass, and nothing else is affected.

This touches a test outside the file we planned, so you may want a line about it in the pull request description.

## User

Good catch, and yes, it goes in the description. The change is correct and that old assertion was just stale.

Now the part about how the team works, so you can prepare everything for me to paste. I'll do the git and the pull request myself. I'd rather you only prepare the text.

A branch is the ticket key plus a short slug. For this one the branch is `TW-1182-rate-limit-header`. Not a prefix directory and not my name in it, just key then slug.

A pull request's title starts with the ticket key and a colon, like `TW-1182: Add rate-limit headers to API responses`. That is the title for this one, exactly.

The description has four sections, in this order: Why, What changed, How I tested, Rollback. Please look for the pull request template in the repository first and follow it if it's there.

## Assistant

I looked for the template in the usual places: `.github/`, the repository root, and `docs/`. There is no pull request template anywhere in the repository, and nothing in `CONTRIBUTING.md` mentions one either. So I can't follow a template from the repo.

Here is what I'll use for now:

- Branch: `TW-1182-rate-limit-header`
- Title: `TW-1182: Add rate-limit headers to API responses`
- Description sections, in order: Why, What changed, How I tested, Rollback

Before I write the description: is the template kept somewhere else that I can't reach from the project folder? If it has wording or checkboxes I should follow, tell me, and I'll match them instead of guessing at the content of each section.

## User

That explains it. The template lives in the team handbook, which is in Notion, not in the repository. That's why you couldn't find it, and it's a known annoyance. I'd rather it were a file in the repo, where it would be versioned along with the code. But the handbook is where the team keeps it, so that's where it stays, and I follow it.

The template is just those four headings, and each should be short. There are no checkboxes. So write the description with the four sections as I listed them. Make sure Why mentions the 429 surprise from the ticket, What changed names the files, How I tested gives the real numbers from the run you just did, and Rollback is honest about what rolling back means.

## Assistant

Understood. The template is the four headings, so I'm writing to that. Here is the text for you to paste.

**Branch:** `TW-1182-rate-limit-header`

**Title:** `TW-1182: Add rate-limit headers to API responses`

**Description:**

```
### Why
Clients of the public API currently get a 429 with no warning that they were
close to the limit (Jira: TW-1182). The limiter already tracks the counters in
its Postgres table, so this change only surfaces them on the response.
No change to limiting behaviour.

### What changed
- src/middleware/rateLimit.ts: new setRateLimitHeaders(), called right after
  the store's hit() returns, so it applies to both normal and 429 responses.
  Sets X-RateLimit-Limit, X-RateLimit-Remaining (never below 0) and
  X-RateLimit-Reset (absolute epoch seconds, derived from window_start).
- Retry-After on 429 is untouched and stays a relative number of seconds.
- No second query and no cache: the values come from the single hit() result.
- The health-check route is skipped by the limiter, so it carries no headers.
  It is not part of the public API.
- test/routes/clients.test.ts: one stale assertion said the response had no
  rate-limit headers; it now checks X-RateLimit-Limit equals the configured max.

### How I tested
- Added four Jest tests in test/middleware/rateLimit.test.ts: normal request,
  request exactly at the limit, request over the limit, and the health-check
  route. Reset is asserted as a literal epoch value, not recomputed.
- Full suite: 87 passing, 0 failing, 14 suites.

### Rollback
Revert the commit. The headers are additive and there is no migration, no
schema change and no data change, so nothing needs to be undone in the
database. Clients that ignore the new headers are unaffected either way.
```

One thing to check on your side: the description says "Postgres table" but the ticket and handbook may use your own wording for it. Change that phrase if so.

## User

That's very close. Two edits, and I'll explain each.

In Why, drop the parenthetical "(Jira: TW-1182)". The title already starts with the key, and the ticket link gets attached by the integration, so repeating it in the body is just noise. Keep the rest.

In Rollback, the last sentence, "Clients that ignore the new headers are unaffected either way", is a claim about clients I can't verify. We don't know what every client does with unknown headers. Replace it with something I can stand behind: that rolling back removes the three headers and returns responses to what they were before.

The "Postgres" wording is fine as it is.

## Assistant

Both edits are made. Here are the two changed sections, with the rest of the description unchanged:

```
### Why
Clients of the public API currently get a 429 with no warning that they were
close to the limit. The limiter already tracks the counters in its Postgres
table, so this change only surfaces them on the response. No change to
limiting behaviour.
```

```
### Rollback
Revert the commit. The headers are additive and there is no migration, no
schema change and no data change, so nothing needs to be undone in the
database. Rolling back removes the three X-RateLimit-* headers and returns
responses to exactly what they were before.
```

You were right about the removed sentence. Whether a client tolerates unfamiliar headers depends on that client, and nothing in this repository tells us. The new wording only says what the revert does, which the diff shows.

A final summary of what is ready for you:

- Branch name: `TW-1182-rate-limit-header`
- Title: `TW-1182: Add rate-limit headers to API responses`
- Description: the four sections, Why, What changed, How I tested and Rollback, with the two edits applied.
- Changes in the working tree: `src/middleware/rateLimit.ts`, `test/middleware/rateLimit.test.ts`, and the one-assertion update in `test/routes/clients.test.ts`. I haven't created the branch, committed or pushed, as you asked, so those steps are yours.
