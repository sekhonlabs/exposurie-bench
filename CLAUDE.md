# exposurie-bench: rules for agents

You are working on a benchmark for exposurie. Read `docs/design.md` before changing anything. It is the method, and any change to it needs a dated entry in `docs/decisions.md`.

Build in the order of `docs/build-plan.md`, one part at a time: discuss the part with the owner, build it, check it, then move on.

## Never

- **Never touch anything outside the benchmark's own folder.** Everything stays in this repository, `../sandbox` and `../runs`. The owner's own agent setup, tools, notes and browser are off-limits, for reading as well as writing.
- **Never open a browser from the sandbox.** It makes a new profile inside the sandbox home. To log in, copy the sign-in URL into the owner's own browser.
- **Never run a benchmark task inside this repository.** The answer key lives here. Every run gets a fresh folder outside it.
- **Never use an API key.** Runs use a Claude plan login inside the sandbox. Never print, copy or commit credentials. The sandbox lives beside this repository, never inside it.
- **Never run with the owner's own Claude Code setup.** Every run, history generation included, goes through `runner/sandbox.mjs`: its environment, and its pinned copies of Node, Git, Claude Code and exposurie.
- **Never place history in the sandbox before its transcript retention is set.** Claude Code deletes old transcripts when it starts.
- **Never start live runs without the owner's go.** Every run spends plan usage. Build, test offline, then ask. The pilot comes first.
- **Never commit personal data.** That means no real names, no machine paths and no private tool names. The users in this benchmark are synthetic.
- **Never add CI workflows, schedules, or anything else that runs on its own.**
- **Never push without the owner's word.** Commit on `main`.

## Always

- **Pin the model:** `claude-sonnet-5-5`, for runs, brain builds, generation and the judge.
- **Close stdin on every run**, and pass `--no-session-persistence`.
- **Give every condition the same tool list**, with no web tools, and check it at the start of each run.
- **Count every input token, cached or not**, as the primary number.
- **Record versions for every run:** Claude Code, the model, exposurie.
- **Add a source to `docs/sources.md` before citing it** anywhere else, with its version.
- **Use LF line endings.**

## Look

Every chart, figure and write-up follows exposurie's own look: the black and orange of its logo, on white.

- **Background:** white `#FFFFFF`, or warm off-white `#F5F5F4` for panels.
- **Text:** `#141414` for headings, `#2B2B2B` for body text, and `#474747`, `#6B6B6B` and `#8C8C8C` below that. Rules and borders are `#E3E3E3` and `#C9C9C9`.
- **Accent:** the logo's orange, `#E37D4E`, used sparingly as the one accent, with its tint `#FCF0E9` for highlighted areas. In charts the orange marks exposurie (condition C), and the other conditions are greys.
- **Fonts:** Georgia for titles, Calibri for body text, Consolas for code. Where they may be missing, fall back to `Georgia, serif`, `Calibri, Carlito, Arial, sans-serif` and `Consolas, Menlo, monospace`.
- **No grid lines and no decoration.** Charts are SVG, so nothing is blurred.
