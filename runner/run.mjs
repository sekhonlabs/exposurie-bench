// The runner (part 5): every benchmark run, one at a time, in the sandbox.
//
//   node runner/run.mjs plan <batch> [--users u,u] [--tasks id,id] [--conditions A,B,C,D] [--seed text]
//   node runner/run.mjs go <batch> [--again r001,r002]
//   node runner/run.mjs status <batch>
//   node runner/run.mjs keep-brain <user>
//
// `plan` fixes a batch: every task and condition asked for, in a mixed order
// worked out from the seed, each with a run ID that says nothing about either.
// `go` runs whatever in it has not run, in that order, and can be stopped and
// started again: a run stopped by a usage limit is "not run", and the next `go`
// runs it. `--again` reruns named runs. `keep-brain` comes after a brain build
// (part 6): it moves everything exposurie wrote into the sandbox home out to
// ../sandbox/brains/<user>/, along with the raw history, so that only C's runs
// see a brain and none sees the history.
//
// Each run gets a fresh folder, ../runs/<batch>/<run>/<folder>, holding a copy
// of its starter or nothing, and runs there. Before it starts, the sandbox home
// gets its condition: nothing for A, the condition file as ~/.claude/CLAUDE.md
// for B and D, and for C everything exposurie installed plus the brain, with
// the `exposurie` command on the PATH. Afterwards the home goes back to how runs
// leave it, and the run is checked:
//
//   - its start-up line: the pinned version and model, a plan login, no MCP
//     server, only the listed tools. A wrong one stops the run at once.
//   - every tool call: no file reached outside its own folder (C may also reach
//     its brain), and no shell command but `exposurie`, unless it was denied
//   - the sandbox home: its condition unchanged, and no transcript written
//
// A run that fails a check is thrown out. What the scorer reads is saved in the
// run's folder, and nothing there names the condition: run.json, answer.md, and
// the files the run created or changed under files/. The conditions are only in
// batch.json, which the scorer never opens.
//
// Run it with the sandbox's own Node.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLAUDE, EXPOSURIE, HOME, PINS, RUNS, SANDBOX, TOOLS, lockSandbox, ownNodeOnly, sandboxEnv, strays,
} from './sandbox.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = join(REPO, 'tasks');
const USERS = ['developer', 'delegator'];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export const CONDITIONS = ['A', 'B', 'C', 'D'];
/** Area 8 needs no past, so it has no D; area 9 is built in part 8. */
const NO_D = 8;
const BUILT_LATER = 9;

/**
 * Edits inside the run's own folder are accepted, as for a person who lets the
 * agent work. Anything else that would ask is denied, since nobody is there to
 * say yes, and the shell may run only `exposurie`.
 */
export const PERMISSION_MODE = 'acceptEdits';
const ALLOWED = 'Bash(exposurie:*)';
const TIMEOUT_MS = 30 * 60 * 1000;

/**
 * What C adds to the sandbox home, relative to it: everything exposurie 1.2.0
 * writes there (its pointer, skill, command and config) and the brain.
 */
export const C_PATHS = ['.claude/CLAUDE.md', '.claude/skills/exposurie', '.claude/commands/exposurie-sync.md', '.exposurie', 'brain'];
/** Where the raw history sits during a brain build. It leaves with keep-brain. */
const HISTORY_PATHS = ['.claude/projects', 'Downloads'];

export const allTasks = () => readJson(join(TASKS, 'index.json')).tasks;

/**
 * Where runs happen and what runs them. This is the sandbox's own; check/runner.mjs
 * builds one in a folder of its own, with a fake `claude`, so a test never
 * touches the home that holds the login.
 */
export function sandboxContext() {
  return {
    home: HOME,
    brains: join(SANDBOX, 'brains'),
    runs: RUNS,
    lock: join(SANDBOX, 'run.lock'),
    placed: join(SANDBOX, 'placed.json'),
    claude: [CLAUDE],
    env: {},
    timeoutMs: TIMEOUT_MS,
  };
}

const envFor = (ctx, condition) => ({ ...sandboxEnv({ home: ctx.home, exposurie: condition === 'C' }), ...ctx.env });

/** A reason the runner stops. Thrown, so check/runner.mjs can see it; the command line prints it. */
export class Stop extends Error {}
const fail = (msg) => {
  throw new Stop(msg);
};

