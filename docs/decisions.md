# Decisions

Dated, newest last. Each entry says what was decided and why.

## 2026-10-18

- **A separate public repository.** The method and the results can be checked and rerun, and cloud sessions can work on it. The repository, the run sandbox and the raw outputs share one folder on a disk kept apart from the owner's personal setup. The sandbox and raw outputs never enter the repository.
- **Runs use a Claude plan login, never an API key,** because of cost. As a result there is no `--bare` mode, which only accepts API keys. Isolation comes from a separate home folder and `CLAUDE_CONFIG_DIR` instead.
- **Claude Code builds and runs everything.**
- **Synthetic users, not real people's histories.** Their right answers are known, they contain no private data, and anyone can rerun them.
- **One agent, Claude Code.** There is no second-agent arm.
- **Broad, not deep.** The benchmark has nine areas, three tasks in each, and one run per cell, about 105 runs in total. An earlier draft had 2 users × 20 tasks × 4 conditions × 3 runs = 480.
- **The half-context-window rule of thumb gets tested rather than asserted** (area 9).
- **The two users are a great developer and someone who hands everything to agents** and just wants the work done. Neither is tied to a niche job or industry.
- **Cloud sessions are an option, not yet the plan.** It is unverified whether nested `claude -p` runs work inside a cloud machine.
- **Model: Sonnet 5.5 (`claude-sonnet-5-5`).** It is pinned for every run, both brain builds, the generated histories and the judge, so one model is used throughout.
- **About 80K tokens of conversation per user.** Real histories run past any context window, which would make B impossible to run. This size keeps B runnable while staying far too long to paste into every session. The pilot confirms that B fits with room for the task.
- **The four conditions differ by one file:** the sandbox's global instructions file, which is where exposurie puts its pointer. Using one mechanism for all four keeps the comparison fair.
- **The sandbox has its own pinned Claude Code and exposurie, with auto-update off.** Claude Code went through 44 version numbers in the 46 days before this decision, and the run takes several days.
- **Sonnet 5.5 writes the histories from written session plans, inside the sandbox, without session persistence.** The plans control where every fact appears. The sandbox keeps the owner's setup out of the text. Without persistence, the generation sessions themselves never end up in the history. The generated text is committed, and it is what every run uses.
- **More run-hygiene rules**, each guarding against a specific wrong number:
  - transcript retention is set before any history is placed
  - claude.ai connectors and auto-memory are off
  - every run gets the same tool list, checked at the start
  - the raw history is removed after the brain build
  - C runs finish within 7 days of the build
  - every input token is counted, cached or not
  - conditions are mixed together in the run order
  - a run stopped by a usage limit counts as not run

  Details are in design.md.
- **An answer with both a required and a forbidden fact goes to the judge and the hand check**, because a correct answer can name the old choice while giving the new one.
- **Area 9 is built last**, once the pilot shows how much plan usage the run needs. It needs sessions to be saved, and that exception is decided when it is built.
- **Charts and write-ups use exposurie's own look** (see CLAUDE.md).
- **The build follows docs/build-plan.md, one part at a time:** each part is discussed, built and checked before the next one starts.
