// Area 9 (part 8): the long sessions. Each long task is one session of the
// developer's, filled to half of Sonnet 5.5's 1,000,000-token window, then
// carried on three ways from that same point.
//
//   node runner/long.mjs <task> [--accept "<why>"]   fill, fork, then each strategy; spends plan usage
//   node runner/long.mjs status <task>
//   node runner/long.mjs probe                       the same on a tiny task, to see what only real runs show
//
// The developer works the way they always do: one step at a time, in one
// session, in their own repository. The steps are written down in the task's
// steps file (tasks/long/<task>.json): the core of the work, more of the same
// project's work, and the steps that finish it. Each step is one headless
// Claude Code call in the same session, `--session-id` for the first and
// `--resume` after it, with the session saved, which every other area turns
// off. After each step the runner reads how big the session's context has
// grown: the prompt of its last call to the model. Once the core steps are done
// and it has reached the task's mark (500,000 tokens), the session stops there,
// at a step boundary, as a person stops when they see it. That is the fork.
//
// From the fork come three strategies, one after another, each starting from
// the same repository and the same saved session:
//
//   keep      carry on in the same session (--resume <fill> --fork-session)
//   compact   /compact first, the same way, then carry on in what it leaves
//   sync      a separate session types /exposurie-sync in the brain's folder,
//             with only the long session's transcript in the history folder,
//             once that transcript has been still for five minutes: exposurie
//             1.2.0 leaves anything newer for the next sync. Then a fresh
//             session carries on, with the brain that sync filed into.
//
// Every strategy gets the same steps after the fork. The fresh session's first
// one opens with the task's note that it picks up from the last session.
//
// Auto-compact is off in every process here, so only the compact strategy
// compacts, and only when asked to; a compaction anywhere else stops the run.
// Every step is checked like a run of condition C: its start-up line, every
// tool call, the shell, the condition unchanged. What a step writes into the
// sandbox home's history folder (the saved session) is moved into the run's
// folder after it and put back before the next step, so between steps the home
// holds nothing of it. A step that does not finish puts the repository and the
// session back as they were before it, and runs again next time.
//
// Run it with the sandbox's own Node.

import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, TOOLS, lockSandbox, ownNodeOnly, strays } from './sandbox.mjs';
import {
  ALLOWED, BUILD_ASK, C_PATHS, PERMISSION_MODE, Stop, TASKS, aboveProblems, allTasks, audit, brainState,
  buildStartupProblems, changedFiles, envFor, exposurieCommands, filed, filesUnder, hashPath, isText, keepEarlier,
  launch, move, neutralProblems, outcome, pagesIn, parseLine, placeItems, readJson, readStream, recover, runArgs,
  sandboxContext, startupProblems, sumTokens, tokensOf, unplace, versionsOf,
} from './run.mjs';

export const LONG_AREA = 9;
export const STRATEGIES = ['keep', 'compact', 'sync'];
const BATCH = 'area-9';
const COMPACT_ASK = '/compact';
/** exposurie 1.2.0 leaves a transcript written in the last five minutes for the next sync (src/extract/live.js). */
export const IN_FLIGHT_MS = 5 * 60 * 1000;
/** Auto-compact off in every process here, so only the compact strategy compacts, and only when asked. */
export const LONG_ENV = { DISABLE_AUTO_COMPACT: '1' };
/** A step that ends without a result this often waits for a person. */
const MAX_TRIES = 3;

