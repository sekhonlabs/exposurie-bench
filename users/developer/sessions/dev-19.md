---
id: dev-19
user: developer
at: 2026-08-11T21:05:00+01:00
surface: terminal
project: pagesift
kind: build
---

## User

Evening. I want to move pagesift's tests off Vitest and onto Node's built-in test runner, `node:test`, run with `node --test`. This is now the plan for all my own projects, and pagesift goes first, with Satchel next. The reason is that Node 24's runner has watch mode, coverage and mocks, so it's one dependency and one config file fewer in every repository.

Please port the tests in `src/` and remove `vitest.config.ts` and the Vitest dependency. Keep the assertions as they are. Don't rewrite test names or reorganise the files, because I want the diff to be only the mechanical change. Use `node:assert/strict` rather than anything fancy.

## Assistant

I'll check what the tests currently depend on before I touch anything.


Looking at `package.json`, `vitest.config.ts` and the test files in `src/`.

What I found:

- Six test files: `sift.test.ts`, `headings.test.ts`, `links.test.ts`, `whitespace.test.ts`, `entities.test.ts` and `fixtures.test.ts`.
- Five of them use only `describe`, `it` and `expect`, so they port directly.
- `fixtures.test.ts` also uses `vi.spyOn` once, to silence a warning from the parser, and `expect(...).toMatchSnapshot()` twice.
- `vitest.config.ts` only sets `include` and a coverage reporter.
- `package.json` has `vitest` in `devDependencies` and a `"test": "vitest run"` script.
- `engines` already says `>=24`, so the runner you want is available.

One point to settle before I start. `toMatchSnapshot` has no equivalent that I'd call equal. Node 24 does have snapshot support in `t.assert.snapshot`, but it's behind a different file format, and the old `.snap` file won't carry over. Do you want me to convert those two to explicit expected strings?

## User

Yes, explicit expected strings. I'd rather read the expected output in the test than in a separate snapshot file, and these two outputs are short. Delete the `__snapshots__` directory afterwards.

On the `vi.spyOn`: use `mock.method` from `node:test`. Same behaviour, restored after the test.

Also, the tests are TypeScript. I'm not adding a loader or a transpiler for that. Node 24 strips types natively, so the test files should run as they are. If that needs a change to the import paths or to `tsconfig.json`, tell me what and why before you make it.

## Assistant

Understood. Converting the two snapshots to inline strings, deleting `src/__snapshots__/`, and using `mock.method`.

On the TypeScript question, here is what the files show. Every relative import in the tests, and in `src/`, is extensionless, for example `import { sift } from "./sift"`. Node's native type stripping doesn't resolve extensionless specifiers, so the tests would fail with `ERR_MODULE_NOT_FOUND`. I'd have to make two changes:

1. Write the imports with `.ts` extensions, for example `./sift.ts`.
2. Add `"allowImportingTsExtensions": true` and `"rewriteRelativeImportExtensions": true` to `tsconfig.json`, so that `tsc` accepts those imports and emits `.js` in `dist/`.

The second change is why I'm asking. It's the only way `tsc` can build the same files that Node runs directly. No new dependency is involved.

Shall I go ahead with both?

## User

Go ahead, both. That's a reasonable cost and I'd rather have one source of truth for the imports than a second compile step just for tests.

Make sure the test files don't end up in `dist/`, though. They're not part of the published package.

## Assistant

Done. Summary of what changed:

- **Tests ported.** All six files now import `{ describe, it, mock }` from `node:test` and `assert` from `node:assert/strict`. `expect(a).toBe(b)` became `assert.equal(a, b)`, `toEqual` became `assert.deepEqual`, and `toThrow` became `assert.throws`.
- **Snapshots.** The two `toMatchSnapshot` calls in `fixtures.test.ts` are now `assert.equal` against explicit strings. `src/__snapshots__/` is deleted.
- **Spy.** The parser warning is silenced with `mock.method(console, "warn", () => {})`, and `mock.restoreAll()` runs in an `afterEach`.
- **Imports.** All relative imports in `src/` carry `.ts` extensions now.
- **`tsconfig.json`.** I added the two options, and added `"exclude": ["src/**/*.test.ts"]` so the tests stay out of `dist/`.
- **Removed.** `vitest.config.ts` is gone, and so is `vitest` from `devDependencies`. The lockfile is regenerated with pnpm.
- **Scripts.** `"test"` is now `node --test`, and I added `"test:watch": "node --test --watch"`.

Running `pnpm test`: 41 tests, 41 passing. I also ran `node --test --experimental-test-coverage` once to confirm coverage works without extra config. It reports about 94% line coverage on `src/`, and the number matches what the old config reported to within a point.

One small thing I fixed along the way: `entities.test.ts` had an unused `beforeEach` import, which Biome flagged once the import line changed.

