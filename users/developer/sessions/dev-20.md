---
id: dev-20
user: developer
at: 2026-08-13T11:20:00+01:00
surface: vscode
project: tidewell-api
kind: build
---

## User

I'm picking up Linear ticket ENG-318 (team key ENG). Please read it through the Linear connection first. It's a new endpoint that exports an organisation's projects as CSV.

Constraints before you start:

- The public API is versioned in the path, and new endpoints go under /v2. So the route is `GET /v2/organizations/:id/export`.
- Every query goes through Prisma. Raw SQL is only allowed inside migrations, and this ticket needs no migration.
- Tests are Jest, next to the existing ones.

Tell me what the ticket asks for and where you plan to put the code. Don't write anything yet.

## Assistant

I read ENG-318 through the Linear connection. Its requirements:

- Export all projects of one organisation as CSV.
- Columns, in order: `id`, `name`, `status`, `created_at`, `task_count`.
- Large organisations must not time out or exhaust memory.
- The response is a download, so it needs a filename in the headers.

I also checked the repository. `src/routes/v2/` already has an index that registers the v2 routers, and `src/routes/v2/organizations.ts` has the existing organisation routes. The Prisma client is exported from `src/db/client.ts`, and the existing tests live under `src/__tests__/`.

Plan:

1. Add the route to `src/routes/v2/organizations.ts` as `GET /v2/organizations/:id/export`, behind the same auth middleware as its neighbours.
2. Put the data access in a new `src/services/exportProjects.ts`. It will be a Prisma `findMany` with `_count` on tasks, fetched in pages.
3. Put the CSV row formatting in `src/lib/csv.ts`.
4. Add Jest tests for the service and the route.

For paging I'd use `skip`/`take` with a fixed page size and write each page to the response as it arrives. Is that fine?

## User

No, not `skip`/`take`. It's the popular default, but in Postgres an offset still scans and discards every skipped row, so each page gets slower than the last. Some organisations have tens of thousands of projects, and the export would get slower the further it went. Use cursor pagination on the primary key: `cursor`, `take`, and an `orderBy` on `id`. Everything else in your plan is fine.

Also, don't buffer. The response has to be streamed, so the first bytes go out before the last page is read.

## Assistant

Understood: cursor pagination on `id`, with streamed output. Writing it now.

I'm implementing the service as an async generator. Each iteration fetches one page of 500 projects with the cursor set to the last `id` of the previous page. The route will turn that generator into a readable stream and pipe it to the response.

I'll start with the service.

Done with the service and the CSV helper. Here is what exists now:

- `src/services/exportProjects.ts` exports `exportProjects(orgId)`, an async generator that yields CSV lines. The first yield is the header. Pages come from `prisma.project.findMany` with `where: { organizationId }`, `orderBy: { id: 'asc' }`, `take: 500` and `cursor`/`skip: 1` after the first page. The `skip: 1` only steps past the cursor row itself, so it is not offset paging.
- `src/lib/csv.ts` exports `toCsvRow(values)`. It quotes any field containing a comma, quote or newline and doubles embedded quotes.

One thing I considered and rejected: a Postgres `COPY ... TO STDOUT` through `$queryRaw` would be faster, but it would put raw SQL in application code, which you ruled out. So it stays on Prisma.

Next is the route.

## User

Good. Skipping `COPY` is correct, and I'm glad you didn't need to be told. One correction on the route: set `Content-Disposition` to `attachment; filename="projects-<orgId>.csv"` and `Content-Type` to `text/csv; charset=utf-8`. Don't use the organisation name in the filename. Names contain spaces and odd characters, and I don't want to sanitise them.

## Assistant

Done. In `src/routes/v2/organizations.ts` the new handler:

- Sets `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="projects-<orgId>.csv"`, with the id taken from the path param. Since the name is never used, there is nothing to sanitise.
- Wraps `exportProjects(id)` with `Readable.from(...)` and pipes it to the response using `stream/promises` `pipeline`, so back-pressure from a slow client pauses the page reads.
- If the stream fails after the headers are sent, it destroys the response instead of trying to send a JSON error body, because a half-written CSV followed by JSON would be worse than a truncated file.

The route goes through the same auth middleware as the other organisation routes, so a caller who can't read that organisation gets the same rejection as on those routes.

Now the tests.

## User

Go ahead with the tests. I want at least these cases: header-only output for an organisation with no projects, correct quoting of a name containing a comma and a quote, and a check that the service pages through more than one page.

