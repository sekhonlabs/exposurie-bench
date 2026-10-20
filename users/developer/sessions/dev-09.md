---
id: dev-09
user: developer
at: 2026-06-14T16:00:00+01:00
surface: terminal
project: pagesift
kind: build
---

## User

Sunday project. I'm pulling the text-extraction code out of Satchel and into its own open-source library, called pagesift. pagesift turns a web page's HTML into readable text. It's the extraction code from Satchel's worker, and Satchel will depend on it once it's out.

The source is in `/Users/dev/code/satchel/worker/src/extract/`. Today's job is the new repository in this folder, `/Users/dev/code/pagesift`. Before we move anything, look at what's in that folder and at the extract directory in Satchel, and tell me what you think needs to change to stand on its own. Don't touch Satchel.

## Assistant

I'll look at both folders first.

Here's what I found.

**`/Users/dev/code/pagesift`** is empty apart from a `.git` directory with no commits.

**`satchel/worker/src/extract/`** has five source files and their tests:
- `extract.ts`, the entry point, which takes an HTML string and returns text
- `blocks.ts`, which decides which elements count as content
- `clean.ts`, which strips scripts, navigation and repeated boilerplate
- `whitespace.ts`, which normalises line breaks
- `types.ts`
- `extract.test.ts` and `blocks.test.ts`, both written for Vitest

Three things need to change:
1. `extract.ts` imports a logger from `../log.js`. That's a Satchel internal, so the library should take an optional callback instead.
2. `clean.ts` reads a `SATCHEL_MAX_NODES` setting. That should become an options field.
3. The tests load fixtures from `../../fixtures/pages/`. Those need to come along.

Packaging, license and registry are still open, so I'll wait for your call on those before I write any config.

## User

Good list, and your plan for the logger and the setting is right. Callback and options field, nothing global.

Now the packaging. It started life as a Deno module, one weekend, which is why the source still uses explicit `.js` suffixes in its imports. I moved it to Node because the people who would use it are on npm, and that's where it should live. Node 24, pnpm, Biome for formatting and linting, Vitest for tests. Keep those suffixes, they're correct for native ESM.

License is MPL-2.0, not MIT. I want file-level copyleft: if someone changes pagesift's own files, those changes come back, but anyone can still use the library inside a proprietary app without the license reaching into the rest of their code. MIT gives me the second half and not the first.

Set up the repo skeleton with that, nothing else yet: `package.json`, the license file, `biome.json`, and a Vitest config.

## Assistant

Understood. I'll keep the `.js` suffixes, since they're what native ESM resolution needs on Node.

Skeleton is in place:

- `package.json`: name `pagesift`, version `0.1.0`, license field `MPL-2.0`, `"engines": {"node": ">=24"}`, `packageManager` pinned to the pnpm version I found on this machine, and scripts for `test`, `lint` and `format`.
- `LICENSE`: the standard Mozilla Public License 2.0 text, unmodified.
- `biome.json`: formatter and linter on, with the defaults except for the indent width, which I matched to what Satchel's `biome.json` uses.
- `vitest.config.ts`: tests under `test/`, with the `src/` directory covered for coverage.

MPL-2.0 is file-level, so I'd normally put a short notice at the top of each source file, but the license's own header is optional when the `LICENSE` file is at the root and the package declares it. I've left headers off for now. Say so if you want them.

One question on packaging. Do you want a dual package, ESM plus a CommonJS build, so older consumers can `require` it?

## User

ESM only. No CommonJS build. Node 24 can `require` an ES module anyway, and a dual package means two copies of the code to test and a build step I don't want in a library this small. Anyone stuck on something older can pin an old version or use dynamic import.

No headers either, your reading is right.

Set `"type": "module"` and make the types ship alongside. Then move the code and tests over. Fixtures too. Make the logger and the settings change we talked about while you're moving it.

## Assistant

ESM only it is. `package.json` now has `"type": "module"`, `main` and `types` point at `dist/index.js` and `dist/index.d.ts`, and there's no second build target.

The move is done:

- Source went to `src/`, with a new `src/index.ts` that re-exports `extract` and the option and result types.
- Tests are in `test/`, and the fixtures are in `test/fixtures/pages/`. I fixed the relative paths in the two test files.
- `extract(html, options)` now accepts `options.onWarn`, an optional callback that replaces the Satchel logger. Without it, warnings are dropped.
- `SATCHEL_MAX_NODES` became `options.maxNodes`, defaulting to the same value Satchel used, 50,000.

Both test files import `htmlparser2` for a DOM-free walk, and so does `blocks.ts`, so the package needs it. I've run into a problem, though: the tests fail on 3 fixtures with `Unexpected end of input` from `blocks.ts`. The sources are unclosed `<td>` and `<li>` tags. The parser handles those fine, but my walk assumes every opened block gets closed. I'm going to look at that now.

## User

That sounds like a real bug in our own walk, not the parser. Fix it in `blocks.ts`, and add a test for it using one of those fixtures by name, so it can't come back.

