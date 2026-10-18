# exposurie-bench

Does an external brain make a coding agent better for the person using it? This repository measures that for [exposurie](https://github.com/sekhonlabs/exposurie). exposurie is a CLI that builds a curated Markdown wiki (the brain) from a person's own agent sessions and chat exports, and points every new session at it.

**Status: designed, and the build follows [docs/build-plan.md](docs/build-plan.md). Nothing has run yet.** It tests the published `@sekhon/exposurie` 1.2.0 with Claude Code on Sonnet 5.5.

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

The questions are spread across nine areas, from recall to long sessions, with three tasks in each. That comes to about 105 runs. See [docs/design.md](docs/design.md).

## What is here

| File | What it holds |
|---|---|
| [docs/design.md](docs/design.md) | the method, fixed before anything runs |
| [docs/build-plan.md](docs/build-plan.md) | the order it is built in, part by part, and what "done" means for each part |
| [docs/sources.md](docs/sources.md) | every paper and document cited, and what this benchmark takes from each |
| [docs/decisions.md](docs/decisions.md) | dated decisions and why |
| [CLAUDE.md](CLAUDE.md) | rules for any agent working in this repository, local or cloud |

## License

MIT