// ---------------------------------------------------------------- files

/** Every file under `dir`, as paths with `/`, or none when it is absent. */
function filesUnder(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p, `${rel}${name}/`);
      else out.push(`${rel}${name}`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** One hash for a file or a whole folder, names included. */
function hashPath(p) {
  if (!statSync(p).isDirectory()) return sha256(readFileSync(p));
  const h = createHash('sha256');
  for (const f of filesUnder(p)) h.update(`${f}\n`).update(readFileSync(join(p, f)));
  return h.digest('hex');
}

const hashes = (dir) => new Map(filesUnder(dir).map((f) => [f, sha256(readFileSync(join(dir, f)))]));

/** The files a run created, changed or deleted, compared with its starter. */
function changedFiles(work, starter) {
  const before = starter ? hashes(starter) : new Map();
  const after = hashes(work);
  const out = [];
  for (const [path, h] of after) {
    if (!before.has(path)) out.push({ path, change: 'created' });
    else if (before.get(path) !== h) out.push({ path, change: 'changed' });
  }
  for (const path of before.keys()) if (!after.has(path)) out.push({ path, change: 'deleted' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const isText = (buf) => !buf.subarray(0, 8192).includes(0);

/** A run folder already used by an earlier attempt is kept beside the new one. */
function keepEarlier(dir) {
  if (!existsSync(dir)) return;
  let n = 1;
  while (existsSync(`${dir}-try${n}`)) n += 1;
  renameSync(dir, `${dir}-try${n}`);
}

// ---------------------------------------------------------------- the batch

const batchFile = (ctx, batch) => join(ctx.runs, batch, 'batch.json');

function readBatch(ctx, batch) {
  if (!existsSync(batchFile(ctx, batch))) fail(`no batch ${batch}; plan it first`);
  return readJson(batchFile(ctx, batch));
}

const saveBatch = (ctx, b) => writeFileSync(batchFile(ctx, b.batch), JSON.stringify(b, null, 2) + '\n');

export function readRun(dir) {
  try {
    return readJson(join(dir, 'run.json'));
  } catch {
    return null;
  }
}

/**
 * Fix a batch. Every task asked for runs once under each condition asked for,
 * and the order comes from sorting on a hash of the seed and the cell: mixed,
 * and the same every time for the same seed.
 */
export function plan(ctx, batch, { users = USERS, tasks: only = null, conditions = CONDITIONS, seed = batch } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(batch ?? '')) fail('a batch name is letters, digits and dashes');
  if (existsSync(batchFile(ctx, batch))) fail(`${batch} is already planned; run it with go, or pick another name`);
  for (const c of conditions) if (!CONDITIONS.includes(c)) fail(`no condition ${c}`);
  for (const u of users) if (!USERS.includes(u)) fail(`no user ${u}`);
  const known = allTasks().filter((t) => t.area !== BUILT_LATER);
  for (const id of only ?? []) if (!known.some((t) => t.id === id)) fail(`no task ${id} to run`);

  const cells = [];
  for (const t of known.filter((t) => users.includes(t.user) && (!only || only.includes(t.id)))) {
    for (const c of conditions) if (!(c === 'D' && t.area === NO_D)) cells.push({ task: t.id, user: t.user, condition: c });
  }
  if (!cells.length) fail('nothing to run');
  const key = (c) => sha256(`${seed}\n${c.task}\n${c.condition}`);
  cells.sort((a, b) => key(a).localeCompare(key(b)));
  cells.forEach((c, i) => {
    c.run = `r${String(i + 1).padStart(3, '0')}`;
  });
  mkdirSync(join(ctx.runs, batch), { recursive: true });
  const b = { batch, planned: new Date().toISOString(), seed, cells };
  saveBatch(ctx, b);
  return b;
}

// ---------------------------------------------------------------- the sandbox home

/** What the home holds that runs must not find there between runs. */
export function neutralProblems(ctx) {
  const p = [];
  if (existsSync(ctx.placed)) p.push(`a run's condition is still in place (${ctx.placed})`);
  for (const rel of ['.claude/CLAUDE.md', '.claude/skills', '.claude/commands', '.claude/agents']) {
    if (existsSync(join(ctx.home, rel))) p.push(`${rel} is in the sandbox home`);
  }
  if (filesUnder(join(ctx.home, '.claude', 'projects')).length) p.push('.claude/projects holds a history');
  for (const s of strays(ctx.home)) p.push(`${s.replace(/\\/g, '/')} is in the sandbox home`);
  return p;
}

/** The files that make up a condition, and where each comes from. */
function conditionFiles(ctx, condition, task) {
  if (condition === 'B') return [{ rel: '.claude/CLAUDE.md', from: join(TASKS, 'conditions', `history-${task.user}.md`) }];
  if (condition === 'D') return [{ rel: '.claude/CLAUDE.md', from: join(TASKS, 'conditions', `facts-${task.id}.md`) }];
  if (condition === 'C') return C_PATHS.map((rel) => ({ rel, from: join(ctx.brains, task.user, 'home', rel) }));
  return [];
}

const DAY = 86_400_000;

/**
 * Why a condition cannot run now, if it cannot. C needs its user's brain, built
 * and synced to the end within the last 7 days: from 7 days, or with anything
 * left unfiled, exposurie's own status line asks the agent to sync.
 */
function setupProblems(ctx, condition, task) {
  const missing = conditionFiles(ctx, condition, task).filter((f) => !existsSync(f.from));
  if (missing.length) {
    return condition === 'C'
      ? [`no brain for the ${task.user}: build it, then run keep-brain ${task.user}`]
      : [`${missing[0].from} is missing; run node tasks/conditions.mjs`];
  }
  if (condition !== 'C') return [];
  let state;
  try {
    state = readJson(join(ctx.brains, task.user, 'home', 'brain', '.exposurie', 'state.json'));
  } catch {
    return [`the ${task.user}'s brain has no state file, so it was never synced`];
  }
  const last = Date.parse(state.lastSyncUtc ?? '');
  if (!last) return [`the ${task.user}'s brain was never synced`];
  const days = Math.floor((Date.now() - last) / DAY);
  if (days >= 7) return [`the ${task.user}'s brain was last synced ${days} days ago; exposurie asks for a sync from 7`];
  if ((state.unfiled ?? 0) > 0) return [`the ${task.user}'s brain has ${state.unfiled} conversations not filed yet`];
  return [];
}

/** Put a run's condition in the home. The marker goes first, so a stop part-way can be undone. */
function place(ctx, run, condition, task) {
  const items = conditionFiles(ctx, condition, task);
  writeFileSync(ctx.placed, JSON.stringify({ run, paths: items.map((i) => i.rel) }, null, 2) + '\n');
  return items.map((i) => {
    const to = join(ctx.home, i.rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(i.from, to, { recursive: true, preserveTimestamps: true });
    return { rel: i.rel, sha256: hashPath(to) };
  });
}

const PLACEABLE = new Set(['.claude/CLAUDE.md', ...C_PATHS]);

/** Take a condition back out of the home: only what the marker lists, and only paths a condition uses. */
function unplace(ctx) {
  if (!existsSync(ctx.placed)) return false;
  const { paths } = readJson(ctx.placed);
  for (const rel of paths) {
    if (!PLACEABLE.has(rel)) fail(`${ctx.placed} lists ${rel}, which no condition places; nothing was removed`);
  }
  for (const rel of paths) rmSync(join(ctx.home, rel), { recursive: true, force: true });
  for (const rel of ['.claude/skills', '.claude/commands']) {
    const d = join(ctx.home, rel);
    if (existsSync(d) && !readdirSync(d).length) rmdirSync(d);
  }
  rmSync(ctx.placed);
  return true;
}

/**
 * Claude Code loads CLAUDE.md from every folder above the one it runs in, and
 * it ships a built-in plugin for AGENTS.md. A file like that above the runs
 * would reach every run in every condition, so none may be there.
 */
export function aboveProblems(dir) {
  const found = [];
  for (let d = resolve(dir); ; d = dirname(d)) {
    for (const n of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.claude']) {
      if (existsSync(join(d, n))) found.push(`${join(d, n)} would reach every run`);
    }
    if (dirname(d) === d) return found;
  }
}

/** A runner stopped part-way may have left a condition in the home. */
export function recover(ctx) {
  if (unplace(ctx)) console.log('A run that stopped part-way had left its condition in the sandbox home. It has been taken out.');
}

/**
 * What a run did to the home, checked before its condition is taken out. A
 * transcript it wrote is moved into its own folder, so the home is clean for
 * the next run and the evidence is kept.
 */
function homeAfterRun(ctx, placed, dir, strayBefore) {
  const problems = [];
  const left = strays(ctx.home).map((s) => s.replace(/\\/g, '/')).filter((s) => !strayBefore.includes(s) && !placed.some((p) => p.rel === s));
  if (left.length) problems.push(`the run left ${left.join(', ')} in the sandbox home`);
  for (const p of placed) {
    const at = join(ctx.home, p.rel);
    if (!existsSync(at) || hashPath(at) !== p.sha256) problems.push(`the run changed ${p.rel}, part of its condition`);
  }
  const projects = join(ctx.home, '.claude', 'projects');
  if (filesUnder(projects).length) {
    mkdirSync(join(dir, 'leaked'), { recursive: true });
    renameSync(projects, join(dir, 'leaked', 'projects'));
    problems.push('the run wrote a transcript, so session persistence was on (moved to leaked/)');
  }
  for (const rel of ['.claude/skills', '.claude/commands', '.claude/agents']) {
    const d = join(ctx.home, rel);
    if (!existsSync(d)) continue;
    const extra = readdirSync(d).map((n) => `${rel}/${n}`).filter((p) => !placed.some((x) => x.rel === p));
    if (extra.length) problems.push(`the run added ${extra.join(', ')}`);
  }
  return problems;
}

// ---------------------------------------------------------------- one run

/** Claude Code's arguments for a run: the same in every condition. */
export const runArgs = (ask) => [
  '-p', ask,
  '--model', PINS.model,
  '--output-format', 'stream-json', '--verbose',
  '--strict-mcp-config',
  '--tools', TOOLS.join(','),
  '--allowedTools', ALLOWED,
  '--permission-mode', PERMISSION_MODE,
  '--no-session-persistence',
];

const samePath = (a, b) => resolve(String(a)).toLowerCase() === resolve(String(b)).toLowerCase();

/** Why a run's start-up line rules it out, if it does. */
export function startupProblems(init, condition, work) {
  const p = [];
  const want = (what, ok, seen) => {
    if (!ok) p.push(`${what}: ${seen}`);
  };
  const tools = [...(init.tools ?? [])].sort();
  want('Claude Code version', init.claude_code_version === PINS.claudeCode, init.claude_code_version);
  want('model', String(init.model).startsWith(PINS.model), init.model);
  want('plan login, no API key', init.apiKeySource === 'none', init.apiKeySource);
  want('no MCP servers', (init.mcp_servers ?? []).length === 0, JSON.stringify(init.mcp_servers));
  want('only the listed tools', JSON.stringify(tools) === JSON.stringify(TOOLS), tools.join(', '));
  want('no plugins but the built-in ones', (init.plugins ?? []).every((x) => x.path === 'builtin'), (init.plugins ?? []).map((x) => x.name).join(', '));
  want('ran in its own folder', samePath(init.cwd, work), init.cwd);
  want('permission mode', init.permissionMode === PERMISSION_MODE, init.permissionMode);
  if (condition !== 'C') {
    const leaked = [...(init.skills ?? []), ...(init.slash_commands ?? [])].filter((n) => /exposurie/i.test(n));
    want('nothing of exposurie outside C', leaked.length === 0, leaked.join(', '));
  }
  return p;
}

function killTree(pid) {
  spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
    stdio: 'ignore', windowsHide: true,
  });
}

/**
 * Start Claude Code and collect its output. The start-up line is checked as
 * soon as it arrives, and a wrong one stops the run before it spends anything.
 */
function launch(ctx, condition, task, work) {
  return new Promise((done) => {
    const [cmd, ...pre] = ctx.claude;
    const child = spawn(cmd, [...pre, ...runArgs(task.ask)], {
      cwd: work, env: envFor(ctx, condition), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const r = { lines: [], stderr: '', exit: null, init: null, refused: null, timedOut: false };
    let buf = '';
    const timer = setTimeout(() => {
      r.timedOut = true;
      killTree(child.pid);
    }, ctx.timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        r.lines.push(line);
        if (r.init) continue;
        const m = parseLine(line);
        if (m?.type === 'system' && m.subtype === 'init') {
          r.init = m;
          const p = startupProblems(m, condition, work);
          if (p.length) {
            r.refused = p;
            killTree(child.pid);
          }
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => {
      r.stderr += d;
    });
    child.on('error', (e) => {
      r.stderr += `\n${e.message}`;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buf) r.lines.push(buf);
      r.exit = code;
      done(r);
    });
  });
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Every message of a saved run, in order. */
export const readStream = (file) => readFileSync(file, 'utf8').split('\n').map(parseLine).filter(Boolean);

const firstLine = (s) => String(s ?? '').trim().split('\n')[0].slice(0, 200);
const isLimit = (r) => r.api_error === 'usage_limit_reached' || /hit your [\w\s-]*limit/i.test(String(r.result ?? ''));
const span = (ms) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`);
const withStderr = (what, stderr) => (firstLine(stderr) ? `${what}: ${firstLine(stderr)}` : what);

/** done, not-run or thrown-out, from how the process ended. The checks after a run come on top. */
function outcome(l, result, ctx) {
  if (l.refused) return { status: 'thrown-out', reason: `start-up line: ${l.refused.join('; ')}` };
  if (l.timedOut) return { status: 'not-run', reason: `no result within ${span(ctx.timeoutMs)}` };
  if (!l.init) return { status: 'not-run', reason: withStderr(`no start-up line (exit ${l.exit})`, l.stderr) };
  if (!result) return { status: 'not-run', reason: withStderr(`no result line (exit ${l.exit})`, l.stderr) };
  if (!result.is_error) return { status: 'done' };
  if (isLimit(result)) return { status: 'not-run', reason: `usage limit: ${firstLine(result.result)}`, limit: true };
  const what = result.api_error ?? result.terminal_reason ?? result.subtype ?? 'error';
  return {
    status: 'not-run',
    reason: `${what}${result.api_error_status ? ` (${result.api_error_status})` : ''}: ${firstLine(result.result)}`,
    apiError: result.terminal_reason === 'api_error',
  };
}

// ---------------------------------------------------------------- the audit

/** A path a tool call names, as an absolute path. `/e/x` is Git Bash's E:\x, and `~` is the home. */
function toPath(p, work, home) {
  let s = String(p).trim();
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) s = join(home, s.slice(1));
  const msys = /^\/([A-Za-z])(?:\/|$)/.exec(s);
  if (msys) s = `${msys[1]}:\\${s.slice(3)}`;
  else if (/^[/\\](?![/\\])/.test(s)) s = join(parse(work).root, s.slice(1));
  return resolve(work, s);
}

const isAbsolute = (p) => /^(?:[A-Za-z]:[\\/]|[/\\]|~)/.test(p);
/** The folders a glob pattern starts from: everything before its first wildcard. */
const globRoot = (pattern) => pattern.split(/[*?[{]/)[0] || '.';

/** The paths a file tool call reaches. */
function pathsOf(call, work, home) {
  const i = call.input ?? {};
  if (['Read', 'Write', 'Edit'].includes(call.name)) return i.file_path ? [toPath(i.file_path, work, home)] : [];
  const root = i.path ? toPath(i.path, work, home) : work;
  if (call.name === 'Glob') {
    const pattern = String(i.pattern ?? '');
    return [isAbsolute(pattern) ? toPath(globRoot(pattern), work, home) : resolve(root, globRoot(pattern))];
  }
  if (call.name === 'Grep') return [root];
  return [];
}

const inside = (p, root) => {
  const a = resolve(p).toLowerCase();
  const r = resolve(root).toLowerCase();
  return a === r || a.startsWith(r.endsWith(sep) ? r : r + sep);
};

/** A shell command, split where it chains or pipes into another one, outside quotes. `2>&1` stays whole. */
function commands(cmd) {
  const s = String(cmd ?? '');
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ';' || c === '\n' || c === '|' || (c === '&' && s[i + 1] === '&')) {
      out.push(cur);
      cur = '';
      if ((c === '|' || c === '&') && s[i + 1] === c) i += 1;
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const EXPOSURIE_CMD = /^exposurie(?:\s|$)/;
const EXPOSURIE_READ = /^exposurie\s+read\b/;

/**
 * Every tool call of a run, held to its folder. A call that was denied reached
 * nothing, so it is only noted. `looked` is whether the agent ran
 * `exposurie read` at all, and `reads` how often.
 */
export function audit(msgs, { work, home, condition }) {
  const allowed = [work, ...(condition === 'C' ? [join(home, 'brain'), join(home, '.exposurie')] : [])];
  const result = msgs.findLast((m) => m.type === 'result');
  const denied = new Set((result?.permission_denials ?? []).map((d) => d.tool_use_id));
  const calls = new Map();
  for (const m of msgs) {
    if (m.type !== 'assistant') continue;
    for (const b of m.message?.content ?? []) if (b.type === 'tool_use') calls.set(b.id, b);
  }
  const problems = [];
  const notes = [];
  let reads = 0;
  for (const c of calls.values()) {
    // A denied call reached nothing, so it is a note; one that went through is a problem.
    const flag = (what) => (denied.has(c.id) ? notes.push(`tried to ${what} (denied)`) : problems.push(what));
    if (!TOOLS.includes(c.name)) {
      flag(`use ${c.name}, which is not in the tool list`);
      continue;
    }
    if (c.name === 'Bash') {
      const parts = commands(c.input?.command);
      const other = parts.filter((s) => !EXPOSURIE_CMD.test(s));
      if (other.length) flag(`run a shell command other than exposurie: ${other[0].slice(0, 100)}`);
      reads += parts.filter((s) => EXPOSURIE_READ.test(s)).length;
      continue;
    }
    for (const p of pathsOf(c, work, home)) {
      if (!allowed.some((a) => inside(p, a))) flag(`reach outside its folder: ${c.name} ${p}`);
    }
  }
  return { calls: calls.size, denied: denied.size, problems, notes, looked: reads > 0, reads };
}

// ---------------------------------------------------------------- tokens

/**
 * Every token a run cost, per model and in all. Claude Code can call a smaller
 * model alongside the pinned one, and those tokens count too. `all_input` is
 * every input token, cached or not: the method's primary number.
 */
export function tokensOf(result) {
  const by = {};
  for (const [model, u] of Object.entries(result?.modelUsage ?? {})) {
    by[model] = { input: u.inputTokens ?? 0, cache_write: u.cacheCreationInputTokens ?? 0, cache_read: u.cacheReadInputTokens ?? 0, output: u.outputTokens ?? 0 };
  }
  if (!Object.keys(by).length && result?.usage) {
    const u = result.usage;
    by[PINS.model] = { input: u.input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
  }
  const sum = (k) => Object.values(by).reduce((n, u) => n + u[k], 0);
  const t = { input: sum('input'), cache_write: sum('cache_write'), cache_read: sum('cache_read'), output: sum('output') };
  return { ...t, all_input: t.input + t.cache_write + t.cache_read, by_model: by };
}

// ---------------------------------------------------------------- running a batch

async function runCell(ctx, b, cell, versions) {
  const task = allTasks().find((t) => t.id === cell.task);
  const dir = join(ctx.runs, b.batch, cell.run);
  keepEarlier(dir);
  const work = join(dir, task.folder);
  mkdirSync(work, { recursive: true });
  const starter = task.starter ? join(TASKS, task.starter) : null;
  if (starter) cpSync(starter, work, { recursive: true });
  const record = { run: cell.run, task: task.id, started: new Date().toISOString() };
  const save = (r) => {
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ ...record, ...r, finished: new Date().toISOString() }, null, 2) + '\n');
    return r;
  };

  const setup = setupProblems(ctx, cell.condition, task);
  if (setup.length) return save({ status: 'not-run', reason: setup.join('; ') });

  const placed = place(ctx, cell.run, cell.condition, task);
  cell.input = placed.map(({ rel, sha256: h }) => ({ file: rel, sha256: h }));
  saveBatch(ctx, b);
  const strayBefore = strays(ctx.home).map((s) => s.replace(/\\/g, '/'));
  let l;
  let home;
  try {
    l = await launch(ctx, cell.condition, task, work);
    home = homeAfterRun(ctx, placed, dir, strayBefore);
  } finally {
    unplace(ctx);
  }

  writeFileSync(join(dir, 'stream.jsonl'), l.lines.join('\n') + '\n');
  writeFileSync(join(dir, 'stderr.txt'), l.stderr);
  const msgs = l.lines.map(parseLine).filter(Boolean);
  const result = msgs.findLast((m) => m.type === 'result');
  const o = outcome(l, result, ctx);
  const a = audit(msgs, { work, home: ctx.home, condition: cell.condition });
  const limits = msgs.filter((m) => m.type === 'rate_limit_event').at(-1)?.rate_limit_info?.unifiedWindows;

  const files = changedFiles(work, starter);
  for (const f of files.filter((x) => x.change !== 'deleted')) {
    const buf = readFileSync(join(work, f.path));
    f.bytes = buf.length;
    f.text = isText(buf);
    mkdirSync(dirname(join(dir, 'files', f.path)), { recursive: true });
    writeFileSync(join(dir, 'files', f.path), buf);
  }
  writeFileSync(join(dir, 'files.json'), JSON.stringify(files, null, 2) + '\n');
  writeFileSync(join(dir, 'answer.md'), typeof result?.result === 'string' && !result.is_error ? result.result : '');

  const problems = [...a.problems, ...home];
  const thrown = o.status === 'done' && problems.length;
  const after = neutralProblems(ctx);
  save({
    status: thrown ? 'thrown-out' : o.status,
    reason: thrown ? problems.join('; ') : o.reason ?? null,
    notes: [...a.notes, ...(thrown ? [] : problems)],
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
    files: files.length,
  });
  const status = thrown ? 'thrown-out' : o.status;
  let stop = null;
  if (o.limit) stop = `The plan's usage limit stopped ${cell.run} (${firstLine(result.result)}). Run the same command again once it resets: it carries on from here.`;
  if (after.length) stop = `After ${cell.run} the sandbox home is not as runs leave it, so nothing more runs until it is:\n  ${after.join('\n  ')}`;
  return { status, reason: thrown ? problems.join('; ') : o.reason, stop, apiError: !!o.apiError };
}

/** The versions every run records. exposurie prints its state line first, so the version is found by its shape. */
function versionsOf(ctx) {
  const env = sandboxEnv({ home: ctx.home });
  const out = (cmd, args) => {
    const r = spawnSync(cmd, args, { env, cwd: ctx.runs, encoding: 'utf8', windowsHide: true });
    const text = String(r.stdout || r.stderr || '').trim();
    return /\b\d+\.\d+\.\d+\b/.exec(text)?.[0] ?? text.split('\n')[0];
  };
  const [cmd, ...pre] = ctx.claude;
  return { claude_code: out(cmd, [...pre, '--version']), exposurie: out(process.execPath, [EXPOSURIE, '--version']), node: process.version.slice(1) };
}

/** Run everything in a batch that has not run yet, in its order. */
export async function go(ctx, batch, { again = [] } = {}) {
  const release = lockSandbox(ctx.lock);
  try {
    recover(ctx);
    const before = neutralProblems(ctx);
    if (before.length) fail(`the sandbox home is not as runs leave it, so nothing runs until it is:\n  ${before.join('\n  ')}`);
    const b = readBatch(ctx, batch);
    for (const r of again) if (!b.cells.some((c) => c.run === r)) fail(`${batch} has no run ${r}`);
    const above = aboveProblems(join(ctx.runs, batch));
    if (above.length) fail(`nothing runs while instructions sit above the runs:\n  ${above.join('\n  ')}`);
    const versions = versionsOf(ctx);
    if (!versions.claude_code.startsWith(PINS.claudeCode)) fail(`Claude Code is ${versions.claude_code}, pinned ${PINS.claudeCode}`);
    let apiErrors = 0;
    for (const cell of b.cells) {
      const prev = readRun(join(ctx.runs, batch, cell.run));
      if (prev && prev.status !== 'not-run' && !again.includes(cell.run)) continue;
      const r = await runCell(ctx, b, cell, versions);
      console.log(`${cell.run}  ${cell.task.padEnd(12)} ${cell.condition}  ${r.status}${r.reason ? `: ${r.reason}` : ''}`);
      apiErrors = r.apiError ? apiErrors + 1 : 0;
      if (r.stop) {
        console.log(`\n${r.stop}`);
        return false;
      }
      if (apiErrors === 3) {
        console.log('\nThree API errors in a row, so the batch stops here. Run the same command again later.');
        return false;
      }
    }
    return true;
  } finally {
    release();
  }
}

/** Where a batch stands. */
export function status(ctx, batch) {
  const b = readBatch(ctx, batch);
  const counts = {};
  const open = [];
  for (const cell of b.cells) {
    const r = readRun(join(ctx.runs, batch, cell.run));
    const s = r?.status ?? 'waiting';
    counts[s] = (counts[s] ?? 0) + 1;
    if (r && r.status !== 'done') open.push(`${cell.run}  ${cell.task} ${cell.condition}  ${r.status}: ${r.reason}`);
  }
  console.log(`${batch}: ${b.cells.length} runs. ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  for (const line of open) console.log(`  ${line}`);
  return counts;
}

// ---------------------------------------------------------------- after a brain build

function move(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

/**
 * After a user's brain build: move what exposurie wrote into the sandbox home
 * out to brains/<user>/home/, and the raw history to brains/<user>/history/.
 * C's runs copy the first back in; nothing ever brings back the second.
 */
export function keepBrain(ctx, user) {
  if (!USERS.includes(user)) fail(`no user ${user}`);
  const kit = join(ctx.brains, user);
  if (existsSync(kit)) fail(`${kit} already holds a brain; nothing was moved`);
  if (existsSync(ctx.placed)) fail(`a run's condition is in place (${ctx.placed}); nothing was moved`);
  let config;
  try {
    config = readJson(join(ctx.home, '.exposurie', 'config.json'));
  } catch {
    return fail("exposurie's config is not in the sandbox home; build the brain first");
  }
  if (!samePath(config.vault, join(ctx.home, 'brain'))) fail(`exposurie's brain is at ${config.vault}, not ${join(ctx.home, 'brain')}`);
  const missing = C_PATHS.filter((rel) => !existsSync(join(ctx.home, rel)));
  if (missing.length) fail(`not in the sandbox home: ${missing.join(', ')}`);
  const md = readFileSync(join(ctx.home, '.claude', 'CLAUDE.md'), 'utf8').trim();
  if (!md.startsWith('<!-- exposurie:start -->') || !md.endsWith('<!-- exposurie:end -->')) {
    fail("~/.claude/CLAUDE.md holds more than exposurie's pointer; nothing was moved");
  }
  for (const rel of C_PATHS) move(join(ctx.home, rel), join(kit, 'home', rel));
  for (const rel of HISTORY_PATHS) if (existsSync(join(ctx.home, rel))) move(join(ctx.home, rel), join(kit, 'history', rel));
  for (const rel of ['.claude/skills', '.claude/commands']) {
    const d = join(ctx.home, rel);
    if (existsSync(d) && !readdirSync(d).length) rmdirSync(d);
  }
  console.log(`The ${user}'s brain and exposurie's files are in ${join(kit, 'home')}, and the raw history in ${join(kit, 'history')}.`);
  const left = neutralProblems(ctx);
  if (left.length) fail(`the sandbox home still holds:\n  ${left.join('\n  ')}`);
}

// ---------------------------------------------------------------- command line

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  ownNodeOnly();
  const [cmd, name, ...rest] = process.argv.slice(2);
  const flag = (f) => {
    const i = rest.indexOf(f);
    return i >= 0 ? String(rest[i + 1] ?? '').split(',').filter(Boolean) : null;
  };
  const ctx = sandboxContext();
  try {
    if (cmd === 'plan') {
      const b = plan(ctx, name, {
        users: flag('--users') ?? USERS, tasks: flag('--tasks'), conditions: flag('--conditions') ?? CONDITIONS, seed: flag('--seed')?.[0] ?? name,
      });
      console.log(`${b.batch}: ${b.cells.length} runs planned, in ${join(ctx.runs, b.batch)}`);
    } else if (cmd === 'go') {
      process.exitCode = (await go(ctx, name, { again: flag('--again') ?? [] })) ? 0 : 1;
      status(ctx, name);
    } else if (cmd === 'status') {
      status(ctx, name);
    } else if (cmd === 'keep-brain') {
      keepBrain(ctx, name);
    } else {
      fail('usage: node runner/run.mjs plan <batch> [--users] [--tasks] [--conditions] [--seed] | go <batch> [--again] | status <batch> | keep-brain <user>');
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`run: ${e.message}`);
    process.exitCode = 1;
  }
}
