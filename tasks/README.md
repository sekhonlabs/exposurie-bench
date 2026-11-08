# tasks

What the agents were asked to do, and what each condition was given.

| Path | What it holds |
|---|---|
| [index.json](index.json) | every task of areas 1 to 8, by area: its prompt, its user, its checks, and the judge's rubric where the checks cannot settle it |
| [examples.json](examples.json) | hand-written example answers for every task, as a run with or without the past might give them; the task check scores each one and fails if a verdict is not the expected one |
| [conditions.mjs](conditions.mjs) | writes what B and D put in the agent's instructions file: `conditions/history-<user>.md` for B, the whole history, and `conditions/facts-<task>.md` for D, only the facts that task needs. A gets nothing, and C gets what exposurie writes there itself. |
| [starters/](starters/) | the projects the work tasks and the long sessions start from |
| [long/](long/) | area 9: each long task's steps and checks (`long-1.json`, `long-2.json`), the material its steps hand over, and the script that writes both |
| [team/](team/) | part 13: the task, its steps and asks, the six decisions, D's notes, the developer's two exports, and the reference implementation the fake `claude` replays |

The answer key lives here, so no task ever runs inside this repository: every run gets a fresh folder outside it. [check/tasks.mjs](../check/tasks.mjs) holds every task to the fact sheets and the method.
