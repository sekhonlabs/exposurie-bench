# exposurie-bench

Does an external brain make a coding agent better for the person using it? This repository measures that for [exposurie](https://github.com/sekhonlabs/exposurie). exposurie is a CLI that builds a curated Markdown wiki (the brain) from a person's own agent sessions and chat exports, and points every new session at it.

**Status: areas 1 to 8 are run, scored and checked by hand, and their results are below.** Two made-up users, a developer and someone who hands everything to agents, have 53 generated sessions of history between them, and an exposurie brain was built from each. All 93 runs of areas 1 to 8 ran in one mixed order, then the stability check's 6. Area 9, the long sessions, comes next: its runner is built and tested against a fake `claude`, and the first of its two long sessions is written. How it was built, part by part, is in [docs/build-plan.md](docs/build-plan.md). It tests the published `@sekhon/exposurie` 1.2.0 with Claude Code 2.1.302 on Sonnet 5.5.

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

## Results: areas 1 to 8

The four questions, answered:

1. **Right more often than a fresh session:** 18 of 21 against 3.
2. **Fewer tokens than the whole history:** a median of 34,494 a run against 125,497.
3. **Almost nothing extra on work that needs no past:** 298 tokens a run more than a fresh session.
4. **"Not recorded" instead of inventing:** no made-up answers, in any condition.

One run per task and condition: 93 runs in one mixed order on 2026-10-21, then the stability check's 6. Every verdict is final: of the full run's 93, 54 were settled by a task's checks and 39 by hand, every answer the judge decided among them. Tokens are every input token, cached or not; output is few and alike in every condition, a median of 439 to 658 tokens a run. Every number here is computed from [results/](results/) alone by [score/results.mjs](score/results.mjs), and they are all in [results/numbers.json](results/numbers.json). Which run had which condition is published beside each batch's scores, now that every verdict is final.

![Right answers by area and condition](results/charts/right-answers.svg)

- **Right answers, areas 1 to 7, of 21:** A 3, B 21, **C 18**, D 21. All three of A's are in area 4, where the right answer is that nothing was recorded.
- **Potential reached:** (18 − 3) ÷ (21 − 3) = **0.83**. exposurie closed 15 of the 18 answers between a fresh session and perfect memory: 8 of 10 for the developer, 7 of 8 for the delegator.
- **Made-up answers** (area 4): none, in any condition.
- **Looked vs found:** C ran `exposurie read` in 20 of its 21 runs, and was right in 18 of those 20. The one run that did not look was wrong.
- **Stability:** area 3 under C was right in all 9 runs, the full run's and two more of each task, and the same task's tokens stayed within 5%.

![Tokens per run and per right answer, by condition](results/charts/tokens.svg)

- **Tokens per run**, median of areas 1 to 7: A 13,095, B 125,497, **C 34,494**, D 6,622. By the median, C used about a quarter of B's tokens on a question (30,089 against 125,495), and about a tenth on a work task (69,939 against 736,844).
- **Tokens per right answer:** A 126,197, B 277,950, **C 49,263**, D 17,675.
- **On work that needs no past** (area 8): C never ran `exposurie read`, and used 298 tokens a run more than A (6,721 against 6,423): the context that exposurie installs. B used 125,509, because it carries the whole history every time.

![Sessions until a brain pays for itself](results/charts/break-even.svg)

- **Break-even:** building the developer's brain took 4,008,581 tokens and the delegator's 2,996,876, 94% of them cache reads. Against B, a C session saved about 80,000 to 90,000 tokens on a question and 530,000 to 770,000 on a work task. So a brain pays for itself after about 38 to 44 sessions of questions, or 5 to 6 of work tasks. With this benchmark's own mix of the two, that is 19 sessions for the developer and 12 for the delegator.

**C's three wrong answers**, each named by its run in [results/full/](results/full/):

- **recall-1** (`r049`) named SQLite, with the wrong reasons. The pilot's C run, on the same brain, gave the right ones.
- **across-3** (`r009`) searched for "google sheets", "sheets" and "spreadsheet", and named only the spending summary. The brain's page on the book club speaks of a "member Google Sheet", in the singular, and exposurie 1.2.0's search is a plain substring match, so a plural never finds its singular.
- **real-work-2** (`r003`) never ran `exposurie read`. Its pull request missed the team's branch format, `ENG-431-slug`, and its four sections.

**Against what [design.md](docs/design.md#what-we-expect-written-before-the-results) expected before any result:** C beat A by a wide margin (18 against 3), and used more raw tokens (34,494 against 13,095 a run). B was more accurate than C (21 against 18), as expected with a history this short. Changed decisions lost no detail: area 3 under C was right in 9 of 9.

**What this does not show:** one run per cell, so a count per area is only indicative; one agent and one model; two made-up users; and histories small enough for B to fit in context, which a real history would not. See [design.md](docs/design.md#limits). Area 9, the long sessions, has not run yet.

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
| [tasks/starters/](tasks/starters/) | the projects the work tasks and the long sessions start from |
| [tasks/conditions/](tasks/conditions/) | what conditions B and D put in the agent's instructions file: each user's whole history, and the facts each task needs |
| [tasks/long/](tasks/long/) | each long session of area 9: its steps, its checks, the material its steps hand over, and the script that writes them |
| [gen/](gen/) | the generator that writes each session from its brief, and the converter that turns the sessions into Claude Code transcripts and a claude.ai export |
| [check/](check/) | the checks that hold the fact sheets, the histories, the tasks, the runner and scorer, the brain build, the long sessions and the results to the method |
| [score/](score/) | how a task's checks read a run, the scorer, the judge for what the checks cannot settle, the long sessions' scorer, and the numbers and charts of the results |
| [runner/](runner/) | the run sandbox (pinned versions, setup, the environment every run gets, and its check), the runner and the brain build, the long sessions of area 9, and the fake `claude` they are tested against |
| [results/](results/) | scores saved from real runs (the pilot, the full run and the stability check) with which run had which condition, the brain builds' tokens, every number in `numbers.json`, and the charts |

## License

MIT
