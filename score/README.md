# score

How runs become verdicts, and verdicts become numbers.

| File | What it does |
|---|---|
| [checks.mjs](checks.mjs) | how a task's checks read a run: its final answer, and the files it made or changed |
| [score.mjs](score.mjs) | the scorer: every finished run of a batch, scored without knowing its condition |
| [judge.mjs](judge.mjs) | the judge: a separate Claude run that scores one answer against its task's fixed rubric, for what the checks cannot settle. Every answer it decided was then read by hand. |
| [long.mjs](long.mjs) | area 9's scorer: the checks of a long task, on each strategy's run |
| [team.mjs](team.mjs), [team/](team/) | part 13's scorer, and the hidden tests it runs on round 2's merged code |
| [results.mjs](results.mjs) | every number and chart, from `results/` alone: `node score/results.mjs` prints them, and `--save` writes `results/numbers.json` and `results/charts/` |

A hand verdict overrides the checks and the judge.
