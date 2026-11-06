// Part 13's scorer: what runner/team.mjs left in ../runs/<task>/, scored per
// condition. Every result here is also read by hand (docs/build-plan.md,
// part 13), and the checks marked hand are listed for that.
//
//   node score/team.mjs <task>      writes scores.json beside team.json
//
// For each condition of round 2:
//   - the merged work's tests: the repository's own (`node --test`), and the
//     hidden ones in score/team/, which import the developer's exports through
//     the merged import job, one test per decision, named by its ID
//   - each decision kept in the merged work, from the hidden tests, and by
//     each agent that needed it, from its own files by script
//   - the three agreeing: both readers' highlights reach the database through
//     the third agent's code, which needs all three to have K1 the same way
//   - the user's way: the commit message in each last reply, and no new
//     dependency
//   - every input token, cached or not, per run and per condition
// And for round 1 and the sync: which decisions round 1's merged code already
// holds (they were not said only in conversation), which the sync filed into
// the brain, and their tokens. The plan meter is read off the runs' own
// rate-limit events, in the order they ran.
//
// The tests run the agents' code with the sandbox's Node, in the merged
// folder, with node_modules from long-1's starter check joined in for the run
// and taken out after.
//
// Run it with the sandbox's own Node.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS, sandboxEnv } from '../runner/sandbox.mjs';
import { holds, looks } from './checks.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const HIDDEN = join(HERE, 'team');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const TEST_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- the tests

/** Where the tests' node_modules come from: long-1's starter check, with better-sqlite3 built for the sandbox's Node. */
export function testModules(runs = RUNS) {
  if (!existsSync(runs)) return null;
  for (const n of readdirSync(runs).filter((x) => x.startsWith('starter-check-long-1-')).sort().reverse()) {
    const p = join(runs, n, 'satchel', 'node_modules');
    if (existsSync(join(p, 'better-sqlite3', 'build', 'Release'))) return p;
  }
  return null;
}

/** Root-level results of Node's TAP reporter: one per test, with the counts it ends on. */
export function readTap(text) {
  const tests = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^(not )?ok \d+ - (.*?)(?:\s+#\s+(?:SKIP|TODO)\b.*)?$/.exec(line);
    if (m) tests.push({ name: m[2].trim(), ok: !m[1] });
  }
  const n = (k) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(text)?.[1] ?? 0);
  return { tests, passed: n('pass'), failed: n('fail') + n('cancelled'), total: n('tests') };
}

function nodeTest(folder, args, home) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...args], {
    cwd: folder, env: sandboxEnv({ home, exposurie: false }), encoding: 'utf8', windowsHide: true, timeout: TEST_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { exit: r.status, signal: r.signal ?? null, out, ...readTap(out) };
}

/**
 * Run a merged copy of Satchel's tests: its own first, as `npm test` would,
 * then the hidden files named, from score/team/, with their data. Nothing is
 * left in the folder afterwards. `out` keeps what each printed.
 */
export function runTests(folder, { hidden = [], data = {}, expect = {}, out = null, runs = RUNS } = {}) {
  const modules = testModules(runs);
  if (!modules) throw new Error(`no node_modules with better-sqlite3 built in ${runs}/starter-check-long-1-*/satchel`);
  const link = join(folder, 'node_modules');
  if (existsSync(link)) throw new Error(`${link} is already there`);
  const home = join(`${folder}-test-home`);
  rmSync(home, { recursive: true, force: true });
  for (const d of ['AppData/Local', 'AppData/Roaming']) mkdirSync(join(home, d), { recursive: true });
  const box = join(folder, 'hidden-tests');
  symlinkSync(modules, link, 'junction');
  let own;
  let secret;
  try {
    own = nodeTest(folder, [], home);
    mkdirSync(join(box, 'data'), { recursive: true });
    cpSync(join(HIDDEN, 'helpers.js'), join(box, 'helpers.js'));
    for (const f of hidden) cpSync(join(HIDDEN, f), join(box, f));
    for (const [name, from] of Object.entries(data)) cpSync(from, join(box, 'data', name));
    writeFileSync(join(box, 'data', 'expect.json'), JSON.stringify(expect, null, 2) + '\n');
    secret = hidden.length ? nodeTest(folder, hidden.map((f) => `hidden-tests/${f}`), home) : { exit: 0, out: '', tests: [], passed: 0, failed: 0, total: 0 };
  } finally {
    if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(link);
    rmSync(box, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'own.tap'), own.out);
    writeFileSync(join(out, 'hidden.tap'), secret.out);
  }
  const strip = ({ out: _, ...r }) => r;
  return {
    passed: own.exit === 0 && own.failed === 0 && secret.exit === 0 && secret.failed === 0 && (hidden.length === 0 || secret.passed > 0),
    own: strip(own),
    hidden: { ...strip(secret), results: Object.fromEntries(secret.tests.map((t) => [t.name, t.ok])) },
    modules,
  };
}

