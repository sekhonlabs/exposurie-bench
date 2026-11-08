# users

The two made-up users. Every right answer in the benchmark is a fact planted here, so it is known, and nothing private is published.

| | The developer | The delegator |
|---|---|---|
| Who | a backend engineer at a made-up company, with long, precise prompts | not a developer; hands everything to agents in 3 to 10 words |
| History | 28 Claude Code sessions: 12 at work, 16 on their own projects | 15 Claude Code sessions and 10 claude.ai chats |
| Planted facts | 90 | 66 |

Each user's folder holds:

| File | What it holds |
|---|---|
| `facts.json` | every planted fact: each one a non-default choice a fresh agent cannot guess, with the options it was chosen over |
| `plan.json` | each session's time, project or chat, and surface, and which facts come up in it and how |
| `sessions/` | each generated session as readable Markdown, the source of truth for that user's history, and `generation.json`, the record of how each one was generated |

[gen/](../gen/) writes the sessions from `plan.json`, and [check/history.mjs](../check/history.mjs) holds them to it.
