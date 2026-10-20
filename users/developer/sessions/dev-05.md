---
id: dev-05
user: developer
at: 2026-06-02T14:30:00+01:00
surface: vscode
project: tidewell-api
kind: build
---

## User

I've got a ticket from Jira, TW-1204: organisations need a billing contact email. It should be a new column on the organisation table, and for the existing rows it has to be filled in from the owner's account email. Before you write anything, here is the database rule on this team: Prisma for every query, and raw SQL only inside migrations. That's not how I'd do it on a project of my own, because I like writing plain SQL for anything with a join in it. But this is the team's codebase and the rule is there so everyone reads the data layer the same way, so I follow it.

Please start by reading `prisma/schema.prisma` and whatever in `src/` touches organisations. Tell me what you find: how an owner is tied to an organisation, whether the email is on the user, and where organisations get created. Don't edit anything yet.

## Assistant

I'll read the schema and then the organisation code in `src/`.

Here is what I found.

**Schema (`prisma/schema.prisma`)**
- `Organisation` has `id`, `name`, `slug`, `createdAt`, and a required `ownerId` with a relation to `User`. There is no separate membership role for the owner, so "the owner" is exactly the user that `ownerId` points to.
- `User.email` is `String @unique`, so it is never null.
- The datasource is `postgresql`, and the existing migrations under `prisma/migrations/` are plain Prisma-generated SQL folders. The most recent one is `20260511093012_add_org_slug`.

**Code**
- Organisations are created in one place, `createOrganisation` in `src/orgs/orgs.service.ts`, which takes the creating user as the owner.
- `src/orgs/orgs.controller.ts` returns the organisation through a serializer in `src/orgs/org.dto.ts`. That DTO lists fields by hand, so a new column won't leak into responses until someone adds it there.
- The tests in `src/orgs/__tests__/` use Jest with a factory in `test/factories/org.ts`. That factory builds an organisation without a billing email, so it needs updating once the column exists.

Since every organisation has a required owner who has a required email, the backfill can't leave any row empty. That means the column can end up `NOT NULL`. The only wrinkle is ordering: Postgres won't add a `NOT NULL` column with no default to a table that already has rows. So the migration has to add the column as nullable, fill it, and then tighten it.

Two questions before I start:
1. Should new organisations take the billing email from the request, or default to the owner's email at creation time?
2. Should the DTO expose the new field in this ticket, or is that for later?

## User

1. At creation the billing email defaults to the owner's email, and the request may override it with an optional `billingContactEmail`. 
2. Yes, expose it in the DTO. The ticket says the API has to return it.

Your plan for the migration is right. I'll add one point because I expect you to reach for the popular default here: you will probably want to do the backfill in a one-off script, or in the seed, and then add the constraint in a later migration. Don't. The backfill goes inside the migration itself. The migration runs once at deploy time, inside the same transaction as the schema change, so there is no window in which the column exists but the old rows are still empty. A separate script is something somebody can forget to run in production. That is also the one place raw SQL is allowed under our rule.

So: edit the schema, generate the migration with `--create-only` so you can edit the SQL before it is applied, and put the backfill in it.

## Assistant

Agreed on the backfill. A script that someone has to remember to run is the more fragile option, and keeping it in the migration means each environment (local, staging, production) ends up in the same state whenever it deploys.

I made these changes:

**`prisma/schema.prisma`**
- Added `billingContactEmail String` to `Organisation`. In the schema it is required, which is what we want at the end.

**Migration**
I ran `npx prisma migrate dev --create-only --name add_org_billing_contact_email`. This created `prisma/migrations/20260602143811_add_org_billing_contact_email/migration.sql`. Prisma's generated SQL tried to add the column as `NOT NULL` straight away, and it printed the usual warning about adding a required column to a table with rows. I rewrote the file by hand so it does three steps:

```sql
-- 1. add the column as nullable
ALTER TABLE "Organisation" ADD COLUMN "billingContactEmail" TEXT;

-- 2. backfill from the owner's account
UPDATE "Organisation" o
SET "billingContactEmail" = u."email"
FROM "User" u
WHERE u."id" = o."ownerId";

-- 3. now every row has a value, so require it
ALTER TABLE "Organisation" ALTER COLUMN "billingContactEmail" SET NOT NULL;
```

