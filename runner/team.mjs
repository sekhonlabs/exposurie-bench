// Part 13, many agents, one job: three agents work one job side by side, each
// in its own copy of one repository, and none hears what the others are told.
// The method is in docs/build-plan.md (part 13); the task, its steps and the
// decisions round 1 is told for round 2 are in tasks/team/<task>.json.
//
//   node runner/team.mjs plan <task> [--seed text]
//   node runner/team.mjs again <batch> <new batch> --exposurie <version> [--conditions C] [--seed text]
//   node runner/team.mjs go <batch> [--accept "<why>"] [--repaired "<what>"]
//   node runner/team.mjs status <batch>
//
// `plan` fixes round 2's nine runs, three agents in each of conditions A, C
// and D, in a mixed order worked out from the seed, each with a run ID that
// says neither; the batch takes the task's name. `again` plans a new batch of
// the same task from an earlier batch's round 1, which does not run again: it
// is copied as the gate passed it, and `go` starts at the sync, on the
// exposurie named, with round 2 in the conditions named (C by default), in the
// order the earlier batch's seed gives them. A batch names its task, so every
// command takes a batch. `go` carries the batch as far as it goes, and can be
// stopped and started again; it spends plan usage:
//
//   1. Round 1, once, in condition C on the batch's exposurie (1.3.1 for
//      team-1): each agent's steps in
//      one saved session, `--session-id` for the first and `--resume` after,
//      in `work/<folder>`, which holds that agent's own copy while it runs.
//      Before every step the developer's kept kit goes into the home, and
//      that release brings it up to date and makes the brain 3 days old, as in
//      full-3. Between steps the home holds nothing of the session.
//   2. Round 1's three copies merged onto the starter with the sandbox's Git,
//      in agent order; a conflict is resolved by keeping both sides (Git's
//      union merge) and recorded. Then the gate: the repository's own tests
//      and score/team/round-1.test.js must pass, or the task stops for a
//      person, who repairs the merged code by hand and says what with
//      `--repaired`, or runs round 1 again.
//   3. The sync: once round 1's newest transcript has been still for five
//      minutes, a session of its own types /exposurie-sync in the brain's
//      folder, with the kept kit brought up to the batch's exposurie, not made younger, and
//      round 1's three transcripts as the only history. The brain it leaves
//      is condition C's in round 2.
//   4. Round 2: each run gets a copy of round 1's merged code with the task's
//      files, and its condition: nothing (A), the sync's kit (C), or the
//      task's notes as ~/.claude/CLAUDE.md (D). One ask, unsaved, checked as a
//      run of areas 1-8 is. What the scorer reads is saved in the run's folder,
//      and nothing there names the condition.
//   5. Each condition's three copies merged onto round 1's merged code, the
//      same way, once all three have run.
//
// It stops at a usage limit, three API errors in a row, a step or run that
// ends without a result three times, or one that breaks a check. A step or run
// that broke a check waits for a person: `--accept "<why>"` keeps what it did.
// score/team.mjs runs the tests and checks on what this leaves.
//
// Run it with the sandbox's own Node.

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPM_EXPOSURIES, PINS, SANDBOX, lockSandbox, ownNodeOnly, sandboxEnv, strays } from './sandbox.mjs';
import {
  BUILD_ASK, C_PATHS, Stop, TASKS, aboveProblems, askNpm, audit, brainState, buildStartupProblems, changedFiles, envFor,
  exposurieCommands, filed, filesUnder, hashPath, homeAfterRun, isText, keepEarlier, launch, move, neutralProblems, npmOf, outcome,
  pagesIn, parseLine, placeItems, prepareNpm, readJson, readRun, recover, runArgs, sandboxContext,
  startupProblems, tokensOf, unplace, updateNpm, versionsOf,
} from './run.mjs';
import {
  IN_FLIGHT_MS, LONG_ENV, callTokens, compactionsIn, configFiles, contextOf, homeAfterStep, kitItems, longArgs,
  longStartupProblems, moveExtras, originalKit, ownTokens, placeSession, projectsDir, recoverSession, restore, takeSession,
  writesIn,
} from './long.mjs';
import { runTests } from '../score/team.mjs';

export const TEAM = join(TASKS, 'team');
/** A step or run that ends without a result this often waits for a person. */
const MAX_TRIES = 3;
const GIT = join(SANDBOX, 'git', 'cmd', 'git.exe');

