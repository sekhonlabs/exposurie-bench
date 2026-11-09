# runner

Everything that runs: the sandbox, the runs and brain builds, the long sessions, the team task and part 12.

| File | What it does |
|---|---|
| [bootstrap.ps1](bootstrap.ps1) | puts the sandbox's own Node beside the repository, then hands over to `sandbox.mjs` |
| [sandbox.mjs](sandbox.mjs) | the run sandbox: installs the pinned Git, Claude Code and each exposurie, logs in once with a Claude plan, and gives every run the same environment |
| [pins.json](pins.json) | every pinned version, with its checksum |
| [sandbox-settings.json](sandbox-settings.json) | the Claude Code settings every run gets: the model pinned, transcripts kept, no auto memory |
| [run.mjs](run.mjs) | the runner: plans a batch in a mixed order, runs each task in a fresh folder in its condition, audits every tool call, and builds each user's brain |
| [long.mjs](long.mjs) | area 9: fills one long session to the fork, then carries it on three ways |
| [team.mjs](team.mjs) | part 13: three agents on one job, each in its own copy, merged, tested and synced, then round 2 in each condition; `again` plans a new batch from an earlier one's round 1, which starts at the sync on another exposurie |
| [its-yours.mjs](its-yours.mjs) | part 12: the six lines, in throwaway homes, with exposurie installed from npm's tarball |
| [no-net.cjs](no-net.cjs) | part 12's network trap, loaded into every Node process |
| [fake-claude.mjs](fake-claude.mjs) | a fake `claude`, so all of the above can be tested end to end without spending anything |

Run each with the sandbox's Node. Every live run spends plan usage, so none starts without the owner's go, and one sandbox process runs at a time.
