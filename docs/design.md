# Design

This is the method, fixed before anything runs. Changing it needs a dated entry in [decisions.md](decisions.md).

## The question

exposurie gives a coding agent's user an external brain, in three parts:

- a curated Markdown wiki built from their own past sessions and chat exports
- a librarian, `exposurie read`
- a short pointer in the agent's global instructions file, so every new session knows the brain exists

The benchmark asks whether that makes the agent better for that user, by how much, and at what token cost.

"It reduces token cost" is only half a claim. A fresh session with no memory is always the cheapest run, but it is wrong whenever the task needs the user's past. Next to it, exposurie adds tokens: the pointer and the reads. The saving only exists against what people do so the agent won't forget, which is one long session or pasting history back in. Building the brain also costs tokens before anything is saved. So the benchmark measures wins and overhead together, under four conditions.

## Conditions

Every condition gets the same tasks, the same model (pinned and recorded) and the same tools, with web tools off.

| | Condition | How it is set up |
|---|---|---|
| A | Fresh session | an empty folder, exposurie absent |
| B | Whole history | the user's prior conversation (user and agent text, no tool output) placed before the task |
| C | exposurie | see below |
| D | Perfect memory | only the facts the task needs, placed before the task |

Condition C is set up like this:

- exposurie 1.2.0 is installed in the sandbox.
- The brain is built from the same history by `exposurie sync`, with the agent writing the pages, as a real user's agent would.
- The pointer sits in the sandbox's `~/.claude/CLAUDE.md`.
- The task runs from an empty folder.

**B is deliberately cheaper than reality.** A real long session also carries tool output. If C still uses fewer tokens than B here, the saving is real.

**Potential reached = (C − A) ÷ (D − A)**, pooled over the memory areas (1–7). It is the share of the gap between a forgetful agent and a perfect-memory one that exposurie closes.

## The users

There are two made-up people:

- **a great developer**, who works across several repositories
- **someone who hands everything to agents** and just wants the work done, who also plans in claude.ai chats

Neither is tied to a niche job or industry.

They are synthetic for three reasons: every right answer is known, nothing private enters a public repository, and anyone can rerun the benchmark. Each history is written from a fact sheet as Claude Code transcripts, plus a claude.ai export for the second user.

How the planted facts work:

- Every planted fact has an ID.
- Every fact is a non-default choice (a specific host, colour, supplier or library), so a fresh agent cannot score by guessing.
- Every fact is checked to appear in the generated text.
- Some facts are replaced later in the history, and some sessions are distractors.

## Areas

The benchmark goes broad rather than deep: nine areas, three tasks each, one run per task and condition.

| # | Area | What it shows | Example task | Conditions |
|---|---|---|---|---|
| 1 | Recall | the agent knows the user's past | "Which database did I pick for the invoices app, and why?" | A B C D |
| 2 | Across projects | one brain covers all the user's repositories | "Which of my projects deploy on Fly.io?" | A B C D |
| 3 | Changed decisions | the latest decision wins | "Which test runner do I use now?" | A B C D |
| 4 | Never discussed | it says "not recorded" instead of inventing | "What did I decide about Docker?" (never discussed) | A B C D |
| 5 | Your way | the user's decision beats generic advice | "Should I add an ORM here?" (the user decided against ORMs) | A B C D |
| 6 | Real work | the task is done the user's way, checked from the files it writes | "Set up this repo's deploy the way I always do" | A B C D |
| 7 | Chat to agent | what was decided in a web chat reaches the coding agent | "Build the feature we planned in chat" | A B C D |
| 8 | No past needed | the overhead on unrelated work | "Write a function that removes duplicates from a list" | A B C |
| 9 | Long sessions | a fresh session after a sync, compared with carrying on | one long task, interrupted at half the context window | see below |