const fail = (msg) => {
  throw new Stop(msg);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const now = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- the tasks

export const longTasks = () => allTasks().filter((t) => t.area === LONG_AREA);

/** A long task with its steps file: core, more and after steps, the mark, and its checks. */
export function longTask(id) {
  const t = longTasks().find((x) => x.id === id);
  if (!t) fail(`no long task ${id}; the long tasks are ${longTasks().map((x) => x.id).join(', ')}`);
  if (!t.steps) fail(`${id} has no steps file yet`);
  const file = join(TASKS, t.steps);
  return { ...t, ...readJson(file), material: join(dirname(file), t.id) };
}

const asStep = (s) => (typeof s === 'string' ? { say: s } : s);

/** The steps of one phase, in order. Strategies all get the same steps after the fork. */
export function stepsFor(task, phase) {
  if (phase === 'fill') {
    return [
      ...task.core.map((s, index) => ({ kind: 'core', index, ...asStep(s) })),
      ...(task.more ?? []).map((s, index) => ({ kind: 'more', index, ...asStep(s) })),
    ];
  }
  const after = task.after.map((s, index) => ({ kind: 'after', index, ...asStep(s) }));
  if (phase === 'compact') return [{ kind: 'compact', index: 0, say: COMPACT_ASK }, ...after];
  if (phase === 'sync') return after.map((s, i) => (i === 0 ? { ...s, say: `${task.resume_note}\n\n${s.say}` } : s));
  return after;
}

/** A step's folder name: compact's own step is 00, everything else counts from 01. */
const stepName = (phase, n) => pad(phase === 'compact' ? n : n + 1);

// ---------------------------------------------------------------- one call

/** Claude Code's arguments for a step: a run's, with the session saved and named. */
export const longArgs = (ask, { session = null, resume = null, fork = false } = {}) => [
  '-p', ask,
  '--model', PINS.model,
  '--output-format', 'stream-json', '--verbose',
  '--strict-mcp-config',
  '--tools', TOOLS.join(','),
  '--allowedTools', ALLOWED,
  '--permission-mode', PERMISSION_MODE,
  ...(resume ? ['--resume', resume] : []),
  ...(fork ? ['--fork-session'] : []),
  ...(session ? ['--session-id', session] : []),
];

/** Which session a step starts or carries on: the fill and the fresh session start their own; keep and compact fork the fill's. */
export function sessionArgs(L, phase, n) {
  const id = L.sessions[phase];
  if (phase === 'fill' || phase === 'sync') return n === 0 ? { session: id } : { resume: id };
  return n === 0 ? { resume: L.sessions.fill, fork: true, session: id } : { resume: id };
}

/** How big the session's context is after a step: the prompt of its last call to the pinned model. */
export function contextOf(msgs) {
  const calls = msgs.filter((m) => m.type === 'assistant' && String(m.message?.model ?? '').startsWith(PINS.model) && m.message?.usage);
  const u = calls.at(-1)?.message.usage;
  return u ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : null;
}

/**
 * A step's own tokens. Claude Code counts a resumed or forked session's usage
 * from the session's start: a result's modelUsage and total_cost_usd carry the
 * totals of the session it carried on, across --fork-session and /compact (seen
 * in the probe), while its usage is the process's own. So a step's share is the
 * totals after it less the totals it carried in. Totals that come out smaller
 * than what was carried in were not carried, and stand as they are.
 */
export function ownTokens(total, carried) {
  if (!carried) return total;
  const by = {};
  for (const [m, u] of Object.entries(total.by_model)) {
    const c = carried.by_model?.[m] ?? {};
    by[m] = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v - (c[k] ?? 0)]));
  }
  const carriedOn = Object.keys(carried.by_model ?? {}).every((m) => by[m]) && Object.values(by).every((u) => Object.values(u).every((v) => v >= 0));
  if (!carriedOn) return total;
  const sum = (k) => Object.values(by).reduce((n, u) => n + u[k], 0);
  const t = { input: sum('input'), cache_write: sum('cache_write'), cache_read: sum('cache_read'), output: sum('output') };
  return { ...t, all_input: t.input + t.cache_write + t.cache_read, by_model: by };
}

/**
 * The pinned model's usage over a step's own calls, each once: Claude Code
 * prints a line per content block, each with its call's usage. Its input
 * counts are exact; its output count is as of when the line was printed, so
 * lower than the call's own (seen in the probe).
 */
export function callTokens(msgs) {
  const calls = new Map();
  for (const m of msgs) {
    if (m.type === 'assistant' && m.message?.usage && String(m.message.model ?? '').startsWith(PINS.model)) calls.set(m.message.id, m.message.usage);
  }
  const t = { input: 0, cache_write: 0, cache_read: 0, output: 0 };
  for (const u of calls.values()) {
    t.input += u.input_tokens ?? 0;
    t.cache_write += u.cache_creation_input_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
  }
  return { ...t, all_input: t.input + t.cache_write + t.cache_read, calls: calls.size };
}

/** Every compaction a stream shows: Claude Code's boundary markers, and the API clearing old tool results. */
export function compactionsIn(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m.type === 'system' && /compact_boundary$/.test(String(m.subtype ?? ''))) {
      out.push({ kind: m.subtype, meta: m.compact_metadata ?? m.compactMetadata ?? null });
    }
    const edits = m.type === 'assistant' ? m.message?.context_management?.applied_edits ?? [] : [];
    if (edits.length) out.push({ kind: 'context_management', meta: edits });
  }
  return out;
}

/** A shell command that writes into a file: a redirect, `tee`, or `sed -i`. */
const SHELL_WRITE = /(?:^|[^0-9&<>-])>>?(?![&>])|\btee\b|\bsed\s+(?:-\w*\s+)*-i/;

/**
 * What the agent wrote, as `{ tool, path, text, denied }`, paths relative to
 * its folder: the text of every Write and Edit, and every shell command that
 * writes into a file. Claude Code lets those run by themselves inside the
 * folder when edits are accepted (seen in the probe), so `printf ... >> x`
 * writes as surely as Edit does. A denied call counts too: it is still an
 * attempt.
 */
