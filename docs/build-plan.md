# Build plan

How the benchmark gets built, in order. Each part is discussed with the owner first, then built and checked, and only then does the next part start. The method itself is in [design.md](design.md). This file gives the order of work and what "done" means for each part.

Claude Code builds and runs all of it.

## Layout

| Path | What it holds |
|---|---|
| `users/<user>/facts.json` | the user's planted facts |
| `users/<user>/plan.json` | the session plan: which facts come up in which session, and how |
| `users/<user>/sessions/` | each generated session as readable Markdown. This is the source of truth for that user's history |
| `gen/` | the generator, and the converter that turns sessions into Claude Code transcripts and a claude.ai export |
| `check/` | the history checker |
| `tasks/` | the tasks, their required and forbidden facts, and the starter repositories for areas 6 and 7 |
| `runner/` | sandbox setup and the runner |
| `score/` | the scorer and the judge rubric |
| `results/` | summaries and charts. Raw run output stays outside the repository |

The sandbox and the raw output (`sandbox/` and `runs/`) sit next to this repository's folder, never inside it.

## Parts

### 0. Sandbox

**Plan usage:** none, except one tiny run to confirm the login.

- Install a pinned Claude Code (the version current on setup day) and exposurie 1.2.0 inside the sandbox. Turn auto-update off (`DISABLE_AUTOUPDATER`).
- Write the sandbox's settings:
  - transcript retention long enough to keep the whole history (`cleanupPeriodDays`)
  - auto-memory off
- Write the environment script:
  - `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and `CLAUDE_CONFIG_DIR` all point into the sandbox.
  - claude.ai connectors are off (`ENABLE_CLAUDEAI_MCP_SERVERS=false`), and every run passes `--strict-mcp-config`.
- The owner logs in once, inside the sandbox.

**Done when** one run's start-up line shows the sandbox's own config, the pinned version, no MCP servers, and only the listed tools.

### 1. Fact sheets

**Plan usage:** none.

Each planted fact has:

- an ID
- its value, with the spellings that count as a match
- what a fresh agent would guess instead
- the session where it is first said
- what replaces it later, if anything
- where it comes from (Claude Code or claude.ai)
- the tasks that ask about it

There are 3–4 times more facts that no task asks about than facts that a task asks about.

**Done when** the owner approves both users.

### 2. Histories

**Plan usage:** yes. Sonnet 5.5 writes the sessions, inside the sandbox, with session persistence off.

- Write a plan for every session: its date, repository, surface, and which facts come up and how. A fact can be stated by the user, proposed by the agent and accepted, or corrected later. Some sessions are distractors with no planted facts.
- Sonnet writes each session from its plan, as Markdown.
- The converter turns the sessions into:
  - Claude Code transcripts (`.jsonl`), with file dates that follow the story
  - the second user's claude.ai export (`data-*.zip`)

**Done when** every session exists and passes part 3.

### 3. History checker

**Plan usage:** none.

- Every fact appears in the session where it is planned, and in no earlier session.
- A replaced value is never stated as current after it was replaced.
- No task question appears in the history.
- No other choice of the same kind (another database, host, library or colour) appears unless it is planned.
- Each user's history is about 80K tokens of conversation.
- exposurie's own readers parse every file. This is exposurie's staging step, which uses no model.

### 4. Tasks

**Plan usage:** none.

- 27 tasks across the nine areas, each tied to one user.
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