const fail = (msg) => {
  throw new Stop(msg);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const now = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => s.replace(/\\/g, '/');

// ---------------------------------------------------------------- the task

/** A team task, with where its starter, its files and condition D's notes are. */
export function teamTask(id) {
  const file = join(TEAM, `${id}.json`);
  if (!/^[a-z0-9-]+$/.test(id ?? '') || !existsSync(file)) fail(`no team task ${id} in ${TEAM}`);
  const t = readJson(file);
  return {
    ...t,
    starterDir: join(TASKS, t.starter),
    filesDir: join(TEAM, t.id),
    notesFile: join(TEAM, t.notes),
    examplesDir: t.examples ? join(TEAM, t.examples) : null,
  };
}

const agentsOf = (task) => task.round_1.map((a) => a.agent);
const stepsOf = (task, agent) => task.round_1.find((a) => a.agent === agent).steps;
const askOf = (task, agent) => task.round_2.find((a) => a.agent === agent).ask;

// ---------------------------------------------------------------- the plan

const batchFile = (ctx, id) => join(ctx.runs, id, 'batch.json');
const recordFile = (dir) => join(dir, 'team.json');
const saveRecord = (dir, T) => writeFileSync(recordFile(dir), JSON.stringify(T, null, 2) + '\n');
const writeBatch = (ctx, b) => {
  mkdirSync(dirname(batchFile(ctx, b.batch)), { recursive: true });
  writeFileSync(batchFile(ctx, b.batch), JSON.stringify(b, null, 2) + '\n');
};

/** A planned batch, and its task. A batch planned before `again` existed is named for its task. */
function batchOf(ctx, id) {
  if (!/^[a-z0-9-]+$/.test(id ?? '') || !existsSync(batchFile(ctx, id))) fail(`${id} is not planned; plan it first`);
  const b = readJson(batchFile(ctx, id));
  const task = teamTask(b.task ?? id);
  return { b, task, conditions: b.conditions ?? task.conditions };
}

/**
 * Round 2's runs: every agent once in every condition given, ordered by a hash
 * of the seed and the cell, so the order is mixed and the same for the same
 * seed, and numbered in that order.
 */
function cellsOf(task, conditions, seed) {
  const cells = [];
  for (const condition of conditions) for (const agent of task.round_2.map((a) => a.agent)) cells.push({ condition, agent });
  const key = (c) => createHash('sha256').update(`${seed}\n${c.condition}\n${c.agent}`).digest('hex');
  cells.sort((a, b) => key(a).localeCompare(key(b)));
  cells.forEach((c, i) => {
    c.run = `r${String(i + 1).padStart(3, '0')}`;
  });
  return cells;
}

/** Fix round 2's runs for a task's first batch, which takes the task's name and runs on exposurie 1.3.1. */
export function planTeam(ctx, id, { seed = id } = {}) {
  const task = teamTask(id);
  if (existsSync(batchFile(ctx, id))) fail(`${id} is already planned; run it with go`);
  const b = {
    batch: id, task: task.id, planned: now(), seed, exposurie: '1.3.1', conditions: task.conditions,
    round_1: task.round_1.map((a) => ({ agent: a.agent, part: a.part })), cells: cellsOf(task, task.conditions, seed),
  };
  writeBatch(ctx, b);
  return b;
}

/**
 * Plan a new batch from an earlier batch's round 1, which does not run again.
 * Round 1 is copied as the gate passed it: each agent's session and copy, the
 * merged code with any repair by hand, the merge, the tests and the record of
 * each step, with the acceptances that let a step through. So `go` starts at
 * the sync, with the same three transcripts, on the exposurie named. Round 2
 * has only the conditions named, in the order the earlier batch's seed gives,
 * so each agent keeps its place. The earlier batch is only read.
 */
export function againTeam(ctx, from, id, { exposurie, conditions = ['C'], seed = null } = {}) {
  if (!/^[a-z0-9-]+$/.test(id ?? '')) fail(`a batch is named with lowercase letters, digits and dashes, not ${id}`);
  if (existsSync(join(ctx.runs, id))) fail(`${id} already exists; run it with go`);
  if (!/^[a-z0-9-]+$/.test(from ?? '') || !existsSync(recordFile(join(ctx.runs, from)))) fail(`${from} has not run`);
  const { b: was, task } = batchOf(ctx, from);
  if (!NPM_EXPOSURIES[exposurie]) fail(`--exposurie names a release installed from npm (${Object.keys(NPM_EXPOSURIES).join(', ')}), not ${exposurie}`);
  const bad = conditions.filter((c) => !task.conditions.includes(c));
  if (!conditions.length || bad.length) fail(`${task.id}'s conditions are ${task.conditions.join(', ')}, not ${bad.join(', ') || 'none'}`);
  const src = join(ctx.runs, from);
  const T0 = readJson(recordFile(src));
  for (const agent of agentsOf(task)) {
    stepsOf(task, agent).forEach((_, n) => {
      if (!counts(lastTry(T0.round_1[agent].steps, n))) fail(`${from}'s round 1 is not finished: agent ${agent}, step ${n + 1}`);
    });
  }
  if (!T0.round_1.merged || !T0.round_1.gate?.passed) fail(`${from}'s round 1 has not passed its gate`);

  const dir = join(ctx.runs, id);
  mkdirSync(dir, { recursive: true });
  cpSync(join(src, 'round-1'), join(dir, 'round-1'), { recursive: true, preserveTimestamps: true });
  const T = {
    task: task.id,
    user: task.user,
    started: now(),
    round_1_from: { batch: from, started: T0.started, accepted: T0.accepted.filter((x) => x.kind === 'step') },
    sessions: T0.sessions,
    round_1: T0.round_1,
    sync: { tries: [] },
    round_2: { merged: {} },
    stopped: null,
    accepted: [],
  };
  saveRecord(dir, T);
  const s = seed ?? was.seed ?? from;
  const b = {
    batch: id, task: task.id, planned: now(), seed: s, exposurie, conditions, round_1_from: from,
    round_1: was.round_1, cells: cellsOf(task, conditions, s),
  };
  writeBatch(ctx, b);
  return b;
}

function startRecord(dir, task) {
  const T = {
    task: task.id,
    user: task.user,
    started: now(),
    // Named before anything runs, so a step that runs again carries on the same session.
    sessions: Object.fromEntries(agentsOf(task).map((a) => [a, randomUUID()])),
    round_1: { ...Object.fromEntries(agentsOf(task).map((a) => [a, { steps: [] }])), merged: null, gate: null, repairs: [] },
    sync: { tries: [] },
    round_2: { merged: {} },
    stopped: null,
    accepted: [],
  };
  mkdirSync(dir, { recursive: true });
  saveRecord(dir, T);
  return T;
}

/** The last attempt at a step, and whether it counts as done. */
const lastTry = (steps, n) => steps.filter((r) => r.n === n).at(-1) ?? null;
const counts = (r) => !!r && (r.status === 'done' || !!r.accepted);
const tries = (steps, n) => steps.filter((r) => r.n === n).length;

const agentDir = (dir, agent) => join(dir, 'round-1', `agent-${agent}`);
const workDir = (dir, task) => join(dir, 'work', task.folder);

// ---------------------------------------------------------------- round 1: one step

/**
 * One step of a round 1 agent: its copy of the repository in work/, the kept
 * kit in the home brought up to 1.3.1 and made 3 days old, its saved session
 * put back, then one headless call that saves the session. What the step did
 * to the copy and the session is kept only if it finished and broke no check.
 */
async function teamStep(ctx, { dir, task, T, agent, n, versions }) {
  const adir = agentDir(dir, agent);
  const sdir = join(adir, pad(n + 1));
  keepEarlier(sdir);
  mkdirSync(sdir, { recursive: true });
  if (!existsSync(join(adir, 'work'))) restore(task.starterDir, join(adir, 'work'));
  const work = workDir(dir, task);
  restore(join(adir, 'work'), work);
  const say = stepsOf(task, agent)[n];
  const started = now();
  let placed = placeItems(ctx, `${basename(dir)}/round-1/agent-${agent}/${pad(n + 1)}`, kitItems(originalKit(ctx, task.user)));
  let prepared;
  try {
    prepared = prepareNpm(ctx);
  } catch (e) {
    unplace(ctx);
    throw e;
  }
  // The step must leave its condition as prepared, not as it was copied in.
  placed = placed.map(({ rel }) => ({ rel, sha256: hashPath(join(ctx.home, rel)) }));
  placeSession(ctx, dir, join(adir, 'session'));
  const configBefore = new Set(configFiles(ctx));
  const strayBefore = strays(ctx.home).map(norm);
  const s = n === 0 ? { session: T.sessions[agent] } : { resume: T.sessions[agent] };
  let l;
  let home;
  try {
    l = await launch(ctx, {
      args: longArgs(say, s), cwd: work, env: { ...envFor(ctx, 'C'), ...LONG_ENV }, timeoutMs: ctx.timeoutMs,
      startup: (m) => longStartupProblems(m, work, s.session ?? s.resume, 'team'),
    });
    home = homeAfterStep(ctx, placed, strayBefore);
  } finally {
    unplace(ctx);
  }
  writeFileSync(join(sdir, 'stream.jsonl'), l.lines.join('\n') + '\n');
  writeFileSync(join(sdir, 'stderr.txt'), l.stderr);
  const msgs = l.lines.map(parseLine).filter(Boolean);
  const result = msgs.findLast((m) => m.type === 'result');
  const o = outcome(l, result, ctx.timeoutMs);
  const a = audit(msgs, { work, home: ctx.home, condition: 'C' });
  const compactions = compactionsIn(msgs);
  const problems = [...a.problems, ...home];
  const id = s.session ?? s.resume;
  if (o.status === 'done' && !filesUnder(projectsDir(ctx)).some((f) => basename(f) === `${id}.jsonl`)) {
    problems.push(`no transcript of session ${id} was saved, so nothing can carry it on`);
  }
  if (compactions.length) problems.push(`the session compacted without being asked: ${compactions.map((c) => c.kind).join(', ')}`);
  const notes = [...a.notes, ...moveExtras(ctx, configBefore, sdir)];
  const steps = T.round_1[agent].steps;
  const from = n > 0 ? lastTry(steps, n - 1) : null;
  const session = tokensOf(result);
  const tokens = result ? ownTokens(session, from?.session_tokens) : session;
  const calls = callTokens(msgs);
  const pinned = tokens.by_model[PINS.model];
  if (result && pinned && ['input', 'cache_write', 'cache_read'].some((k) => pinned[k] !== calls[k])) {
    notes.push(`the step's input tokens (${pinned.input}, ${pinned.cache_write}, ${pinned.cache_read}) differ from its own calls' (${calls.input}, ${calls.cache_write}, ${calls.cache_read})`);
  }
  const sessionCost = result?.total_cost_usd ?? null;
  const carriedCost = from?.session_cost_usd ?? null;
  const thrown = o.status === 'done' && problems.length > 0;
  const ok = o.status === 'done' && !thrown;
  // A finished step's session and copy are the agent's from now on; anything else stays beside the step.
  takeSession(ctx, ok ? join(adir, 'session') : join(sdir, 'session'));
  if (ok) restore(work, join(adir, 'work'));
  else restore(work, join(sdir, 'work'));
  const limits = msgs.filter((m) => m.type === 'rate_limit_event').at(-1)?.rate_limit_info?.unifiedWindows;
  const rec = {
    n,
    step: pad(n + 1),
    started,
    finished: now(),
    status: thrown ? 'thrown-out' : o.status,
    reason: thrown ? problems.join('; ') : o.reason ?? null,
    problems,
    notes,
    session: s,
    prepared,
    exit: l.exit,
    versions: {
      claude_code: l.init?.claude_code_version ?? null,
      model: l.init?.model ?? null,
      models_used: Object.keys(result?.modelUsage ?? {}),
      exposurie: versions.exposurie,
      node: versions.node,
    },
    tokens,
    session_tokens: session,
    call_tokens: calls,
    turns: result?.num_turns ?? null,
    duration_ms: result?.duration_ms ?? null,
    cost_usd_estimate: sessionCost == null ? null : carriedCost != null && sessionCost >= carriedCost && tokens !== session ? sessionCost - carriedCost : sessionCost,
    session_cost_usd: sessionCost,
    plan_usage_after: limits ? Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.utilization])) : null,
    context_after: contextOf(msgs),
    tool_calls: a.calls,
    denied: a.denied,
    looked: a.looked,
    reads: a.reads,
    exposurie_commands: exposurieCommands(msgs),
    writes: writesIn(msgs, work).length,
  };
  steps.push(rec);
  saveRecord(dir, T);
  return { rec, limit: !!o.limit, apiError: !!o.apiError };
}

