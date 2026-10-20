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
| `check/` | the fact-sheet check (part 1) and the history checker (part 3) |
| `tasks/` | the tasks, their required and forbidden facts, and the starter repositories for areas 6 and 7. `tasks/index.json` lists every task |
| `runner/` | sandbox setup and the runner |
| `score/` | the scorer and the judge rubric |
| `results/` | summaries and charts. Raw run output stays outside the repository |

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
  - Each history is about 80K tokens, and sessions come in longer or shorter than their briefs. So each new session is asked for its share of what is left: the tokens the written sessions have not used, spread over the briefs still to write, between 0.7 and 1.3 of its own brief.
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

**Done when** every session exists and passes part 3.

### 3. History checker

**Plan usage:** none. **Built 2026-10-20, with part 2,** because the generator holds every session to it before keeping it. It is `check/history.mjs`, with the matching rule in `check/text.mjs` and the rival names in `check/rivals.json`.

- Every fact appears in the session where it is planned, and in no earlier session. A turned-down option is named in its session.
- A replaced value is never stated as current after it was replaced. It may be named in the session that replaces it, and never after.
- No task question appears in the history.
- No other choice of the same kind (another database, host, library or colour) appears unless it is planned. A name from `check/rivals.json`, or a turned-down option, may appear only in a session where a fact or a turned-down option names it. A colour code may appear only once its fact has been said.
- No `never_say` word appears anywhere in that user's history. Nothing first said in the claude.ai chats that area 7 asks about appears in a Claude Code session.
- Each user's history is about 80K tokens of conversation.
- exposurie's own readers parse every file (`--readers`). This is exposurie's staging step, which uses no model.

`node check/history.mjs --briefs` holds the briefs to the same rules before anything is generated.

### 4. Tasks

**Plan usage:** none.

- 26 tasks across the nine areas, three in each and two in area 9, each tied to one user. Their list, `tasks/index.json`, starts in part 1.
- For every task, the required and forbidden facts, with the spellings that count.
- Starter repositories for areas 6 and 7, and the file checks for each.
- The condition files: B's history file for each user, and D's facts file for each task.

### 5. Runner and scorer

**Plan usage:** none.

The runner:

- makes a fresh folder for each run, writes the condition's file and sets the environment
- runs Claude Code headless and saves the output stream and the versions
- refuses a run whose start-up line shows a tool or MCP server that should not be there
- mixes conditions together in the run order, and can resume after a stop

The scorer never sees the condition. Answers that contain both a required and a forbidden fact go to the judge and the hand check.

Both are tested end to end against a fake `claude` that prints saved output, before any real run.

### 6. Brain build and pilot

**Plan usage:** yes. **Needs the owner's go.**

- Check that the sandbox's history folder holds only the generated history. Nothing else may be in it, including the owner's login session.
- Build the first user's brain: exposurie syncs and Claude Code writes the pages, until nothing is left. Record the tokens.
- Move the raw history out of the sandbox home.
- Run the pilot: one task under all four conditions.
- Check that B's input tokens show the whole history arrived, and that C saw the pointer.
- Use the pilot's numbers to estimate the plan usage of the full run.

### 7. Full run

**Plan usage:** yes.

- Build the second user's brain.
- Run every cell, with conditions mixed together. Resume after usage-limit stops.
- Each user's C runs finish within 7 days of that user's brain build.

### 8. Area 9

**Plan usage:** yes. Built last, and only as far as the estimated usage allows.

This area needs sessions to be saved, so they can be resumed and synced. Every other area turns saving off, so the exception gets its own entry in [decisions.md](decisions.md) when this part is built. It also needs a check that `/compact` works in a headless run.

### 9. Results

- Score the runs, check them by hand, and compute the numbers in [design.md](design.md#numbers).
- Make the charts and the README's results section, in exposurie's look (see [CLAUDE.md](../CLAUDE.md#look)).
