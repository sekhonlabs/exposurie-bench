# Build plan

How the benchmark gets built, in order. Each part is discussed with the owner first, then built and checked, and only then does the next part start. The method itself is in [design.md](design.md). This file gives the order of work and what "done" means for each part.

Claude Code builds and runs all of it.

## Layout

| Path | What it holds |
|---|---|
| `users/<user>/facts.json` | the user's planted facts |
| `users/<user>/plan.json` | the session plan: each session's time, project or chat, and surface (part 1), and which facts come up in it and how (part 2) |
| `users/<user>/sessions/` | each generated session as readable Markdown. This is the source of truth for that user's history |
| `gen/` | the generator, and the converter that turns sessions into Claude Code transcripts and a claude.ai export |
| `check/` | the fact-sheet check (part 1), the history checker (part 3), the task check (part 4), the runner and scorer check (part 5), the brain build check (part 6), the long-session check (part 8) and the results check (part 9) |
| `tasks/` | the tasks, their checks and judge rubrics (`tasks/index.json`, which lists every task), the starter repositories for areas 6, 7 and 9 (`tasks/starters/`), the condition files for B and D (`tasks/conditions/`), example answers (`tasks/examples.json`), and area 9's steps files, the material their steps hand over, and the scripts that write both (`tasks/long/`) |
| `runner/` | sandbox setup, the runner and the brain build, area 9's long sessions (`long.mjs`), and the fake `claude` they are tested against |
| `score/` | how a task's checks read a run (part 4), the scorer and the judge (part 5), area 9's scorer (`long.mjs`), and the results' numbers and charts (`results.mjs`, part 9) |
| `results/` | each batch's scores and which run had which condition, the brain builds' tokens, area 9's scores, hand read and record of every step (`area-9/`), every number (`numbers.json`) and the charts (`charts/`). Raw run output stays outside the repository |

The sandbox and the raw output (`sandbox/` and `runs/`) sit next to this repository's folder, never inside it.

## Parts

### 0. Sandbox

**Done 2026-10-18.** Plan usage: one tiny run, to confirm the login.

Everything the sandbox runs is its own copy, pinned in [runner/pins.json](../runner/pins.json) and checked against its published hash: Node 24.22.0, Portable Git 2.56.0, Claude Code 2.1.302 and exposurie 1.2.0. Apart from Windows itself, it uses nothing of the machine owner's setup.

- `runner/bootstrap.ps1` fetches the sandbox's Node with Windows' own `curl` and `tar`. It then hands over to `runner/sandbox.mjs setup`, which installs Git, then Claude Code and exposurie with the sandbox's own npm, prefix and cache. Setup also writes the sandbox's settings ([runner/sandbox-settings.json](../runner/sandbox-settings.json)):
  - transcript retention of 3650 days (`cleanupPeriodDays`)
  - auto-memory off, auto-update off, web tools denied, model Sonnet 5.5
- `runner/sandbox.mjs` builds the environment every run gets. It is built, never inherited: Windows' own variables, plus
  - `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP` and `CLAUDE_CONFIG_DIR` pointing into the sandbox
  - a `PATH` of the sandbox's folders and Windows
  - claude.ai connectors off (`ENABLE_CLAUDEAI_MCP_SERVERS=false`), and every run passes `--strict-mcp-config`
  - remote feature flags off (`DISABLE_GROWTHBOOK=1`), see [decisions.md](decisions.md)
- The owner logs in once with `sandbox.mjs login`, by copying the sign-in URL into their own browser. A browser started from the sandbox makes a new profile inside it.

**Done when** one run's start-up line shows the pinned version and model, a plan login with no API key, no MCP servers, only the listed tools, and no plugins, skills, agents or commands except the binary's built-in ones. `sandbox.mjs check` makes that one tiny run and checks it. It also fails if anything but `.claude` and the empty `AppData` folders appears in the sandbox home.

### 1. Fact sheets

**Plan usage:** none. **Done 2026-10-20:** `check/facts.mjs` passes, and the owner approved both users.

Each planted fact in `users/<user>/facts.json` has:

- an ID (`id`), its context (`context`: work or personal), its project (`project`, or null when it is about the person) and its kind (`kind`, such as host, licence or colour)
- its value (`value`), with the spellings that count as a match (`match`). `match_all` means every spelling must appear, and `exact_case` means case matters.
- why it was chosen (`why`), and the spellings that count for the reason where a task asks why (`why_match`)
- what a fresh agent would guess instead (`guess`)
- how it first comes up (`how`): said by the user (`user`), proposed by the agent and accepted (`agent`), or the user correcting the agent (`correction`)
- the session where it is first said (`first_session`)
- what replaces it later, or what it replaces (`replaced_by`, `replaces`)
- the options turned down, and the session that names them (`rejected`). A rival choice may be named only where a fact or a turned-down option plans it.
- where it comes from (`source`: `claude-code` or `claude.ai`)
- the tasks that ask about it (`tasks`), and the tasks where giving it as the answer is wrong (`traps`)

Each sheet also lists what is never discussed (`never_discussed`), for area 4: the topic, the words that must never appear in the history, and the facts closest to it, which D gets.

The sessions the facts point at are fixed here too, in `users/<user>/plan.json` (time, project or chat, surface), and so is the task list, `tasks/index.json`.

There are 3–4 times more facts that no task asks about than facts that a task asks about.

**Done when** `check/facts.mjs` passes and the owner approves both users.

### 2. Histories

**Plan usage:** yes. Sonnet 5.5 writes the sessions, inside the sandbox, with session persistence off. **Built and tested offline 2026-10-20, then piloted on three sessions with the owner's go.** del-04 and del-22 were kept. dev-01 passed but was set aside on reading, because it printed a Windows drive path that does not fit the user's Mac. Since the pilot, the prompt names each project's folder and leaves the language name off code blocks, and the checker refuses drive paths. Each kept session took about 4.5–9.4K output tokens, roughly twice its visible text, because the model thinks before writing.

The first full run, 2026-10-20, changed four things (see [decisions.md](decisions.md)):

