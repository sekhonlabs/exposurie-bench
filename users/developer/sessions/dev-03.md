---
id: dev-03
user: developer
at: 2026-05-27T21:10:00+01:00
surface: terminal
project: satchel
kind: build
---

## User

Evening. I want to settle Satchel's tooling before any more code goes in. Satchel is my read-later app: you save links, read them later, search them, and get a weekly digest. It's server-rendered HTML with htmx, so there's no single-page app and no front-end build to think about.

Right now there is no formatter, no linter, no test runner, and no pinned Node version. Everything works because I've been careful, and that has stopped scaling. Please look at the project folder, `/Users/dev/code/satchel`, and tell me what you'd propose. Don't install or change anything yet. I want to read the plan first, and if I disagree I'll say so.

## Assistant

I'll read `package.json` and the source layout first, so the proposal fits what's already there.

Here is what I found:

- **Server:** a Hono app. `src/app.js` builds it, and the routes live in `src/routes/` (`save.js`, `search.js`, `digest.js`, and a few others).
- **Storage:** SQLite, with the schema applied by a `migrate(db)` function in `src/db.js`.
- **Views:** HTML templates in `src/views/`, with htmx attributes in the markup. Nothing is bundled, so there is no build step.
- **Scripts:** `package.json` has only `start` and `dev`. There are no `lint`, `format` or `test` scripts, no `engines` field and no `.nvmrc`.
- **Style drift:** the files mix double and single quotes, and the indentation differs between `save.js` and `digest.js`. A formatter would settle that in one pass.

My proposal for the tooling:

1. **ESLint and Prettier**, with a shared config. ESLint would use the flat config format and carry the lint rules. Prettier would own formatting. I'd add the small config package that switches off ESLint's formatting rules, so the two tools don't fight over whitespace.
2. **A test runner**, which I'd pick after you tell me what you prefer.
3. **A pinned Node version**, in an `.nvmrc` and in `engines`.
4. **Scripts** in `package.json` for lint, format and test.

Two questions before I start. How do you install things here: npm, pnpm or something else? And which Node version should I pin? Nothing is changed yet.

## User

No to ESLint and Prettier. That pairing is the default everyone reaches for, but it means two tools, two config files, and a third package whose only job is to stop the first two disagreeing. For a project this size that's ceremony. Use Biome: one tool that does both formatting and linting, with one config file. I'd rather have a single thing to learn, a single thing to upgrade, and a single place where the rules live.

On installing: pnpm. I use it for everything, so use it for this too.

Please do the following:

- Install Biome with pnpm, pinned to an exact version so formatting can't shift under me between upgrades.
- Create `biome.json`. Two-space indentation, double quotes, and the recommended lint rules. Keep it small. I don't want a screen of overrides.
- Add `lint` and `format` scripts.
- Run it over the whole project and tell me what it finds. Fix what's trivially mechanical. If anything needs a real decision, stop and ask me.

Don't touch tests yet. That's the next step.

## Assistant

Understood, I'm switching to Biome. One config file and one tool is a better fit than the ESLint and Prettier pairing for a project this size.

What I did:

- Ran `pnpm add -D --save-exact @biomejs/biome`. The version is pinned exactly in `package.json`, and pnpm wrote its lockfile.
- Created `biome.json`:

```
{
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "files": { "includes": ["src/**", "test/**"] }
}
```

- Added two scripts to `package.json`: `"lint": "biome check ."` and `"format": "biome format --write ."`.

The first `pnpm lint` run reported:

- **Formatting:** differences in 6 of the 14 files, mostly the quote style and the odd indentation in `digest.js`. I ran `pnpm format` and they are all consistent now.
- **One real lint error:** `src/routes/search.js` imported a helper called `escapeHtml` and never used it. The query is escaped inside the template, so the import was dead and I removed it. That one is mechanical, so I didn't stop to ask.
- **One warning left alone:** a `forEach` in `src/routes/digest.js` that Biome would prefer as a `for...of` loop. Rewriting it changes the code rather than the layout, so I left it. It's a warning, not an error, so `pnpm lint` exits cleanly. If you want it changed, say so.

I haven't touched anything under `test/`, and nothing there exists yet.

For the next step, which test runner do you want?

## User

Vitest. I want it for the same reason as Biome: it's small, and it runs without a pile of config. Add it as a dev dependency with pnpm, pinned exactly like Biome.

Then write a first test for the save handler. The save handler is what everything else depends on, because every link in the app goes through it. Run it against an in-memory SQLite database, not the real file, and don't mock the database. I'd rather the test do a real insert and read the row back. If the structure of the app makes that awkward, tell me what's awkward before you start bending the code to fit.

Add a `test` script too, and make sure `pnpm lint` still passes afterwards.

## Assistant

I added Vitest with `pnpm add -D --save-exact vitest`, then added `"test": "vitest run"` to `package.json`.

The structure of the app does not get in the way. `src/app.js` exports `createApp(db)`, which takes the database as an argument. `src/routes/save.js` handles `POST /save`: it reads a form field called `url`, inserts a row into `links`, and returns a `201` with an HTML fragment that htmx swaps into the page. Because the database is passed in, the test can hand it an in-memory SQLite connection and I didn't need to change any application code.

The test is in `test/save.test.js`. The core of it:

```
test("saving a link stores it and returns a fragment", async () => {
  const app = createApp(db);
  const res = await app.request("/save", {
    method: "POST",
    body: new URLSearchParams({ url: "https://example.com/post" }),
  });
  expect(res.status).toBe(201);
  const row = db.prepare("SELECT url FROM links").get();
  expect(row.url).toBe("https://example.com/post");
});
```

