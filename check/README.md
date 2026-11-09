# check

One check per part, each holding that part to the method in [docs/design.md](../docs/design.md). Each prints a line ending in "hold" or "everything holds", and exits 0, when it does.

| Check | Part | What it holds |
|---|---|---|
| [facts.mjs](facts.mjs) | 1 | both users' facts, session lists and the task index, against each other and the method |
| [history.mjs](history.mjs) | 3 | every generated session, to its brief and the rules it was generated to; with `--readers`, also converts each history and reads it back with exposurie's own readers |
| [tasks.mjs](tasks.mjs) | 4 | every task, its checks, its starter and its condition files |
| [runner.mjs](runner.mjs) | 5 | the runner and the scorer, end to end against the fake `claude` |
| [build.mjs](build.mjs) | 6 | the brain build, end to end against the fake `claude`, with exposurie's real sync |
| [long.mjs](long.mjs) | 8 | the long sessions, end to end against the fake `claude` |
| [results.mjs](results.mjs) | 9 to 13 | that `results/` and its charts are exactly what `score/results.mjs` computes, in the look, with no personal data, and that the README shows every chart and gives its headlines as the results have them |
| [team.mjs](team.mjs) | 13 | the team task's runner and scorer, end to end against the fake `claude`, and its rerun on 1.3.2 from team-1's round 1 |
| [text.mjs](text.mjs) | | how the checks read text, shared so that a spelling counts the same way everywhere |
| [rivals.json](rivals.json) | | the names a history may mention only where a fact or a turned-down option plans them |

Run each with the sandbox's Node. The checks of parts 5, 6, 8 and 13 also need the sandbox's installs; never run them during a live run.