// ---------------------------------------------------------------- merging

/** The sandbox's Git, with no system or global config, its identity given, and bytes kept as they are. */
function git(cwd, ...args) {
  const env = { ...sandboxEnv({ home: cwd, exposurie: false }), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL' };
  const r = spawnSync(GIT, [
    '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.longpaths=true', '-c', 'user.name=exposurie-bench',
    '-c', 'user.email=bench@localhost', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args,
  ], { cwd, env, encoding: 'utf8', windowsHide: true });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

function mustGit(cwd, ...args) {
  const r = git(cwd, ...args);
  if (r.status !== 0) fail(`git ${args.join(' ')} failed in ${cwd}:\n${r.out.slice(0, 800)}`);
  return r.out;
}

/** Everything in a folder but these names, copied over the top of another whose own files, but these, go first. */
function replaceTree(from, to, keep = ['.git']) {
  for (const n of readdirSync(to)) if (!keep.includes(n)) rmSync(join(to, n), { recursive: true, force: true });
  for (const n of readdirSync(from)) if (!keep.includes(n) && n !== 'node_modules') cpSync(join(from, n), join(to, n), { recursive: true, preserveTimestamps: true });
}

const unmerged = (repo) => git(repo, 'diff', '--name-only', '--diff-filter=U').out.split('\n').map((s) => s.trim()).filter(Boolean);

/**
 * Merge copies of one repository onto the base they all started from, in the
 * order given, the way a person merges their agents' branches. Each copy is a
 * branch off the base; each is merged with no fast-forward. When a merge
 * conflicts, it is done again with Git's union driver, which keeps both sides
 * of every conflicting hunk; whatever the union cannot merge (a file deleted on
 * one side, or binary) takes the later copy's version. Files Git ignores never
 * enter a branch. Every conflict is recorded, and the merged tree is left in
 * `to`, with the repository beside it in `repo` for anyone who wants to look.
 */
export function mergeCopies({ base, copies, to, repo }) {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(repo, { recursive: true });
  replaceTree(base, repo);
  mustGit(repo, 'init', '-q');
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  for (const c of copies) {
    mustGit(repo, 'checkout', '-q', '-b', `copy-${c.name}`, 'main');
    replaceTree(c.dir, repo);
    mustGit(repo, 'add', '-A');
    // Git takes a tracked file whose size, time and creation time match its
    // index entry as unchanged, without reading it, unless the file is as new
    // as the index. A copied file keeps its time (Windows' copy keeps it even
    // unasked), and one made again within 15 s of its deletion keeps the old
    // one's creation time, so a copy's change of bytes but not size could go
    // unseen: once in 40 merges of check/team.mjs's made-up repository
    // (2026-11-09). --renormalize reads every tracked file again.
    mustGit(repo, 'add', '--renormalize', '.');
    mustGit(repo, 'commit', '-q', '--allow-empty', '-m', `copy ${c.name}`);
    mustGit(repo, 'checkout', '-q', '-f', 'main');
    mustGit(repo, 'clean', '-q', '-fdx');
  }
  mustGit(repo, 'checkout', '-q', '-b', 'merged', 'main');
  const attributes = join(repo, '.git', 'info', 'attributes');
  const merges = [];
  for (const c of copies) {
    const changed = mustGit(repo, 'diff', '--name-only', 'main', `copy-${c.name}`).split('\n').filter(Boolean);
    git(repo, 'merge', '--no-ff', '--no-commit', `copy-${c.name}`);
    const conflicts = unmerged(repo);
    let unresolved = [];
    if (conflicts.length) {
      mustGit(repo, 'merge', '--abort');
      mkdirSync(dirname(attributes), { recursive: true });
      writeFileSync(attributes, '* merge=union\n');
      git(repo, 'merge', '--no-ff', '--no-commit', `copy-${c.name}`);
      rmSync(attributes, { force: true });
      unresolved = unmerged(repo);
      for (const f of unresolved) {
        if (git(repo, 'cat-file', '-e', `copy-${c.name}:${f}`).status === 0) mustGit(repo, 'checkout', `copy-${c.name}`, '--', f);
        else mustGit(repo, 'rm', '-q', '--', f);
      }
    }
    mustGit(repo, 'commit', '-q', '--allow-empty', '--no-edit', '-m', `merge copy ${c.name}`);
    merges.push({ copy: c.name, changed, conflicts, unresolved });
  }
  mustGit(repo, 'clean', '-q', '-fdx');
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  replaceTree(repo, to);
  return { at: now(), order: copies.map((c) => c.name), merges, conflicts: merges.flatMap((m) => m.conflicts.map((f) => `${m.copy}:${f}`)) };
}

// ---------------------------------------------------------------- the gate

/**
 * Round 1's merged code must pass its own tests and the hidden round 1 test
 * before round 2 starts from it, since every condition starts from it. A
 * repair by hand is recorded as a patch against the code as it was merged.
 */
function gate(dir, task) {
  const merged = join(dir, 'round-1', 'merged');
  const r = runTests(merged, { hidden: ['round-1.test.js'], data: { 'pocket.csv': join(task.starterDir, 'test', 'fixtures', 'pocket.csv') }, out: join(dir, 'round-1', 'tests') });
  return { at: now(), ...r };
}

function recordRepair(dir, what) {
  const merged = join(dir, 'round-1', 'merged');
  const asMerged = join(dir, 'round-1', 'merged-as-merged');
  const r = git(dir, 'diff', '--no-index', '--no-color', '--', norm(asMerged), norm(merged));
  const n = readdirSync(join(dir, 'round-1')).filter((f) => /^repair-\d+\.patch$/.test(f)).length + 1;
  const patch = join(dir, 'round-1', `repair-${n}.patch`);
  writeFileSync(patch, r.out ? `${r.out}\n` : '');
  return { at: now(), what, patch: basename(patch), lines: r.out ? r.out.split('\n').length : 0 };
}

// ---------------------------------------------------------------- the sync

/**
 * A session of its own types /exposurie-sync in the brain's folder, with the
 * developer's kept kit brought up to 1.3.1 and round 1's three transcripts as
 * the only history. exposurie leaves a transcript written in the last five
 * minutes for the next sync, so it waits until the newest has been still that
 * long. The brain it leaves, with its staged batch moved out as keep-brain
 * moves it, is condition C's in round 2.
 */
async function syncTeam(ctx, { dir, task, T, versions }) {
  const sdir = join(dir, 'sync', 'sync');
  keepEarlier(sdir);
  mkdirSync(sdir, { recursive: true });
  const sessions = agentsOf(task).map((a) => join(agentDir(dir, a), 'session'));
  const transcripts = sessions.flatMap((s) => filesUnder(s).filter((f) => f.endsWith('.jsonl')).map((f) => ({ rel: f, file: join(s, f) })));
  if (transcripts.length !== sessions.length) fail(`round 1 left ${transcripts.length} transcripts, not ${sessions.length}: ${transcripts.map((t) => t.rel).join(', ')}`);
  const newest = Math.max(...transcripts.map((t) => statSync(t.file).mtimeMs));
  const wait = newest + IN_FLIGHT_MS + 30_000 - Date.now();
  if (wait > 0) {
    console.log(`Waiting ${Math.ceil(wait / 1000)} s: exposurie leaves a transcript written in the last five minutes for the next sync.`);
    await sleep(wait);
  }
  const started = now();
  const brain = join(ctx.home, 'brain');
  let placed = placeItems(ctx, `${basename(dir)}/sync`, kitItems(originalKit(ctx, task.user)));
  let updated;
  try {
    updated = updateNpm(ctx);
  } catch (e) {
    unplace(ctx);
    throw e;
  }
  placed = placed.map(({ rel }) => ({ rel, sha256: hashPath(join(ctx.home, rel)) }));
  for (const s of sessions) placeSession(ctx, dir, s);
  const history = filesUnder(projectsDir(ctx));
  const before = Object.keys(brainState(brain)?.files ?? {}).length;
  const strayBefore = strays(ctx.home).map(norm);
  let l;
  const problems = [];
  let st;
  try {
    l = await launch(ctx, {
      args: runArgs(BUILD_ASK), cwd: brain, env: { ...envFor(ctx, 'C'), ...LONG_ENV }, timeoutMs: ctx.buildTimeoutMs ?? ctx.timeoutMs,
      startup: (m) => buildStartupProblems(m, brain),
    });
    // The brain is the session's to write, and exposurie's own config with it; the pointer, skill and command are not.
    problems.push(...homeAfterStep(ctx, placed, strayBefore, { except: ['brain', '.exposurie'] }));
    const after = filesUnder(projectsDir(ctx));
    if (JSON.stringify(after) !== JSON.stringify(history)) problems.push(`the history folder holds ${after.join(', ')}, not just round 1's sessions`);
    for (const t of transcripts) {
      const at = join(projectsDir(ctx), t.rel);
      if (existsSync(at) && hashPath(at) !== hashPath(t.file)) problems.push(`the sync changed ${t.rel}`);
    }
    st = brainState(brain);
    const read = Object.keys(st?.files ?? {}).map((p) => basename(norm(p)));
    const missed = transcripts.filter((t) => !read.includes(basename(t.rel)));
    if (missed.length) problems.push(`exposurie never read ${missed.map((t) => basename(t.rel)).join(', ')}`);
    else if (!filed(st)) problems.push('the brain is not synced to the end');
    const kit = join(dir, 'sync', 'kit');
    rmSync(kit, { recursive: true, force: true });
    for (const rel of C_PATHS) cpSync(join(ctx.home, rel), join(kit, rel), { recursive: true, preserveTimestamps: true });
    const staged = join(kit, 'brain', '.exposurie', 'staged');
    rmSync(join(dir, 'sync', 'staged'), { recursive: true, force: true });
    if (existsSync(staged)) move(staged, join(dir, 'sync', 'staged'));
  } finally {
    unplace(ctx);
    takeSession(ctx, join(sdir, 'history'));
  }
  writeFileSync(join(sdir, 'stream.jsonl'), l.lines.join('\n') + '\n');
  writeFileSync(join(sdir, 'stderr.txt'), l.stderr);
  const msgs = l.lines.map(parseLine).filter(Boolean);
  const result = msgs.findLast((m) => m.type === 'result');
  const o = outcome(l, result, ctx.buildTimeoutMs ?? ctx.timeoutMs);
  // The brain is the agent's to write; round 1's transcripts are there to be read.
  const a = audit(msgs, { work: brain, home: ctx.home, roots: [brain, join(ctx.home, '.exposurie'), projectsDir(ctx)] });
  problems.unshift(...a.problems);
  const thrown = o.status === 'done' && problems.length > 0;
  const limits = msgs.filter((m) => m.type === 'rate_limit_event').at(-1)?.rate_limit_info?.unifiedWindows;
  const rec = {
    started,
    finished: now(),
    status: thrown ? 'thrown-out' : o.status,
    reason: thrown ? problems.join('; ') : o.reason ?? null,
    problems,
    notes: a.notes,
    updated,
    exit: l.exit,
    versions: { claude_code: l.init?.claude_code_version ?? null, model: l.init?.model ?? null, exposurie: versions.exposurie, node: versions.node },
    tokens: tokensOf(result),
    turns: result?.num_turns ?? null,
    duration_ms: result?.duration_ms ?? null,
    cost_usd_estimate: result?.total_cost_usd ?? null,
    plan_usage_after: limits ? Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.utilization])) : null,
    tool_calls: a.calls,
    denied: a.denied,
    exposurie_commands: exposurieCommands(msgs),
    brain_after: {
      filed: filed(st),
      transcripts_read: Object.keys(st?.files ?? {}).length,
      newly_read: Object.keys(st?.files ?? {}).length - before,
      pages: pagesIn(join(dir, 'sync', 'kit', 'brain')),
      last_sync: st?.lastSyncUtc ?? null,
    },
  };
  T.sync.tries.push(rec);
  saveRecord(dir, T);
  return { rec, limit: !!o.limit, apiError: !!o.apiError };
}