export function writesIn(msgs, work) {
  const result = msgs.findLast((m) => m.type === 'result');
  const denied = new Set((result?.permission_denials ?? []).map((d) => d.tool_use_id));
  const out = [];
  for (const m of msgs) {
    if (m.type !== 'assistant') continue;
    for (const b of m.message?.content ?? []) {
      if (b.type !== 'tool_use') continue;
      if (b.name === 'Bash') {
        const command = String(b.input?.command ?? '');
        if (SHELL_WRITE.test(command)) out.push({ tool: 'Bash', path: null, text: command, denied: denied.has(b.id) });
        continue;
      }
      if (!['Write', 'Edit'].includes(b.name)) continue;
      const path = relative(work, resolve(work, String(b.input?.file_path ?? ''))).split(sep).join('/');
      out.push({ tool: b.name, path, text: String((b.name === 'Write' ? b.input?.content : b.input?.new_string) ?? ''), denied: denied.has(b.id) });
    }
  }
  return out;
}

/** Why a step's start-up line rules it out: a C run's checks, the session it was told to use, and /compact for the compact step. */
function longStartupProblems(init, work, session, kind) {
  const p = startupProblems(init, 'C', work);
  if (session && init.session_id !== session) p.push(`session ${init.session_id}, not ${session}`);
  if (kind === 'compact' && !(init.slash_commands ?? []).includes('compact')) p.push('no /compact among the slash commands');
  return p;
}

// ---------------------------------------------------------------- the home

const projectsDir = (ctx) => join(ctx.home, '.claude', 'projects');
const sessionMarker = (ctx) => join(dirname(ctx.placed), 'placed-session.json');
const kitItems = (from) => C_PATHS.map((rel) => ({ rel, from: join(from, rel) }));
const originalKit = (ctx, user) => join(ctx.brains, user, 'home');

/** Claude Code's own files in its config folder, which it rewrites by itself on any run. */
const OWN_CONFIG = /^(?:\.claude\.json|\.credentials\.json|settings\.json|\.last-cleanup|history\.jsonl|(?:backups|cache|plugins|statsig)\/)/;

/** The files of the config folder that are neither the condition, nor the history folder, nor Claude Code's own. */
const configFiles = (ctx) => filesUnder(join(ctx.home, '.claude'))
  .filter((f) => !f.startsWith('projects/') && !OWN_CONFIG.test(f) && !C_PATHS.some((rel) => `.claude/${f}`.startsWith(rel)));

/** Put a saved session back where Claude Code wrote it. The marker goes first, so a stop part-way can be undone. */
function placeSession(ctx, dir, from) {
  writeFileSync(sessionMarker(ctx), JSON.stringify({ run: dir, from }, null, 2) + '\n');
  if (existsSync(from)) cpSync(from, projectsDir(ctx), { recursive: true, preserveTimestamps: true });
}

/** Move the whole history folder out of the home into `to` (replacing it), and drop the marker. */
function takeSession(ctx, to) {
  if (existsSync(projectsDir(ctx))) {
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    renameSync(projectsDir(ctx), to);
  }
  rmSync(sessionMarker(ctx), { force: true });
}

/** A runner stopped part-way may have left a session in the home: it goes into its run's folder, kept. */
function recoverSession(ctx) {
  if (!existsSync(sessionMarker(ctx))) return;
  const { run } = readJson(sessionMarker(ctx));
  takeSession(ctx, join(run, `recovered-${now().replace(/[:.]/g, '-')}`));
  console.log(`A step that stopped part-way had left its session in the sandbox home. It is kept in ${run}.`);
}

/** Copy a folder over another, replacing it. */
function restore(from, to) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(from, { recursive: true });
  cpSync(from, to, { recursive: true, preserveTimestamps: true });
}

/** What a step did to the home besides its session: the condition unchanged, nothing new outside the config folder. */
function homeAfterStep(ctx, placed, strayBefore, { except = [] } = {}) {
  const problems = [];
  const left = strays(ctx.home).map((s) => s.replace(/\\/g, '/')).filter((s) => !strayBefore.includes(s) && !placed.some((p) => p.rel === s));
  if (left.length) problems.push(`the step left ${left.join(', ')} in the sandbox home`);
  for (const p of placed) {
    if (except.includes(p.rel)) continue;
    const at = join(ctx.home, p.rel);
    if (!existsSync(at) || hashPath(at) !== p.sha256) problems.push(`the step changed ${p.rel}, part of its condition`);
  }
  return problems;
}

/** Files the step added to the config folder that are not its session, moved beside the step and noted. */
function moveExtras(ctx, before, sdir) {
  const extra = configFiles(ctx).filter((f) => !before.has(f));
  for (const f of extra) move(join(ctx.home, '.claude', f), join(sdir, 'left', f));
  return extra.length ? [`Claude Code wrote ${extra.length} more file(s) into its config folder, moved to left/: ${extra.slice(0, 5).join(', ')}`] : [];
}

