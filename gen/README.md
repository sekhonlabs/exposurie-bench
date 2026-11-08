# gen

How the two users' histories were made (parts 2 and 3).

| File | What it does |
|---|---|
| [generate.mjs](generate.mjs) | writes each session from its brief with Sonnet 5.5, inside the sandbox, and keeps it only if it passes the history checker |
| [prompt.mjs](prompt.mjs) | the prompt each session is written from, built from the user's `facts.json` and `plan.json` and the checker's rules, so the prompt and the checker cannot disagree |
| [convert.mjs](convert.mjs) | turns a user's sessions into what exposurie reads on a real machine: Claude Code transcripts, and for the delegator a claude.ai export |

Run `node gen/generate.mjs <developer|delegator> [session ids...] [--dry-run]` with the sandbox's Node. Generating spends plan usage: the 53 sessions took 527K output tokens over 81 attempts.