// ---------------------------------------------------------------- round 2: one run

const baseDir = (dir) => join(dir, 'round-2-base');

/** What every round 2 run starts from: round 1's merged code, and the task's files. */
function makeBase(dir, task) {
  const base = baseDir(dir);
  restore(join(dir, 'round-1', 'merged'), base);
  for (const [to, from] of Object.entries(task.files ?? {})) {
    mkdirSync(dirname(join(base, to)), { recursive: true });
    cpSync(join(task.filesDir, from), join(base, to));
  }
}

/** The files that make up a round 2 condition, and where each comes from. */
function conditionItems(dir, task, condition) {
  if (condition === 'C') return C_PATHS.map((rel) => ({ rel, from: join(dir, 'sync', 'kit', rel) }));
  if (condition === 'D') return [{ rel: '.claude/CLAUDE.md', from: task.notesFile }];
  return [];
}

/**
 * One round 2 run, as a run of areas 1-8 goes: a fresh folder named for the
 * run, its condition in the home, one ask with the session unsaved, and every
 * check. In C, exposurie must see the brain the sync left as it left it: no
 * update to make and no sync to ask for.
 */
async function runCell(ctx, { dir, task, b, cell, versions }) {
  const cdir = join(dir, cell.run);
  keepEarlier(cdir);
  const work = join(cdir, task.folder);
  mkdirSync(work, { recursive: true });
  cpSync(baseDir(dir), work, { recursive: true, preserveTimestamps: true });
  const record = { run: cell.run, task: task.id, round: 2, started: now() };
  const save = (r) => {
    writeFileSync(join(cdir, 'run.json'), JSON.stringify({ ...record, ...r, finished: now() }, null, 2) + '\n');
    return r;
  };
  const items = conditionItems(dir, task, cell.condition);
  const missing = items.filter((i) => !existsSync(i.from));
  if (missing.length) return save({ status: 'not-run', reason: `${missing[0].from} is missing` });
  const placed = placeItems(ctx, `${b.batch}/${cell.run}`, items);
  let state = null;
  if (cell.condition === 'C') {
    const r = askNpm(ctx);
    state = r.out.split('\n')[0].trim();
    if (r.status !== 0 || /UPDATED TO|-> RUN:/.test(r.out)) {
      unplace(ctx);
      fail(`exposurie ${npmOf(ctx).version} does not see the sync's brain as the sync left it:\n${r.out.slice(0, 600)}`);
    }
  }
  cell.input = placed.map(({ rel, sha256: h }) => ({ file: rel, sha256: h }));
  writeBatch(ctx, b);
  const strayBefore = strays(ctx.home).map(norm);
  let l;
  let home;
  try {
    l = await launch(ctx, {
      args: runArgs(askOf(task, cell.agent)), cwd: work, env: envFor(ctx, cell.condition), timeoutMs: ctx.timeoutMs,
      startup: (m) => startupProblems(m, cell.condition, work),
    });
    home = homeAfterRun(ctx, placed, cdir, strayBefore);
  } finally {
    unplace(ctx);
  }
  writeFileSync(join(cdir, 'stream.jsonl'), l.lines.join('\n') + '\n');
  writeFileSync(join(cdir, 'stderr.txt'), l.stderr);
  const msgs = l.lines.map(parseLine).filter(Boolean);
  const result = msgs.findLast((m) => m.type === 'result');
  const o = outcome(l, result, ctx.timeoutMs);
  const a = audit(msgs, { work, home: ctx.home, condition: cell.condition });
  const limits = msgs.filter((m) => m.type === 'rate_limit_event').at(-1)?.rate_limit_info?.unifiedWindows;
  const files = changedFiles(work, baseDir(dir));
  for (const f of files.filter((x) => x.change !== 'deleted')) {
    const buf = readFileSync(join(work, f.path));
    f.bytes = buf.length;
    f.text = isText(buf);
    mkdirSync(dirname(join(cdir, 'files', f.path)), { recursive: true });
    writeFileSync(join(cdir, 'files', f.path), buf);
  }
  writeFileSync(join(cdir, 'files.json'), JSON.stringify(files, null, 2) + '\n');
  writeFileSync(join(cdir, 'answer.md'), typeof result?.result === 'string' && !result.is_error ? result.result : '');
  const problems = [...a.problems, ...home];
  const thrown = o.status === 'done' && problems.length > 0;
  save({
    status: thrown ? 'thrown-out' : o.status,
    reason: thrown ? problems.join('; ') : o.reason ?? null,
    problems,
    notes: a.notes,
    exit: l.exit,
    versions: {
      claude_code: l.init?.claude_code_version ?? null,
      model: l.init?.model ?? null,
      models_used: Object.keys(result?.modelUsage ?? {}),
      exposurie: versions.exposurie,
      node: versions.node,
    },
    tokens: tokensOf(result),
    turns: result?.num_turns ?? null,
    duration_ms: result?.duration_ms ?? null,
    cost_usd_estimate: result?.total_cost_usd ?? null,
    plan_usage_after: limits ? Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.utilization])) : null,
    tool_calls: a.calls,
    denied: a.denied,
    looked: a.looked,
    reads: a.reads,
    exposurie_commands: exposurieCommands(msgs),
    ...(state ? { exposurie_state: state } : {}),
    files: files.length,
  });
  const after = neutralProblems(ctx);
  let stop = null;
  if (after.length) stop = `After ${cell.run} the sandbox home is not as runs leave it, so nothing more runs until it is:\n  ${after.join('\n  ')}`;
  return { status: thrown ? 'thrown-out' : o.status, reason: thrown ? problems.join('; ') : o.reason ?? null, problems, limit: !!o.limit, apiError: !!o.apiError, stop };
}

