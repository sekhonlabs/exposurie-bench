---
id: dev-27
user: developer
at: 2026-09-17T11:00:00+01:00
surface: vscode
project: tidewell-api
kind: build
---

## User
I'm working on Linear ticket ENG-402: inviting many people to an organisation in one request. Right now the invite endpoint takes a single email. The new endpoint takes a list and creates one invitation per address. It has to ship dark, so it goes behind a feature flag.

Please start by reading how the existing single-invite route is built: the route file, the service, and the tests. Then tell me what you'd change before writing anything. I'd like to agree the shape first.

## Assistant
I'll look at the existing invite route, its service and its tests first.

I've read through it. This is what exists:

- `src/routes/v2/organisations/invitations.ts` has `POST /v2/organisations/:orgId/invitations`. It validates the body with a schema, calls `inviteService.create`, and returns 201.
- `src/services/inviteService.ts` runs a Prisma `invitation.create` and sends the email through the existing mailer wrapper. A duplicate pending invite raises a `ConflictError`.
- `src/lib/flags.ts` wraps an Unleash client and exports `isEnabled(name, context)`. Only one flag is checked anywhere in the code today.
- `tests/routes/invitations.test.ts` is Jest with a Prisma mock.

My proposal:

1. Add `POST /v2/organisations/:orgId/invitations/bulk`, taking `{ emails: string[] }`.
2. Add `inviteService.createMany`, which dedupes the list, validates each address, and creates the invitations in one Prisma transaction.
3. Return a per-address result, so a duplicate pending invite doesn't fail the whole batch.
4. Cap the batch size. I'd suggest 100, but that's your call.
5. Check the flag in the route handler, before the service is touched.

For the flag name I'd go with `bulk_invite_enabled`. Does that shape work for you?

## User
Most of that works, but two things.

First, the flag name. `bulk_invite_enabled` is the popular default and I don't want it. A feature flag is named after its ticket: this one is eng-402-bulk-invite. The reason is that when someone finds a stale flag in Unleash six months from now, the name takes them straight to the ticket, which tells them who asked for it and when it's safe to delete. A descriptive name tells them nothing about that.

Second, the per-address results. Make the response `{ created: [...], skipped: [{ email, reason }] }`, not a mixed list. Our clients already destructure on those two keys in another endpoint, and I'd like to stay consistent. Cap of 100 is fine.

## Assistant
Understood on both. The flag is `eng-402-bulk-invite`, and I'll use that exact string everywhere it appears. The response will be `{ created, skipped }`, with `skipped` entries shaped as `{ email, reason }`.

Before I write code I'll check how `src/lib/flags.ts` passes context to Unleash, so the flag can be targeted by organisation later. I'll also see whether the existing mailer wrapper can be called inside a transaction or should run after commit.

What I found:

- `isEnabled` takes `{ userId, properties }`. Passing `properties: { orgId }` would allow per-organisation rollout in Unleash later without touching the code.
- The mailer is called inside `inviteService.create` today, after the Prisma call but not inside a transaction. If I send emails inside a transaction, a rollback could leave people holding an email for an invitation that doesn't exist.

So `createMany` will write all the rows in one transaction and send the emails after it commits. Is that acceptable, or do you want sending kept inside the same unit as the writes?

## User
After commit is right. An invite email pointing at a row that rolled back is much worse than a row with a late email. I'd also like the send failures to be reported, not swallowed: if the email fails for an address, it goes in `skipped` with reason `email_failed`, but the row stays so it can be re-sent.

Go ahead and build it.

## Assistant
Built. These are the changes:

- `src/services/inviteService.ts`: new `createMany(orgId, emails, invitedBy)`.
  - It lowercases and trims the addresses, then dedupes them.
  - Invalid addresses go to `skipped` with reason `invalid_email`.
  - It looks up existing pending invitations in one Prisma `findMany` and skips those with reason `already_invited`.
  - The remaining rows are written with a single `invitation.createMany` inside `prisma.$transaction`.
  - After commit it sends the emails one by one. A send failure puts the address in `skipped` with `email_failed`, and the row is left in place.
- `src/routes/v2/organisations/invitations.ts`: new `POST /bulk` handler.
  - It calls `isEnabled('eng-402-bulk-invite', { userId, properties: { orgId } })` first.
  - If the flag is off, it returns 404 with the same body the router gives for an unknown route. A caller can't tell the endpoint exists.
  - It validates `emails` as an array of 1 to 100 strings. Anything larger returns 400.
- `src/schemas/invitations.ts`: added `bulkInviteBody`.

One small fix along the way: the existing single-invite handler lowercased emails but didn't trim them. The new code trims, so the two paths now differ slightly. I left the old handler alone because it's outside this ticket. Say so if you want it aligned.

I haven't written tests yet.

## User
Leave the old handler alone. Good call on 404 for the off state.

Now the tests. I want both states of the flag covered, and I want them to be real assertions, not just "returns 200". Off: 404, and nothing is written to the database and no email is sent. On: the happy path, the duplicate-pending case, the invalid address, the over-cap request, and the email-failure case.