The SQL is raw, but it lives only inside the migration, which is what the rule allows. Nothing under `src/` uses it.

**Application code**
- `src/orgs/orgs.service.ts`: `createOrganisation` now sets `billingContactEmail` to `input.billingContactEmail ?? owner.email`, through Prisma's `create`.
- `src/orgs/org.dto.ts`: added `billingContactEmail` to the serializer.
- The request validation accepts an optional `billingContactEmail`, checked as an email address.
- `test/factories/org.ts`: the factory now fills in a billing email, which fixed the type error that showed up in the existing tests.

I haven't applied the migration or run the tests yet. Do you want me to apply it to the local database and run Jest next?

## User

Yes, apply it locally and run Jest. Then, for the migration, I want a check that the backfill did what we say it did. Not a test in the Jest suite, because Jest in this repo doesn't run against a migrated database with old rows in it. Just do it by hand: seed two or three organisations on the previous migration, apply the new one, and compare.

## Assistant

I'll do that in this order: reset to the previous migration, insert rows, apply the new one, compare.

**Setup.** I used the local PostgreSQL database from `.env.development`. I ran `npx prisma migrate reset --skip-seed` and then deployed everything up to `20260511093012_add_org_slug` only, by temporarily moving the new migration folder out of `prisma/migrations/`. Then I inserted three users and three organisations with `psql`. One of the owners had an email with capital letters in it (`Owner.Three@example.com`), because I wanted to be sure the copy doesn't change case.

**Apply.** I moved the folder back and ran `npx prisma migrate deploy`. It applied cleanly in one step.

**Compare.** This query returned zero rows, so no organisation differs from its owner:

```sql
SELECT o."id"
FROM "Organisation" o
JOIN "User" u ON u."id" = o."ownerId"
WHERE o."billingContactEmail" IS DISTINCT FROM u."email";
```

I also checked `\d "Organisation"` and the column shows `not null`. The mixed-case address came through exactly as stored.

**Jest.** The orgs suite runs 14 tests, and all of them pass. One test failed on the first run: `creates an organisation with the owner as billing contact`. I had written the expectation against the factory's default address, not against the owner I passed in. I fixed the test, not the service, and added a second case for the override through `billingContactEmail`. After that the whole suite was green.

The seed rows I added are only in the local database, and I didn't leave any files for them in the repo.

## User

Good. One correction on how you described it: you said "a down migration isn't needed" in the summary of the migration. I never asked about that and I don't want that sentence in anything we write. But I do need a Rollback section, and I want you to tell me honestly what it would be. Do you know how this repo handles rollbacks?

## Assistant

I didn't write that sentence in anything saved to the repo. If it came across that way in my summary, please ignore it. It also wasn't the right way to put it.

On rollbacks: Prisma Migrate has no down migrations. I checked `prisma/migrations/` and there are no down files or scripts, and `package.json` has no rollback script. So in this repo a rollback is a new forward migration that undoes the change. For this ticket that would be:

```sql
ALTER TABLE "Organisation" DROP COLUMN "billingContactEmail";
```

Two things should go into the Rollback section:
- Dropping the column loses any billing emails that were changed after the deploy, because the original owner emails still exist in `User` but a customised billing address would not. If someone has overridden the address by then, the drop deletes that information.
- The application code from this branch has to be reverted before or together with the migration. Otherwise `createOrganisation` would try to write a column that is gone.

I'd write it as: revert the pull request, and ship a follow-up migration that drops the column. Does that match how the team does it, or is there a different process?

## User

That matches. The loss of customised addresses is a good point, keep it. Now the pull request. These are the rules, and I'll give them to you because the template itself lives in the team handbook in Notion, not in the repository, so you can't read it from here.

The title starts with the ticket key: `TW-1204: …`. The branch name is the ticket key and a short slug, so this one should be `TW-1204-org-billing-email`. The description has four sections, in this order: Why, What changed, How I tested, Rollback.

Two more things. Ana, on the platform team, reviews every migration, so I want the description to say clearly that this pull request needs her review because of the migration. And every pull request needs two approvals, so I want the description to be easy to review: short, specific, with the migration's three steps spelled out so the reviewer doesn't need to open the SQL to understand them.

Create the branch, push it, and write the description for me. I'll open the pull request myself.

## Assistant

Creating the branch from the current work and then writing the description.