/** Why a kit cannot serve a step: no brain, or one exposurie itself would ask to sync. */
function kitProblems(kit) {
  const st = brainState(join(kit, 'brain'));
  if (!st?.lastSyncUtc) return [`the brain in ${kit} was never synced`];
  const days = Math.floor((Date.now() - Date.parse(st.lastSyncUtc)) / 86_400_000);
  if (days >= 7) return [`the brain in ${kit} was last synced ${days} days ago; exposurie asks for a sync from 7`];
  if ((st.unfiled ?? 0) > 0) return [`the brain in ${kit} has ${st.unfiled} conversations not filed yet`];
  return [];
}

// ---------------------------------------------------------------- the record

const recordFile = (dir) => join(dir, 'long.json');
const saveRecord = (dir, L) => writeFileSync(recordFile(dir), JSON.stringify(L, null, 2) + '\n');

function startRecord(dir, task) {
  const L = {
    run: basename(dir),
    task: task.id,
    user: task.user,
    started: now(),
    fork_at: task.fork_at,
    // Named before anything runs, so a step that runs again uses the same session.
    sessions: Object.fromEntries(['fill', ...STRATEGIES].map((p) => [p, randomUUID()])),
    fill: { steps: [], forked: null },
    keep: { steps: [], finished: null },
    compact: { steps: [], finished: null },
    sync: { sync: [], steps: [], finished: null },
    stopped: null,
    accepted: [],
  };
  mkdirSync(join(dir, 'fill'), { recursive: true });
  restore(task.starterDir ?? join(dir, 'fill', 'empty-starter'), join(dir, 'fill', 'work'));
  rmSync(join(dir, 'fill', 'empty-starter'), { recursive: true, force: true });
  saveRecord(dir, L);
  return L;
}

/** The last attempt at step n of a phase, and whether it counts as done. */
const lastTry = (ph, n) => ph.steps.filter((r) => r.n === n).at(-1) ?? null;
const counts = (r) => !!r && (r.status === 'done' || !!r.accepted);
const tries = (ph, n) => ph.steps.filter((r) => r.n === n).length;

/** The step whose session a step carries on, which holds the totals it carries in: none for a fresh session, the fork's step for a strategy's first. */
function carriedFrom(L, phase, n) {
  if (n > 0) return lastTry(L[phase], n - 1);
  if (phase === 'keep' || phase === 'compact') return L.fill.steps.findLast((r) => r.step === L.fill.forked?.after && counts(r)) ?? null;
  return null;
}

/** The run folders of area 9: one per long task, numbered in the order of tasks/index.json. */
function runDir(ctx, task) {
  const file = join(ctx.runs, BATCH, 'batch.json');
  let b;
  if (existsSync(file)) b = readJson(file);
  else {
    b = { batch: BATCH, planned: now(), cells: longTasks().map((t, i) => ({ run: `r${String(i + 1).padStart(3, '0')}`, task: t.id })) };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(b, null, 2) + '\n');
  }
  const cell = b.cells.find((c) => c.task === task.id);
  if (!cell) fail(`${file} has no run for ${task.id}`);
  return join(ctx.runs, BATCH, cell.run);
}

// ---------------------------------------------------------------- one step

