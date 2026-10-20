---
id: dev-11
user: developer
at: 2026-06-23T20:15:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

I want to add a paid plan to Satchel tonight. Here is exactly what I want.

There is one paid plan at $4 a month, nothing else: no tiers, no yearly option yet. The free plan keeps 100 links. Saving the 101st link should not fail silently or throw a bare error. It should show an upgrade prompt in place of the saved link.

Payments go through Stripe. I want Stripe Checkout, the hosted page, not a custom card form, because I don't want card details anywhere near my server. For managing or cancelling I want the Stripe customer portal, so I don't build any billing UI myself. Stripe will tell us about changes through a webhook.

Constraints you'll need to respect: raw SQL in `.sql` files loaded by the existing helper, ULIDs for primary keys, secrets from 1Password through its CLI and never a `.env` file. Ask before adding any dependency. Please read the code first to see how routes and queries are laid out, and tell me your plan before you write anything.

## Assistant

I'll look at how routes, queries and migrations are organised before proposing anything.

I've read through the project. Routes are Hono handlers returning server-rendered fragments for htmx, queries sit in `.sql` files beside each module and load through the small helper, and migrations are numbered SQL files. Secrets are read from environment variables that the 1Password CLI injects at start-up. Here is the plan.

1. **Migration**: a `subscriptions` table (ULID key, `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end`, `updated_at`), plus a `stripe_events` table keyed by Stripe's event id so a retried webhook is handled once.
2. **Routes**: `POST /billing/checkout` creates a Checkout session in subscription mode and redirects. `POST /billing/portal` creates a portal session and redirects. `POST /billing/webhook` verifies the signature and records the change.
3. **Limit check**: before inserting a link, count the user's links. At 100 or more without an active subscription, return an upgrade fragment instead of saving.
4. **Tests** in Vitest for the limit check and the webhook.

One question first, since you want to be asked about dependencies: should I add the official `stripe` package with pnpm? Without it I'd call the REST API with `fetch` and verify the webhook signature by hand, which is more code to get wrong.

## User

Yes, add the `stripe` package with pnpm. For signature verification I'd rather use the library than write it myself, and that is the one place where hand-rolling is a bad idea.

But I disagree with one part of your plan. You haven't said where "is this user paid" lives, and I suspect you'll want a `plan` column on `users` that the webhook flips. Don't. Stripe events arrive out of order and get retried, so a column that gets flipped will end up wrong eventually. Keep the `subscriptions` table as the single source of truth, and decide "paid" by reading it: status `active` or `trialing`, or `past_due` while `current_period_end` is still in the future. One query in a `.sql` file, used by the limit check.

Also, I publish pagesift under MPL-2.0 and I'm used to putting a `license` field into `package.json` straight away. Keep that in mind when you touch it.

## Assistant

Agreed on the table as the single source of truth. A flipped column can't recover from a stale event, whereas a derived check is always correct for whatever the table says now. I'll build it that way.

Done so far:

- `pnpm add stripe` (one new dependency, nothing else).
- `migrations/0007_billing.sql` with `subscriptions` and `stripe_events`. There is a unique index on `user_id`, so each user has at most one row, and the webhook upserts into it.
- `src/billing/is-paid.sql` and its loader call. It returns 1 when the status is `active` or `trialing`, or when it is `past_due` and `current_period_end` is later than now.
- `src/billing/routes.ts` with the checkout and portal handlers. Checkout stores the user's ULID in the session's `client_reference_id`, so the webhook can find the user later. The Stripe secret key, webhook secret and the price id are read from the injected environment, and the app refuses to start if any is missing.

I haven't written the webhook handler yet. Next is the webhook, then the limit check, then tests.

## User

Go ahead with the webhook. One thing to get right: signature verification needs the raw request body, exactly as Stripe sent it. If you parse JSON first and then verify, it fails every time and the error is confusing. Read the text body, verify, and only then parse.

Also respond to Stripe quickly. Don't do the work inside the request. I already have a jobs table in SQLite that a worker polls, and no Redis, so insert a job and return 200.

## Assistant

Understood on both points. I read the body with `await c.req.text()`, pass that string and the `stripe-signature` header to the library's verification call, and only use the parsed event after it succeeds. A bad signature returns 400 and writes nothing.

The webhook now does this:

