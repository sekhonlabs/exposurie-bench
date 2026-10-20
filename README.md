# exposurie-bench

Does an external brain make a coding agent better for the person using it? This repository measures that for [exposurie](https://github.com/sekhonlabs/exposurie). exposurie is a CLI that builds a curated Markdown wiki (the brain) from a person's own agent sessions and chat exports, and points every new session at it.

**Status: the run sandbox is built and checked (part 0 of [docs/build-plan.md](docs/build-plan.md)), and the two users' fact sheets are written and approved (part 1). Both users' histories are generated and checked (parts 2 and 3): 53 sessions, about 83K tokens for the developer and 74K for the delegator, read back by exposurie 1.2.0's own readers. The tasks are complete for areas 1 to 8 (part 4): 24 questions and work tasks, their checks and rubrics, five starter repositories, and the files conditions B and D give the agent. The runner and the scorer are built (part 5) and tested end to end against a fake `claude`: every task under every condition, with usage limits, crashes and broken runs planted on purpose. No benchmark task has run yet.** It tests the published `@sekhon/exposurie` 1.2.0 with Claude Code on Sonnet 5.5.

## The question

Same tasks, same model, same tools. Does a fresh session with an exposurie brain:

1. get the user's past right more often than a session without one,
2. spend fewer tokens than the way people keep context today (one long session, or pasting history back in),
3. cost almost nothing extra on work that needs no past,
4. and say "not recorded" instead of inventing an answer?

## Four conditions

| | Condition | Stands for |
|---|---|---|
| A | Fresh session | what every new session gets today |
| B | Whole history in context | the long-session habit |
| C | exposurie | fresh session + pointer + brain |
| D | Perfect memory | only the facts the task needs, pasted in |

**Potential reached = (C − A) ÷ (D − A).** This is the share of the gap between a forgetful agent and a perfect-memory one that exposurie closes.

The questions are spread across nine areas, from recall to long sessions, with three tasks in each of the first eight and two in the last. That comes to about 105 runs. See [docs/design.md](docs/design.md).

## What is here

| File | What it holds |
|---|---|
| [docs/design.md](docs/design.md) | the method, fixed before anything runs |
| [docs/build-plan.md](docs/build-plan.md) | the order it is built in, part by part, and what "done" means for each part |
| [docs/sources.md](docs/sources.md) | every paper and document cited, and what this benchmark takes from each |
| [docs/decisions.md](docs/decisions.md) | dated decisions and why |
| [CLAUDE.md](CLAUDE.md) | rules for any agent working in this repository, local or cloud |
| [users/](users/) | the two made-up users: who they are, every planted fact, and each session's brief |
| [tasks/index.json](tasks/index.json) | every task, by area, with its checks and the judge's rubric |
| [tasks/starters/](tasks/starters/) | the projects the work tasks start from |
| [tasks/conditions/](tasks/conditions/) | what conditions B and D put in the agent's instructions file: each user's whole history, and the facts each task needs |
| [gen/](gen/) | the generator that writes each session from its brief, and the converter that turns the sessions into Claude Code transcripts and a claude.ai export |
| [check/](check/) | the checks that hold the fact sheets, the histories, the tasks, and the runner and scorer to the method |
| [score/](score/) | how a task's checks read a run, the scorer, and the judge for what the checks cannot settle |
| [runner/](runner/) | the run sandbox (pinned versions, setup, the environment every run gets, and its check), the runner, and the fake `claude` it is tested against |

## License

MIT
