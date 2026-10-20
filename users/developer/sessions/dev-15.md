---
id: dev-15
user: developer
at: 2026-07-14T10:05:00+01:00
surface: vscode
project: tidewell-api
kind: build
---

## User

Morning. Two things changed this week, so I'll give you the context before the task.

First, the team moved its tickets from Jira to Linear. Our team key there is ENG, so tickets look like ENG-301 now, not TW-1182. Second, Rui, my manager, asked everyone on the team to connect their agent to the team's tools. I've connected this Claude Code to the GitHub, Linear and Slack MCP servers, so you should be able to read the ticket yourself and I don't have to paste it.

Please read ENG-301 through the Linear connection and tell me what it asks for. Don't change anything yet.

## Assistant

I'll pull ENG-301 through the Linear connection first.

I got it. Here is what the ticket says:

- **Title:** Trim whitespace from organisation names
- **Description:** Names like `"  Acme Ltd "` are stored with their leading and trailing spaces. This breaks exact-match lookups and makes duplicates such as `"Acme Ltd"` and `"Acme Ltd "` look different in the admin list.
- **Acceptance:** Names are trimmed when an organisation is created or renamed. A name that is empty after trimming is rejected with a 400. The ticket says nothing about rows that already exist.

The GitHub and Slack connections also loaded, but I haven't used them. Two places look relevant: `src/orgs/org.service.ts`, which does the Prisma create and update, and `src/orgs/org.validation.ts`, where the request bodies are checked. I haven't edited either.

Do you want existing rows handled in this ticket, or only new writes?

## User

Only new writes. Existing rows are a separate piece of work and I'd rather not mix them in here.

Now, where would you put the trimming? Tell me your plan before you touch anything.

## Assistant

My plan is to trim in `org.validation.ts`, at the point where the request body is parsed. Both the create and rename handlers already go through it, so the service only ever receives a clean name.

1. Add a small helper, `cleanOrgName(raw: string): string`, that trims and throws the existing validation error when the result is empty.
2. Call it from both the create and rename validators.
3. Add Jest cases next to the existing org tests: surrounding spaces are removed, interior spaces are kept, and whitespace-only input gives a 400.

I considered a Prisma client extension that trims `name` on every write to the organisation model. That would cover any future code path too. I'd lean toward the validation boundary because it is simpler, but I'm happy to go the other way if you prefer.

## User

Good that you didn't start with the extension. Stay with the validation boundary, and here is why. A client extension changes data silently, below everything else. Someone reading the service sees `name: input.name` and has no idea it gets rewritten on the way in. I want the cleaning visible where the input is checked, so the next person finds it in the first place they look.

One more constraint: keep it to those two files plus the tests. Don't touch the Prisma schema. If the database ever needs a constraint for this, that is a migration, and it goes through its own review, not this ticket.

## Assistant

Understood. That's the validation boundary only, with no extension and no schema change.

I've made the change:

- `src/orgs/org.validation.ts`: added `cleanOrgName`, used by both `validateCreateOrg` and `validateRenameOrg`.
- `src/orgs/org.service.ts`: untouched. It already passes the validated name straight to Prisma, which is what you wanted.

The helper looks like this:

```
export function cleanOrgName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new ValidationError("Organisation name cannot be empty");
  }
  return name;
}
```

I reused the `ValidationError` class that the other validators in that file already throw, so the 400 mapping works without any new handler code.

I haven't written the tests yet. Should I do that now, or run the linters first?

## User

Tests first, then lint.

For the lint step, the repository uses ESLint and Prettier with the team's shared config, and the rule is that both run before anything gets committed. I would configure this differently in my own projects, but this is the team's repository, so we follow the team's setup. Don't edit the config and don't add disable comments to get around a warning.

## Assistant

Understood. I'll write the tests, run them, then run both linters, and I won't touch the config or add disable comments.

Tests are added to `src/orgs/__tests__/org.validation.test.ts`:

- trims leading and trailing spaces on create
- trims on rename
- keeps interior spaces, so `"Acme  Ltd"` stays as it is
- rejects `"   "` with a `ValidationError`
- rejects an empty string, which the old code already rejected, so this is a regression guard

I ran the Jest suite for the orgs folder: 14 tests, all passing. That includes the 9 that were there before, so nothing existing broke.

Now the linters. ESLint reports one problem in my test file: an unused import, `beforeEach`, which I had copied from a neighbouring test. I removed it. Prettier then flagged two lines in `org.validation.ts` that were over the line width, and I let it reformat just those. A second run of both is clean, with no warnings and no errors.

## User

Good. Did Prettier touch anything outside the files you changed?

## Assistant

No. I ran it against only the three files I edited: `org.validation.ts`, the new test file, and nothing else. I did not run it across the whole repository, so I can't speak for formatting elsewhere. The three-file run reports no differences and ESLint is also clean on them.

Say so if you want a repository-wide check, but that would be a separate decision from this ticket.

## User

No, that's right. Keep it narrow.

Now the branch and the pull request. The convention is unchanged except for the key. A branch is the ticket key and a short slug, like TW-1182-rate-limit-header, and a pull request's title starts with the ticket key, like 'TW-1182: …'. So for this ticket the branch is ENG-301-trim-org-names and the title starts 'ENG-301:'.

The description always has four sections: Why, What changed, How I tested, Rollback. Draft it for me. Also check whether the branch name is already taken before you create it.

## Assistant

I checked through the GitHub connection and locally. There is no `ENG-301-trim-org-names` on the remote and none locally, so the name is free. I created that branch from the current main and committed the three files.

Here is the draft for the pull request:

```
Title: ENG-301: Trim whitespace from organisation names

## Why
Organisation names were stored with leading and trailing spaces,
which broke exact-match lookups and created look-alike duplicates
in the admin list (ENG-301).

## What changed
- Added cleanOrgName in src/orgs/org.validation.ts. It trims the
  name and rejects a name that is empty after trimming.
- Used it in both the create and rename validators.
- No change to the service, the Prisma schema or existing rows.

## How I tested
- Added Jest cases for trimming on create and rename, interior
  spaces kept, and whitespace-only and empty input rejected.
- Orgs test folder: 14 passing.
- ESLint and Prettier clean on the changed files.

## Rollback
Revert this commit. Names saved while it was live stay trimmed,
which is harmless, and nothing else depends on the change.
```

I haven't pushed or opened the pull request. Do you want me to do that, or would you like to edit the text first?

## User

The text is fine, with one addition. In Rollback, say that there is no migration to undo, because a reviewer will look for one.

Then push and open the pull request. Don't mark it ready for anyone. I'll request the reviewers myself, since it needs two approvals.

## Assistant

I added the line to Rollback: "There is no migration to undo, because this change does not touch the schema."

The branch `ENG-301-trim-org-names` is pushed, and the pull request is open with the title `ENG-301: Trim whitespace from organisation names` and the four-section description above. I requested no reviewers and assigned no one, so you can add the two approvals yourself.

The Linear connection also shows ENG-301 linked to the pull request, so the ticket will pick up its status from it.

One note for later: the existing rows with stray spaces are still there. You said that is separate work, so I haven't done anything about it, but it may be worth its own ticket.

## User

Agreed, I'll open one for it myself. That's all for this morning, thanks.

## Assistant

Done. The pull request for ENG-301 is open and waiting on your reviewer requests. Nothing else is left in the working tree.