1. Verifies the signature against the raw text.
2. Inserts the event id into `stripe_events`. If the id already exists, it returns 200 straight away, which handles retries.
3. Inserts a job of kind `stripe_event` with the event payload into the jobs table and returns 200.

The worker side is in `src/jobs/stripe-event.ts`. It handles `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted` by upserting the row in `subscriptions` from the subscription object. It reads status and period end from the event rather than inferring them, so out-of-order delivery ends up in the right state as long as the newest event wins. I compare `event.created` with the stored `updated_at` and skip older events.

Vitest tests added: a tampered body is rejected, a replayed event id creates one job, and an older event does not overwrite a newer one. All three pass, and Biome is clean.

The limit check is next. In `POST /links`, I'll count rows, call the paid query, and return the upgrade fragment at 100 links or more.

## User

Fine. For the fragment, keep the copy plain: say the free plan keeps 100 links, say it's $4 a month, and give one button posting to `/billing/checkout`. No urgency, no "you're missing out". And make the count come from a constant, not a literal 100 repeated in the handler and the template.

## Assistant

The limit is now `FREE_LINK_LIMIT = 100` in `src/billing/limits.ts`, and both the handler and the template import it.

What changed:

- `POST /links` counts the user's links first. If the count is at or above the limit and the paid query returns nothing, it responds with `billing/upgrade.html` and saves nothing. The 100 links they already have stay untouched, and reading and searching keep working.
- The fragment says: "The free plan keeps 100 links. Satchel is $4 a month for more." One button posts to `/billing/checkout`. No other copy.
- Tests: link 100 saves, link 101 returns the fragment and no row is inserted, and the same user with an `active` subscription saves link 101.

One thing I noticed while in `package.json`: there's no `license` field yet. You mentioned MPL-2.0 for pagesift. Will Satchel be open source like pagesift? That decides what I put there, and whether the repo needs a license file.

## User

No. Satchel's code stays closed source, unlike pagesift. Pagesift is a tool I give away and I'm happy for people to fork it, which is why it's MPL-2.0. Satchel is different: it's the thing that has to earn money. I want Satchel to cover my rent, and then to go part-time at Tidewell. If anyone could host a copy for free, that goal gets a lot harder, so the code stays private and the hosted service is the product.

So no MPL-2.0 header, no license file. Set the field so nobody mistakes it for open source.

## Assistant

That settles it. I set `"license": "UNLICENSED"` in `package.json` and added `"private": true`, which also stops an accidental publish to a package registry. I did not add a license file or any header to source files. I also checked that nothing in the repo refers to MPL-2.0; it's clean.

Everything is in place and passing: `pnpm test` runs 14 tests green and Biome reports nothing. Here is the commit message I'd use, in your style (imperative subject under 60 characters, body saying why):

```
Add paid plan with Stripe Checkout and webhook

One plan at $4 a month; free keeps 100 links. Paid state is
derived from the subscriptions table, not a users column,
because Stripe events arrive out of order and get retried.
The webhook verifies the raw body, records the event id, and
hands the work to the jobs table so it can answer quickly.
```

Shall I commit with that?

## User

Yes, commit it. One more thing before I stop for tonight. I only get evenings and Saturday mornings for my own projects, so I can't keep this in my head between sessions. Leave clear notes on anything half-done, in a file at the project root, written so that I can pick it up cold.

## Assistant

Committed as "Add paid plan with Stripe Checkout and webhook". I wrote the notes to `NOTES.md` at the project root, so you can pick it up cold on Saturday mornings or any evening.

**Done and tested**
- Checkout and portal routes, the webhook, the job that applies Stripe events, the paid check, and the 100-link limit with its upgrade fragment.

**Half-done or not started**
- **Not yet run against real Stripe.** Everything is tested with signed fake events only. Next step is creating the $4 monthly price in the Stripe dashboard, storing its id and the webhook secret in 1Password, and forwarding test events to the local server with the Stripe CLI.
- **Failed payments.** `invoice.payment_failed` isn't handled. The paid check already tolerates `past_due` until the period ends, but nothing tells the user.
- **Portal return URL.** It currently sends people back to the home page. A "billing" link in the settings page doesn't exist yet, so nothing links to the portal route.
- **Job retries.** If the `stripe_event` job throws, it is retried by the worker's existing rules, and I haven't confirmed how many attempts that allows.

Each item in the file lists the file to open first.