- Sessions asked for at least their planned length came in at 1.39 times it, which would have put the developer's history near 114K tokens. Each session's length now follows the history's budget.
- Every heading the checker refused was inside a code block, in a README or a pull request description. Headings are now refused only outside code blocks.
- Two attempts named a forbidden word inside a file name (`.cjs`, and pnpm's lockfile), and one split a spelling with backticks. The prompt now covers both.
- Reading found five developer sessions where the assistant knew a team convention said only in an earlier session. The prompt now says the assistant knows the person's rules and the team's conventions only once they are said.
- Claude Code adds the sandbox login's own email address to every run's context. One session used it, and was set aside before it was committed. The checker now refuses the login's address and names, read from the sandbox when it runs, so they never enter the repository.

Seven kept sessions are written again: del-04, where the assistant knew something only a claude.ai chat had said; dev-11, dev-15, dev-18, dev-23 and dev-27, where it knew a team convention said only earlier; and dev-16, which used the login's address.

- **Briefs.** Every session in `users/<user>/plan.json` has a `brief`:
  - what happens (`story`)
  - how each fact first said in it comes up (`facts`, one entry for each fact whose `first_session` it is). A fact can be stated by the user, proposed by the agent and accepted, or corrected later. Distractors plant nothing.
  - the earlier facts that come up again (`again`)
  - its planned size: `turns` from the user and `tokens` in all, about 80K per user
  - for work sessions, the git branch

  `plan.json`'s `machine` gives each project's made-up working folder. Each ends in the project's name, because exposurie names a project after its folder.
- **The prompt** (`gen/prompt.mjs`) is built from the brief, the fact sheet and the checker's rules. It holds the facts that must come up, with their exact spellings and reasons, the earlier facts that come up again, the background the session must not contradict, and the words it must not use. The assistant in the history remembers nothing from earlier sessions, as Claude Code doesn't.
- **The generator** (`gen/generate.mjs`) runs the sandbox's Claude Code once per session, with the pinned model and the prompt as its whole system prompt. The run has no tools, skills or MCP servers, stdin is closed and session persistence is off.
  - What comes back is checked with `check/history.mjs` before it is kept. A session that fails goes back with the checker's findings, up to three attempts.
  - Each history is about 80K tokens, and sessions come in longer or shorter than their briefs. So each new session is asked for its share of what is left: the tokens the written sessions have not used, spread over the briefs still to write, between 0.7 and 1.6 of its own brief.
  - Sessions already written are skipped, so a run stopped by a usage limit resumes when it is run again.
  - `users/<user>/sessions/generation.json` keeps every attempt's usage and findings. Prompts and raw output go to `../runs`.
- **The converter** (`gen/convert.mjs`) turns the sessions into a home folder:
  - Claude Code transcripts under `.claude/projects/`, with the line fields Claude Code 2.1.302 writes and file dates that follow the story
  - for the second user, a claude.ai export in `Downloads/`

  It is deterministic. Its output is not committed, because git does not keep file dates and exposurie orders history by them; part 6 converts straight into the sandbox home. `--self-test` converts a small made-up history and reads it back with exposurie 1.2.0's own readers.

```
node gen/generate.mjs developer --dry-run       write every prompt to ../runs, run nothing
node gen/generate.mjs developer                 generate the missing sessions (needs the owner's go)
node gen/convert.mjs developer <home folder>    convert a finished history
node gen/convert.mjs --self-test
```

**Done when** every session exists and passes part 3. **Done 2026-10-20:** 28 developer sessions (about 83K tokens) and 25 delegator sessions (about 74K), each kept only after the checker and a reading pass.

### 3. History checker

**Plan usage:** none. **Built 2026-10-20, with part 2,** because the generator holds every session to it before keeping it. **Done 2026-10-20:** `--readers` passes for both users. Its first full run had found a deadlock: the check's top-level await waited on `gen/convert.mjs`, which imports the check back. It is `check/history.mjs`, with the matching rule in `check/text.mjs` and the rival names in `check/rivals.json`.

- Every fact appears in the session where it is planned, and in no earlier session. A turned-down option is named in its session.
- A replaced value is never stated as current after it was replaced. It may be named in the session that replaces it, and never after.
- No task question appears in the history.
- No other choice of the same kind (another database, host, library or colour) appears unless it is planned. A name from `check/rivals.json`, or a turned-down option, may appear only in a session where a fact or a turned-down option names it. A colour code may appear only once its fact has been said.
- No `never_say` word appears anywhere in that user's history. Nothing first said in the claude.ai chats that area 7 asks about appears in a Claude Code session.
- Each user's history is about 80K tokens of conversation.
- exposurie's own readers parse every file (`--readers`). This is exposurie's staging step, which uses no model.

`node check/history.mjs --briefs` holds the briefs to the same rules before anything is generated.

### 4. Tasks

**Plan usage:** none. **Done 2026-10-20:** `check/tasks.mjs` passes. The 24 tasks of areas 1–8 are complete. Area 9's two are built in part 8.

Each task in `tasks/index.json` has:

- its question (`ask`), in the user's own voice
- the folder it runs in (`folder`): an empty folder named `scratch` for areas 1–5 and 8, so the name points at no project, and the project's own folder name for areas 6 and 7, holding a copy of its starter (`starter`) or nothing
- how it is scored (`score`): by its checks, or by the judge for areas 4 and 5
- its required checks (`required`), which must all hold, and its forbidden checks (`forbidden`), which must not. Each check names the fact it tests (`fact`), or none when it only confirms the work was done.
- the judge's rubric (`judge`): what a right answer does and what makes it wrong. The judge uses it for areas 4 and 5, and for any answer where every required check holds and a forbidden one does too.

A check reads the answer, the files the run created or changed, or both (`in`). It can narrow to some files (`file`, a glob) or to an HTML page's visible text (`text`). It passes when any, all or none of its spellings appear (`any`, `all`, `none`), or when a pattern matches (`patterns`). Spellings match as whole words, case-insensitively unless `exact`, in text read with backticks removed and curly quotes straightened. `score/checks.mjs` holds these rules, for the task check now and the scorer in part 5.

- **Facts.** A task's required checks cover every fact whose `tasks` list it, and its forbidden checks cover every fact whose `traps` list it.
- **Starters** in `tasks/starters/<task>/`. Each one is a project as the history leaves it:
  - real-work-1: a new Hono and SQLite app of the developer's own, written their way, with no deploy files
  - real-work-2: a cut-down `tidewell-api`, whose export endpoint fails for an organisation with no projects
  - chat-1 to chat-3: the delegator's book-club, small-hours and spending-summary
  - real-work-3 starts empty.

  Where sessions disagree about a file, the latest session wins.
- **The condition files**, written by `tasks/conditions.mjs` into `tasks/conditions/` and committed:
  - B, `history-<user>.md`: every session and chat, oldest first, as exposurie reads them. Each one is headed by its start, its surface, and the folder it ran in or the chat's title.
  - D, `facts-<task>.md`: only the facts the task needs, one line each. For area 4 these are the facts closest to what was never discussed. Area 8 has no D.
- **Examples.** `tasks/examples.json` holds a right and a wrong answer for every task scored by its checks, and some answers that must go to the judge.

`check/tasks.mjs` holds all of it:

- each task against the fact sheets
- no fact check passing on the question itself, or on a fresh agent's guess
- no starter file passing a check on its own, or holding a plan made only in claude.ai
- the condition files against a fresh build
- every example's verdict
- no question in the history, and no Windows path or login detail in any task file

```
node tasks/conditions.mjs     write the condition files
node check/tasks.mjs          check the tasks
```

**Done when** `check/tasks.mjs` passes.

### 5. Runner and scorer

**Plan usage:** none. **Done 2026-10-21:** `check/runner.mjs` passes. A fault test then broke the code fifteen ways, one at a time, and the check failed on every one (`../runs/part5-fault-test`). The fake found one thing a real run would not have shown: Windows gives a child process its parent's `USERNAME`, `USERDOMAIN` and `LOGONSERVER` whenever its environment leaves them out, so every sandbox process had carried the owner's account name. The sandbox now sets all three itself (see [decisions.md](decisions.md)).

The runner, `runner/run.mjs`:

- **`plan <batch>`** fixes a batch: each task asked for, under each condition asked for (area 8 has no D). The order comes from sorting on a hash of the seed, so conditions are mixed and the same seed always gives the same order. Each run gets an ID, `r001` onwards, that names neither its task nor its condition, because the agent sees its folder's path.
- **`go <batch>`** runs whatever has not run, in order. For each run it:
  - makes a fresh folder, `../runs/<batch>/<run>/<folder>`, holding a copy of the starter or nothing
  - puts the condition into the sandbox home. A gets nothing. B and D get the condition file as `~/.claude/CLAUDE.md`. C gets a copy of everything exposurie installed, and of the brain, from `../sandbox/brains/<user>/`, and the `exposurie` command on the PATH, which A, B and D do not have.
  - runs Claude Code headless with stdin closed: `-p`, the pinned model, `stream-json`, `--strict-mcp-config`, the six tools, `Bash(exposurie:*)` allowed, edits accepted inside its folder (`acceptEdits`), and no session persistence
  - checks the start-up line the moment it arrives: the version, the model, a plan login, no MCP server, the tool list, built-in plugins only, its own folder, the permission mode, and nothing of exposurie outside C. A wrong one stops the run before it spends anything.
  - puts the home back as runs leave it, then checks the run. Every tool call must stay inside its folder (C may also reach its brain), the shell may have run only `exposurie`, its condition must be unchanged, and it must have written no transcript and left nothing in the home. A call that was denied reached nothing, so it is only noted.
  - saves what the scorer reads in the run's folder: `run.json` (the task, the versions, tokens per model, turns, plan usage, and whether it ran `exposurie read`), `answer.md` (the final reply), and the files it created or changed (`files/`, `files.json`). The condition is only in `batch.json`.
- Each run ends up **done**, **not run** (a usage limit, an API error, no result within 30 minutes, or a crash) or **thrown out** (it broke a check). The batch stops at a usage limit, at three API errors in a row, or when a run leaves anything in the home. Running `go` again carries on and reruns whatever did not run. `--again` reruns named runs, and keeps each earlier attempt beside the new one.
- C runs only on a brain synced in the last 7 days with nothing left unfiled. Past that, exposurie's own status line asks the agent to sync.
- **`keep-brain <user>`**, for part 6, moves what exposurie wrote into the sandbox home out to `../sandbox/brains/<user>/home/`, and the raw history to `../sandbox/brains/<user>/history/`.
- Only one sandbox process runs at a time. A lock file, `../sandbox/run.lock`, enforces it, and `sandbox.mjs check` and `login` take it too.
- Nothing runs while a `CLAUDE.md`, `AGENTS.md` or `.claude` sits in a folder above the runs, since Claude Code would load it into every one of them.

The scorer, `score/score.mjs`, reads only each run's folder, never `batch.json`. A run's verdict comes from its checks (`score/checks.mjs`). The judge, `score/judge.mjs`, decides areas 4 and 5, and any answer where every required check holds while a forbidden one does too. It is a separate run, with the pinned model and no tools, given the question, the rubric, the final reply and the files, and it answers `VERDICT:` and `REASON:`. `hand-check.md` lists every judged run for the hand check, and a verdict written into `hand.json` is final. `--save` writes the scores into `results/<batch>/`, and refuses any text holding the sandbox login's address or names, or a machine path.

`check/runner.mjs` runs all of it against `runner/fake-claude.mjs`, in a sandbox home of its own under `../runs`:

- both users' brains, made by exposurie 1.2.0's own `scaffold` and kept with `keep-brain`
- all 93 runs of areas 1–8. Fifteen of them get trouble on purpose: a usage limit, a crash, a hang, an API error, a wrong tool list, an MCP server, a read outside the folder (once allowed and once denied), a shell command, a transcript written, an edited condition, something left in the home, the login's address in an answer, and two answers that must go to the judge.
- the fake checks each run's arguments, environment, folder and condition, and looks for `exposurie` through Git Bash, as an agent's shell would
- C on a brain synced 8 days ago, and on one with conversations unfiled, and a batch with an `AGENTS.md` above it
- scoring with `batch.json` moved out of reach, a usage limit in the judge, a hand verdict, the repository save's refusals, and the real sandbox home unchanged

```
node runner/run.mjs plan <batch> [--users u,u] [--tasks id,id] [--conditions A,B,C,D] [--seed text]
node runner/run.mjs go <batch> [--again r001,r002]     every run spends plan usage: needs the owner's go
node runner/run.mjs status <batch>
node runner/run.mjs keep-brain <user>
node score/score.mjs <batch> [--no-judge] [--save]     the judge spends plan usage too
node check/runner.mjs
```

**Done when** `check/runner.mjs` passes.

### 6. Brain build and pilot

**Plan usage:** yes. **Done 2026-10-21,** with the owner's go. Built and tested offline first: `check/build.mjs` passes, and so does `check/runner.mjs` again.

The brain build, `node runner/run.mjs build <user>`:

- **Before any history goes in,** it refuses unless the sandbox's settings keep transcripts for 3650 days and the home is as runs leave it, with nothing in the history folder, the owner's login session included.
- It converts the user's history straight into the sandbox home (`gen/convert.mjs`), then checks that the history folder holds exactly the converted transcripts, and Downloads exactly the export or nothing.
- `exposurie scaffold --at ~/brain` makes the brain and writes the pointer, the skill and `/exposurie-sync`. This takes no model.
- Of the steps exposurie leaves for the person, retention is already done. The claude.ai export and Obsidian are declined, with no reason recorded (see [decisions.md](decisions.md)).
- Then headless Claude Code types `/exposurie-sync` in the brain's folder, with a run's model, tools and permission mode, as many times as it takes for exposurie's own state to say nothing is staged or waiting.
- Every session is checked like a run: its start-up line (with `/exposurie-sync` among its commands), every tool call (the brain may be written, and the history and the export read), the shell (`exposurie` only), the pointer unchanged, no transcript written, nothing left in the home.
- Each session's stream, tokens and the brain's state after it go to `../runs/build-<user>/`, in `build.json`, with the tokens summed over every session and model.
- A session that breaks a check stops the build until a person has read it: `build <user> --accept "<why>"` records their decision and carries on. A usage limit stops it too, and the same command carries on after the reset. exposurie moves its cutoff only once a batch's pages exist, so nothing is lost. A build also stops after six sessions, or when a session never runs `exposurie sync` or files nothing.
- `keep-brain` refuses a build that has not finished or stopped on a problem. It also moves the staged batches out of the brain, with the raw history.

`node runner/run.mjs probe` is one small run, set up as condition A, asked to read a file one folder up and to run `ls` and `git status`. It shows what Claude Code itself allows a headless run, which the fake can't.

`check/build.mjs` runs all of it against the fake `claude`, whose build agent drives exposurie 1.2.0's real sync through Git Bash:

- the developer, through a usage limit before the first batch is filed and a second build that finishes; then `keep-brain`, and a C run on the brain
- the delegator, through a session that stops after one batch, so the build starts another
- a session that reads the answer key (stopped, then accepted by hand), one that writes a transcript, one that never syncs, a home with no retention set, and a history folder already holding a session

What part 6 did live, in order: `probe`, `build developer`, `keep-brain developer`, then the pilot, `plan pilot --tasks recall-1` and `go pilot`. Costs are Claude Code's own estimates at list prices.

- **The probe** (twice, about $0.04 in all): a headless run is denied every read outside its folder, with the Read tool and with the shell, and Claude Code lets `ls` and `git status` run inside it without asking. So the audit notes such commands rather than throwing the run out (see [decisions.md](decisions.md)).
- **The developer's brain:** one session of 9 minutes and 113 turns filed all 28 sessions in three batches (13, 9 and 6) into 39 pages: 12 entities, 27 concepts, and 19 working rules in `how-they-work.md`. It took 4,008,581 input tokens (3,781,295 of them cache reads) and 64,842 output tokens, about $1.94. Its start-up line listed exposurie's skill and `/exposurie-sync`.
  - The audit stopped it on a false flag: a here-document's text read as commands. Fixed, re-audited clean (all 101 file tool calls in the brain), and accepted. No page holds the sandbox login's address or names.
- **The pilot, recall-1:** A wrong, and B, C and D right, all scored by the checks.

  | | input tokens, all | output | turns | about |
  |---|---|---|---|---|
  | A | 13,050 | 350 | 3 | $0.009 |
  | B | 125,498 | 354 | 1 | $0.484 |
  | C | 73,998 | 1,200 | 7 | $0.056 |
  | D | 6,594 | 67 | 1 | $0.005 |

- **B's history arrived whole.** B's input less D's is about 119K tokens for a 338,692-character file. Sonnet 5.5's window in Claude Code 2.1.302 is 1,000,000 tokens, so B has room even on long work tasks.
- **C saw the pointer.** Its first command was `exposurie read --search "Satchel database"`, and it read four pages after two searches. Its start-up line listed the `exposurie` skill and `/exposurie-sync`.
- **The estimate for part 7.** B dominates: each B run puts about 120K tokens of history in the cache, about $0.48 when the cache is cold, and a turn on a warm cache costs about $0.04. Work tasks take many turns, so B's six work tasks cost the most. The remaining 89 runs of areas 1–8, the second brain, the stability check and the judge come to roughly $20–25 at list prices. The build and the pilot (about $2.50) moved the plan's five-hour meter from 19% to 43%, and that meter also counts the session that ran them. So part 7 needs roughly one and a half to two five-hour windows.

### 7. Full run

**Plan usage:** yes. **Run 2026-10-21,** with the owner's go, and checked by hand the same day by a session that had not seen which run had which condition.

- Build the second user's brain.
- Run every cell, with conditions mixed together. Resume after usage-limit stops.
- Each user's C runs finish within 7 days of that user's brain build.

What part 7 did, in order: `build delegator`, `keep-brain delegator`, `plan full` and `go full`, then the stability check, then `score/score.mjs` on all three batches. Costs are Claude Code's own estimates at list prices.

- **The delegator's brain:** one session of 7 minutes and 70 turns filed all 25 conversations, 15 Claude Code sessions and 10 claude.ai chats, into 20 pages. It took 2,996,876 input tokens and 53,890 output tokens, about $1.58. No page holds the sandbox login's address or names.
- **The full run, `full`:** all 24 tasks of areas 1–8, the pilot's included, under every condition. That is 93 runs in one mixed order, and all are done. The plan's five-hour limit stopped it once, after 30 runs, and `go` carried on after the reset.
- **The audit's second false flag.** One run ran `cat README.md 2>/dev/null` inside its folder, and the audit read the null device as a place outside it. The audit was fixed and tested, the runs before it re-audited unchanged, and that run ran again by name (see [decisions.md](decisions.md)).
- **The stability check, `stability-1` and `stability-2`:** area 3's three tasks, twice more under C, all done.
- **Scored:** in `full`, 56 answers were settled by their checks and 37 by the judge: the 24 of areas 4 and 5, and 13 that named both an old and a new choice. All 6 stability answers named both, so the judge decided them. With two earlier attempts, the runs cost about $14.22, and part 7 about $16 in all.
- **Checked by hand:** all 43 judged answers, read against their rubrics before anything naming a condition was opened. The hand check agreed with the judge on 41 and overturned 2, both to right. Two refusals the checks had scored right, because each listed the right name among those it searched for, were corrected by hand to wrong (see [decisions.md](decisions.md)). Every hand verdict is final, and the scores are in [results/full/](../results/full/), [results/stability-1/](../results/stability-1/) and [results/stability-2/](../results/stability-2/).
- **The work tasks can't run their tests, in any condition.** The shell may run only `exposurie`, so `npx jest` is denied, and an agent writes its test without running it.

### 8. Area 9

**Plan usage:** yes. Built last, and only as far as the estimated usage allows.

This area needs sessions to be saved, so they can be resumed and synced. Every other area turns saving off, so the exception gets its own entry in [decisions.md](decisions.md) when this part is built. It also needs a check that `/compact` works in a headless run.

Sonnet 5.5's window in Claude Code 2.1.302 is 1,000,000 tokens (seen in the pilot), so "half the context window" is 500K tokens a session, and every turn past that point re-reads it. **Decided 2026-10-21, with the owner, before anything was built:** each long session is interrupted at 500K. Each task's session is filled once and forked three ways with `--resume <id> --fork-session`. One task runs first, and its measured cost decides whether the second runs (see [decisions.md](decisions.md)).

What Claude Code 2.1.302's binary says about the window:

- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` sets where auto-compact fires, from 100K to 1M, and it takes precedence over every other source. `DISABLE_AUTO_COMPACT` turns auto-compact off, and `DISABLE_COMPACT` turns off `/compact` too. So the fill and the keep-going strategy can be kept from compacting on their own.
- `CLAUDE_CODE_DISABLE_1M_CONTEXT` does not shrink a window that is natively 1M. Claude Code's own warning says the 200K limit is then not enforced.
- `/compact` runs headless (`supportsNonInteractive`). `--session-id` may name the new session beside `--resume` only with `--fork-session`. Clearing old tool results after an idle hour, and compacting while idle, are switched by remote flags that are off by default, and the sandbox never loads remote flags.

**The runner is built and tested against the fake (2026-10-21).** The method is in [design.md](design.md#area-9-long-sessions), and the decisions behind it in [decisions.md](decisions.md).

```
node runner/long.mjs <task> [--accept "<why>"]   fill, fork, then each strategy: spends plan usage
node runner/long.mjs status <task>
node runner/long.mjs probe                       the same on a tiny task: spends a little, waits five minutes for the sync
node score/long.mjs <task>                       each strategy's checks, into scores.json beside long.json
node tasks/long/long-1.mjs                       writes long-1's steps file and its material
node tasks/long/long-2.mjs                       writes long-2's steps file and its material
node check/long.mjs
```

- **A long task** is an entry of area 9 in `tasks/index.json`, with its folder, its starter, and `steps`, the path of its steps file in `tasks/long/`. The steps file holds `fork_at` (500000), `resume_note`, the `core`, `more` and `after` steps, the checks, and examples for the fake. A step is its text, or `{ "say", "files" }`, where `files` copies material from `tasks/long/<task>/` into the repository before the step, as what the developer saved for the agent to read.
- **What a run leaves**, in `../runs/area-9/r001/` for the first task and `r002/` for the second:
  - `long.json`: every step's record, the fork, each strategy's tokens. A step's `tokens` are its own: Claude Code's result for a resumed or forked session counts the whole session from its start, so the runner takes away what the session carried in, and keeps the result's own count as `session_tokens` (2026-10-22, see [decisions.md](decisions.md))
  - the repository folder, where every step runs
  - `fill/`, `keep/`, `compact/`, `sync/`, each with one folder per step (`stream.jsonl`), `work/` (the repository after the last finished step) and `session/` (the saved session)
  - `fork/`: the repository and the session at the fork, never changed
  - `sync/sync/`, `sync/kit/` and `sync/staged/`: the sync session, the brain it left, and its staged batch
  - for each strategy, what the scorer reads: `files/` and `files.json` (changed since the fork), `answer.md` (the last reply) and `writes.json` (every Write and Edit after the fork)
- **A step that ends without a result** puts the repository and the session back as they were, and runs again next time. After three such ends, it waits for a person. A step that breaks a check stops the run until `--accept "<why>"`.
- **`check/long.mjs` passes:** a made-up task through the fill, the fork and all three strategies, with exposurie's real sync, a usage limit, a read outside the folder accepted by hand, a compaction nobody asked for, an unsaved session, a session that runs out of steps, and one a stopped runner left in the home. Every step's tokens come out as its own. Then each long task with a steps file runs through the fill and all three strategies: its starter and the files its steps hand over reach the fork, and `score/long.mjs` scores each strategy's examples the way they were written. `check/runner.mjs` and `check/build.mjs` still pass.

**The probe ran on 2026-10-21, with the owner's go,** for about $0.17 (`../runs/probe-long-*`), counted as each step's own cost. The $0.32 first written for it counted each resumed step's carried totals again. Every phase ran, and the file came out as asked under all three strategies.
- A saved session resumes, and a fork stands on its own.
- `/compact` leaves one boundary, with the tokens before and after.
- The sync filed the session.
- Where it differed from the fake, the fake now matches: what `/compact` prints. It also turned up two things the runner needed:
  - A shell command that writes inside the folder goes through by itself, so it now counts as a write.
  - The audit read quoted text as a place, which it no longer does.

  See [decisions.md](decisions.md).

**long-1's content is written (2026-10-22).** `check/tasks.mjs` holds it to the method, and `check/long.mjs` runs it through the fake. What it is, beside the blueprint below:

- **The starter** (`tasks/starters/long-1/`, 124 text files, about 94K characters) is Satchel in JavaScript, the shape of its latest sessions in the history. It already has the link-list import from the 2026-07-22 session: it runs inside the request, fetches titles first and writes in chunks of 50. That is why the developer's first cut goes "inside the upload request, the same way". Its 36 tests pass and Biome is clean, with the developer's own library, pagesift, stubbed. It holds no failed approach a strategy could copy, and passes none of the checks on its own.
- **The steps** come from `tasks/long/long-1.mjs`, which writes `long-1.json` and the material in `tasks/long/long-1/`. Both are seeded, so the script always writes the same bytes, and `check/tasks.mjs` holds them to that.
  - 9 core steps follow the blueprint, word for word in the developer's voice.
  - 23 more steps are production questions about the same app, each answered from what the developer saved into `tmp/`: 57 files, about 1.31 million characters, each about 46K characters at most, so it is one Read. There are more steps than the fill needs, since it stops at the first step boundary past 500,000 tokens.
  - 3 after steps finish the feature.
- **No step assumes what the agent wrote.** A failure is told as what the developer saw. Where a step states a fact about its material, such as when the digest went out, the fact is read off the material, and every file agrees with the others.
- **The checks** are scripts where a script can tell, and the rest are marked to be read by hand:
  - *finished:* Instapaper, Omnivore, the page offering all three, the README, and no Conventional Commits prefix; by hand, both importers run as jobs, and the commit message is in the developer's style
  - *kept:* `imported:<service>`, `folder:<name>`, archived in as read, and highlights with source `import`; by hand, Unread and Archive kept out of the folder tags
  - *retried:* `INSERT OR REPLACE` or `REPLACE INTO`, a line split on commas, and an importer run from a route

  Two of the four decisions also apply to Pocket, so the agent will likely have written them into the code by the fork. The other two, the folder tags and the highlights' source, exist only in the conversation. The hand read records which were in the fork's code.

**long-1 runs live from 2026-10-23,** on the owner's go, a day before the seven-day reset. Its fill stopped twice on false flags of the audit, each fixed, tested and re-audited, and each step kept with `--accept` (see [decisions.md](decisions.md)).

**long-2's content is written (2026-10-23).** `check/tasks.mjs` holds it to the method, and `check/long.mjs` runs it through the fake. What it is, beside the blueprint below:

- **The starter** (`tasks/starters/long-2/`, 53 files, about 56K characters) is tidewell-api as the history leaves it, grown from area 6's copy: Express 5 and TypeScript, Prisma for every query with SQL migrations, Jest with Prisma mocked, the rate limiter of TW-1182, the bulk invites of ENG-402 behind their Unleash flag, and a worker that polls a jobs table, claiming a row with a conditional update and counting a claim older than a minute as abandoned. Its admin routes, for Tidewell's staff only, sit behind `requireAdmin`. Its 22 tests pass and the type check is clean, with its public dependencies installed and Prisma's client generated (`../runs/starter-check-long-2-*`); the team's own ESLint and Prettier configs are private, so lint is not run. That run found two type errors in the code area 6's copy had carried all along, fixed the way the starter's other routes read the organisation. It holds no webhook code, no failed approach, and nothing any check finds.
- **The steps** come from `tasks/long/long-2.mjs`, which writes `long-2.json` and the material in `tasks/long/long-2/`, seeded.
  - 8 core steps follow the blueprint in the developer's voice: ticket ENG-447, the decisions, a first cut with the three approaches that then fail on staging (a retry in a `setTimeout` lost to a deploy, a `createHash` signature the partner cannot verify, a send inside an interactive transaction that expired), the schedule, the tests and the migration.
  - 25 more steps are the developer's on-call week, each answered from what they saved into `tmp/`, with six fixes among them: last night's database failover, the partner's report of stale signatures, a slow projects list, the flag on staging, a Terraform plan, a client's polling storm, the support inbox, npm, the backlog, a teammate's pull request, Tuesday's duplicate invites, the week's metrics, the bill, a security scan, usage, Tuesday's migration locks, the error tracker and the load balancer's 5xx. 64 files, about 1.30 million characters, each at most about 46,000.
  - 3 after steps finish the ticket: an event when a project's name changes, replaying a dead letter with the cleanup of old deliveries, and `PR.md`.
- **No step assumes what the agent wrote.** What the material shows of the new code (the signature header, an event's body, the retry schedule) is what the developer specified in a core step, and every other file is about code the starter already has.
- **The team's conventions are never said in the session.** Branch, title, sections, who reviews migrations and where deploy notes go are known only from the history and the brain, so a strategy keeps them only by looking them up.
- **The checks:**
  - *finished:* the rename's event, a replay, the cleanup, `PR.md`, and the team's branch, title, sections and the note for Ana; by hand, the tests and the deploy note
  - *kept:* `project.renamed`, replaying under the admin routes, and 45 days; by hand, the envelope
  - *retried:* a retry scheduled with `setTimeout`, a signature made with `createHash`, and a network call inside an interactive Prisma transaction, found at any depth of its callback and never past it

  The event's name and the envelope apply from the first cut, so they will be in the fork's code; the admin routes and the 45 days exist only in the conversation.

**Both long tasks ran, and every strategy is scored and read by hand (2026-10-24).** The results are in the README and `results/area-9/`, and what each run showed is in [decisions.md](decisions.md).

1. **long-1** forked after step 19, at 509,677 tokens, with 9 core and 10 more steps. All three strategies finished, through a five-hour and a weekly usage limit. It came to about $17.34 at list prices, $7.04 of it the fill.
2. **long-1 was scored** with `score/long.mjs`, and every strategy read by hand. The hand read overturned two kinds of script result.
3. **long-2 ran on the owner's go**, once long-1's cost was known. It forked after step 24, at 500,236 tokens, with 8 core and 16 more steps, through one five-hour limit in the fill. It came to about $13.33, $9.29 of it the fill. It was scored and read the same way, and every scripted result stands.

**long-1, Satchel (personal): import from other read-later services.**

- **Starter:** Satchel before the session. Hono and htmx, better-sqlite3 in WAL mode with every query in a `.sql` file, a jobs table polled by a worker, Postmark, magic links, FTS5, `node:test` and Biome. It has no CSV reader yet. Fixtures: made-up exports from Pocket (CSV), Instapaper (CSV) and Omnivore (JSON).
- **Core steps:**
  1. Read the code, and say where an import fits.
  2. The decisions, then the Pocket import as a first cut. The developer asks for it inside the upload request, splitting each line on commas, with `INSERT OR REPLACE` for links already saved.
  3. It fails: the proxy cuts the request at 60 seconds. So it moves to a job, with the upload saved to `/data/imports/` and deleted after.
  4. It fails: titles with commas shift the columns. So comes a small CSV reader in `src/lib/csv.js`, with no new dependency.
  5. It fails: re-importing deleted highlights, through `ON DELETE CASCADE`. So comes `ON CONFLICT DO NOTHING`, with duplicates counted.
  6. Batches of 500.
  7. The summary email.
  8. Tests.
  9. The import page.
- **Decisions said only in conversation, for later steps:**
  - Instapaper's folders become `folder:<name>` tags, except Unread and Archive.
  - Anything archived comes in as read.
  - Highlights, Instapaper's Selection and Omnivore's highlights, come in as highlights with source `import`.
  - Every imported link gets `imported:<service>`.
- **More steps:** production questions, answered from what the developer saved into `tmp/`:
  - the worker log of a digest that went out late
  - saved pages that read empty
  - Fly and Litestream logs
  - Paddle webhooks
  - Postmark bounces
  - a slow search's query plan
  - an access log
- **After steps:**
  1. Instapaper.
  2. Omnivore.
  3. The import page's list, the README, and the commit message.
- **Checks:**
  - *Finished:* both importers run as jobs, the page lists them, the README says so, and the reply gives a commit message in the developer's style.
  - *Kept:* the `folder:` tags; Unread and Archive kept out of them; archived links in as read; highlights with source `import`; `imported:<service>` on every link.
  - *Retried:* `INSERT OR REPLACE` or `REPLACE INTO`; a line split on commas; an importer called from a route instead of a job.

**long-2, tidewell-api (work): webhooks for project events, under one Linear ticket.**

- **Starter:** the cut-down tidewell-api of area 6, grown. Express 5, Prisma with raw SQL only in migrations, Jest, and a worker process that polls. The team's conventions are known only from the history and the brain.
- **Core steps:**
  1. Read the code.
  2. The decisions, then a first cut. Retries are scheduled with `setTimeout`, the signature is a SHA-256 of the secret and the body through `createHash`, and claiming and sending happen in one interactive Prisma transaction.
  3. It fails: a deploy replaced the task, and the pending retries vanished. So comes `next_attempt_at`, and polling.
  4. It fails: the partner cannot verify the signature. So comes HMAC-SHA256 over the timestamp and the body, with `createHmac`.
  5. It fails: the transaction timed out while a partner's endpoint hung. So rows are claimed in a short transaction, and sent outside it.
  6. The backoff schedule, and dead-lettering after eight attempts.
  7. Tests.
  8. The migration.
- **Decisions said only in conversation:**
  - Event names are `project.<verb in the past tense>`.
  - The envelope is `{ id, type, created_at, data }`.
  - The dead-letter endpoints are admin-only.
  - The nightly cleanup deletes deliveries older than 30 days.
- **More steps:** staging logs, a partner's bug report with their verification code, a slow query, the feature flag's configuration, and a Terraform plan for the worker.
- **After steps:**
  1. `project.renamed`.
  2. Replaying a dead-lettered delivery, through an admin endpoint under `/v2`.
  3. `PR.md` with the branch, the title and the sections, the note for the migration's reviewer, and the deploy note.
- **Checks:**
  - *Finished, kept and retried,* as for long-1. *Retried:* `setTimeout` for a retry, `createHash` for the signature, and an HTTP call inside a Prisma transaction.
  - *The team's conventions,* as in area 6.

**Done when** both tasks ran under all three strategies, or the first one's cost stopped the second, and every run is scored and read by hand. **Done 2026-10-24.**

### 9. Results

**Plan usage:** none. **Done: areas 1–8 on 2026-10-22, area 9 on 2026-10-24.**

- Score the runs, check them by hand, and compute the numbers in [design.md](design.md#numbers).
- Make the charts and the README's results section, in exposurie's look (see [CLAUDE.md](../CLAUDE.md#look)).

What part 9 did for areas 1–8, whose runs were already scored and checked by hand in part 7:

- **`score/results.mjs --save`** first publishes what the numbers need from `../runs`: each batch's conditions, as `results/<batch>/conditions.json`, and each brain build's tokens, as `results/builds.json`. Then it computes every number of design.md from `results/` alone into `results/numbers.json`, and draws three charts into `results/charts/`: right answers by area, tokens, and break-even, which was dropped on 2026-10-28. Without `--save` it prints the numbers. How each number is computed is in [decisions.md](decisions.md).
- **`check/results.mjs` passes:**
  - each batch holds each of its planned cells exactly once, and every run has its condition and a final verdict
  - `results/` holds exactly what the script writes, and nothing else in `results/charts/`
  - the charts use only the colours and fonts in CLAUDE.md's look, read from CLAUDE.md itself, and every line of their text fits inside the chart at Arial's widths
  - nothing in `results/` holds the sandbox login's address or names, or a machine path

  A fault test broke a copy of the repository twelve ways, one at a time, and every break was caught (`../runs/part9-fault-test`).
- **The README's results section** answers its four questions, gives every number with the charts, C's three wrong answers, how the results compare with what design.md expected before any result, and what they do not show.

What part 9 did for area 9, whose runs were scored with `score/long.mjs` and read by hand in part 8:

- **`score/results.mjs --save`** also publishes area 9 from `../runs/area-9`, into `results/area-9/`:
  - `scores.json`: each long task's scores, as `score/long.mjs` saved them
  - `hand.json`: the hand read, which overrides them, with a reason for each verdict
  - `steps.json`: every attempt at every step, with its own tokens, turns, reads and context, and whether it counts. It leaves out each attempt's notes and reason, which name the run's machine paths, and its session and the plan's meters.

  It then computes area 9's numbers into `results/numbers.json` under `area_9`, from `results/` alone, and draws a fourth chart, `results/charts/long-sessions.svg`.
- **`check/results.mjs` also holds area 9:**
  - each long task is in all three files exactly once, with the same run, and every strategy finished
  - every check is scored; one read only by hand has a verdict and a reason; and a hand verdict over a script names the result it overrides, so a hand read older than the scores is caught
  - the hand read's own tally equals the verdicts
  - each strategy's tokens are those of its counted attempts, with the sync session for sync, and the fill's are the fork's
  - the fork is at the first step boundary past the mark, after the core steps
  - the versions are the pinned ones

  Its check for a machine path now also catches one written with forward slashes, as a run's notes write them, and so does the repository save. The fault test now breaks a copy twenty-six ways, fourteen of them in area 9, and every break is caught.
- **The README's area 9 section** gives, for each task and strategy, what was finished, kept and retried, and the tokens after the fork, with the chart. It also explains why sync + fresh lost in long-2, compares the results with what design.md expected, and says what they do not show.

```
node score/results.mjs [--save]
node check/results.mjs
```

### 10. The rebuilt read

**Plan usage:** yes: 30 C runs and two fresh sessions of area 9. **Done 2026-10-25.** It was built and checked against the fake, then run live the same day on the owner's go. All 30 C runs, both fresh sessions and their scoring took 18 minutes, with no usage-limit stop, for about $2.66 at list prices. Then it was read by hand and published beside 1.2.0's. The results are in the README, under *C again, with exposurie's rebuilt read*.

exposurie's `read` was rebuilt after the results (commit `b6855ee`), because its search had matched a whole phrase as one substring. This part runs C again with it, on the same brains, and sets the results beside 1.2.0's. Why each choice was made is in [decisions.md](decisions.md).

- **The sandbox:** `sandbox.mjs setup-rebuilt` installs the rebuilt exposurie from GitHub's archive of the commit, pinned by its hash, into `sandbox/npm-rebuilt/`, beside 1.2.0.
- **The runs:**
  - `run.mjs plan full-2 --conditions C --exposurie rebuilt`, then `go full-2`: the 24 C runs of areas 1–8.
  - `plan stability-3` and `plan stability-4`, each with `--tasks changed-1,changed-2,changed-3 --conditions C --exposurie rebuilt`: area 3 under C twice more.
  - `long.mjs rebuilt long-1` and `long.mjs rebuilt long-2`: sync + fresh's fresh session again, into `../runs/area-9-2/`, from the same fork and the brain its sync wrote. The sync session's record is carried over.
- **Scoring:** `score/score.mjs` on each batch, with the judge and a hand read of every judged answer; `score/long.mjs <task> --rebuilt`, then a hand read of every check, into `hand.json` beside the scores.
- **Done when:**
  - `check/runner.mjs`, `check/long.mjs` and `check/build.mjs` hold, with the rebuilt batch and the fresh session again run through the fake. A fault test breaks the runner's part 10 code, and every break is caught.
  - every run of the three batches and both fresh sessions is done, scored, and read by hand
  - `score/results.mjs --save` publishes them beside 1.2.0's, `check/results.mjs` holds them, and the README and charts show both. A fault test breaks what part 10 publishes, and every break is caught.

```
node runner/sandbox.mjs setup-rebuilt
node runner/run.mjs plan full-2 --conditions C --exposurie rebuilt
node runner/run.mjs go full-2
node runner/long.mjs rebuilt <task>
node score/long.mjs <task> --rebuilt
```

### 11–13. Beyond retrieval (decided 2026-11-05: 13 and 12)

On 2026-10-28 the owner found that the benchmark mostly tests `read`: retrieval and its input tokens. These three parts test what exposurie does beyond it. They stay within the owner's two bounds: no other paid agent, and exposurie the only thing under test. Each reports counts or pass and fail, and how far the plan meter moved, with tokens in a side column and no ratios.

**Decided 2026-11-05, by the owner:** 13, with three agents rather than five, and 12. 11 is not built. The order:
1. exposurie's pointer gains a condition for work, released as exposurie 1.3.1 (see 13, *What it depends on*), and measured first on areas 1–8 (see *1.3.1, measured*)
2. 13, run on 1.3.1
3. 12
4. the README rewritten as one finished account of the benchmark

Why is in [decisions.md](decisions.md).

#### 1.3.1, measured

**Plan usage:** yes: the 24 C runs of areas 1–8. **Done 2026-11-05.** It was built and checked against the fake, then run live the same day on the owner's go. All 24 runs ran in one go, with no usage-limit stop, for $1.00 at list prices with the judge. Then they were read by hand and published beside 1.2.0's and the rebuilt read's, and a fault test broke what they publish and saw every break caught. The results are in the README, under *C again, with exposurie 1.3.1's pointer*: 21 of 21 in areas 1–7.

exposurie 1.3.1's pointer also fires before work in the user's projects, because real-work-2 never opened the brain. Every C run carries the pointer, so C runs again on all of areas 1–8, on the same kept brains, and the results are set beside 1.2.0's and the rebuilt read's. Why each choice was made is in [decisions.md](decisions.md).

- **The sandbox:** `sandbox.mjs setup-131` installs npm's tarball, pinned by the registry's sha512, into `sandbox/npm-131/`.
- **Before each run:** 1.3.1's own update step brings the pointer, skill and command in the run's home up to 1.3.1. The run's copy of the brain is made 3 days old, so exposurie's state line reads as part 10's runs saw it. The kept brains are never touched.
- **The runs:** `run.mjs plan full-3 --conditions C --exposurie 1.3.1`, then `go full-3`.
- **Scoring:** `score/score.mjs` on the batch, with the judge and a hand read of every judged answer.
- **Done when:**
  - `check/runner.mjs` holds with a 1.3.1 batch run through the fake on brains a fortnight old, and a fault test breaks the runner's 1.3.1 code and sees every break caught
  - all 24 runs are done, scored and read by hand
  - `score/results.mjs --save` publishes them beside 1.2.0's and the rebuilt read's, and `check/results.mjs` holds them

```
node runner/sandbox.mjs setup-131
node runner/run.mjs plan full-3 --conditions C --exposurie 1.3.1
node runner/run.mjs go full-3
```

#### 11. What the sync wrote (not built)

**Not built,** the owner's call of 2026-11-05, to fit the time left. The design stays here for the record.

**Plan usage:** the judge's calls only. No agent session runs.

Areas 1–9 test whether an agent finds a fact. This part tests whether the sync wrote it down right. Each kept brain is read against its user's fact sheet.

- **Per planted fact:** captured, captured wrong, an old decision still shown as current, or missing. A fact's checks settle what they can, with the whole-word rule of `check/text.mjs`, and the judge reads the rest against a rubric. A hand read overrides both.
- **Per brain:** anything it states that the history never said. Also the never-discussed items, which must stay out.
- **Inputs, all kept:**
  - the brain each build wrote on 2026-10-21, in `../sandbox/brains/<user>/`
  - `users/<user>/facts.json`: 90 and 66 facts, each with the session it is first said in, decisions that were later replaced among them
  - the sessions
- **To settle with the owner:** whether "never said" is read page by page by the judge, or sampled.
- **Done when:** both brains are scored and read by hand. `results/brains/` holds the scores, the README gives a line for each brain, `check/results.mjs` holds them, and a fault test catches every break.

#### 12. It's yours

**Plan usage:** none. No model is called. **Decided 2026-11-05.** Whether it runs against 1.3.0 or the 1.3.1 that part 13 needs is settled when it is built.

The owner's point: a brain belongs to the person, and stays with them when they change agent or lab. Each line of this checklist is a script, run against exposurie 1.3.0 from npm in the sandbox:

1. **The brain is plain Markdown.** Every page opens as UTF-8 text, and its links are wikilinks to pages in the same folder.
2. **It outlives the tool.** After `exposurie uninstall`, every page's bytes are unchanged and `~/.exposurie/config.json` is gone. 1.2.0 runs this line too, since it leaves that file behind, so the check is seen to fail once.
3. **No network.** exposurie's commands work with networking blocked, and its code loads no network module. How to block it is settled when the part is built.
4. **No account.** Nothing in setup, sync, read or uninstall asks for a login, a key or a sign-up.
5. **A pointer for every agent it supports.** In a sandbox home that holds Claude Code's, Codex's, Cursor's and OpenCode's folders, setup writes the pointer into each one's instructions file.
6. **History from every lab.** Made-up sessions in Codex's, Cursor's, claude.ai's and ChatGPT's formats are all read into one sync's batch, with their formats taken from exposurie's own readers. Only the staging step runs, so no model is called.

- **The sandbox:** exposurie 1.3.0 installs from npm's tarball, pinned in `runner/pins.json` by the registry's sha512, beside 1.2.0 and the rebuilt read.
- **Done when:** every line passes or fails with its evidence in `results/its-yours/`. The README lists them, and a fault test breaks each line's check and sees it caught.

#### 13. Many agents, one job

**Plan usage:** yes, the most of the parts left: 9 steps in round 1, one sync and 9 runs in round 2, estimated at $3–7 at list prices. **Decided 2026-11-05, with three agents, and designed by Claude the same day, on the owner's word. Built and checked against the fake on 2026-11-06. Run live on 2026-11-07, on his go, then scored and read by hand (see decisions.md). Publishing is next.** Why each choice was made is in [decisions.md](decisions.md).

The owner's point: someone running several agents in parallel on one job, with the brain as their shared memory. While agents work side by side, none hears what the others are told. What one of them heard reaches the next round only through whatever carries it: the code alone, exposurie, or a file a person keeps by hand.

**The job: Satchel's imports from Pocket, Instapaper and Omnivore,** on long-1's starter, the developer's own project. Round 1 builds the import's groundwork and Pocket. Round 2 adds Instapaper, Omnivore and imported highlights.

**How it runs:**

1. **Round 1: three agents, once.** Each works in its own copy of the starter, one after another, since none sees another anyway. They run in condition C on exposurie 1.3.1, as the user would work. Before every step the developer's kept brain is brought up to 1.3.1 and made 3 days old, as in `full-3`. Each session is saved, and gets three steps in the developer's voice:
   - agent 1, **the job:** the upload saved to disk and imported by an `import_file` job, in batches of 500, with duplicates counted
   - agent 2, **Pocket:** a CSV reader with no new dependency, and Pocket's reader
   - agent 3, **the page and the email:** the import page, which lists the readers it finds, and the summary email

   Every first step gives all three the same plan and the same contract: the item a reader returns, the job's payload, and the email's function. It tells them to stay in their own files and to leave no notes in the code about round 2's work. The second step corrects a detail of their own part, then tells them **decisions for round 2's work**, which they are told not to build. The third asks for tests and a commit message.
2. **Merged and tested.** The three copies are merged onto the starter with the sandbox's Git, in the order 1, 2, 3. A conflict is resolved by keeping both sides (Git's union merge), mechanically, and recorded. Then the repository's own tests run, and a hidden test imports a Pocket export through the merged job. If the merged code fails either, the run stops for a person. They either repair it by hand, with the smallest change and no round 2 decision written into it, recorded in decisions.md, or run round 1 again.
3. **Synced.** Once the newest of round 1's transcripts has been still for five minutes, a session of its own types `/exposurie-sync` in the brain's folder, as area 9's sync did. It gets the developer's kept brain, brought up to 1.3.1, with round 1's three transcripts as the only history. The brain it leaves is round 2's, in condition C.
4. **Round 2: three agents in each of three conditions.** Each agent gets a copy of round 1's merged code, the developer's own two exports in `tmp/`, and one short ask, the way a ticket reads when the details are kept elsewhere. No ask restates a decision of round 1:
   - agent 1: Instapaper, from `tmp/instapaper-export.csv`
   - agent 2: Omnivore, from `tmp/omnivore-export.json`
   - agent 3: imported highlights, "the highlights side", while the other two write the readers

   Each ask says the other two are at work at the same time in their own copies, and ends with tests and a commit message. The 9 runs are blind (`r001`…), in a seeded mixed order, with session persistence off, like areas 1–8.
5. **Merged and tested again,** per condition: the three copies onto round 1's merged code, the same way.

**The conditions of round 2.** Round 1 is the same for all three, so they differ only in what carries round 1's conversations into round 2.

| | Condition | What carries round 1's conversations |
|---|---|---|
| A | no memory | nothing: the merged code is all there is |
| C | exposurie | the brain the sync left, with 1.3.1's pointer, skill and command |
| D | a perfect notes file | round 1's decisions that round 2 needs, and the developer's commit style, one line each in the sandbox's `~/.claude/CLAUDE.md`, where D's file goes: what a perfect, hand-kept `AGENTS.md` would hold |

**Round 1's decisions for round 2,** in `tasks/team/team-1.json`. Each round 2 agent needs decisions told to two different round 1 agents, and one decision is needed by all three:

| | Told to | Decision | Needed by |
|---|---|---|---|
| K1 | agent 1 | a reader puts highlights on its items as `highlights: [{ text, note, createdAt }]` | agents 1, 2, 3 |
| K2 | agent 1 | the job saves them with `source` set to `import` | agent 3 |
| K3 | agent 1 | an import adds a highlight once: the same link and text are the same highlight, and new ones on links already saved are added | agent 3 |
| K4 | agent 2 | Instapaper's folders become `folder:<name>` tags, except Unread and Archive, which are states; Archive means archived and read | agent 1 |
| K5 | agent 2 | an Omnivore item read 90% or more counts as read, archived or not | agent 2 |
| K6 | agent 3 | the summary email says how many highlights came in | agent 3 |

- **Every value is a choice a fresh agent can't guess, and the exports show each one.** Instapaper's has Unread, Archive and Starred beside folders of the developer's own. Omnivore's has items read 95%, 91% and 89% that are not archived.
- **A decision counts as said only in conversation when round 1's merged code lacks it,** as area 9 defined it. Round 1's merged code is searched for each. One found there is reported, and scored apart.

**Scored on, per condition:**
- **The merged work passing its tests:** the conflicts, the repository's own tests, and hidden tests that import both exports through the merged job (`score/team/`).
- **The three agreeing:** whether Instapaper's and Omnivore's highlights reach the database through the third agent's code. That needs all three to have K1 the same way.
- **The decisions kept:** K1–K6, from the hidden tests on the merged work, and from each agent's own files by script. A hand read settles both.
- **The user's way:** each commit message in the developer's style, a fact from the history: no Conventional Commits prefix, an imperative subject under 60 characters, and a body that says why. Also no new dependency, and SQL kept in `.sql` files.
- **What it cost:** every input token, cached or not, per condition, and for round 1 and the sync apart. How far the plan meter moved, from the runs' own rate-limit events. Tokens go in a side column, with no ratios.
- **Looked:** whether C's agents ran `exposurie read`, and what they searched for.
- **Filed:** which of K1–K6 the sync wrote into the brain, read off its pages. A decision the brain lacks is one C cannot keep.

**What it does not show:**
- One job, one user and one run per cell.
- The agents can't run the tests, as in every area: they keep the standing tools, which run no code. The tests run after each merge.
- One sync, so exposurie's missing lock, where two syncs at once take the same batch, never comes up.
- The decisions were written for this test. Round 1 is told not to write them into code, as a person who keeps an `AGENTS.md` would. That person is condition D.

**The runner and the scorer:**
```
node runner/team.mjs plan team-1
node runner/team.mjs go team-1 [--accept "<why>"]   round 1, its merge, the sync, round 2 and its merges: spends plan usage
node runner/team.mjs status team-1
node score/team.mjs team-1                          the tests, the checks and the numbers, into scores.json
node check/team.mjs                                 all of it through the fake, with exposurie 1.3.1's real sync
```

- **Built 2026-11-06.** `tasks/team/team-1-examples/` holds a reference implementation, which the fake replays: what a good agent writes at each step of round 1, and a right and a wrong version of each round 2 agent. No agent ever sees it. Merged as the runner merges and tested as the scorer tests:
  - round 1's three copies merge with no conflict, and pass Satchel's 50 tests and the gate
  - round 2's right versions pass all 13 hidden tests
  - the wrong versions pass their own 55 tests and fail all nine decision tests, which is the gap the scorer must tell apart
- **`check/team.mjs` holds**, in about 80 seconds:
  - the task: `team-1.mjs` writes the same bytes again, the exports hold what the hidden tests expect, and each decision is said in its own agent's second step and nowhere else in round 1, is in D's notes, and is in no ask of round 2
  - the union merge on a made-up repository
  - the whole task through the fake, with exposurie 1.3.1's real sync: a usage limit in round 1, a read outside the folder in round 1 and in round 2 and a saved session in round 2, each accepted by hand; the runs blind; every step's tokens its own. Then the scorer: C and D keep all six decisions and agree, A keeps none and does not, nothing of round 1 leaked, and the brain holds every decision.
  - the gate: a round 1 step that breaks the contract stops the task there, and a repair by hand, recorded as a patch, lets it go on
- **A fault test** broke the runner and the scorer 15 ways, and every break was caught. Every earlier check still holds.
- **Done when:** `check/team.mjs` holds with the fake, and a fault test breaks the runner and the scorer and sees every break caught. **Done 2026-11-06.** Then, on the owner's go, every session has run, and every condition is scored and read by hand. Then the README gets the results.
- **What it depended on, done:** the agent opening the brain during work. real-work-2 never ran `exposurie read` with either read, because exposurie's pointer was worded for questions about the user, not for work in their projects. So a conditional line in the pointer came first, released as 1.3.1, and measured on all of areas 1–8 (see *1.3.1, measured*).
- It reverses the decision of 2026-10-18 to run no second agent.

**Not proposed:**
- a switch of labs, which needs another paid agent
- "the next session", which area 9 and part 13's second round already cover
