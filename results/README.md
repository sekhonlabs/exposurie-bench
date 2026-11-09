# results

Everything published from the runs: each batch's scores, which run had which condition, the hand reads, every number and every chart. [score/results.mjs](../score/results.mjs) computes every number and chart from this folder alone, and [check/results.mjs](../check/results.mjs) holds the folder to what it computes. Raw run output stays outside the repository.

## Charts

| Chart | What it shows |
|---|---|
| [at-a-glance.svg](charts/at-a-glance.svg) | every result in one view |
| [right-answers.svg](charts/right-answers.svg) | areas 1 to 8: right answers by area and condition, with exposurie 1.3.1 |
| [tokens.svg](charts/tokens.svg) | areas 1 to 8: tokens per run and per right answer |
| [many-agents.svg](charts/many-agents.svg) | part 13: which of round 1's six decisions round 2 kept, in each condition |
| [its-yours.svg](charts/its-yours.svg) | part 12: the six lines, and whether each held for each user |
| [long-sessions.svg](charts/long-sessions.svg) | area 9: what each strategy kept after the fork, and its tokens |
| [versions.svg](charts/versions.svg) | condition C with each release: 1.2.0, 1.3.0's read and 1.3.1 |

## Batches

A batch folder holds `scores.json`, the scorer's verdicts made without knowing the condition, and `conditions.json`, which run had which condition, published only once every verdict was final. Runs are named `r001`, `r002` and so on, in a mixed order.

| Folder | exposurie | Ran | What |
|---|---|---|---|
| `pilot/` | 1.2.0 | 2026-10-21 | one task, once in each condition, before the full run |
| `full/` | 1.2.0 | 2026-10-21 | areas 1 to 8 in all four conditions: 93 runs in one mixed order |
| `stability-1/`, `stability-2/` | 1.2.0 | 2026-10-21 | area 3 under C, twice more |
| `area-9/` | 1.2.0 | 2026-10-21 to 24 | the long sessions: scores, the hand read (`hand.json`) and every step's record (`steps.json`) |
| `full-2/` | 1.3.0's read | 2026-10-25 | C again on areas 1 to 8: 24 runs |
| `stability-3/`, `stability-4/` | 1.3.0's read | 2026-10-25 | area 3 under C, twice more |
| `area-9-2/` | 1.3.0's read | 2026-10-25 | sync + fresh's fresh session again, in each long task |
| `full-3/` | 1.3.1 | 2026-11-05 | C again on areas 1 to 8: 24 runs, the results the README leads with |
| `team-1/` | 1.3.1 | 2026-11-07 | part 13: scores, the hand read and its tests (`hand.json`, `hand.test.js`), and round 1's repair (`repair-1.patch`) |
| `team-1-132/` | 1.3.2 | 2026-11-09 | part 13 again: the sync and C's round 2 from team-1's round 1, with their scores, hand read and its tests |
| `its-yours/` | 1.3.1 | 2026-11-07 | part 12: every line's evidence (`its-yours.json`), and each command's output for each user |

"1.3.0's read" is exposurie's rebuilt read, which ran as `1.2.0+b6855ee` before npm shipped it, byte for byte, as 1.3.0. Its records keep the label they recorded.

## Other files

| File | What it holds |
|---|---|
| `numbers.json` | every number in the README: 1.2.0's at the top level, then `area_9`, `rebuilt_read` (1.3.0's read), `pointer_for_work` (1.3.1) and `many_agents` (part 13) |
| `builds.json` | each brain build's sessions, turns, time and tokens |

To compute them again: `node score/results.mjs` with the sandbox's Node prints every number, and `node check/results.mjs` checks this folder against it.
