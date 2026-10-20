---
id: dev-13
user: developer
at: 2026-07-04T10:45:00+01:00
surface: terminal
project: dotkit
kind: build
---

## User

Morning. I've just got back from a run along the river, which I always do before working on weekends, so I'm warm and ready to start something new. The project is called dotkit and it lives in /Users/dev/code/dotkit. It's a small Go command-line tool that keeps my dotfiles in sync across machines. The dotfiles live in one git repository, and dotkit links files from that repository into place in my home directory.

Here is how I want it built. There are three subcommands: `link`, `unlink` and `status`. Use Go's standard flag package with one `flag.FlagSet` per subcommand. No Cobra. I know it's the default everyone reaches for, but three subcommands don't justify a dependency tree, a generated scaffold and a new way of wiring flags. Config is TOML at ~/.config/dotkit/config.toml, not YAML. It needs at least the path of the dotfiles repository and the target directory, which defaults to my home directory.

For now I only want the scaffold: the module, the subcommand dispatch, config loading, and a first round of tests. Don't implement the real linking yet. Look at what's already in the folder first.

## Assistant

I'll look at what's in the folder before creating anything.

The folder holds a `CLAUDE.md` and nothing else, with no `go.mod` and no source. The `CLAUDE.md` has one rule that matters here: ask before adding any dependency. I'll follow it, and it will come up in a moment because Go's standard library has no TOML parser.

Plan, matching what you described:

- `go.mod` for module `dotkit`.
- `main.go` with a small dispatcher. It reads `os.Args[1]`, picks the matching subcommand and prints usage to stderr with exit code 2 if the name is unknown or missing.
- `internal/cli/` with `link.go`, `unlink.go` and `status.go`. Each defines its own `flag.FlagSet` and a `Run(args []string) error` function.
- `internal/config/config.go` with a `Config` struct (`Repo`, `Target`) and `Load(path string)`.

The one open question is the TOML parsing. The options are a small third-party TOML library or writing a minimal parser for the two keys we have now. Per your rule I haven't added anything. Which do you want?

## User

Good, that layout is what I had in mind. Add one TOML parsing library. A hand-written parser would become a liability the day I add a nested table, and the library is the only dependency I want in this project. Pick a well-maintained one and tell me which before you run `go get`. Anything else after that, you ask me first.

One behaviour to set now: `link` takes a `--dry-run` flag, and `status` doesn't take any flags yet. Both read the config the same way.

## Assistant

Understood: one TOML library, and any further dependency gets a question first.

I've scaffolded everything, and `go build ./...` passes. Specifically:

- `main.go` dispatches through a `map[string]func([]string) error`. An unknown subcommand prints `dotkit: unknown command "x"` plus usage and exits with 2.
- `link` registers `--dry-run` as a bool. `unlink` and `status` build empty flag sets, so passing an unexpected flag still gives the standard package's error text.
- Each subcommand calls `config.Load` and, for now, prints what it would do and returns nil.

On the library: I haven't run `go get`, because you asked me to name the library before fetching. I'd choose the most widely used TOML decoder in the Go ecosystem. It decodes straight into structs via tags, which keeps `Config` to a few lines. If you'd rather name the module yourself, give me the import path and I'll use that instead. Otherwise tell me to go ahead with my pick and I'll fetch it.

## User

Go ahead with your pick. I'd have chosen the same one.

For the config path, resolve it with `os.UserConfigDir()`... actually no, don't. On this Mac that returns `~/Library/Application Support`, and I want `~/.config/dotkit/config.toml` exactly, because the same file has to work on my Linux machine. Build it from `os.UserHomeDir()` and join `.config/dotkit/config.toml` onto it. Allow an override with a `--config` flag on every subcommand.

## Assistant

Done. I fetched the library, and `go.mod` now has that single `require` line.

Changes:

- `internal/config/path.go` has `DefaultPath()`, which joins `.config/dotkit/config.toml` onto `os.UserHomeDir()`. I avoided `os.UserConfigDir()` as you said, so the path is identical on both machines.
- Every subcommand now registers `--config` on its flag set, defaulting to `DefaultPath()`. A shared helper in `internal/cli/common.go` adds the flag, so the three files don't repeat it.
- `Load` decodes into `Config`. It expands a leading `~/` in `Repo` and `Target`, and if `Target` is empty it falls back to the home directory.

I also ran `dotkit status` against a machine with no config file. It exits with `open /Users/dev/.config/dotkit/config.toml: no such file or directory`. You may want to decide whether a missing file should be an error. I left it as one for now, because that's the strict reading of what you said.

## User

I'd say a missing file is an error. Silent defaults hide typos in the path.

But there's a problem. `Repo` has no sensible default, so on a fresh machine every command would fail before I've written a config, including `status`, which is the one I'd run to see what state things are in. Fine, I'm changing my mind: a missing file is not an error, it yields a config with `Target` set to home and `Repo` empty. `link` and `unlink` then fail with a clear "repo is not set" message, and `status` reports that and exits 0. A file that exists but fails to parse is still an error, and that error must include the path.

## Assistant

That split makes sense, since the failure now happens where the missing value matters.

Changes:

- `Load` checks `errors.Is(err, fs.ErrNotExist)` on the read and returns the defaults (`Target` set to home, `Repo` empty). Any other read error, and any decode error, is wrapped as `fmt.Errorf("config %s: %w", path, err)`, so the path is always in the message.
- `link` and `unlink` call `cfg.RequireRepo()`, which returns `repo is not set; add repo = "..." to <path>`.
- `status` prints `repo: (not set)` and returns nil. I ran it with no config and it exits 0.

I also wrote a doc comment on `RequireRepo` and then removed it, because it only restated the function name. I won't add comments unless they carry something the code doesn't.

## User

Good. Now the tests. Use the standard `testing` package, table-driven, with `t.TempDir()` for config files. Cover `Load`: a valid file, a missing file, a malformed file where the error has to contain the path, and a `~/` expansion case.

## Assistant

I'll write them in `internal/config/config_test.go`. I had planned to pull in an assertion helper library, but that would be a second dependency and you said to ask first, so I'm using plain `if got != want` checks with `t.Fatalf`.

The table has four cases:

```go
tests := []struct {
	name    string
	content *string
	want    Config
	wantErr string
}{
	{name: "valid", content: ptr(`repo = "/srv/dots"`), want: Config{Repo: "/srv/dots", Target: home}},
	{name: "missing", content: nil, want: Config{Target: home}},
	{name: "malformed", content: ptr(`repo = `), wantErr: "config "},
	{name: "tilde", content: ptr(`repo = "~/dots"`), want: Config{Repo: home + "/dots", Target: home}},
}
```

A nil `content` means the file isn't created. The malformed case checks that the error string contains the temp file's full path, not just the `config ` prefix. To keep `~` predictable, each case sets `HOME` with `t.Setenv`.

`go test ./...` passes with 4 cases, all green. I also added a short test in `internal/cli` that checks the dispatcher returns exit code 2 for an unknown subcommand.

## User

Fine, but the `ptr` helper is clumsy. Use a `create bool` field next to `content string`. Then the missing case is `create: false` and you don't need a helper at all. Also write the commit for this: imperative subject under 60 characters, and a body that says why, no prefixes.

## Assistant

Switched to `create bool`. The `ptr` helper is gone, and the missing case now just leaves `create` unset. `go test ./...` is still green with the same four cases plus the dispatcher test.

Commit message:

```
Scaffold dotkit with three subcommands and TOML config

Start the CLI on the standard flag package so three subcommands
need no framework. Config is read from
~/.config/dotkit/config.toml on every machine, with a missing file
meaning defaults so status works on a fresh machine. The TOML
decoder is the only dependency.
```

The subject is 52 characters. I haven't committed, since you didn't ask me to. Next step is the actual linking in `link`, whenever you want it.