// ---------------------------------------------------------------- the whole of it

/**
 * Carry a team task as far as it goes. Running it again carries on from where
 * it stopped. `accept` keeps a step or run that broke a check; `repaired`
 * records a repair by hand of round 1's merged code, after the gate stopped it.
 */
export async function goTeam(given, id, { accept = null, repaired = null } = {}) {
  const { b, task, conditions } = batchOf(given, id);
  const release = lockSandbox(given.lock);
  try {
    recover(given);
    recoverSession(given);
    const before = neutralProblems(given);
    if (before.length) fail(`the sandbox home is not as runs leave it, so nothing runs until it is:\n  ${before.join('\n  ')}`);
    const ctx = { ...given, exposurie: b.exposurie };
    const dir = join(ctx.runs, id);
    const above = aboveProblems(dir);
    if (above.length) fail(`nothing runs while instructions sit above the runs:\n  ${above.join('\n  ')}`);
    const versions = versionsOf(ctx);
    if (!versions.claude_code.startsWith(PINS.claudeCode)) fail(`Claude Code is ${versions.claude_code}, pinned ${PINS.claudeCode}`);
    const T = existsSync(recordFile(dir)) ? readJson(recordFile(dir)) : startRecord(dir, task);

    if (T.stopped) {
      if (!accept) {
        fail(`${T.stopped.where} of ${id} broke a check:\n  ${T.stopped.problems.join('\n  ')}\n` +
          `Read ${join(dir, T.stopped.where)}. To keep what it did anyway: team.mjs go ${id} --accept "<why>"`);
      }
      T.accepted.push({ at: now(), why: accept, ...T.stopped });
      const w = T.stopped;
      if (w.kind === 'step') {
        const r = lastTry(T.round_1[w.agent].steps, w.n);
        r.accepted = accept;
        // A step that ran through is kept as it left things: the copy, and its session.
        restore(join(dir, w.where, 'work'), join(agentDir(dir, w.agent), 'work'));
        if (existsSync(join(dir, w.where, 'session'))) restore(join(dir, w.where, 'session'), join(agentDir(dir, w.agent), 'session'));
      } else if (w.kind === 'sync') {
        T.sync.tries.at(-1).accepted = accept;
      } else {
        const run = readRun(join(dir, w.where));
        writeFileSync(join(dir, w.where, 'run.json'), JSON.stringify({ ...run, accepted: accept }, null, 2) + '\n');
      }
      T.stopped = null;
      saveRecord(dir, T);
    } else if (accept) {
      fail('--accept is for a team task that stopped on a problem, and this one did not');
    }

    let apiErrors = 0;
    /** What to do after a step, the sync or a run: null to carry on, or false to stop here. */
    const after = (r, where, stop) => {
      const tokens = r.rec?.tokens ?? null;
      console.log(`${where}  ${r.status}${r.reason ? `: ${r.reason}` : ''}${tokens ? `  (${tokens.all_input} in, ${tokens.output} out)` : ''}`);
      if (r.status === 'thrown-out') {
        T.stopped = { where, ...stop, problems: r.problems };
        saveRecord(dir, T);
        console.log(`\n${where} broke a check, so ${id} stops here. Read ${join(dir, where)}.`);
        return false;
      }
      if (r.stop) {
        console.log(`\n${r.stop}`);
        return false;
      }
      if (r.limit) {
        console.log("\nThe plan's usage limit stopped it. Run the same command once it resets: it carries on from here.");
        return false;
      }
      apiErrors = r.apiError ? apiErrors + 1 : 0;
      if (apiErrors === 3) {
        console.log('\nThree API errors in a row, so it stops here. Run the same command again later.');
        return false;
      }
      if (r.status === 'not-run' && r.tried >= MAX_TRIES) {
        console.log(`\n${where} has ended without a result ${r.tried} times. Read ${join(dir, where)} before running it again.`);
        return false;
      }
      return null;
    };

    // Round 1, each agent's steps in turn.
    for (const agent of agentsOf(task)) {
      const steps = stepsOf(task, agent);
      for (let n = 0; n < steps.length; n += 1) {
        while (!counts(lastTry(T.round_1[agent].steps, n))) {
          const st = brainState(join(originalKit(ctx, task.user), 'brain'));
          if (!st?.lastSyncUtc) fail(`the ${task.user}'s kept brain was never synced`);
          if ((st.unfiled ?? 0) > 0) fail(`the ${task.user}'s kept brain has ${st.unfiled} conversations not filed`);
          const r = await teamStep(ctx, { dir, task, T, agent, n, versions });
          const where = `round-1/agent-${agent}/${r.rec.step}`;
          if (after({ ...r, ...r.rec, tried: tries(T.round_1[agent].steps, n) }, where, { kind: 'step', agent, n }) === false) return false;
        }
      }
    }

    // Round 1's copies, merged and tested.
    const merged = join(dir, 'round-1', 'merged');
    if (!T.round_1.merged) {
      T.round_1.merged = mergeCopies({
        base: task.starterDir, copies: agentsOf(task).map((a) => ({ name: String(a), dir: join(agentDir(dir, a), 'work') })),
        to: merged, repo: join(dir, 'round-1', 'merge-repo'),
      });
      restore(merged, join(dir, 'round-1', 'merged-as-merged'));
      saveRecord(dir, T);
      console.log(`round-1 merged${T.round_1.merged.conflicts.length ? `, with conflicts kept both ways: ${T.round_1.merged.conflicts.join(', ')}` : ', with no conflict'}`);
    }
    if (repaired) {
      if (T.round_1.gate?.passed !== false) fail('--repaired is for round 1\'s merged code after the gate stopped it, and it did not');
      T.round_1.repairs.push(recordRepair(dir, repaired));
      T.round_1.gate = null;
      saveRecord(dir, T);
    }
    if (!T.round_1.gate?.passed) {
      T.round_1.gate = gate(dir, task);
      saveRecord(dir, T);
      const g = T.round_1.gate;
      console.log(`round-1 gate  ${g.passed ? 'passed' : 'failed'}: its own tests ${g.own.passed} passed, ${g.own.failed} failed; the hidden test ${g.hidden.passed} passed, ${g.hidden.failed} failed`);
      if (!g.passed) {
        console.log(`\nRound 1's merged code does not pass, so round 2 cannot start from it. Read ${join(dir, 'round-1', 'tests')}. ` +
          `Repair ${merged} by hand, with the smallest change and no round 2 decision in it, then: team.mjs go ${id} --repaired "<what you changed>". Or run round 1 again.`);
        return false;
      }
    }

    // The sync.
    while (!counts(T.sync.tries.at(-1))) {
      const r = await syncTeam(ctx, { dir, task, T, versions });
      if (after({ ...r, ...r.rec, tried: T.sync.tries.length }, 'sync/sync', { kind: 'sync' }) === false) return false;
    }

    // Round 2, in the batch's order.
    if (!existsSync(baseDir(dir))) makeBase(dir, task);
    const triesOf = (run) => readdirSync(dir).filter((n) => n === run || n.startsWith(`${run}-try`)).length;
    for (const cell of b.cells) {
      const prev = readRun(join(dir, cell.run));
      if (prev && (prev.status === 'done' || prev.accepted)) continue;
      if (prev && prev.status === 'thrown-out') fail(`${cell.run} broke a check and was not accepted; read ${join(dir, cell.run)}`);
      const r = await runCell(ctx, { dir, task, b, cell, versions });
      if (after({ ...r, rec: { tokens: readRun(join(dir, cell.run))?.tokens }, tried: triesOf(cell.run) }, cell.run, { kind: 'run', run: cell.run }) === false) return false;
    }

    // Each condition's copies, merged.
    for (const condition of conditions) {
      if (T.round_2.merged[condition]) continue;
      const cells = b.cells.filter((c) => c.condition === condition).sort((x, y) => x.agent - y.agent);
      if (!cells.every((c) => counts(readRun(join(dir, c.run))) || readRun(join(dir, c.run))?.accepted)) continue;
      T.round_2.merged[condition] = mergeCopies({
        base: baseDir(dir), copies: cells.map((c) => ({ name: String(c.agent), dir: join(dir, c.run, task.folder) })),
        to: join(dir, 'merged', condition), repo: join(dir, 'merged', `${condition}-repo`),
      });
      saveRecord(dir, T);
      console.log(`round-2 ${condition} merged${T.round_2.merged[condition].conflicts.length ? `, with conflicts kept both ways: ${T.round_2.merged[condition].conflicts.join(', ')}` : ', with no conflict'}`);
    }
    const done = conditions.every((c) => T.round_2.merged[c]);
    if (done && !T.finished) {
      T.finished = now();
      saveRecord(dir, T);
    }
    return done;
  } finally {
    release();
  }
}