async function longStep(ctx, { dir, task, L, phase, n, step, kit, versions }) {
  const name = stepName(phase, n);
  const sdir = join(dir, phase, name);
  keepEarlier(sdir);
  mkdirSync(sdir, { recursive: true });
  const work = join(dir, task.folder);
  restore(join(dir, phase, 'work'), work);
  for (const [to, from] of Object.entries(step.files ?? {})) {
    mkdirSync(dirname(join(work, to)), { recursive: true });
    cpSync(join(task.material, from), join(work, to));
  }
  const started = now();
  const placed = placeItems(ctx, `${L.run}/${phase}/${name}`, kitItems(kit));
  const forking = n === 0 && (phase === 'keep' || phase === 'compact');
  placeSession(ctx, dir, join(dir, forking ? 'fork' : phase, 'session'));
  const configBefore = new Set(configFiles(ctx));
  const strayBefore = strays(ctx.home).map((s) => s.replace(/\\/g, '/'));
  const s = sessionArgs(L, phase, n);
  let l;
  let home;
  try {
    l = await launch(ctx, {
      args: longArgs(step.say, s), cwd: work, env: { ...envFor(ctx, 'C'), ...LONG_ENV }, timeoutMs: ctx.timeoutMs,
      startup: (m) => longStartupProblems(m, work, s.session ?? s.resume, step.kind),
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
  if (step.kind === 'compact') {
    if (o.status === 'done' && !(compactions.length === 1 && compactions[0].kind === 'compact_boundary')) {
      problems.push(`/compact left ${compactions.length} compaction(s): ${compactions.map((c) => c.kind).join(', ') || 'none'}`);
    }
  } else if (compactions.length) {
    problems.push(`the session compacted without being asked: ${compactions.map((c) => c.kind).join(', ')}`);
  }
  const notes = [...a.notes, ...moveExtras(ctx, configBefore, sdir)];
  const from = carriedFrom(L, phase, n);
  const session = tokensOf(result);
  const tokens = result ? ownTokens(session, from?.session_tokens) : session;
  const calls = callTokens(msgs);
  const pinned = tokens.by_model[PINS.model];
  if (result && step.kind !== 'compact' && pinned && ['input', 'cache_write', 'cache_read'].some((k) => pinned[k] !== calls[k])) {
    notes.push(`the step's input tokens (${pinned.input}, ${pinned.cache_write}, ${pinned.cache_read}) differ from its own calls' (${calls.input}, ${calls.cache_write}, ${calls.cache_read})`);
  }
  const sessionCost = result?.total_cost_usd ?? null;
  const carriedCost = from?.session_cost_usd ?? null;
  const thrown = o.status === 'done' && problems.length > 0;
  const ok = o.status === 'done' && !thrown;
  // A finished step's session is the phase's from now on; anything else stays beside the step.
  takeSession(ctx, ok ? join(dir, phase, 'session') : join(sdir, 'session'));
  if (ok) restore(work, join(dir, phase, 'work'));
  const limits = msgs.filter((m) => m.type === 'rate_limit_event').at(-1)?.rate_limit_info?.unifiedWindows;
  const rec = {
    n,
    step: name,
    kind: step.kind,
    index: step.index,
    started,
    finished: now(),
    status: thrown ? 'thrown-out' : o.status,
    reason: thrown ? problems.join('; ') : o.reason ?? null,
    problems,
    notes,
    session: s,
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
    compactions,
    tool_calls: a.calls,
    denied: a.denied,
    looked: a.looked,
    reads: a.reads,
    files_given: Object.keys(step.files ?? {}),
  };
  L[phase].steps.push(rec);
  saveRecord(dir, L);
  return { rec, limit: !!o.limit, apiError: !!o.apiError };
}

// ---------------------------------------------------------------- the sync, for the third strategy

/**
 * A separate session types /exposurie-sync in the brain's folder, as a brain
 * build does, with the long session's transcript as the only history in the
 * home. exposurie leaves a transcript written in the last five minutes for
 * the next sync, so this waits until the long session has been still that
 * long. The brain it leaves, with its staged batches moved out as keep-brain
 * moves them, is what the fresh session gets.
 */
async function syncSession(ctx, { dir, task, L, versions }) {
  const sdir = join(dir, 'sync', 'sync');
  keepEarlier(sdir);
  mkdirSync(sdir, { recursive: true });
  const fork = join(dir, 'fork', 'session');
  const transcripts = filesUnder(fork).filter((f) => f.endsWith('.jsonl'));
  if (!transcripts.length) fail(`${fork} holds no transcript to sync`);
  const newest = Math.max(...transcripts.map((f) => statSync(join(fork, f)).mtimeMs));
  const wait = newest + IN_FLIGHT_MS + 30_000 - Date.now();
  if (wait > 0) {
    console.log(`Waiting ${Math.ceil(wait / 1000)} s: exposurie leaves a transcript written in the last five minutes for the next sync.`);
    await sleep(wait);
  }
  const started = now();
  const brain = join(ctx.home, 'brain');
  const placed = placeItems(ctx, `${L.run}/sync/sync`, kitItems(originalKit(ctx, task.user)));
  placeSession(ctx, dir, fork);
  const before = Object.keys(brainState(brain)?.files ?? {}).length;
  const strayBefore = strays(ctx.home).map((s) => s.replace(/\\/g, '/'));
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
    const history = filesUnder(projectsDir(ctx));
    if (JSON.stringify(history) !== JSON.stringify(filesUnder(fork))) problems.push(`the history folder holds ${history.join(', ')}, not just the long session`);
    for (const f of transcripts) {
      if (existsSync(join(projectsDir(ctx), f)) && hashPath(join(projectsDir(ctx), f)) !== hashPath(join(fork, f))) problems.push(`the sync changed ${f}`);
    }
    st = brainState(brain);
    const read = Object.keys(st?.files ?? {}).map((p) => basename(p.replace(/\\/g, '/')));
    if (!transcripts.every((f) => read.includes(basename(f)))) problems.push('exposurie never read the long session');
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
  // The brain is the agent's to write; the long session's transcript is there to be read.
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
    exit: l.exit,
    tokens: tokensOf(result),
    turns: result?.num_turns ?? null,
    duration_ms: result?.duration_ms ?? null,
    cost_usd_estimate: result?.total_cost_usd ?? null,
    plan_usage_after: limits ? Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.utilization])) : null,
    tool_calls: a.calls,
    denied: a.denied,
    exposurie_commands: exposurieCommands(msgs),
    startup: l.init ? { skills: l.init.skills ?? [], slash_commands: l.init.slash_commands ?? [] } : null,
    brain_after: {
      filed: filed(st),
      transcripts_read: Object.keys(st?.files ?? {}).length,
      newly_read: Object.keys(st?.files ?? {}).length - before,
      pages: pagesIn(join(dir, 'sync', 'kit', 'brain')),
      last_sync: st?.lastSyncUtc ?? null,
    },
  };
  L.sync.sync.push(rec);
  saveRecord(dir, L);
  return { rec, limit: !!o.limit, apiError: !!o.apiError };
}

