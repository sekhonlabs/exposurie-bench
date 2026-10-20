---
id: dev-10
user: developer
at: 2026-06-18T21:30:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

Evening session on satchel. Two things tonight: search across saved articles, then styling the reading view.

Search first, and I've already decided how it works. It's SQLite FTS5 over the extracted text, nothing else. I'm not going to run Meilisearch or any other separate service for this. It's one person's reading list, and Litestream already replicates the one file I care about. A second process with its own data directory would mean a second thing to back up and a second thing that can be down.

What I want from you:

1. A migration that creates the FTS5 index over the article title and the extracted text, kept in sync with the articles table.
2. A ranked query, in a `.sql` file like the other queries, loaded through the existing helper. No inline SQL strings in route code.
3. A search page, server-rendered with a result list showing a snippet with the matches marked.

Look at how the articles table is set up before you write anything. Tell me what you find, and ask before you add any dependency. I don't expect you'll need one.

## Assistant

I'll check the schema, the migrations folder and the query loader first.


Here's what I found, then the plan.

**What's in the project**
- `migrations/` runs from `0001` to `0006`. The articles table is in `0002_articles.sql`. Its primary key is a ULID stored as text, and it isn't declared `WITHOUT ROWID`, so every row still has an implicit integer `rowid`. That matters because FTS5 external-content tables key on an integer rowid.
- Article text is in `extracted_text`, written by the save job. That job calls `pagesift`, which turns the page's HTML into readable text, and `package.json` lists it as a separate package, so it's already out of Satchel's own code. The index only needs to read the column.
- `src/db/sql.ts` is the loader. It reads `src/db/queries/*.sql` by file name. I'll add `search.sql` there.
- The database is in WAL mode, so index writes won't block reads on the search page.

**Plan**
- `migrations/0007_articles_fts.sql` creates an external-content FTS5 table over `articles` with `title` and `extracted_text`. The text lives only in `articles` and the index stores just the tokens. Three triggers (insert, update, delete) keep it in sync. The migration ends with a one-time `rebuild` so articles you've already saved get indexed.
- `src/db/queries/search.sql` is a ranked query ordered by `bm25`, with the title weighted above the body.
- `src/routes/search.ts` is a new Hono route, and `src/views/search.ts` renders the page.

No new dependency. FTS5 ships in the SQLite build we already use, and I'll confirm that when I run the migration. I'm starting on the migration now.

## User

Go ahead. Two constraints on the ranked query. Title matches should clearly beat body matches, because when I search for a word I usually remember it from the headline. And I don't want to see results for articles I've archived, so filter on that, but check what the column is actually called instead of guessing.

## Assistant

I checked the column. It's `archived_at`, a nullable timestamp, so "not archived" means `archived_at IS NULL`.

The migration, the query and the loader entry are written. The migration applied cleanly against a scratch copy of the database, so FTS5 is available in this build.

**`0007_articles_fts.sql`**
- The virtual table is `articles_fts`, declared with `content='articles'` and `content_rowid='rowid'`.
- The insert, update and delete triggers use the documented external-content pattern. The delete and update paths insert the old values with the special `'delete'` command before adding the new ones. If you skip that step, the index fills with stale tokens and the first symptom is search results for text you've since removed.
- The final `INSERT INTO articles_fts(articles_fts) VALUES('rebuild')` indexed 214 existing articles on the scratch copy.

**`search.sql`**

```sql
SELECT a.id, a.title, a.url, hits.excerpt
FROM (
  SELECT rowid, bm25(articles_fts, 10.0, 1.0) AS score,
         snippet(articles_fts, 1, char(2), char(3), '…', 24) AS excerpt
  FROM articles_fts
  WHERE articles_fts MATCH :query
) AS hits
JOIN articles a ON a.rowid = hits.rowid
WHERE a.archived_at IS NULL
ORDER BY hits.score
LIMIT 30;
```

Some notes on that query:
- `bm25(articles_fts, 10.0, 1.0)` weights the title column ten times the body. bm25 in SQLite returns lower numbers for better matches, so the default ascending `ORDER BY` is correct.
- My first attempt put `snippet()` and the join in one query, and SQLite refused with `SqliteError: unable to use function snippet in the requested context`. The auxiliary functions only work when the planner is scanning the FTS table itself. Wrapping the FTS part in a subquery and joining afterward fixes it, which is the shape above.
- The excerpt markers are the control characters `char(2)` and `char(3)`, not HTML. The view escapes the whole excerpt first and then swaps the markers for `<mark>` and `</mark>`. Article text is untrusted, so raw markup in it can't get through that way.