/** Where a team task stands. */
export function teamStatus(ctx, id) {
  const dir = join(ctx.runs, id ?? '');
  if (!/^[a-z0-9-]+$/.test(id ?? '') || !existsSync(batchFile(ctx, id))) {
    console.log(`${id}: not planned.`);
    return null;
  }
  const { b, task, conditions } = batchOf(ctx, id);
  const T = existsSync(recordFile(dir)) ? readJson(recordFile(dir)) : null;
  if (!T) {
    console.log(`${id}: planned, not started (${dir}).`);
    return null;
  }
  console.log(`${id}: ${task.id} on exposurie ${b.exposurie}${T.round_1_from ? `, round 1 from ${T.round_1_from.batch}` : ''}`);
  for (const agent of agentsOf(task)) {
    const steps = stepsOf(task, agent);
    const n = steps.filter((_, i) => counts(lastTry(T.round_1[agent].steps, i))).length;
    console.log(`  round 1, agent ${agent}: ${n} of ${steps.length} steps`);
  }
  console.log(`  round 1 merged: ${T.round_1.merged ? `yes${T.round_1.merged.conflicts.length ? `, conflicts ${T.round_1.merged.conflicts.join(', ')}` : ''}` : 'no'}; gate: ${T.round_1.gate ? (T.round_1.gate.passed ? 'passed' : 'failed') : 'not yet'}`);
  console.log(`  sync: ${counts(T.sync.tries.at(-1)) ? 'done' : `${T.sync.tries.length} tries`}`);
  for (const cell of b.cells) {
    const r = readRun(join(dir, cell.run));
    console.log(`  ${cell.run}  round 2: ${r ? `${r.status}${r.accepted ? ' (accepted)' : ''}` : 'waiting'}`);
  }
  console.log(`  round 2 merged: ${conditions.map((c) => `${c} ${T.round_2.merged[c] ? 'yes' : 'no'}`).join(', ')}`);
  if (T.stopped) console.log(`  stopped at ${T.stopped.where}: ${T.stopped.problems.join('; ')}`);
  return T;
}

