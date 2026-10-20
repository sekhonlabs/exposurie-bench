---
id: dev-21
user: developer
at: 2026-08-20T20:40:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

Tonight I'm moving Satchel's payments from Stripe to Paddle. The reason is that Paddle is the merchant of record, so it handles VAT and sales tax for me. With Stripe I'd have to register, collect and file all of that myself, and I'm not doing that for a $4 a month product. Satchel has one paid plan, and that stays as it is. Paddle just replaces Stripe.

Here is what I want, in order:

1. Replace the checkout flow.
2. Replace the webhook handler.
3. Plan how the existing Stripe subscribers move over.
4. Remove all the Stripe code once the new flow works in Paddle's sandbox.

Please read the billing code first and tell me what you find before changing anything. The project is in `/Users/dev/code/satchel`.

## Assistant

I'll read the billing code and the routes first.

Here is what's there:

- `src/billing/stripe.js` creates Checkout sessions and the customer portal link. It holds a single price constant for the $4 monthly plan.
- `src/routes/checkout.js` redirects to Stripe's hosted page and handles the return URL.
- `src/routes/webhooks.js` verifies the Stripe signature and handles `checkout.session.completed`, `invoice.paid` and `customer.subscription.deleted`.
- `src/db/queries/subscriptions.sql` and `src/db/queries/users.sql` hold the raw SQL. `users` has `stripe_customer_id` and `stripe_subscription_id` columns.
- `migrations/` is plain numbered SQL files, and the newest is `0014_jobs.sql`.
- `src/worker.js` polls the `jobs` table in SQLite every few seconds. The welcome and digest emails go through it. There's no Redis anywhere.

My plan for the new flow:

- Checkout would open Paddle's overlay on the pricing page using the official client script, with the user's ULID passed as custom data.
- The webhook route would verify the signature and then insert a row into `jobs`. The worker would apply the subscription change, so a slow database write never makes Paddle retry.
- I'd add `paddle_customer_id` and `paddle_subscription_id` in migration `0015`, and leave the Stripe columns until the cutover is done.
- For the API calls I'd add Paddle's Node SDK.

Does that match what you want?

## User

Mostly, but two corrections.

First, no SDK. I ask before any dependency gets added, and this one isn't worth it. We make about three API calls, and the signature check is a timestamp, an HMAC-SHA256 and a constant-time compare, all in `node:crypto`. I don't want a package that I have to re-audit every time Paddle changes its types. Use `fetch`.

Second, the overlay. I'd rather not load a third-party script on the pricing page. Satchel is server-rendered HTML with htmx and I'd like to keep it that way. Create the transaction server-side, take the checkout URL from the response, and redirect to it. That's what the Stripe flow does now, so the change is small.

I'm happy to have the webhook insert into `jobs`, though. That's the pattern for everything slow.

## Assistant

Understood: `fetch`, no SDK, server-side transaction and redirect. That removes the dependency question and the client script.

I've written the first part:

- `src/billing/paddle.js` has two functions, `createCheckout(user)` and `getPortalUrl(user)`. Both call the sandbox or live base URL depending on `PADDLE_ENV`. The API key comes from the same 1Password-backed env injection as the rest of the config, so nothing is read from a file.
- `createCheckout` posts a transaction with the one price ID and the user's ULID in `custom_data`, then returns the `checkout.url` from the response.
- `src/routes/checkout.js` now calls it and redirects. The success route is unchanged.

One thing I noticed: the old Stripe code passed the user's email so the hosted page would prefill it. Paddle creates the customer on first checkout, so I pass the email in the same way and store the customer ID when the first webhook arrives.

I haven't touched the webhook route yet. For the signature check I'll write a small `verifyPaddleSignature(rawBody, header, secret)` in `src/billing/signature.js`. Hono gives us `c.req.text()` for the raw body, so we must not parse JSON before verifying.

## User

Good. Go ahead with the webhook. Two details I care about:

- Reject anything whose timestamp is more than five minutes old, and use `timingSafeEqual`.
- Webhooks are delivered at least once and can arrive out of order, so the handler must be idempotent. Use the event ID. I don't want a second `subscription.created` to give anyone a second paid period.

The tests use `node:test`. The pre-push hook runs them, so they have to pass before I push anything.

## Assistant

Done. This is what changed:

- `src/billing/signature.js` parses the `ts=...;h1=...` header, rejects timestamps older than 300 seconds, recomputes the HMAC over `ts:rawBody`, and compares with `timingSafeEqual`. It also checks that the two buffers have equal length first, because `timingSafeEqual` throws otherwise.
- `src/routes/webhooks.js` now has a Paddle route. It verifies the signature, returns 400 on failure, and otherwise inserts `(id, type, payload)` into a new `webhook_events` table with the Paddle event ID as the unique key. `INSERT ... ON CONFLICT DO NOTHING` makes a duplicate delivery a no-op, and the route still answers 200 so Paddle stops retrying.
- It then enqueues a `paddle_event` job in `jobs` only when the insert actually added a row.
- `src/worker.js` has a handler for that job type. It maps `subscription.activated`, `subscription.updated` and `subscription.canceled` onto the existing `plan` and `plan_ends_at` columns. For out-of-order delivery it compares each event's `occurred_at` with the last one applied and ignores older ones.
- `migrations/0015_paddle.sql` adds the two Paddle columns and `webhook_events`. The queries live in `src/db/queries/paddle.sql`.
- `test/signature.test.js` and `test/paddle-events.test.js` cover a bad signature, a stale timestamp, a duplicate event and an out-of-order cancel.