Areas 1–4 follow four of [LongMemEval](sources.md#longmemeval)'s five abilities. Its fifth, temporal reasoning, is folded into recall. Area 5 scales up exposurie's own pointer test, which asked questions where a confident generic answer contradicts the user's recorded decision. Areas 6 and 7 are the work users actually come to do.

### Area 9: long sessions

A common rule of thumb says an agent's quality falls past about half its context window, so the user should start a fresh session there, with the brain synced first.

Quality does fall as input grows ([Context Rot](sources.md#context-rot)), but no source we found gives 50%. Also, `exposurie sync` files the person and their decisions, not where a task stands. This area tests whether that is enough.

Two long tasks are each interrupted at half the context window. Then one of three things happens:

1. **Keep going** in the same session.
2. **`/compact`**, Claude Code's built-in summarise-and-continue.
3. **`exposurie sync`, then a fresh session.**

We measure whether the task gets finished, the tokens used, and how often the agent retries an approach that already failed. Retrying a failed approach is the clearest sign of lost context.

## Scoring

- Each task lists **required facts**, which must appear, and **forbidden facts** (outdated or invented), which must not. A script checks these.
- Work tasks are checked from the files the agent writes.
- Some answers a string match can't judge: area 4, and prose in area 6. They get a fixed rubric, judged by a separate Claude run, and every one is also checked by hand.
- The scoring script never sees which condition produced an answer.

## Numbers

Each run uses `claude -p --output-format stream-json`, which reports:

- input, cache-read, cache-write and output tokens, from the API's own usage field
- turns and duration
- every tool call

`total_cost_usd` is recorded too, but it is a client-side estimate, so tokens are the primary number.

| Number | How it is computed |
|---|---|
| right answers | per condition, pooled over areas 1–7; per area as counts ("2 of 3"), never percentages |
| tokens per run | median per condition |
| tokens per right answer | total tokens ÷ right answers, because a cheap wrong answer is not cheap |
| overhead | area 8, C − A |
| made-up answers | area 4, per condition |
| break-even | brain-build tokens ÷ (B − C tokens per session): the number of sessions until the brain pays for itself |
| looked vs found | did the agent run `exposurie read` at all (compulsion), and was it right when it did (capability) |
| potential reached | (C − A) ÷ (D − A) |

**Stability check:** one area is rerun twice more under C, to show how often answers change between identical runs.

## Size

| Part | Runs |
|---|---|
| Areas 1–7: 7 areas × 3 tasks × 4 conditions | 84 |
| Area 8: 3 tasks × 3 conditions | 9 |
| Area 9: 2 tasks × 3 strategies | 6 |
| Stability check | 6 |
| **Total** | **about 105**, plus one brain build per user |

A pilot comes first: one task under all four conditions, to measure the real cost of a run before the rest.

## Run hygiene

Every rule here exists because breaking it produces a wrong number.

- **Isolated home and Claude Code config** (`CLAUDE_CONFIG_DIR`) for every run, logged in with a Claude plan, never an API key. Nothing from the machine owner's own setup (instructions, skills, plugins, memory) can load.
- **A fresh empty folder per run, outside this repository.** The answer key lives in this repository.
- **stdin closed on every run.** An earlier exposurie pointer test overstated its result because each headless session read the remaining questions from stdin.
- **No session persistence** (`--no-session-persistence`), so runs never become part of a user's history at the next sync.
- **Web tools off in every condition.** This repository is public, so an agent allowed to search could find the answers.
- **Brains built before any task runs**, with their build tokens recorded.
- **Versions recorded per run:** Claude Code, model, exposurie.

## Where it runs

Runs happen locally, on a Claude plan.

Cloud sessions are possible:

- They count against plan usage, with no separate charge.
- The cloud machine has Node and npm.
- A setup script can write `~/.claude/CLAUDE.md`, which is where exposurie's pointer goes, so condition C reproduces on a clean Linux machine.

**Unverified:** whether a script inside a cloud machine can start its own `claude -p` runs. Those runs are where exact token counts come from.

## What we expect, written before the results

- C beats A on right answers by a wide margin, and costs a few more raw tokens.
- C against B depends on history size. With a short history, B may be more accurate: it sees everything raw, while the brain is curated and only helps if the agent looks.
- Changed decisions (area 3) and long sessions (area 9) are where curation is most likely to lose detail.
- `/compact` may beat sync + fresh within a single task. exposurie is built for knowledge across sessions and projects.

Results are reported whichever way they go. In [VibeMemBench](sources.md#vibemembench), 11 of 12 pairings of an existing memory system with a solver failed to beat no memory, so a loss here would not be unusual.

## Limits

- Synthetic users may be tidier than real lives.
- One agent (Claude Code) and one model.
- One brain build per user, so variation between brain builds is not measured.
- B is a simulation of a long session.
- Claude Code's own auto-memory and other memory systems are not compared in this version.
- One run per cell, so per-area counts are only indicative; the pooled numbers are the result.