## Assistant
Tests are added in `tests/routes/invitations.bulk.test.ts`. The Unleash wrapper is mocked, so `isEnabled` returns whatever each test sets.

**Flag off**
- Returns 404 and the body matches the unknown-route body.
- `prisma.invitation.createMany` is called zero times.
- The mailer mock is called zero times.

**Flag on**
- Happy path: three addresses give 201, `created` has three entries, `skipped` is empty, and the mailer is called three times.
- Duplicate pending: an address that already has a pending invite appears in `skipped` with `already_invited`, and only the others are written.
- Invalid address: `not-an-email` is skipped with `invalid_email`, and the rest go through.
- Over the cap: 101 addresses give 400, with no database call and no email.
- Email failure: the mailer mock rejects for one address. That address is in `skipped` with `email_failed`, and its row is still created.

I also added one case for within-request duplicates. `A@x.com` and `a@x.com ` in the same list produce a single invitation.

I ran `npx jest tests/routes` and 14 tests pass, including the existing ones. ESLint and Prettier are clean on the changed files.

One thing I noticed: the suite's setup file resets mocks between tests, but not the flag mock. I set the flag value explicitly in a `beforeEach` in the new file, so the tests don't depend on order.

## User
Good. Now the pull request. Before you write it, check whether the repository has a pull request template.

## Assistant
I checked `.github/` and the repository root. There's no pull request template and no contributing guide that mentions one. The only file in `.github/` is a workflow definition.

So I don't know what structure your team expects. Where does the template live, and what sections does it have?

## User
It's not in the repository. The team handbook is in Notion, and the template lives there. I'll save you the trip: a pull request's description has four sections, in this order: Why, What changed, How I tested, Rollback.

Title starts with the ticket key, so `ENG-402: ` and then a short summary. The branch should be the ticket key and a short slug.

## Assistant
That gives me what I need. I'll use the title `ENG-402: Add bulk invite endpoint behind a flag` and the branch name `ENG-402-bulk-invite`.

I checked the current branch, and the work is on `bulk-invites-wip`. I'll rename it to `ENG-402-bulk-invite` before pushing. I haven't pushed anything yet.

Here's the description:

```
## Why
ENG-402: organisations need to invite many people at once. Today an admin has to call the single-invite endpoint once per address. This ships dark behind the Unleash flag `eng-402-bulk-invite`.

## What changed
- New `POST /v2/organisations/:orgId/invitations/bulk` taking `{ emails }`, capped at 100.
- New `inviteService.createMany`: dedupes, validates, writes in one transaction, sends emails after commit.
- Response is `{ created, skipped: [{ email, reason }] }`. Reasons: `invalid_email`, `already_invited`, `email_failed`.
- Flag off: the route returns 404, the same as an unknown route.

## How I tested
- New Jest file `tests/routes/invitations.bulk.test.ts` covering both flag states.
- Off: 404, no database write, no email.
- On: happy path, duplicate pending, invalid address, over the cap, email failure, in-request duplicates.
- `npx jest tests/routes`, ESLint and Prettier all pass.

## Rollback
Turn `eng-402-bulk-invite` off in Unleash. The endpoint returns 404 immediately. No migration is involved, so there is nothing to revert in the database. Invitations already created stay valid.
```

Should I open the pull request with this, or do you want to change anything first?

## User
One correction. In Rollback you say invitations already created stay valid. That's true, but add that they can be revoked through the existing revoke endpoint, because the first question from anyone on call will be what to do about rows created while the flag was on.

Also, there's no migration, which is why nobody on the platform team needs to look at it. Keep that sentence as it is.

Otherwise it's fine. Open it.

## Assistant
I've updated the Rollback section:

```
## Rollback
Turn `eng-402-bulk-invite` off in Unleash. The endpoint returns 404 immediately. No migration is involved, so there is nothing to revert in the database. Invitations already created stay valid, and any of them can be revoked through the existing revoke endpoint.
```

I renamed the branch to `ENG-402-bulk-invite` and pushed it. The pull request is open with the title `ENG-402: Add bulk invite endpoint behind a flag` and the four-section description above.

Two practical points:

- The repository is squash-merge only, so the branch history won't matter after merge. The title is what ends up on the main branch.
- Before the flag is turned on anywhere, someone needs to create `eng-402-bulk-invite` in Unleash. Until it exists, `isEnabled` returns false, so the endpoint stays dark, which is the safe default.

I'd also suggest linking the pull request on the Linear ticket. Do you want me to do that, or will you?

## User
I'll link it myself. I'll create the flag in Unleash once it's approved. Thanks, that's everything for ENG-402.

## Assistant
Sounds good. To recap where things stand:

- The pull request for ENG-402 is open on branch `ENG-402-bulk-invite`, with Why, What changed, How I tested and Rollback filled in.
- The endpoint is `POST /v2/organisations/:orgId/invitations/bulk`, behind `eng-402-bulk-invite`.
- The flag doesn't exist in Unleash yet, so the endpoint is dark everywhere until you create it.
- The old single-invite handler is untouched. Its email handling still differs slightly from the new path: no trim.

Once the review comes back, I can help with any comments.