I created `TW-1204-org-billing-email`, staged the schema, migration, service, DTO, validation and test changes, and made one change set with the message `TW-1204: Add billing contact email to organisations`. I pushed the branch to `origin`. I didn't open the pull request, as you asked.

Here is the title and description to paste in.

**Title:** `TW-1204: Add billing contact email to organisations`

**Needs review from Ana (platform team), because this pull request contains a migration.** It also needs two approvals in total.

**Why**
TW-1204 asks for a billing contact email on every organisation. Existing organisations have to get one, taken from the owner's account email, so that billing messages have somewhere to go from day one.

**What changed**
- `prisma/schema.prisma`: new required field `billingContactEmail` on `Organisation`.
- New migration `20260602143811_add_org_billing_contact_email`, in three steps inside one migration:
  1. Add the column as nullable.
  2. Backfill every existing row from the owner's `User.email` (plain `UPDATE ... FROM`, raw SQL kept inside the migration).
  3. Set the column to `NOT NULL`.
- `createOrganisation` uses an optional `billingContactEmail` from the request and falls back to the owner's email.
- The organisation DTO now returns `billingContactEmail`.
- Test factory and tests updated, with a new case for the override.

**How I tested**
- Applied the migration to a local PostgreSQL database holding three organisations created on the previous migration, one with a mixed-case owner email.
- Compared each organisation's `billingContactEmail` with its owner's `email`: zero differences, and the mixed-case address was copied exactly.
- Confirmed the column is `NOT NULL` afterwards.
- Ran the Jest suite for organisations: 14 tests, all passing.

**Rollback**
Prisma has no down migrations, so rolling back means reverting this pull request and shipping a follow-up migration that runs `ALTER TABLE "Organisation" DROP COLUMN "billingContactEmail";`. Dropping the column loses any billing address that was customised after deploy, since only owner emails survive in `User`.

I put the four sections in bold rather than as headings so that it pastes cleanly. If the Notion template has them as headings, swap them back.

## User

Good. Two changes. First, the sentence about Ana should name why in a single line that she can act on, since she'll open it from a notification and see only the top. Second, one claim in "How I tested" bothers me: "Applied the migration to a local PostgreSQL database holding three organisations". Did you test the rollback statement as well? If not, the description must not suggest that you did.

## Assistant

I did not run the rollback statement. The description doesn't say I did, but its order could lead a reviewer to assume it, so I'll state it plainly in the section.

Revised top and tested section:

**Needs review from Ana (platform team): this adds a migration that backfills `Organisation.billingContactEmail` from `User.email` and then sets it `NOT NULL`.** Every pull request needs two approvals, so one more reviewer is also needed.

**How I tested**
- Applied the migration to a local PostgreSQL database holding three organisations created on the previous migration, one with a mixed-case owner email.
- Compared each organisation's `billingContactEmail` with its owner's `email`: zero differences, and the mixed-case address was copied exactly.
- Confirmed the column is `NOT NULL` afterwards.
- Ran the Jest suite for organisations: 14 tests, all passing.
- Not tested: the rollback statement in the next section has not been run.

If you want it tested before review, I can run the drop statement against the local database and check that the application tests still fail without the column, which would confirm the order in the Rollback section. I would then change the last line to say it was tested.

## User

Do that. I'd rather the line read as tested than as not tested, and the order matters for the reviewer.

## Assistant

I ran it against the local database that still had the three test organisations.

1. I applied `ALTER TABLE "Organisation" DROP COLUMN "billingContactEmail";` with `psql`. It succeeded and the three organisations were intact, without the column.
2. With the column gone and the branch code still in place, the organisations Jest suite failed as expected: 9 of the 14 tests errored with `The column Organisation.billingContactEmail does not exist in the current database`. That confirms the Rollback order: the code has to be reverted with the migration, not after it.
3. I reset the local database to the migrated state afterwards, so nothing is left over in the repo. `git status` shows a clean tree.

So the last line of "How I tested" can now read:

- Rollback tested locally: ran the `DROP COLUMN` statement on the migrated database. The organisations survive, and the branch's tests fail until the code is reverted too, which is why the Rollback section says to revert the pull request alongside the follow-up migration.

Everything else in the description stays as it was. It is ready for you to paste into the pull request for `TW-1204-org-billing-email`.
