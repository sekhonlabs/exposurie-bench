# Decisions

Dated, newest last. Each entry says what was decided and why.

## 2026-10-18

- **A separate public repository.** The method and the results can be checked and rerun, and cloud sessions can work on it. The repository, the run sandbox and the raw outputs share one folder on a disk kept apart from the owner's personal setup. The sandbox and raw outputs never enter the repository.
- **Runs use a Claude plan login, never an API key,** because of cost. As a result there is no `--bare` mode, which only accepts API keys. Isolation comes from a separate home folder and `CLAUDE_CONFIG_DIR` instead.
- **Claude Code builds and runs everything.**
- **Synthetic users, not real people's histories.** Their right answers are known, they contain no private data, and anyone can rerun them.
- **One agent, Claude Code.** There is no second-agent arm.
- **Broad, not deep.** The benchmark has nine areas, three tasks in each, and one run per cell, about 105 runs in total. An earlier draft had 2 users × 20 tasks × 4 conditions × 3 runs = 480.
- **The half-context-window rule of thumb gets tested rather than asserted** (area 9).
- **The two users are a great developer and someone who hands everything to agents** and just wants the work done. Neither is tied to a niche job or industry.
- **Cloud sessions are an option, not yet the plan.** It is unverified whether nested `claude -p` runs work inside a cloud machine.
- **Model: Sonnet 5.5 (`claude-sonnet-5-5`).** It is pinned for every run, both brain builds, the generated histories and the judge, so one model is used throughout.
- **About 80K tokens of conversation per user.** Real histories run past any context window, which would make B impossible to run. This size keeps B runnable while staying far too long to paste into every session. The pilot confirms that B fits with room for the task.
- **The four conditions differ by one file:** the sandbox's global instructions file, which is where exposurie puts its pointer. Using one mechanism for all four keeps the comparison fair.
- **The sandbox has its own pinned Claude Code and exposurie, with auto-update off.** Claude Code went through 44 version numbers in the 46 days before this decision, and the run takes several days.
- **Sonnet 5.5 writes the histories from written session plans, inside the sandbox, without session persistence.** The plans control where every fact appears. The sandbox keeps the owner's setup out of the text. Without persistence, the generation sessions themselves never end up in the history. The generated text is committed, and it is what every run uses.
- **More run-hygiene rules**, each guarding against a specific wrong number:
  - transcript retention is set before any history is placed
  - claude.ai connectors and auto-memory are off
  - every run gets the same tool list, checked at the start
  - the raw history is removed after the brain build
  - C runs finish within 7 days of the build
  - every input token is counted, cached or not
  - conditions are mixed together in the run order
  - a run stopped by a usage limit counts as not run

  Details are in design.md.
- **An answer with both a required and a forbidden fact goes to the judge and the hand check**, because a correct answer can name the old choice while giving the new one.
- **Area 9 is built last**, once the pilot shows how much plan usage the run needs. It needs sessions to be saved, and that exception is decided when it is built.
- **Charts and write-ups use exposurie's own look** (see CLAUDE.md).
- **The build follows docs/build-plan.md, one part at a time:** each part is discussed, built and checked before the next one starts.
- **Everything the benchmark installs, writes or runs stays in its own folder:** this repository, `../sandbox` and `../runs`. Nothing of the owner's own setup is read or written. So the sandbox carries its own Node and Git as well as Claude Code and exposurie, each pinned and checked against its published hash.
- **The run environment is built, never inherited:** Windows' own variables plus the sandbox's paths. A run is often started from inside another agent session, and that session's variables (its effort setting, its session ID) would otherwise reach the run.
- **Remote feature flags are off** (`DISABLE_GROWTHBOOK=1`). There are two reasons:
  - On Windows, one flag (`tengu_windows_credman`) moves the login out of the sandbox's credentials file and into the Windows user's Credential Manager, which is outside the sandbox.
  - Any flag can change behaviour partway through the run.

  So every run gets the pinned binary's own defaults, the same on every day and for anyone who reruns the benchmark.
- **The binary's built-in plugins and skills stay on.** Claude Code 2.1.302 ships three plugins (`cc-plugin-agents-md`, `cc-plugin-telemetry` and `cc-plugin-plugin-authoring`) and 17 skills of its own. They come with the pinned version and are the same in every condition.
- **The login happens in the owner's own browser**, by copying the sign-in URL from the sandbox's Claude Code. A browser started from the sandbox creates a new profile inside it. On the first try, Edge signed that profile in with the owner's account and synced into it, and the profile was then deleted. `sandbox.mjs check` now fails if anything but `.claude` and the empty `AppData` folders appears in the sandbox home.
- **The developer also has a job**, at the owner's suggestion: a developer at a company works across its repositories, with connectors and memories of their own, and a brain can carry that working life too. So the developer works at a made-up company, Tidewell, as well as on four projects of their own: 28 sessions across 6 repositories, instead of about 25 across about 4.
  - Connectors stay off in every run, and exposurie drops what a connector returns. So where a connector would act, a task writes a file instead.
  - The team's rules and the developer's own disagree in places, and some tasks check that neither leaks into the other.
- **The users have no names.** Real users rarely tell Claude Code their name. Their folders are `users/developer` and `users/delegator`.

## 2026-10-20