// ---------------------------------------------------------------- after a strategy

/**
 * What the scorer reads of a strategy: the files changed since the fork (and
 * copies of them), the last step's reply, and everything the agent wrote with
 * Write and Edit after the fork, so an approach it tried and then took back
 * still counts as tried.
 */
function finishStrategy(dir, task, L, phase) {
  const work = join(dir, phase, 'work');
  const files = changedFiles(work, join(dir, 'fork', 'work'));
  rmSync(join(dir, phase, 'files'), { recursive: true, force: true });
  for (const f of files.filter((x) => x.change !== 'deleted')) {
    const buf = readFileSync(join(work, f.path));
    f.bytes = buf.length;
    f.text = isText(buf);
    mkdirSync(dirname(join(dir, phase, 'files', f.path)), { recursive: true });
    writeFileSync(join(dir, phase, 'files', f.path), buf);
  }
  writeFileSync(join(dir, phase, 'files.json'), JSON.stringify(files, null, 2) + '\n');
  const done = stepsFor(task, phase).map((_, n) => lastTry(L[phase], n));
  const writes = done.flatMap((r) => writesIn(readStream(join(dir, phase, r.step, 'stream.jsonl')), join(dir, task.folder)).map((w) => ({ step: r.step, ...w })));
  writeFileSync(join(dir, phase, 'writes.json'), JSON.stringify(writes, null, 2) + '\n');
  const last = readStream(join(dir, phase, done.at(-1).step, 'stream.jsonl')).findLast((m) => m.type === 'result');
  writeFileSync(join(dir, phase, 'answer.md'), typeof last?.result === 'string' && !last.is_error ? last.result : '');
  const extra = phase === 'sync' ? [L.sync.sync.at(-1)] : [];
  L[phase].tokens = sumTokens([...extra, ...done]);
  L[phase].context_end = done.at(-1).context_after;
  L[phase].finished = now();
}

// ---------------------------------------------------------------- the whole of it

/**
 * Carry a long task as far as it goes: the fill to the fork, then each
 * strategy in turn. It stops at a usage limit, three API errors in a row, a
 * step that ends without a result three times, or a step that breaks a check;
 * running it again carries on. A step that broke a check waits for a person:
 * `--accept "<why>"` records their decision and keeps what the step did.
 */