**Raw user input is a problem.** FTS5 has its own query syntax, so a search for `c++` or `don't` or a stray quote throws a syntax error. I added `toMatchQuery()` in `src/routes/search.ts`. It splits the input on whitespace, wraps each term in double quotes (doubling any inner quotes) and adds a `*` to the last term so results appear as you type. Empty input returns the page with no query run.

I haven't added tests yet. I'll do that once you've seen the page.

## User

Good on the subquery, and I'm glad you escape before marking. One thing on `toMatchQuery`: I don't want the prefix star on the last term when it's shorter than three characters. Two letters matches half the library and the page gets noisy. Below three, match the term exactly.

Also, the page should use htmx, the same as the rest of Satchel. The input should fire the request as I type, with a short delay, and swap just the results list. The URL should update so I can reload or share a search. No client-side rendering, and the server returns HTML either way.

## Assistant

Both are done.

**Prefix rule.** `toMatchQuery()` now adds the `*` to the last term only when it's at least three characters long. Shorter terms stay as exact quoted tokens. I measured the difference on your scratch data: `ai` as a prefix matched 61 articles, and as an exact token it matched 9.

**htmx.** The route in `src/routes/search.ts` looks at the `HX-Request` header:
- A normal request renders the full page: layout, the form and the results list.
- An htmx request returns only the results fragment, `<ol id="results">…</ol>`.

The input in `src/views/search.ts` looks like this:

```html
<input type="search" name="q" value="…"
       hx-get="/search"
       hx-trigger="input changed delay:250ms, search"
       hx-target="#results"
       hx-push-url="true"
       autocomplete="off">
```

- `delay:250ms` waits for a pause in typing, and `input changed` skips requests when the value hasn't actually changed.
- `hx-push-url="true"` makes `/search?q=…` the address after each swap, so reloading renders the same results as a full page.
- With JavaScript off, the form still submits as a plain GET. That falls out of server-rendered HTML.

**Small fixes along the way**
- Biome flagged an unused import in `src/routes/search.ts` and reformatted two lines in the view. I ran `pnpm biome check --write` and the check passes.
- Link text in results uses the article title and falls back to the hostname when the title is empty.

**Tests.** I added `src/routes/search.test.ts` with Vitest, using an in-memory database that runs the real migrations. It covers these cases:
- A title match outranks a body-only match.
- Archived articles don't appear.
- `c++` and a lone quote don't throw.
- A two-letter term doesn't prefix-match.
- The excerpt escapes `<script>` in article text and still contains `<mark>`.

All five pass under `pnpm vitest run`.

## User

All five pass for me too. One more scenario I want covered: I edit an article's title and then search for the old title. It should no longer match. That's what proves the update trigger does the delete-then-insert correctly. Add it, and tell me whether it actually fails if you break the trigger on purpose.

## Assistant

I added the test, `renaming an article removes the old title from the index`. It inserts an article, renames it with an `UPDATE`, then checks that the old title returns zero results and the new title returns one.

I checked that it catches a broken trigger. I temporarily changed the update trigger to skip the `'delete'` step and only insert the new row. The new test failed with the old title still returning one result, and no other test noticed. I restored the trigger and all six tests pass again. Migration `0007` is unchanged from the one you saw.

The search side is finished. Here's a commit message following your convention:

```
Add FTS5 search over saved articles

Search needs to match titles and extracted text without a second
service to run and back up. Title matches are weighted above body
matches because titles are what gets remembered.
```

The subject is 47 characters, imperative, with the reason in the body. I haven't committed anything. That's your call.

On to the reading view. The page is `src/views/read.ts` and there's no stylesheet for it yet. It's just the browser defaults inside the layout. I'll set up the styling next.

## User

Go ahead and propose how you'd style it.

## Assistant

Here's my proposal.

The reading view is one article at a time: a title, a byline line with the source and date, then the body text. It has to look right on a phone and on a wide monitor. I'd use **Tailwind**. The utility classes go straight on the elements in `read.ts`, and a typography plugin would handle the article body, so headings, lists, blockquotes and code blocks look right without hand-written rules. It would also give us responsive breakpoints and a spacing scale from the start.

The setup would be:
- Add Tailwind and its CLI as dev dependencies.
- Add a `pnpm` script that builds `public/app.css` from the classes it finds in `src/views/`.
- Use the typography plugin on the article container.

I'd want your go-ahead on the dependencies before I install anything.

## User

No. Not Tailwind. This is a reading app and it needs very little CSS: one column of text, a few sizes, some spacing. Tailwind brings a build step, a config file, and a plugin just to make a handful of rules. It also puts the styling inside the markup, and I want `read.ts` to stay plain semantic HTML with class names that say what things are. And the article body is HTML that came out of pagesift, not markup I write, so I can't put utility classes on it anyway. It has to be styled by element selectors from outside.