// ---------------------------------------------------------------- reading what the runs left

/** Every text file under a folder, as `{ path, text }`. */
function textsUnder(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      if (n.isDirectory()) walk(join(d, n.name), `${rel}${n.name}/`);
      else {
        const buf = readFileSync(join(d, n.name));
        if (!buf.subarray(0, 8192).includes(0)) out.push({ path: `${rel}${n.name}`, text: buf.toString('utf8') });
      }
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}

/** The files a folder holds that differ from another's, as `{ path, text }`. */
function changedTexts(dir, base) {
  const was = new Map(textsUnder(base).map((f) => [f.path, f.text]));
  return textsUnder(dir).filter((f) => !f.path.startsWith('node_modules/') && was.get(f.path) !== f.text);
}

/** What one round 2 run left for the checks: its last reply and the files it changed. */
function cellRun(dir, run) {
  const files = readJson(join(dir, run, 'files.json'))
    .filter((f) => f.change !== 'deleted' && f.text)
    .map((f) => ({ path: f.path, text: readFileSync(join(dir, run, 'files', f.path), 'utf8') }));
  return { answer: readFileSync(join(dir, run, 'answer.md'), 'utf8'), files };
}

const depsOf = (pkg) => JSON.stringify({ dependencies: pkg?.dependencies ?? {}, devDependencies: pkg?.devDependencies ?? {} });

/** One check of a run: true or false from a script, or null for one read by hand. */
function checkOne(c, run, base) {
  if (c.hand) return null;
  if (c.in === 'dependencies') {
    const mine = run.files.find((f) => f.path === 'package.json');
    if (!mine) return true;
    let pkg;
    try {
      pkg = JSON.parse(mine.text);
    } catch {
      return false;
    }
    return depsOf(pkg) === depsOf(readJson(join(base, 'package.json')));
  }
  return looks(c) ? holds(c, run) : null;
}

/** A decision for one agent: every script check under its ID must hold; null when only a hand read can tell. */
function byId(checks, run, base) {
  const out = {};
  for (const c of checks) {
    const v = checkOne(c, run, base);
    if (!(c.id in out)) out[c.id] = { holds: null, checks: [] };
    out[c.id].checks.push({ what: c.what, holds: v });
    if (v !== null) out[c.id].holds = out[c.id].holds === null ? v : out[c.id].holds && v;
  }
  return out;
}

/** Which decisions round 1's merged code holds already, by each decision's leak patterns over what it changed. */
export function leaksOf(merged, starter, task) {
  const files = changedTexts(merged, starter);
  return Object.fromEntries(task.decisions.map((d) => {
    const hits = files.filter((f) => holds({ in: 'files', file: d.leak.file, patterns: d.leak.patterns }, { files: [f] })).map((f) => f.path);
    return [d.id, { leaked: hits.length > 0, files: hits }];
  }));
}

/** Which decisions the sync wrote into the brain, by each decision's filed patterns over its pages. */
export function filedOf(brain, task) {
  const pages = textsUnder(join(brain, 'wiki')).filter((f) => f.path.endsWith('.md'));
  return Object.fromEntries(task.decisions.map((d) => {
    const hits = pages.filter((p) => d.filed.some((re) => new RegExp(re, 'iu').test(p.text))).map((p) => p.path);
    return [d.id, { filed: hits.length > 0, pages: hits }];
  }));
}

