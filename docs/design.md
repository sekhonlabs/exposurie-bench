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

Every condition gets the same tasks, the same model (Sonnet 5.5, `claude-sonnet-5-5`, pinned and recorded) and the same tools, with web tools off.

| | Condition | How it is set up |
|---|---|---|
| A | Fresh session | no instructions file, exposurie absent |
| B | Whole history | the user's prior conversation (user and agent text, no tool output) in the instructions file |
| C | exposurie | see below |
| D | Perfect memory | only the facts the task needs, in the instructions file |

**A, B and D differ by one file:** the sandbox's global instructions file, `~/.claude/CLAUDE.md`, which is also where exposurie puts its pointer. C has that file with the pointer in it, plus everything else exposurie installs: its skill (`~/.claude/skills/exposurie/SKILL.md`), its `/exposurie-sync` command, the brain on disk, and the `exposurie` command. The pilot checks B's input tokens to confirm the whole history arrived. If the file were cut short, B and D would move to `--append-system-prompt-file`.

The files B and D get are in `tasks/conditions/`:

- **B** holds every session and chat, oldest first, as exposurie reads them: only what was said. Each one is headed by what exposurie also knows about it: when it started, the surface, and the folder it ran in or the chat's title.
- **D** holds only the facts the task needs, one line each: where the fact applies, what kind it is, its value and its reason. Nothing marks a fact as replaced, since perfect retrieval returns only the current one.

For area 4, D gets the facts closest to the question, which is what perfect retrieval would return. The right answer is still "not recorded".

Condition C is set up like this:

- exposurie 1.2.0 is installed in the sandbox. Part 10 runs C again with exposurie's `read` rebuilt (commit `b6855ee`), on the same brains, beside 1.2.0's results: see [decisions.md](decisions.md).
- The brain is built from the same history by `exposurie sync`, with the agent writing the pages, as a real user's agent would.
- The pointer sits in the sandbox's `~/.claude/CLAUDE.md`.
- The task runs from an empty folder.

**B is deliberately cheaper than reality.** A real long session also carries tool output. If C still uses fewer tokens than B here, the saving is real.

## The users

There are two made-up people:

- **a great developer**, who works across several repositories: two at the software company they work for, and four of their own
- **someone who hands everything to agents** and just wants the work done, who also plans in claude.ai chats

Neither is tied to a niche job or industry: the developer's company is never said to make anything in particular, and the second user's job is never named. Neither has a name either, since real users rarely tell Claude Code theirs.

They are synthetic for three reasons: every right answer is known, nothing private enters a public repository, and anyone can rerun the benchmark.

Their histories:

- **The developer:** 28 Claude Code sessions across 6 repositories, over 4 months. 12 are at work, in VS Code, where their Claude Code has GitHub, Linear and Slack connected. 16 are on their own projects, in the terminal.
- **The second user:** 15 short Claude Code sessions in the desktop app and 10 claude.ai chats, over 3 months. Their prompts are short ("make it work", "ok, do that"), so the agent proposes most of their decisions and they accept them. exposurie keeps the agent's side of a transcript too, so a brain can still pick these decisions up.
- **Size:** about 80K tokens of conversation per user, counted on the text exposurie reads at 4 characters per token. Sonnet 5.5's own count is higher: the pilot measured about 119K tokens for the developer's B file. Real histories are larger than any context window, so this size is chosen to keep B runnable: the whole history fits, with room for the task.
- **How they are made:** each session has a written plan, and Sonnet 5.5 writes the session from it. The text is then converted into Claude Code transcripts, plus a claude.ai export for the second user. See [build-plan.md](build-plan.md). Each user's facts are in `users/<user>/facts.json`, and the sessions they are first said in are in `users/<user>/plan.json`.

How the planted facts work:

- Every planted fact has an ID.
- Every fact a task asks about is a non-default choice (a specific host, colour, supplier or library), so a fresh agent cannot score by guessing. The other facts also include people, places and habits, because a real history has them and exposurie is built to keep them.
- A replaced value may be the popular default, as it often is in life. It is never the right answer, so guessing it still cannot score.
- Every fact is checked to appear in the generated text.
- Some facts are replaced later in the history, and some sessions are distractors.
- There are 3–4 times more facts that no task asks about than facts a task does, so the brain has to sort what matters, not just store it.

**Work and personal.** The developer follows their team's rules at work and their own at home, and the two disagree. The team uses Prisma for every query, for example, while they keep ORMs out of their own code. Some tasks check that one context's rules do not leak into the other.

Connectors and MCP servers stay off in every run, and exposurie drops what a connector returns, so only what was *said* about a connector can reach a brain. Where a connector would act, such as opening a pull request, a task writes a file instead, and the file is checked.

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

Two long tasks, both the developer's, are each interrupted at half the context window: 500,000 tokens of Sonnet 5.5's 1,000,000. Then one of three things happens:

1. **Keep going** in the same session.
2. **`/compact`**, Claude Code's built-in summarise-and-continue.
3. **`exposurie sync`, then a fresh session.**

How a long session is made:

- **It is filled live,** in condition C. The developer gives the agent one written step at a time, in one saved session, in their own repository. First come the core steps, which build the first half of a feature. Along the way the developer makes decisions that only later steps need, and three times asks for an approach that then fails on their real data. They say why it failed and have it replaced. Then come more steps of the same project's work, until the session reaches the mark.
- **It is interrupted at the first step boundary past 500,000 tokens,** counted as the prompt of the session's last call to the model. A person stops there when they see it.
- **Each strategy starts from that same point:** the same saved session, forked, and the same repository.
- **Every strategy then gets the same steps,** which finish the feature. The fresh session's first step also says it picks up from the last session.
- **Auto-compact is off throughout,** so only the second strategy compacts.
- **The sync runs in a session of its own,** once the long session has been still for five minutes, because exposurie leaves anything newer for the next sync, and never files the session it runs in.

We measure whether the task gets finished, whether the decisions made in conversation are kept, the tokens used after the interruption, and how often the agent retries an approach that already failed. Retrying a failed approach is the clearest sign of lost context. Each of the three failed approaches leaves a mark in code, so the measure counts every file write after the interruption, including ones the agent later took back.

This area needs sessions to be saved, so they can be resumed and synced. It is the one exception to the run hygiene below, and it is built last. A stream shows which strategy made it, so area 9 cannot be scored blind; its checks are scripts, and every run is read by hand.

## Scoring

- Each task lists **required facts**, which must appear, and **forbidden facts** (outdated or invented), which must not. A script checks these.
- An answer is the agent's final reply, not the text it wrote before its tool calls.
- Work tasks are checked from the files the agent creates or changes. Area 7 also reads the agent's reply, because it measures whether a plan made in a web chat reached the agent, and a reply that names the plan shows it did.
- Some answers a string match can't judge. They get a fixed rubric, judged by a separate Claude run, and every one is also checked by hand:
  - area 4, where the right answer is "not recorded"
  - area 5, whose answers are advice. Advice is right only when it follows the user's decision for the user's reason, and that reason can be put in many words, while a fresh agent can give the same verdict for a generic one.
- An answer that contains both a required fact and a forbidden one, such as "you moved from Jest to Vitest", is not failed automatically. It goes to the judge and the hand check.
- The scoring script never sees which condition produced an answer.

## Numbers

Each run uses `claude -p --output-format stream-json`, which reports:

- input, cache-read, cache-write and output tokens, from the API's own usage field
- turns and duration
- every tool call

`total_cost_usd` is recorded too, but it is a client-side estimate, so tokens are the primary number.

**Tokens per run counts every input token, cached or not.** Whether a prompt hits the cache depends on what ran just before it, not on the condition. The cached/uncached split is kept as a second number.