## Assistant

Added `src/__tests__/exportProjects.test.ts` and `src/__tests__/organizationsExport.test.ts`.

The service tests mock the Prisma client and cover your three cases:

- **Empty organisation:** the generator yields only the header line.
- **Quoting:** a project named `Acme, "Phase 2"` comes out as `"Acme, ""Phase 2"""`.
- **Paging:** the mock returns a full page of 500, then 120 rows. The test asserts that `findMany` was called twice and that the second call carried `cursor: { id: <last id of page one> }`.

The first run failed in the route test:

```
TypeError: Cannot read properties of undefined (reading 'findMany')
  at exportProjects (src/services/exportProjects.ts:14:38)
```

The cause was my mock, not the service. The route test used `jest.mock('../db/client')` with automock, which left `prisma.project` undefined. I replaced it with an explicit factory returning `{ prisma: { project: { findMany: jest.fn() } } }`. After that, both files pass: 7 tests, 0 failures. I also ran ESLint and Prettier on the changed files, and both are clean.

## User

Before I accept the page size, think about 500. I'd lean towards 2000 to cut the number of round trips. Run something to check whether it matters, and tell me what you find.

## Assistant

I can't hit the real database from here without credentials, so the check is limited. I wrote a throwaway script outside the repo that runs the generator against a fake `findMany`. The fake sleeps 5 ms per call to stand in for a round trip and returns synthetic rows. For 50,000 projects:

- Page size 500: 100 calls, about 0.5 s of simulated latency.
- Page size 2000: 25 calls, about 0.13 s.

So the saving is about 0.4 s per 50,000 rows at 5 ms a call. That's real, but small next to the time a client takes to download tens of megabytes. Larger pages also mean each page holds more rows in memory at once, and every row carries a `_count` subselect.

The simulation can't show query cost, so it can't settle this. I'd keep 500 as a named constant, `EXPORT_PAGE_SIZE`, so it can be changed in one place after you've seen real timings. I've made it a constant and left it at 500. Say if you want 2000 instead.

## User

Fine, that persuades me: the saving is small and the memory side matters more. Keep 500 as the constant.

Now the branch and the pull request. The branch is `ENG-318-org-projects-csv-export`. Pull requests here are squash-merged only, so don't bother tidying the branch's commits. Commit however you like, because the PR title becomes the commit. The title starts with the ticket key, like `ENG-318: Add CSV export of organisation projects`.

The description has four sections: Why, What changed, How I tested, Rollback. The template is in the team handbook, which is in Notion and not in the repo, so you won't find it. Use those four headings.

## Assistant

Created the branch `ENG-318-org-projects-csv-export` and committed the work in two commits: one for the service and helper, and one for the route and tests. I didn't rewrite or squash anything locally, since the squash happens at merge.

Here is the description I'm going to submit with the title `ENG-318: Add CSV export of organisation projects`:

```
## Why
ENG-318: customers need to download an organisation's projects as CSV.

## What changed
- New route GET /v2/organizations/:id/export, streamed, with a download filename.
- exportProjects service: Prisma cursor pagination on id, 500 rows per page.
- csv helper that quotes commas, quotes and newlines.
- Jest tests for the service and the route.

## How I tested
- Jest: empty organisation, quoting, multi-page paging, route headers.
- ESLint and Prettier clean on the changed files.
- Page size checked with a simulated-latency script; kept at 500.

## Rollback
Revert the squash commit. The change is additive and has no migration.
```

One caveat for "How I tested": I haven't run the endpoint against a real database, only against mocks. Do you want that stated in the description?

## User

Yes, add one line saying it hasn't been run against a real database yet. Reviewers should know that. Then open the PR.

## Assistant

I added the line under "How I tested": "Not yet run against a real database; covered by mocked Prisma only."

I opened the pull request through the GitHub connection with the title `ENG-318: Add CSV export of organisation projects` and the description above. It targets the main branch from `ENG-318-org-projects-csv-export`.

Summary of what's in it:

- `src/routes/v2/organizations.ts`: the new `GET /v2/organizations/:id/export` handler
- `src/services/exportProjects.ts`: cursor-paginated generator, `EXPORT_PAGE_SIZE = 500`
- `src/lib/csv.ts`: row formatting
- two Jest files under `src/__tests__/`

It still needs its required approvals before it can be squash-merged. The first real-database run is the open item, so that is what I'd mention to reviewers.
