---
id: dev-25
user: developer
at: 2026-09-05T11:30:00+01:00
surface: terminal
project: dotkit
kind: build
---

## User

A user opened an issue this morning: `dotkit sync` fails on Windows. Their output ends with `A required privilege is not held by the client.` and nothing gets linked. I have no Windows machine, so I can't reproduce it, but I suspect it's the symlink creation.

Please find where dotkit creates links, tell me what you find, and explain why Windows rejects it. Don't change anything yet. I want to decide the behaviour first, and I'd like the options laid out with their costs, not just a recommendation.

## Assistant

I'll look at how the sync path creates links.

Your suspicion is right. `internal/link/link.go` has a function `Apply` that calls `os.Symlink(src, dst)` for every entry in the manifest, and the error from that call is returned straight up to `cmd/sync.go`. Nothing in the code is OS-specific.

On Windows, creating a symlink needs the `SeCreateSymbolicLinkPrivilege` privilege. A normal user account doesn't have it unless Developer Mode is switched on or the process runs elevated. Without it, Go returns exactly the message in the issue.

The options:

1. **Require Developer Mode or elevation.** The code doesn't change. Users get a clearer error and a README paragraph. The cost is that dotkit stays unusable for anyone who can't or won't change that setting, such as on a locked-down work machine.
2. **Try the symlink, fall back to a copy if it fails.** It works everywhere, but the same config produces different results depending on a machine setting.
3. **Junctions.** They need no privilege but only work for directories, so single files like `.gitconfig` stay unsolved.
4. **Always copy on Windows.** Behaviour is predictable, with no privilege needed. The cost is that edits to the live file don't flow back into the dotfiles folder, and every sync has to copy again.

My lean would be option 2, since it's the most forgiving.

## User

I'd rather not go with 2, and the reason is that it's the popular default. A fallback that depends on a privilege means two Windows users with identical configs end up with different file layouts, and when something drifts the first question becomes "did yours symlink or copy?". I don't want that in a bug report.

So the decision is option 4. On Windows, dotkit copies files instead of symlinking them, and copies again on every sync. I'm fine with that because it's honest: the dotfiles folder stays the source of truth, and sync pushes it outward. Don't try to be clever about skipping unchanged files; that's a separate decision and not for today.

Implement it in `internal/link`. Keep the config format alone. The TOML at `~/.config/dotkit/config.toml` shouldn't gain a new key for this. And no new dependencies. Use `runtime.GOOS` from the standard library.

## Assistant

Understood: option 4, no fallback, no skipping, no config key, no dependencies.

Before editing I checked the config loader in `internal/config`. It decodes `~/.config/dotkit/config.toml` into a struct with `source`, `target_root` and a list of `[[link]]` entries. Nothing there needs to change, since the platform decides the mode.

What I did in `internal/link/link.go`:

- Added `func usesCopy(goos string) bool { return goos == "windows" }`. It takes the OS name as an argument so a test can exercise it without running on Windows.
- `Apply` now calls `place(src, dst)`, which either symlinks or copies depending on `usesCopy(runtime.GOOS)`.
- The copy path is `copyFile(src, dst)`. It removes any existing file at `dst` first, then writes the new one with the source's permission bits. Removing first means a stale symlink left by an earlier version is replaced and not written through.
- Error wrapping is unchanged, so the failure still names the destination path.

I left the Unix path as it was. `go build ./...` and `go vet ./...` are clean, and `GOOS=windows go build ./...` also compiles, which I wanted to confirm because the Windows binary is built by the release pipeline.

One thing to decide: on Windows each sync will now do a full copy of every linked file. Should it say so, for example a warning line?

## User

Yes, print a warning, once per file, in the form `copied (not linked): <dst>`. A person reading the output should know why their edits to the live file don't show up in the dotfiles folder.

## Assistant

I added it in `place`, on the copy branch, written to stderr through the existing logger in `internal/ui`. Then I ran a sync against the sample dotfiles in `testdata/home` with the OS check forced on, and the output is a problem: that sample has 41 entries, so you get 41 identical-looking lines, and the real signal, which is why, is lost in the middle.

A fix that keeps the information: print one line at the start of the run, `windows: copying files instead of symlinking them`, and let the per-file lines stay as they are under the existing `-v` flag. I haven't changed anything yet.

## User

That's convincing. 41 lines of the same warning is noise, and I asked for the per-file form without having seen it, so I'm changing my mind. Do it your way: one line per run, per-file detail only with `-v`. Keep it on the same flag the rest of dotkit already uses, no new flag.

## Assistant

Done. In `internal/link/link.go`, `Apply` emits the single summary line before the loop when `usesCopy(runtime.GOOS)` is true. The per-file `copied (not linked): <dst>` line moved behind the verbosity check that `-v` already sets in `internal/ui`, so the standard `flag` setup in `cmd/` is untouched.

Now the test, in `internal/link/link_test.go`:

```go
func TestUsesCopy(t *testing.T) {
	cases := map[string]bool{"windows": true, "darwin": false, "linux": false}
	for goos, want := range cases {
		if got := usesCopy(goos); got != want {
			t.Errorf("usesCopy(%q) = %v, want %v", goos, got, want)
		}
	}
}
```

A second test, `TestCopyFileReplacesSymlink`, creates a temporary directory with a symlink at the destination, calls `copyFile`, and asserts the destination is now a regular file with the source's contents and the original target untouched. It runs on macOS and Linux because it needs to create a symlink first. `go test ./...` passes.

## User

Good. Now the README. Before you write it, check how we ship Windows builds. I don't remember whether the release config even includes them, and I don't want the note to promise something the pipeline doesn't deliver.

## Assistant

I read the GoReleaser config at the project root. The `builds` section targets linux, darwin and windows, each for amd64 and arm64, and the Windows ones are packaged as zip archives. The `brews` section publishes a formula to the Homebrew tap, but it only covers macOS and Linux, so Windows users get the binary from the release page and nothing else. The README note should say that, because an installation line mentioning Homebrew would mislead them.

I added a section called "Windows" to `README.md`, directly after "Installation":

```
## Windows

Creating symlinks on Windows needs a privilege most accounts don't have, so
on Windows dotkit copies files instead of symlinking them. It copies again on
every sync, and edits to the copied file are not carried back to your dotfiles
folder; the folder stays the source of truth. Run with `-v` to see each file.
Windows builds are on the release page as zip archives; the Homebrew tap does
not cover them.
```

I did not touch the section that documents `~/.config/dotkit/config.toml`, because the format is unchanged.

## User

The note is accurate, but the first sentence leads with the privilege, which is the cause and not what the reader needs. Someone scanning wants the behaviour first. Reorder it so the copying comes first and the privilege follows as the reason. Then give me a commit message. The usual: imperative subject under 60 characters, a body that says why, no prefix.

## Assistant

I reordered the paragraph in `README.md`. It now opens: "On Windows, dotkit copies files instead of symlinking them, because creating symlinks there needs a privilege most accounts don't have." The remaining sentences are unchanged.

The commit message:

```
Copy files instead of symlinking on Windows

Creating symlinks on Windows needs a privilege that normal accounts
lack, so every sync failed with "A required privilege is not held by
the client". A fallback would give identical configs different layouts
per machine, so Windows now always copies, and the dotfiles folder
stays the source of truth. A single summary line is printed per run;
per-file detail is behind -v. The README documents the behaviour.
```

The subject is 43 characters. I haven't committed anything, so the working tree holds the changes to `internal/link/link.go`, `internal/link/link_test.go` and `README.md`. The pre-push hook will run `go test ./...` when you push, and I ran the same command just now, so it should pass.