| Number | How it is computed |
|---|---|
| right answers | per condition, pooled over areas 1–7; per area as counts ("2 of 3"), never percentages |
| tokens per run | median per condition |
| tokens per right answer | total tokens ÷ right answers, because a cheap wrong answer is not cheap |
| overhead | area 8, C − A |
| made-up answers | area 4, per condition |
| looked vs found | did the agent run `exposurie read` at all (compulsion), and was it right when it did (capability) |

Potential reached and break-even were in this table until 2026-10-28, when they were dropped; [decisions.md](decisions.md#2026-10-28) says why.

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

- **Isolated home and Claude Code config for every run**, logged in with a Claude plan, never an API key. `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP` and `CLAUDE_CONFIG_DIR` all point into the sandbox. Auto-memory and claude.ai connectors are off, and no MCP server loads. Nothing from the machine owner's own setup (instructions, skills, plugins, memory, connectors) can load.
- **The environment is built, never inherited:** Windows' own variables plus the sandbox's paths, so nothing from the process that starts a run reaches it.
- **The sandbox's own pinned copies** of Node, Git, Claude Code and exposurie 1.2.0, with auto-update off. Claude Code went through 44 version numbers in the 46 days before this benchmark was designed, and the run takes several days.
- **No remote feature flags** (`DISABLE_GROWTHBOOK=1`). Every run gets the pinned binary's own defaults, the same on every day.
- **Transcript retention is set before any history is placed.** Claude Code deletes transcripts older than its `cleanupPeriodDays` (30 by default). exposurie orders history by file date, so the history's files carry dates months in the past.
- **A fresh folder per run, outside this repository.** It is empty, except for the task's starter repository in areas 6 and 7. The answer key lives in this repository. The folder's path names neither the task nor the condition, since the agent sees it, and no instructions file (`CLAUDE.md`, `AGENTS.md`) sits in any folder above it.
- **Every tool call stays in the run's folder.** The runner reads every tool call afterwards, and throws out a run that reached outside its folder, with a file tool or with the shell. C may also reach its brain. Edits are accepted inside the folder, and anything else that would ask for permission is denied. Claude Code itself denies a headless run any read outside its folder, and lets read-only shell commands inside it, such as `ls`, run without asking; those are noted, not thrown out.
- **stdin closed on every run.** An earlier exposurie pointer test overstated its result because each headless session read the remaining questions from stdin.
- **No session persistence** (`--no-session-persistence`), so runs never become part of a user's history at the next sync.
- **The same tools in every condition:** read, write, edit, search, and a shell allowed to run `exposurie`, plus the read-only commands Claude Code allows by itself inside the run's folder. No web tools: this repository is public, so an agent allowed to search could find the answers. The runner checks the tool list at the start of every run and throws out any run where it is wrong.
- **Brains built before any task runs**, with their build tokens recorded. Then the raw history leaves the sandbox home, and so do exposurie's staged copies of it, so C can only use the brain. The brain is hidden during A, B and D.
- **C runs finish within 7 days of their brain build.** After 7 days exposurie's status line asks the agent to sync, and an agent that syncs mid-task changes both the brain and the token count.
- **Conditions are mixed together in the run order.**
- **A run stopped by a usage limit counts as "not run", never "wrong"**, and is run again later.
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
- Histories are about 80K tokens per user, smaller than a real one. That also favours B, because a real history would not fit in one context at all.
- Claude Code's own auto-memory and other memory systems are not compared in this version.
- Remote feature flags are off, so Claude Code runs on the pinned binary's defaults rather than on any account's flag settings.
- One run per cell, so per-area counts are only indicative; the pooled numbers are the result.
- Connectors are off in every run, so the benchmark measures whether work is done the team's way, not whether an agent can drive the team's tools.
- C reaches its brain only through `exposurie read`. A headless run is denied any read outside its folder, so a direct read of a brain page is refused, where a person at the keyboard could approve it.
- Every planted fact is said in words. In a real history some decisions live only in code an agent wrote, where a brain built from conversation cannot see them.
- The claude.ai export carries no claude.ai memory. A real one may, and exposurie would read it first.