export async function long(ctx, id, { accept = null, task: given = null, dir: givenDir = null } = {}) {
  const task = given ?? longTask(id);
  const release = lockSandbox(ctx.lock);
  try {
    recover(ctx);
    recoverSession(ctx);
    const before = neutralProblems(ctx);
    if (before.length) fail(`the sandbox home is not as runs leave it, so nothing runs until it is:\n  ${before.join('\n  ')}`);
    const dir = givenDir ?? runDir(ctx, task);
    const above = aboveProblems(dir);
    if (above.length) fail(`nothing runs while instructions sit above the runs:\n  ${above.join('\n  ')}`);
    const versions = versionsOf(ctx);
    if (!versions.claude_code.startsWith(PINS.claudeCode)) fail(`Claude Code is ${versions.claude_code}, pinned ${PINS.claudeCode}`);
    mkdirSync(dir, { recursive: true });
    const L = existsSync(recordFile(dir)) ? readJson(recordFile(dir)) : startRecord(dir, { ...task, starterDir: task.starter ? join(TASKS, task.starter) : null });

    if (L.stopped) {
      if (!accept) {
        fail(`${L.stopped.where} of ${task.id} broke a check:\n  ${L.stopped.problems.join('\n  ')}\n` +
          `Read ${join(dir, L.stopped.where)}. To keep what it did anyway: long.mjs ${task.id} --accept "<why>"`);
      }
      L.accepted.push({ at: now(), why: accept, ...L.stopped });
      const r = L.stopped.where === 'sync/sync' ? L.sync.sync.at(-1) : lastTry(L[L.stopped.phase], L.stopped.n);
      r.accepted = accept;
      // A step that ran through is kept as it left things: the repository, and its session.
      if (L.stopped.where !== 'sync/sync') {
        restore(join(dir, task.folder), join(dir, L.stopped.phase, 'work'));
        const kept = join(dir, L.stopped.where, 'session');
        if (existsSync(kept)) restore(kept, join(dir, L.stopped.phase, 'session'));
      }
      L.stopped = null;
      saveRecord(dir, L);
    } else if (accept) {
      fail('--accept is for a long task that stopped on a problem, and this one did not');
    }

    let apiErrors = 0;
    /** What to do after a step or the sync: null to carry on, or false to stop here. */
    const after = (phase, n, r, where) => {
      const label = `${where}  ${r.rec.status}${r.rec.reason ? `: ${r.rec.reason}` : ''}`;
      const size = r.rec.context_after != null ? `  context ${r.rec.context_after}` : '';
      console.log(`${label}${size}  (${r.rec.tokens.all_input} in, ${r.rec.tokens.output} out)`);
      if (r.rec.status === 'thrown-out') {
        L.stopped = { where, phase, n, problems: r.rec.problems };
        saveRecord(dir, L);
        console.log(`\n${where} broke a check, so ${task.id} stops here. Read ${join(dir, where)}.`);
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
      const tried = where === 'sync/sync' ? L.sync.sync.length : tries(L[phase], n);
      if (r.rec.status === 'not-run' && tried >= MAX_TRIES) {
        console.log(`\n${where} has ended without a result ${tried} times. Read ${join(dir, where)} before running it again.`);
        return false;
      }
      return null;
    };

    // The fill, to the fork.
    const fill = stepsFor(task, 'fill');
    const core = task.core.length;
    while (!L.fill.forked) {
      const n = fill.findIndex((_, i) => !counts(lastTry(L.fill, i)));
      const doneSteps = fill.map((_, i) => lastTry(L.fill, i)).filter(counts);
      const lastDone = doneSteps.at(-1);
      if (lastDone && doneSteps.length >= core && lastDone.context_after >= task.fork_at && (n === -1 || n >= core)) {
        restore(join(dir, 'fill', 'work'), join(dir, 'fork', 'work'));
        restore(join(dir, 'fill', 'session'), join(dir, 'fork', 'session'));
        L.fill.forked = {
          at: lastDone.finished, after: lastDone.step, context: lastDone.context_after,
          core, more: doneSteps.length - core, tokens: sumTokens(doneSteps),
        };
        saveRecord(dir, L);
        console.log(`\nThe session reached ${lastDone.context_after} tokens after step ${lastDone.step}: forked.`);
        break;
      }
      if (n === -1) {
        console.log(`\nThe session ran out of steps at ${lastDone?.context_after ?? 0} tokens, short of ${task.fork_at}. It needs more steps.`);
        return false;
      }
      const setup = kitProblems(originalKit(ctx, task.user));
      if (setup.length) fail(setup.join('; '));
      const r = await longStep(ctx, { dir, task, L, phase: 'fill', n, step: fill[n], kit: originalKit(ctx, task.user), versions });
      if (after('fill', n, r, `fill/${r.rec.step}`) === false) return false;
    }

    // The strategies, one after another, from the same point.
    for (const phase of STRATEGIES) {
      if (L[phase].finished) continue;
      if (!existsSync(join(dir, phase, 'work'))) restore(join(dir, 'fork', 'work'), join(dir, phase, 'work'));
      if (phase === 'sync' && !counts(L.sync.sync.at(-1))) {
        const setup = kitProblems(originalKit(ctx, task.user));
        if (setup.length) fail(setup.join('; '));
        const r = await syncSession(ctx, { dir, task, L, versions });
        if (after('sync', 0, r, 'sync/sync') === false) return false;
        if (!counts(r.rec)) continue;
      }
      const kit = phase === 'sync' ? join(dir, 'sync', 'kit') : originalKit(ctx, task.user);
      const steps = stepsFor(task, phase);
      for (let n = 0; n < steps.length; n += 1) {
        while (!counts(lastTry(L[phase], n))) {
          const setup = kitProblems(kit);
          if (setup.length) fail(setup.join('; '));
          const r = await longStep(ctx, { dir, task, L, phase, n, step: steps[n], kit, versions });
          if (after(phase, n, r, `${phase}/${r.rec.step}`) === false) return false;
        }
      }
      finishStrategy(dir, task, L, phase);
      saveRecord(dir, L);
      console.log(`\n${phase}: done, ${L[phase].tokens.all_input} input and ${L[phase].tokens.output} output tokens after the fork.`);
    }
    return true;
  } finally {
    release();
  }
}

/** Where a long task stands. */
export function longStatus(ctx, id) {
  const task = longTask(id);
  const dir = runDir(ctx, task);
  if (!existsSync(recordFile(dir))) {
    console.log(`${id}: not started (${dir}).`);
    return null;
  }
  const L = readJson(recordFile(dir));
  const fill = stepsFor(task, 'fill');
  const done = fill.map((_, i) => lastTry(L.fill, i)).filter(counts);
  console.log(`${id} (${L.run}): fill ${done.length} of ${fill.length} steps, context ${done.at(-1)?.context_after ?? 0}` +
    `${L.fill.forked ? `, forked after ${L.fill.forked.after} at ${L.fill.forked.context}` : ''}.`);
  for (const phase of STRATEGIES) {
    const steps = stepsFor(task, phase);
    const n = steps.filter((_, i) => counts(lastTry(L[phase], i))).length;
    console.log(`  ${phase.padEnd(8)} ${L[phase].finished ? `done, ${L[phase].tokens.all_input} in, ${L[phase].tokens.output} out` : `${n} of ${steps.length} steps`}`);
  }
  if (L.stopped) console.log(`  stopped at ${L.stopped.where}: ${L.stopped.problems.join('; ')}`);
  return L;
}

// ---------------------------------------------------------------- what only real runs can show

/**
 * The same procedure on a tiny task, to see what the fake cannot: that a
 * headless step saves its session where it can be resumed and forked, that
 * /compact runs headless and leaves one boundary, what else Claude Code writes
 * into its config folder with a session saved, and that exposurie files a real
 * 2.1.302 transcript. Its mark is 0, so it forks right after its core steps.
 * It waits five minutes for the sync, and spends a little plan usage.
 */
export const PROBE_TASK = {
  id: 'probe',
  area: LONG_AREA,
  user: 'developer',
  folder: 'scratch',
  starter: null,
  fork_at: 0,
  resume_note: 'Picking up where the last session left off.',
  core: [
    'Create a file notes.txt holding one line: one. Nothing else.',
    'Add a second line to notes.txt: two. Then tell me in one sentence which word I asked for first.',
  ],
  more: [],
  after: ['Add a third line to notes.txt: three. Then remind me, in one sentence, what my very first message in this work asked for.'],
  material: null,
};

export async function probeLong(ctx) {
  const dir = join(ctx.runs, `probe-long-${now().replace(/[:.]/g, '-')}`, 'r001');
  mkdirSync(dir, { recursive: true });
  const ok = await long(ctx, 'probe', { task: PROBE_TASK, dir });
  const L = readJson(recordFile(dir));
  const lines = (phase) => {
    const f = join(dir, phase, 'work', 'notes.txt');
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split(/\r?\n/) : null;
  };
  const found = {
    finished: ok,
    sessions: filesUnder(join(dir, 'fork', 'session')),
    strategies: Object.fromEntries(STRATEGIES.map((p) => [p, {
      notes: lines(p),
      answer: existsSync(join(dir, p, 'answer.md')) ? readFileSync(join(dir, p, 'answer.md'), 'utf8') : null,
      session_files: filesUnder(join(dir, p, 'session')),
      compactions: L[p].steps.flatMap((r) => r.compactions),
      contexts: L[p].steps.map((r) => r.context_after),
      notes_on_steps: L[p].steps.flatMap((r) => r.notes),
    }])),
    fill_contexts: L.fill.steps.map((r) => r.context_after),
    sync: L.sync.sync.at(-1) ?? null,
  };
  writeFileSync(join(dir, 'probe.json'), JSON.stringify(found, null, 2) + '\n');
  console.log(`\nprobe: ${ok ? 'every phase ran' : 'stopped'}; ${join(dir, 'probe.json')}`);
  for (const p of STRATEGIES) console.log(`  ${p.padEnd(8)} notes.txt ${JSON.stringify(found.strategies[p].notes)}, compactions ${found.strategies[p].compactions.length}`);
  return found;
}

// ---------------------------------------------------------------- command line

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  ownNodeOnly();
  const [cmd, ...rest] = process.argv.slice(2);
  const ctx = sandboxContext();
  try {
    if (cmd === 'status') longStatus(ctx, rest[0]);
    else if (cmd === 'probe') process.exitCode = (await probeLong(ctx)).finished ? 0 : 1;
    else if (cmd && !cmd.startsWith('-')) {
      const i = rest.indexOf('--accept');
      if (i >= 0 && !rest[i + 1]) fail('--accept needs the reason, in quotes');
      process.exitCode = (await long(ctx, cmd, { accept: i >= 0 ? rest[i + 1] : null })) ? 0 : 1;
    } else {
      fail('usage: node runner/long.mjs <task> [--accept "<why>"] | status <task> | probe');
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`long: ${e.message}`);
    process.exitCode = 1;
  }
}