const sum = (list) => {
  const t = { input: 0, cache_write: 0, cache_read: 0, output: 0, all_input: 0 };
  for (const x of list) for (const k of Object.keys(t)) t[k] += x?.[k] ?? 0;
  return t;
};
const counted = (r) => !!r && (r.status === 'done' || !!r.accepted);

// ---------------------------------------------------------------- the scores

/**
 * Score a team task that has run to the end. `runs` is where the tests'
 * node_modules are found; check/team.mjs passes the real one.
 */
export function scoreTeam(dir, task, { runs = RUNS } = {}) {
  const T = readJson(join(dir, 'team.json'));
  const b = readJson(join(dir, 'batch.json'));
  if (!task.conditions.every((c) => T.round_2.merged[c])) throw new Error(`${task.id} has not finished: round 2's merges are not all done`);
  const base = join(dir, 'round-2-base');
  const data = {
    'pocket.csv': join(task.starterDir, 'test', 'fixtures', 'pocket.csv'),
    ...Object.fromEntries(Object.values(task.files).map((f) => [f, join(task.filesDir, f)])),
  };

  const agents = task.round_1.map((a) => a.agent);
  const steps = agents.flatMap((a) => T.round_1[a].steps.filter(counted).map((r) => ({ agent: a, ...r })));
  const sync = T.sync.tries.findLast(counted);
  const round1 = {
    steps: steps.length,
    tokens: sum(steps.map((r) => r.tokens)),
    cost_usd_estimate: steps.reduce((n, r) => n + (r.cost_usd_estimate ?? 0), 0),
    looked: steps.filter((r) => r.looked).length,
    merge: { conflicts: T.round_1.merged.conflicts },
    gate: { passed: T.round_1.gate.passed, own: T.round_1.gate.own, hidden: T.round_1.gate.hidden.results },
    repairs: T.round_1.repairs,
    leaks: leaksOf(join(dir, 'round-1', 'merged'), task.starterDir, task),
  };
  const synced = {
    tokens: sync.tokens,
    cost_usd_estimate: sync.cost_usd_estimate,
    pages: sync.brain_after.pages,
    filed: filedOf(join(dir, 'sync', 'kit', 'brain'), task),
  };

  const conditions = {};
  for (const condition of task.conditions) {
    const cells = b.cells.filter((c) => c.condition === condition).sort((x, y) => x.agent - y.agent);
    const runs2 = cells.map((c) => {
      const r = readJson(join(dir, c.run, 'run.json'));
      const run = cellRun(dir, c.run);
      return {
        run: c.run,
        agent: c.agent,
        status: r.status,
        accepted: r.accepted ?? null,
        tokens: r.tokens,
        cost_usd_estimate: r.cost_usd_estimate,
        looked: r.looked,
        searched: (r.exposurie_commands ?? []).filter((x) => /\bread\b/.test(x)),
        files: run.files.map((f) => f.path),
        decisions: byId(task.checks.agents[c.agent] ?? [], run, base),
        way: byId(task.checks.way, run, base),
      };
    });
    const tests = runTests(join(dir, 'merged', condition), {
      hidden: ['round-1.test.js', 'round-2.test.js'], data, expect: task.expect, out: join(dir, 'merged', `${condition}-tests`), runs,
    });
    const results = tests.hidden.results;
    const decisions = Object.fromEntries(task.decisions.map((d) => {
      const mine = Object.entries(results).filter(([name]) => new RegExp(`^${d.id}\\b`).test(name));
      return [d.id, {
        merged: mine.length > 0 && mine.every(([, ok]) => ok),
        tests: Object.fromEntries(mine),
        agents: Object.fromEntries(d.needed_by.map((a) => [a, runs2.find((x) => x.agent === a)?.decisions[d.id]?.holds ?? null])),
        said_only_in_conversation: !round1.leaks[d.id].leaked,
      }];
    }));
    const k1 = Object.entries(results).filter(([name]) => /^K1\b/.test(name));
    conditions[condition] = {
      runs: runs2,
      merge: { conflicts: T.round_2.merged[condition].conflicts },
      tests: { passed: tests.passed, own: tests.own, hidden: results },
      decisions,
      kept: {
        merged: Object.values(decisions).filter((d) => d.merged).length,
        of: task.decisions.length,
        said_only_in_conversation: Object.values(decisions).filter((d) => d.merged && d.said_only_in_conversation).length,
      },
      agreed: k1.length >= 2 && k1.every(([, ok]) => ok),
      tokens: sum(runs2.map((r) => r.tokens)),
      cost_usd_estimate: runs2.reduce((n, r) => n + (r.cost_usd_estimate ?? 0), 0),
      looked: runs2.filter((r) => r.looked).length,
    };
  }

  // The plan meter, in the order everything ran.
  const meter = [
    ...steps.map((r) => ({ what: `round-1/agent-${r.agent}/${r.step}`, at: r.finished, seven_day: r.plan_usage_after?.seven_day ?? null })),
    { what: 'sync', at: sync.finished, seven_day: sync.plan_usage_after?.seven_day ?? null },
    ...b.cells.map((c) => {
      const r = readJson(join(dir, c.run, 'run.json'));
      return { what: c.run, at: r.finished, seven_day: r.plan_usage_after?.seven_day ?? null };
    }),
  ].sort((x, y) => String(x.at).localeCompare(String(y.at)));

  return {
    task: task.id,
    scored: new Date().toISOString(),
    round_1: round1,
    sync: synced,
    conditions,
    plan_meter: meter,
    by_hand: [
      ...task.decisions.map((d) => `leak ${d.id}: read round 1's merged code where its patterns matched, if any (${d.what})`),
      ...task.decisions.map((d) => `filed ${d.id}: read the brain's pages for it (${d.what})`),
      ...Object.entries(task.checks.agents).flatMap(([a, list]) => list.filter((c) => c.hand).map((c) => `agent ${a} ${c.id}: ${c.what}`)),
      ...task.checks.way.filter((c) => c.hand).map((c) => `every run ${c.id}: ${c.what}`),
      'every hidden test that failed: read why, in merged/<condition>-tests/hidden.tap',
    ],
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { teamTask } = await import('../runner/team.mjs');
  const { ownNodeOnly } = await import('../runner/sandbox.mjs');
  ownNodeOnly();
  const id = process.argv[2];
  const task = teamTask(id);
  const dir = join(RUNS, task.id);
  if (!existsSync(join(dir, 'team.json'))) {
    console.error(`score/team: ${id} has not run`);
    process.exit(1);
  }
  const s = scoreTeam(dir, task);
  writeFileSync(join(dir, 'scores.json'), `${JSON.stringify(s, null, 2)}\n`);
  console.log(`round 1: ${s.round_1.steps} steps, ${s.round_1.tokens.all_input} in; gate ${s.round_1.gate.passed ? 'passed' : 'failed'}; ` +
    `in its code already: ${Object.entries(s.round_1.leaks).filter(([, v]) => v.leaked).map(([k]) => k).join(', ') || 'none'}`);
  console.log(`sync: ${s.sync.tokens.all_input} in; filed ${Object.entries(s.sync.filed).filter(([, v]) => v.filed).map(([k]) => k).join(', ') || 'none'}`);
  for (const [c, r] of Object.entries(s.conditions)) {
    console.log(`${c}  kept ${r.kept.merged}/${r.kept.of}, agreed ${r.agreed ? 'yes' : 'no'}, tests ${r.tests.passed ? 'pass' : 'fail'}, conflicts ${r.merge.conflicts.length}, ${r.tokens.all_input} in`);
  }
  console.log(`\nRead by hand as well:\n  ${s.by_hand.join('\n  ')}\nScores: ${join(dir, 'scores.json')}`);
}