The first run failed with `no such table: links`. The schema is applied by `migrate(db)`, not by opening the connection, and my `beforeEach` had skipped that step. I now open a fresh `:memory:` database and call `migrate(db)` in `beforeEach`, so every test starts from an empty schema.

I also added two small tests next to it, one for an empty `url` field and one for saving the same URL twice. Both documented existing behaviour, so I didn't change the handler. An empty field returns `400`, and a duplicate returns `200` with the existing row.

Results: `pnpm test` passes with 3 tests. `pnpm lint` passes too, with the same single `forEach` warning as before.

Which Node version should I pin?

## User

Node 24. It's what I run everywhere, so that's the version the repository should say. Pin it in the repo in the two places that matter: an `.nvmrc` so my shell picks it up, and `engines` in `package.json` so a mismatched install fails loudly instead of quietly misbehaving.

Also set the `packageManager` field so it names pnpm. That way nobody, including me on a new machine, runs the wrong tool by accident.

If the Dockerfile for deploying to Fly.io mentions a Node version, check it agrees. If it doesn't, don't change it. Just tell me.

## Assistant

Done. These are the changes:

- **`.nvmrc`:** contains `24`.
- **`engines`:** `"node": ">=24 <25"` in `package.json`. With pnpm's default settings, an install under a different major version now fails with an error instead of continuing.
- **`packageManager`:** set to pnpm, at the version installed on this machine. Corepack and similar tools will refuse to run a different package manager for this repo.

The Dockerfile agrees. Its base image already uses the 24 line, so there was nothing to report there and I didn't touch it.

Current state of the working tree, all uncommitted:

- new: `biome.json`, `.nvmrc`, `test/save.test.js`, and the pnpm lockfile
- changed: `package.json`, and the 6 files Biome reformatted
- changed: `src/routes/search.js`, for the removed unused import

`pnpm lint` and `pnpm test` both pass. I haven't committed anything. Before I do, how should commits read in this repo? Unless you say otherwise I'd default to Conventional Commits.

## User

Not Conventional Commits. No type prefixes and no scopes in parentheses. At work I follow whatever the team has agreed on, and that's fine there, but this is my project and I want the history to read like sentences.

The rules:

- The subject line is in the **imperative**, like "Add" or "Fix", and under 60 characters.
- No trailing full stop on the subject.
- A blank line, then a body that says **why** the change was made.

Don't commit yet. Show me the message you'd write for the work in the tree, as one commit, and I'll tell you if it's right.

## Assistant

Understood: no Conventional Commits, no prefixes, an imperative subject under 60 characters, and a body that says why. Here is my draft for the whole tree as one commit:

```
Add Biome, Vitest and a first test for the save handler

Add Biome for formatting and linting, with a single biome.json.
Reformat six files to match it and remove an unused import in
search.js. Add Vitest with a test for the save handler that runs
against an in-memory SQLite database. Add .nvmrc, an engines
field and a packageManager field to pin Node 24 and pnpm.
```

The subject is 55 characters. I'm not sure the body is what you want, though.

## User

The subject is fine. The body is wrong: you've listed what changed, and the diff already shows that. I asked for why. Rewrite it so it says why Satchel needed these things now, why one tool for formatting and linting, why the save handler was the first thing tested, and why the versions are pinned. Keep it short, and wrap lines at 72.

## Assistant

You're right, that body was a changelog. The new one:

```
Add Biome, Vitest and a first test for the save handler

Satchel had no formatter, linter or tests, and more code is about to
land, so the conventions needed settling first. Biome does formatting
and linting from one config file, which leaves a single tool to
learn and upgrade.

Every saved link passes through the save handler, so it is the first
thing under test. The test uses a real in-memory SQLite database
rather than a mock, so it checks the actual insert.

Node 24 and pnpm are pinned in the repository so installs behave the
same on every machine and a mismatch fails loudly.
```

The subject is unchanged at 55 characters. The body is wrapped at 72 or less and explains the reasons, not the file list.

Shall I commit it as it stands?

## User

Yes, commit it exactly like that.

## Assistant

Committed. `git log --oneline -1` shows:

```
a3f9c21 Add Biome, Vitest and a first test for the save handler
```

The body is the one you approved, and the working tree is clean. `pnpm lint` and `pnpm test` both pass on the committed state.

One more option, if you want it: I can add editor settings to the repository, such as format-on-save and Biome as the default formatter for the project, so Biome runs automatically for anyone who opens Satchel in an editor. I haven't added anything yet.

## User

No need. I use Neovim, and it's already set up for Biome, so format-on-save works without anything in the repo. I'd rather the repository hold only what the project itself needs. Editor settings are personal, and they'd just be files that go stale.

## Assistant

Agreed. I've added nothing editor-specific, so the repository stays as committed.

Where Satchel's tooling stands now:

- **Formatting and linting:** Biome, configured in `biome.json` and run with `pnpm lint` and `pnpm format`.
- **Tests:** Vitest, run with `pnpm test`, with the save handler covered against an in-memory SQLite database.
- **Pinned environment:** Node 24 via `.nvmrc` and `engines`, and pnpm via `packageManager`.
- **History:** one commit in the style you set. It has an imperative subject under 60 characters, no prefixes, and a body that says why.

The one open item is the `forEach` warning in `src/routes/digest.js`. It is harmless today, so it can wait until you next touch the digest code.