Then the dependency question, since you've raised it. Runtime dependencies: exactly one, htmlparser2. Dev dependencies are Biome, Vitest and the TypeScript compiler.

## Assistant

You're right, it was our walk. In `blocks.ts` the stack of open blocks was popped only on a matching close tag. The parser reports implied closes through `onclosetag` too, but my code treated the mismatch as an error. It now pops until it finds the matching name, or empties the stack if none matches.

The test is `closes implied blocks in unclosed table cells` in `test/blocks.test.ts`. It uses `test/fixtures/pages/unclosed-cells.html`, and it failed before the change and passes after. The whole suite is green: 41 tests.

`package.json` now lists `htmlparser2` as the only entry under `dependencies`. Under `devDependencies` I put Biome, Vitest and the TypeScript compiler, all at the versions pnpm resolved today.

One suggestion: the parser is lenient but not perfect on badly broken markup. Adding jsdom would give you a browser-grade parse of malformed pages, at the price of a larger tree to build. Want me to try it behind an option?

## User

No. jsdom is far too heavy for this. It pulls in dozens of packages and builds a full DOM just so we can read text out of it, and the whole point of pagesift is that it's small and fast. The leniency we have is enough, and the fixture you just fixed proves we can handle the broken cases ourselves.

And this is a rule now, for all my projects, not just this one: ask before adding any dependency. Runtime or dev, big or small. You say what it is, what it's for, and what it costs, and I decide. I don't want to find a new line in a lockfile that I never agreed to.

## Assistant

Understood, and I'll hold to it. From here on I'll ask before adding any dependency, runtime or dev, with what it is, what it's for and what it costs. jsdom is dropped, and I haven't added anything for it.

If you want the rule to be visible to later sessions, I can write it into a `CLAUDE.md` in the repo root, because that's where I'd find it next time. I won't create the file unless you say so.

The dependency list is still just `htmlparser2`, with the three dev tools. Next on your list I'd guess is the README and the publishing setup. Which should go first?

## User

Yes, write it into `CLAUDE.md`, short. Rule, then the stack in one line: Node 24, pnpm, Biome, Vitest.

Then publishing. pagesift is published to npm and JSR, both, from this same repository. I don't want two sets of source. Set up what JSR needs, and add a `files` list so npm only ships `dist` and the license and the README. Don't publish anything, just prepare it.

## Assistant

`CLAUDE.md` is written. It says to ask before adding any dependency, then gives the stack on one line: Node 24, pnpm, Biome, Vitest.

For publishing, both registries read the same `src/`:

- **npm:** `files` is `["dist", "LICENSE", "README.md"]`, and `prepublishOnly` runs the tests and then the TypeScript build to `dist/`.
- **JSR:** I added `jsr.json` with the name, the version, and the entry point `./src/index.ts`. JSR takes TypeScript directly, so it needs no build output. Its `publish.include` lists `src/`, `LICENSE` and `README.md`.

JSR is strict about explicit return types on everything the entry point re-exports. A dry-run found two functions in `types.ts` and `extract.ts` missing them, so I added the types and the dry-run is clean now.

One mismatch to flag: `version` lives in both `package.json` and `jsr.json`. I added a small test that fails if they differ. That's a Vitest test, not a new dependency.

I've published nothing. Should the README be next?

## User

Yes. Keep it plain: what it does, install for both registries, one usage example, the options, the license in a sentence that says why it's MPL-2.0. No badges, no emoji. And no comments in the example that just restate the code.

## Assistant

`README.md` is written. Its sections, in order:

1. **What it does:** pagesift turns a web page's HTML into readable text. It was extracted from Satchel's worker.
2. **Install:** `pnpm add pagesift` for npm, and `jsr add @pagesift/pagesift` for JSR. I guessed the JSR scope, so check it against the one you own.
3. **Usage:** a single example.
4. **Options:** `maxNodes` and `onWarn`, each with its default.
5. **License:** MPL-2.0. Changes to pagesift's own files must be shared under the same license, while the library can be used inside a proprietary app.

The example:

```
import { extract } from "pagesift";

const text = extract(html, {
  maxNodes: 20_000,
  onWarn: (message) => console.warn(message),
});
```

I also noted in the README that it is ESM only, so nobody expects a `require` build.

I left out the Deno history. That seemed like it belongs in a commit message at most, not in the README.

## User

Agreed on the history. The scope is right as it is. Now commit it. No prefixes: an imperative subject under 60 characters, and a body that says why.

## Assistant

Committed on `main`:

```
Extract text extraction from Satchel's worker

Satchel's worker held the only copy of this code, and it
needs to be usable by other projects on npm. pagesift is
now its own library, ESM only, with htmlparser2 as the
single runtime dependency, under MPL-2.0 so changes to its
files come back.
```

The subject is 43 characters. The commit contains the source and tests with their fixtures, the config files, `jsr.json`, `CLAUDE.md`, `LICENSE` and the README. The unclosed-cells test is part of the same commit because the fix couldn't land without it.

Nothing is published and no remote is configured. When you're ready to point Satchel at pagesift, I'd ask first before touching its `package.json`, as with any dependency.