// ---------------------------------------------------------------- command line

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  ownNodeOnly();
  const [cmd, id, ...rest] = process.argv.slice(2);
  const ctx = sandboxContext();
  const flag = (name) => {
    const i = rest.indexOf(name);
    if (i >= 0 && !rest[i + 1]) fail(`${name} needs its text, in quotes`);
    return i >= 0 ? rest[i + 1] : null;
  };
  try {
    if (cmd === 'plan' && id) console.log(`${id}: planned, ${planTeam(ctx, id, { seed: flag('--seed') ?? id }).cells.length} runs in round 2.`);
    else if (cmd === 'again' && id && rest[0] && !rest[0].startsWith('--')) {
      const b = againTeam(ctx, id, rest[0], {
        exposurie: flag('--exposurie'), conditions: (flag('--conditions') ?? 'C').split(','), seed: flag('--seed'),
      });
      console.log(`${b.batch}: planned from ${id}'s round 1, on exposurie ${b.exposurie}: ${b.cells.length} runs in round 2 (${b.conditions.join(', ')}). go starts at the sync.`);
    } else if (cmd === 'go' && id) process.exitCode = (await goTeam(ctx, id, { accept: flag('--accept'), repaired: flag('--repaired') })) ? 0 : 1;
    else if (cmd === 'status' && id) teamStatus(ctx, id);
    else {
      fail('usage: node runner/team.mjs plan <task> [--seed text] | again <batch> <new batch> --exposurie <version> [--conditions C] [--seed text] | ' +
        'go <batch> [--accept "<why>"] [--repaired "<what>"] | status <batch>');
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`team: ${e.message}`);
    process.exitCode = 1;
  }
}
