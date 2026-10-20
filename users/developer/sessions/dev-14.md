---
id: dev-14
user: developer
at: 2026-07-08T21:00:00+01:00
surface: terminal
project: dotkit
kind: build
---

## User

Tonight is dotkit's first release. It's the Go CLI that keeps my dotfiles in sync across my computers, and I want v0.1.0 tagged before I stop. Releases should be built with GoReleaser, and it should also update a Homebrew tap, so `brew install` works on my laptop and on the others.

Some constraints before you touch anything. The CLI uses Go's standard flag package and I don't want Cobra, so don't suggest it, even for version handling. Ask before adding any Go dependency. GoReleaser is a build tool and not a module dependency, so that one is fine. Config lives at `~/.config/dotkit/config.toml`, and nothing in the release should touch that path. Secrets come from 1Password through its CLI, so no `.env` files and no tokens written into the repo.

Start by reading what's there: `go.mod`, `main.go`, and anything release-related. Then tell me what's missing before you write anything.

## Assistant

I'll read the module file, the entry point and the top of the tree first.

Here is what I found in `/Users/dev/code/dotkit`:

- `go.mod` declares module `dotkit` with no third-party requirements. Flag parsing in `main.go` is the standard `flag` package with a hand-written subcommand switch, so nothing there conflicts with what you said.
- `main.go` has `-version` wired to a constant, `const version = "dev"`. A release binary needs this to be a variable that the linker can overwrite. As it stands, every build would report `dev`.
- There is no GoReleaser config, no release workflow and no `LICENSE` file.
- The `.gitignore` already excludes `dist/`, which is where GoReleaser writes its output.

Here's what I propose, and I'll wait for your go-ahead on the licence before writing it:

1. Change the constant to `var version = "dev"` and have GoReleaser set it with `-X main.version={{.Version}}`.
2. Add a GoReleaser config that builds darwin and linux for amd64 and arm64, packs each build into a tarball with the README and licence, writes a checksum file, and generates a changelog from commit subjects.
3. Add a `brews` section pointing at a separate tap repository, `homebrew-dotkit`, so the formula is pushed there on each release.
4. Add a `LICENSE`. Since this is a small personal tool, I'd default to MIT. Is that right, or do you want something else?

## User

Points 1 to 3 are fine. Point 4 is not. I would normally pick MIT for something this small, and you were right to guess that. Not this time. dotkit gets Apache-2.0, because of its explicit patent grant. A company that wanted to use dotkit asked for it, and MIT says nothing about patents. I'm not going to make them argue about that when I can answer it with a different file.

So: the full Apache-2.0 text in `LICENSE`, and the copyright line with my name as it appears in `git config user.name`. Put no per-file headers in the Go sources, since I don't want a banner on every file. Reference the licence in the README with one line.

Also, for the tap token: GoReleaser needs a token that can push to the tap repo. I'll keep it in 1Password. Show me how to feed it to the release command with `op run` or `op read`, and don't write it to disk anywhere.

## Assistant

Understood, Apache-2.0 and not MIT. I'm not adding file headers.

Done so far:

- `LICENSE` now holds the standard Apache-2.0 text, unmodified. The copyright holder is taken from your `git config user.name`, with the year 2026. I did not add a `NOTICE` file, because the licence only calls for one when you have attributions to carry, and dotkit has none.
- `main.go` now has `var version = "dev"`, nothing else changed there.
- The README has one new line at the bottom: "Licensed under the Apache License, Version 2.0. See LICENSE."
- The GoReleaser config is at the project root. I set `project_name` to `dotkit`, `CGO_ENABLED=0` so the binaries are static, and tarballs named `dotkit_<version>_<os>_<arch>`. The `brews` section targets the `homebrew-dotkit` repo with a one-line description and a `test` block that runs `dotkit -version`.

For the token, the config reads it from an environment variable named `TAP_TOKEN`, and nothing else. Run the release like this:

```
op run --env-file=<(echo 'TAP_TOKEN=op://Private/dotkit tap/credential') -- goreleaser release --clean
```

The environment is populated for that one process, and nothing touches the disk. If you'd like a shorter way, I can put it behind a `make release` target. That would be a small file, not a dependency.

Before the real thing, I'd run a snapshot build, which needs no token and doesn't publish. Shall I?

## User

Yes, run the snapshot. Skip the Makefile; I'd rather have one command I can read in the shell history than a target I have to open to remember.

## Assistant

I ran `goreleaser release --snapshot --clean`. It failed in the first stage:

```
only configurations files on version: 2 are supported
```

That was my mistake. The config I wrote has no `version: 2` line, and the installed GoReleaser needs it. I added it at the top and reran. Config validation now passes, and the build step produced these:

- `dist/dotkit_0.1.0-SNAPSHOT-<hash>_darwin_arm64.tar.gz`
- the same for darwin amd64, linux amd64 and linux arm64
- a checksum file

I unpacked the darwin arm64 tarball into a temporary directory and ran the binary with `-version`. It prints `0.1.0-SNAPSHOT-<hash>`, so the linker flag works. The tarball contains the binary, the README and `LICENSE`.

One more finding: the snapshot generated a formula under `dist/` but skipped the upload, as expected. The formula's `license` field reads `Apache-2.0`, which GoReleaser took from the config. I had set that explicitly, so it matches the `LICENSE` file.

## User

Good. One correction: the changelog section you wrote excludes commits that start with `docs:` and `test:`. I don't use prefixes like that. My commits are an imperative subject under 60 characters with a body that says why, so those filters match nothing and the changelog would list everything. Change them. Drop the filters, and keep the changelog sorted ascending by subject.

Then commit it all. Subject under 60 characters, imperative, and a body explaining why GoReleaser and why the tap.

## Assistant

You're right. Those two filters came from a common default, and your history doesn't match it. I removed the `filters` block from the changelog section and kept `sort: asc`. I reran the snapshot to confirm the config still validates, and it does.

I made the commit with these contents:

```
Add GoReleaser config and Apache-2.0 licence

One command now builds the darwin and linux tarballs and
updates the Homebrew tap, so installing dotkit on a new
computer is a single brew install instead of a manual
build from source.

Apache-2.0 rather than MIT because it has an explicit
patent grant, which a company interested in using dotkit
asked for. The version is now a variable so the linker
can set it at release time.
```

The subject is 43 characters. Five files changed: `LICENSE`, `README.md`, `main.go`, the GoReleaser config, and `.gitignore`, where I touched nothing except to confirm that `dist/` was already ignored, so it isn't in the commit.

The tag is next. Do you want me to create `v0.1.0` locally, or will you do that along with the push?

## User

I'll push and tag it myself, since the real release spends the tap token and I want to watch it happen. Let me do it now.

Before I do: is there anything in the tap setup that could go wrong on the very first release? The tap repo is empty.

## Assistant

Two things are worth knowing, both small.

1. **Empty tap repo.** GoReleaser commits the formula to the default branch. If the repo has no commits at all, some versions fail on the first push because there's no branch to base the commit on. The safe route is to create `homebrew-dotkit` with a README before you tag. A one-line README is enough.
2. **Token scope.** The token needs write access to the contents of the tap repo only. If it was created with access to the dotkit repo alone, the release builds fine and then fails at the formula step. In that case the tarballs are already published, and rerunning with `--clean` after fixing the scope is safe.

After the release, run `brew tap` with your tap and `brew install dotkit`, then `dotkit -version`. It should print `0.1.0`.

Everything else is in place: the version variable, the Apache-2.0 `LICENSE`, the README line, and a config that validated in a snapshot build. Go ahead and tag.