Write plain CSS with custom properties. Define the spacing and the type sizes as custom properties on `:root` and use them everywhere, so changing the rhythm of the page means editing a few lines. One file, `public/reading.css`, linked from the layout. No new dependencies, no build step.

Some specifics:
- A single column that never gets wider than about 65 characters, centered, with comfortable side padding on a phone.
- A type scale of about five steps, defined once, and body text slightly larger than the browser default with generous line height.
- Spacing on a small scale, and vertical rhythm between paragraphs and headings that comes from that scale.
- Images inside the article must never overflow the column. Code blocks scroll sideways instead of wrapping.
- Do not specify any colours. Inherit from the browser and the layout for now, and I'll deal with colour separately.

## Assistant

You're right on both counts. The body markup comes from the extraction step, so utility classes can't reach it, and a build step plus a plugin is a lot of machinery for what's needed. I'll go with plain CSS and custom properties, and I'm not installing anything.

I checked `src/views/read.ts` and the layout. The article container is `<article class="reading">`, and the body goes inside `<div class="reading-body">` as already-sanitized HTML. I can target `.reading-body` with element selectors. The layout is `src/views/layout.ts`, and it currently links no stylesheet except the one for the search page.

I wrote `public/reading.css` and added a single `<link>` to the layout. The structure:

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2.5rem;

  --text-sm: 0.875rem;
  --text-base: 1.125rem;
  --text-lg: 1.375rem;
  --text-xl: 1.75rem;
  --text-2xl: 2.25rem;

  --measure: 65ch;
  --leading: 1.65;
}
```

**How it uses them**
- `.reading` has `max-width: var(--measure)`, `margin-inline: auto` and `padding-inline: var(--space-3)`. On a phone the text keeps a margin, and on a wide screen it stops at about 65 characters.
- The page title uses `--text-2xl` with a tight line height. `h2` and `h3` inside the body use `--text-xl` and `--text-lg`. The byline is `--text-sm`.
- Body text is `--text-base` (18px at the default root size) with `line-height: var(--leading)`.
- Vertical rhythm comes from one rule: `.reading-body > * + * { margin-block-start: var(--space-3); }`. Headings override it with `var(--space-5)` above and `var(--space-2)` below, so a heading sits closer to the text it introduces than to the text before it.
- `.reading-body img` and `video` get `max-width: 100%; height: auto`.
- `pre` gets `overflow-x: auto` and `white-space: pre`, so code scrolls sideways. Inline `code` is only set to a smaller size with `var(--text-sm)`.
- `blockquote` has an inline-start indent from `--space-4` and no colour.
- Lists keep their native markers, with `padding-inline-start: var(--space-4)` and `var(--space-1)` between items.

There are no colour declarations anywhere in the file, as you asked. There's no build step either: the file is served as it is from `public/`.

Biome checked the CSS and found nothing. The search page uses the same layout, so its results list now gets the same type size and column width. That's an unplanned side effect, but it looked consistent when I rendered it, and the file is small enough to adjust if you disagree.

## User

The shared column on the search page is fine, actually better than what I had. One thing I'd change: `--text-base` at 1.125rem is a bit big on a phone. Keep it for wider screens, but give small screens plain 1rem. Do it by redefining the custom property in a media query, not by adding new rules on the elements.

## Assistant

I made that change. It redefines the property in one place and adds no rules on the elements:

```css
@media (max-width: 40em) {
  :root {
    --text-base: 1rem;
  }
}
```

Everything that reads `--text-base` follows it: the body text, the search results list and the excerpt lines. Nothing else in the file needed to change. The block sits directly under `:root`, so the full set of values is visible together. The breakpoint is in `em`, so it follows the reader's font-size setting instead of a pixel width.

I rendered a saved article and a search results page at both widths. At the narrow width the body is 16px, and above that it's 18px, with the column still centered and capped at about 65 characters. A wide table in one article scrolls inside its own box. That only works because I put `display: block; overflow-x: auto` on `.reading-body table`. I added that rule in the same pass, since you'd otherwise see the table push the page sideways.

**Where things stand**
- Search: `0007_articles_fts.sql`, `search.sql`, the search route and view, and six passing Vitest tests.
- Reading view: `public/reading.css`, linked from the layout, with no dependencies added and no build step.
- Nothing is committed. For the CSS, I'd suggest:

```
Style the reading view with plain CSS

A reading app needs very little CSS, so custom properties for
spacing and type sizes replace a utility framework and its build.
```

Colour is still open, as you said, so that's the natural next piece.