- **The fact sheets carry more than the build plan first listed.** For each fact they also give its kind, its context (work or personal), how it first comes up (said by the user, proposed by the agent and accepted, or a correction), the options turned down and the session that names them, and the tasks where stating it would be wrong. A rival choice may be named only where a fact or a turned-down option plans it. Each user also lists what is never discussed, with the words that must never appear. See build-plan.md, part 1.
- **The sessions are fixed in part 1**, in `users/<user>/plan.json`: each one's time, project or chat, and surface. A fact's first session means nothing without them. Part 2 adds how each fact comes up.
- **The task list starts in part 1**, in `tasks/index.json`, so the fact sheets can point at tasks. Part 4 completes each task.
- **"Non-default" applies to the facts a task asks about.** The other facts also include people, places and habits, as a real history does. A replaced value may be a popular default, since it is never the right answer.
- **26 tasks, not 27:** three in each of areas 1–8, and two in area 9.
- **`check/facts.mjs` holds both fact sheets to the method** before any history exists. Part 3's history checker reads text the same way, with its `mentions` rule.
- **The owner approved both users' fact sheets**, which ends part 1.
- **Each session is generated from a written brief**, kept in `plan.json`. It says what happens, how each fact first said in the session comes up, which earlier facts come up again, and how long the session is. The prompt is built from the brief, the fact sheet and the checker's rules, so the prompt and the checker cannot disagree.
- **Generation runs the sandbox's Claude Code with the brief as its whole system prompt,** with no tools, skills or MCP servers. Writing text needs none of them, and leaving them out keeps every attempt small. A session is checked before it is kept. One that fails is written again with the checker's findings, up to three times.
- **The assistant in the histories remembers nothing between sessions**, as Claude Code doesn't. An earlier decision reaches a later session only when the user says it again or the agent finds it in the code. That is the gap a brain is built to close.
- **The transcripts carry conversation only, with no tool calls.** exposurie 1.2.0 keeps only the text blocks of user and assistant lines (`src/extract/transcript.js`), so tool calls and their output would change nothing it reads. Leaving them out also means no fact can sit in a tool call where the checker would miss it. Connector calls at work are left out the same way, and what a connector did is said in words.
- **The claude.ai export carries the chats and an account file with no name in it.** A real export may also carry claude.ai's own memory of the person (`memories.json`) and the instructions of their claude.ai Projects, and exposurie reads both ahead of the chats. They are left out because here they would be a summary written by us, not by claude.ai, and only C would read it. The second user's chats are not in a claude.ai Project.
- **The transcripts record made-up working folders on macOS**, such as `/Users/dev/code/satchel`. Each ends in the project's name, because exposurie names a project after its folder. The account names in them are placeholders, since the users have no names.
- **The converted files are not committed.** Git does not keep file dates, and exposurie orders history by them. The converter is deterministic, and part 6 converts straight into the sandbox home. The sessions are committed, and they are what every run uses.
- **"No other choice of the same kind" is checked against a list of names**, `check/rivals.json`, plus every turned-down option. Names that are also ordinary words are matched by their case or left out. So are names used everywhere (npm, Node, git, GitHub, VS Code), because a whole-word match cannot tell a choice from a word.
- **Where a chat would naturally offer several options**, such as names, places, gifts or subject lines, it offers one. Any other option would be a rival nobody planned.
- **Every transcript line records the pinned Claude Code version**, 2.1.302, rather than a version history made up for the dates.
- **Each session's length follows the history's budget, not only its brief.** The pilot's sessions came in short, so the prompt asked for at least the planned length. The first eleven developer sessions then came in at 1.39 times it, which would have put that history near 114K tokens. So each new session is asked for its share of what is left of the 80K: the tokens the written sessions have not used, spread over the briefs still to write. The share is kept between 0.7 and 1.3 of its brief, and `generation.json` records it. The method's number is unchanged: about 80K tokens of conversation per user.
- **A heading inside a code block is allowed.** Every heading the checker refused in the first run was part of a document the assistant was showing, such as a README or a pull request description. Outside code blocks, turns still never start a line with `#` or `##`, the marks that separate turns in a session file.
- **del-04 is written again.** Its kept draft had the assistant say the user writes late at night, which only a claude.ai chat had said. The pilot found it, and the prompt was fixed, but the draft was kept. It is set aside like dev-01, and its draft stays in `../runs`.
- **The assistant knows a team's conventions only once they are said.** Reading the developer's history found five sessions where the assistant used something said only in an earlier session: the team's pull request sections, its two approvals and squash merges, where its handbook lives, and once "You said to ask before adding any dependency". The prompt already said the assistant knows nothing about the person beyond the files. It now says the same of the team's conventions, and that the assistant asks until it is told. The pull request sections are a fact a task asks about, so the extra mentions would also have favoured B and C. dev-11, dev-15, dev-18, dev-23 and dev-27 are written again, and their drafts stay in `../runs`.
- **The sandbox login's own email address and names never appear in a session.** Claude Code 2.1.302 adds the logged-in account's email address to every run's context (its user context `userEmail`, taken from the account), even when the run brings its own system prompt. Only `ANTHROPIC_UNIX_SOCKET` turns it off, and that changes how Claude Code connects. One developer session used the address as a blog's contact address, and was set aside before it was committed. The checker now refuses the login's address and names. It reads them from the sandbox when it runs, so they never enter the repository, and its findings never quote them. The prompt says every address is made up, at example.com.
- **The same address reaches every benchmark run**, in all four conditions alike. It changes no condition against another. But a run can write it into a file, so parts 5 and 6 hold everything they save into the repository to the same check.