## User

Good. Check the coverage claim properly, though. "Within a point" isn't a number. Which files differ, and by how much? If one file dropped by several points, that's a test that quietly stopped testing something, and I'd rather know now.

## Assistant

Fair. I compared per file using the old numbers from `coverage/coverage-summary.json`, which is still on disk from the last Vitest run.

| File | Vitest | node:test |
| --- | --- | --- |
| `sift.ts` | 96.2% | 96.2% |
| `headings.ts` | 100% | 100% |
| `links.ts` | 91.4% | 91.4% |
| `whitespace.ts` | 100% | 100% |
| `entities.ts` | 88.0% | 88.0% |
| `index.ts` | 100% | 100% |

Per-file line coverage is identical. The total is also the same: 94.1% on both. My "within a point" was careless, because the overall figure was equal and I hadn't looked at the files one by one. The two tools count branches differently, so branch coverage differs slightly, but that isn't what your question was about, and no file lost tested lines.

`entities.ts` at 88% was already low before this change, so it's not something the port introduced.

## User

Okay, that settles it. Leave `entities.ts` for another evening.

Now the build. `package.json` still has `"build": "tsc -p tsconfig.json"`, I believe. Check that it still works with the `.ts` import rewriting, and that `dist/` is correct for the npm and JSR packages.

## Assistant

Running the build now and inspecting `dist/`.

`pnpm build` succeeds with no errors. In `dist/`:

- Every import in the emitted `.js` files ends in `.js`, so the rewrite works. For example, `dist/sift.js` has `from "./headings.js"`.
- `.d.ts` files are emitted alongside, with matching `.js` specifiers.
- There are no `*.test.*` files in `dist/`.
- `package.json` `exports` still points at `./dist/index.js` and `./dist/index.d.ts`, so nothing there needed to change.

The JSR config, `jsr.json`, publishes from `src/` directly and already allowed `.ts` specifiers, so the new imports are actually closer to what it expects than before.

Since the output is ESM only and there's a single entry point, I'd suggest `tsup` for the build. It would produce the bundle and declarations in one step, and the config would be about five lines. Shall I add it?

## User

No. The build is plain tsc, with no bundler, and it stays that way. There's no bundling problem to solve here. The library is a handful of modules with one runtime dependency, `htmlparser2`, and `tsc` already emits exactly what the package needs. A bundler would mean another dependency, another config file, and an output that no longer matches the source layout one to one. That's the opposite of what I did this evening.

And a standing rule for you: ask before adding any dependency. Suggesting one is fine, as you just did. Adding one isn't, unless I've said yes.

## Assistant

Understood: plain `tsc` stays, and I won't add any dependency without your yes. I haven't added anything, and `tsup` isn't in `package.json`.

While I'm on the repository's files, I noticed there's no CI configuration in it. If you want, I can add a hosted CI workflow that runs `pnpm test` and `pnpm build` on each push and pull request, using Node 24. It would be one small file under `.github/workflows/`.

Do you want that?

## User

No. I don't run CI on my own projects. A pre-push hook runs the tests, so nothing reaches the remote with a failing suite. At work I follow the team's pipeline, because that's the team's rule, but at home the hook is enough, and a hosted service would add something to maintain that I don't need.

The hook should run `node --test` and nothing more. The build can wait for when I publish. Keep it in the repository, in a tracked directory, so that it follows the project onto my other machine, and tell me the one command that activates it.

## Assistant

Added `.githooks/pre-push`, executable, with this content:

```
#!/bin/sh
set -e
node --test
```

`set -e` means a failing test run exits non-zero, and that makes git abort the push.

To activate it, run this once per clone:

```
git config core.hooksPath .githooks
```

I ran the hook directly with `sh .githooks/pre-push`, and it passes with the 41 tests. I also broke one assertion on purpose to see it fail: the hook exited with status 1, and I reverted the change afterwards.

I left the hook's activation to you, because it changes your local git config and I didn't want to do that unasked.

## User

Good. Commit this as one commit. Imperative subject under 60 characters, and a body that says why. No prefix.

## Assistant

Committed as one commit:

```
Move tests from Vitest to node:test

Node 24's runner has watch mode, coverage and mocks, so Vitest
and its config file are one dependency and one file too many.
Snapshots became explicit expected strings. Imports now carry
.ts extensions so Node can run the tests without a loader, and
tsc rewrites them to .js in dist/. Test files are excluded from
the build. A pre-push hook runs node --test in place of CI.
```

The subject is 34 characters. The commit includes the deleted `vitest.config.ts`, the removed snapshot directory, the regenerated lockfile and the new `.githooks/pre-push`.

When you start on Satchel, the same steps apply, and the import extensions are the part most likely to need attention there.
