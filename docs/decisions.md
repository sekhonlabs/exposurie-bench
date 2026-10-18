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
- **Cloud sessions are an option, not yet the plan.** It is unverified whether nested `claude -p` runs work inside a cloud machine.