`pnpm test` passes: 23 tests, 0 failures.

## User

Before the sandbox run, tell me how you'd move the existing subscribers. I have around forty paying people on Stripe. I don't want to cancel anyone's plan without them agreeing to it, and I don't want anyone double-charged.

## Assistant

Paddle can't take over a Stripe subscription directly, because the card details don't move with an account. So each subscriber has to re-enter a card once. Here is the plan, built to avoid double charges:

1. **Don't touch Stripe at first.** Every current subscriber keeps their Stripe plan and `plan_ends_at` exactly as is.
2. **Migration job.** A one-off script enqueues one `migrate_billing` job per paying user in `jobs`. The worker sends each of them an email through Postmark with a magic link. Magic links expire after 15 minutes, so the email links to `/billing/move`, and the user signs in there if needed before the page creates the Paddle checkout.
3. **Start date.** The Paddle transaction starts billing on the day their current Stripe period ends. The subscriber is never charged by both, and the plan doesn't lapse.
4. **Cancel Stripe after the first Paddle payment.** The worker handles this step, not the user. When `subscription.activated` arrives for someone with a `stripe_subscription_id`, it enqueues a job that cancels the Stripe subscription at period end.
5. **Reminder.** A second email goes out after a week to anyone who hasn't moved. Anyone still on Stripe when the last period ends gets a final notice, and is not downgraded without one.

The cancel call in step 4 is the last use of the Stripe API. It needs the Stripe key, so the old module has to stay until the last subscriber has moved. I would remove the checkout and webhook code only, and keep a small `src/billing/stripe-cancel.js`.

## User

No, I disagree with the last part. A half-removed Stripe module that stays around for months is exactly how dead code survives. I'd rather make the cancellation a manual step in the Stripe dashboard. Forty people is few enough, and I can do it once a week.

But the rest holds up, and the start-date rule is the part I hadn't thought of. Build steps 1 to 3 and the reminder. Leave step 4 as a line in a checklist file, not code.

## Assistant

That's reasonable at forty people, and it gets the dependency on Stripe out of the code completely. I've built it that way:

- `scripts/enqueue-billing-move.js` selects users with a `stripe_subscription_id` and no `paddle_subscription_id`, then inserts one `migrate_billing` job each. It skips anyone who already has a pending job, so running it twice is safe.
- The worker's `migrate_billing` handler sends the Postmark email, and the `/billing/move` route creates the transaction with `billing_starts_at` set to the user's `plan_ends_at`.
- `src/jobs/billing-reminder.js` enqueues the one-week reminder as a job with a `run_after` value.
- `docs/billing-cutover.md` has the manual checklist. Step 4 is there as "cancel in the Stripe dashboard at period end, after the first Paddle payment shows in the Paddle dashboard", with a query to list who is due.

I ran the whole flow in Paddle's sandbox: a test checkout, `subscription.activated` delivered through the sandbox simulator, and the same event sent twice. The user ended up with one paid period and one row in `webhook_events`. A `subscription.canceled` for an older timestamp was ignored.

I also found one bug in my own first draft. The success page read the plan before the worker had processed the job, so it showed "free" for a few seconds. It now shows a short "confirming your payment" state, with an htmx poll on `/billing/status` every two seconds until the plan changes.

## User

Good, the polling is the right fit for this stack. Now remove the Stripe code. Be thorough, and check the docs and the pricing page copy too, not only the JS.

## Assistant

I checked every place the old provider appears. This is what I removed:

- Deleted `src/billing/stripe.js` and the Stripe route in `src/routes/webhooks.js`.
- Deleted the old checkout call and `test/stripe-webhook.test.js`.
- Removed the Stripe key and webhook secret from `fly.toml` env references and from the 1Password item mapping in `scripts/run.sh`.
- Removed `stripe` from `package.json` and ran `pnpm install`, so the lockfile has no trace of it.
- Changed the footer line on the pricing page from "Payments by Stripe" to "Payments by Paddle, who also handle VAT", and updated the FAQ entry about receipts to say receipts come from Paddle.
- Updated `README.md` and `docs/` to describe the new flow.

I left the `stripe_customer_id` and `stripe_subscription_id` columns in place, because the cutover checklist's query needs them. I wrote `migrations/0016_drop_stripe_columns.sql.pending` for later and did not add it to the migration run order.

`pnpm test` passes: 21 tests, since the two old Stripe tests are gone. Biome reports no issues, and a search for "stripe" in `src/`, `test/` and `scripts/` matches only the two column names and the checklist.

For the git history I'd suggest two separate messages. One would be "Replace checkout and webhooks with Paddle", with a body saying that Paddle is the merchant of record, so VAT and sales tax stop being your job. The other would be "Remove Stripe code and dependency", with a body saying nothing reads it once the cutover checklist replaces the cancel call. Both subjects are under 60 characters. Should I write them?

## User

Yes, write both. One more check first: the pre-push hook has to pass with all of this in place.

## Assistant

I wrote both messages as described. The first covers the Paddle checkout, webhook handler, migration `0015` and the migration job. The second covers the Stripe removal. I then ran the pre-push hook by hand, and it passed with the 21 tests and no failures.

Before you go live, you need to do three things yourself:

1. Create the live Paddle price for the $4 monthly plan and put its ID, the API key and the webhook secret into 1Password.
2. Point Paddle's live webhook destination at `/webhooks/paddle`.
3. Run `scripts/enqueue-billing-move.js` once the live flow has worked end to end for your own account.

The sandbox run is done, and nothing is waiting on code.
