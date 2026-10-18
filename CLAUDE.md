# exposurie-bench: rules for agents

You are working on a benchmark for exposurie. Read `docs/design.md` before changing anything. It is the method, and any change to it needs a dated entry in `docs/decisions.md`.

## Never

- **Never run a benchmark task inside this repository.** The answer key lives here. Every run gets a fresh empty folder outside it.
- **Never use an API key.** Runs use a Claude plan login inside the sandbox. Never print, copy or commit credentials. The sandbox lives beside this repository, never inside it.
- **Never start live runs without the owner's go.** Every run spends plan usage. Build, test offline, then ask. The pilot comes first.
- **Never commit personal data.** That means no real names, no machine paths and no private tool names. The users in this benchmark are synthetic.
- **Never add CI workflows, schedules, or anything else that runs on its own.**
- **Never push without the owner's word.** Commit on `main`.

## Always

- **Close stdin on every run**, and pass `--no-session-persistence`.
- **Turn web tools off** in every condition.
- **Record versions for every run:** Claude Code, the model, exposurie.
- **Add a source to `docs/sources.md` before citing it** anywhere else, with its version.
- **Use LF line endings.**
