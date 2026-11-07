// The results check (part 9): what the numbers are computed from is complete,
// and results/ holds exactly what score/results.mjs writes from it, in the look.
// For area 9 that means each long task's scores, its hand read and its record
// of every step agree with one another and with the task's steps file. Part
// 10's C again with the rebuilt read is held the same way, and to the rebuilt
// exposurie; its sync + fresh again must come from area 9's own forks. C again
// with exposurie 1.3.1 is held the same way, and to 1.3.1. Part 13's team task
// is held to its task file: every run of round 2 done, round 1 through its gate
// with each repair published, and a finished hand read, every verdict of which
// gives a reason; and the README gives its headline as the numbers have it.
//
//   node check/results.mjs
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REBUILT_BATCH, STRATEGIES } from '../runner/long.mjs';
import { PINS, loginIdentity } from '../runner/sandbox.mjs';
import { LONG_GROUPS } from '../score/checks.mjs';
import {
  AREAS, BATCHES, CONDITIONS, LONG_BATCH, REBUILT_BATCHES, REBUILT_NAME, TEAM_TASKS, USERS, V131_BATCHES, finalChecks, outputs,
} from '../score/results.mjs';
import { WINDOWS_PATH } from '../score/score.mjs';
import { find } from './text.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const SAVE = 'run node score/results.mjs --save';

// ---- every scored run has its condition and a final verdict
const tasks = readJson('tasks', 'index.json').tasks.filter((t) => AREAS[t.area]);
const cellsOf = {};
const ALL_BATCHES = [...BATCHES, ...REBUILT_BATCHES, ...V131_BATCHES];
for (const batch of ALL_BATCHES) {
  const scores = readJson('results', batch, 'scores.json').runs;
  const key = join('results', batch, 'conditions.json');
  if (!existsSync(join(REPO, key))) {
    fail(key, `is missing; ${SAVE}`);
    continue;
  }
  const { conditions, exposurie } = readJson(key);
  // Part 10's batches name the rebuilt exposurie their runs recorded, and 1.3.1's name 1.3.1; 1.2.0's name none.
  const label = REBUILT_BATCHES.includes(batch) ? PINS.exposurieRebuilt.label : V131_BATCHES.includes(batch) ? PINS.exposurie131.version : undefined;
  if (exposurie !== label) fail(key, label ? `names exposurie ${exposurie}, not ${label}` : `names an exposurie, ${exposurie}, as only the batches of C again do`);
  for (const s of scores) {
    if (!CONDITIONS.includes(conditions[s.run])) fail(`${batch}/${s.run}`, 'has no condition in conditions.json');
    if (s.status !== 'done') fail(`${batch}/${s.run}`, `is ${s.status}, not done`);
    if (!['right', 'wrong'].includes(s.verdict)) fail(`${batch}/${s.run}`, 'has no final verdict');
  }
  for (const run of Object.keys(conditions)) if (!scores.some((s) => s.run === run)) fail(key, `names ${run}, which has no score`);
  cellsOf[batch] = scores.map((s) => `${s.task} ${conditions[s.run]}`).sort();
}

// ---- each batch ran what it was planned to: every cell of areas 1–8 once, area 3 under C, recall-1 under all four
const want = {
  full: tasks.flatMap((t) => (t.area === 8 ? ['A', 'B', 'C'] : CONDITIONS).map((c) => `${t.id} ${c}`)),
  'stability-1': tasks.filter((t) => t.area === 3).map((t) => `${t.id} C`),
  'stability-2': tasks.filter((t) => t.area === 3).map((t) => `${t.id} C`),
  pilot: CONDITIONS.map((c) => `recall-1 ${c}`),
  // Part 10: every cell of areas 1–8 under C once, then area 3 under C twice more.
  'full-2': tasks.map((t) => `${t.id} C`),
  'stability-3': tasks.filter((t) => t.area === 3).map((t) => `${t.id} C`),
  'stability-4': tasks.filter((t) => t.area === 3).map((t) => `${t.id} C`),
  // 1.3.1: every cell of areas 1–8 under C once.
  'full-3': tasks.map((t) => `${t.id} C`),
};
for (const batch of ALL_BATCHES) {
  if (!cellsOf[batch]) continue;
  if (JSON.stringify(cellsOf[batch]) !== JSON.stringify(want[batch].sort())) fail(`results/${batch}`, `does not hold each of its ${want[batch].length} cells exactly once`);
}

// ---- the brain builds
const builds = existsSync(join(REPO, 'results', 'builds.json')) ? readJson('results', 'builds.json').builds : null;
if (!builds) fail('results/builds.json', `is missing; ${SAVE}`);
else for (const u of USERS) if (!(builds[u]?.tokens?.all_input > 0)) fail('results/builds.json', `has no tokens for the ${u}`);

// ---- area 9: each long task once, every strategy finished, every check with a final verdict, every token accounted for.
// Part 10's REBUILT_BATCH ran sync + fresh alone again, from area 9's forks: its fork and its sync session must be area 9's own.
const longTasks = readJson('tasks', 'index.json').tasks.filter((t) => t.area === 9);
const kinds = ['all_input', 'input', 'cache_write', 'cache_read', 'output'];
const add = (xs, k) => xs.reduce((n, x) => n + x.tokens[k], 0);
const longOf = {};
const strategiesKeyed = {};
for (const batch of [LONG_BATCH, REBUILT_BATCH]) {
  const again = batch === REBUILT_BATCH;
  const longFiles = ['scores', 'hand', 'steps'].map((f) => `results/${batch}/${f}.json`);
  for (const f of longFiles.filter((x) => !existsSync(join(REPO, x)))) fail(f, `is missing; ${SAVE}`);
  strategiesKeyed[batch] = 0;
  if (!longFiles.every((f) => existsSync(join(REPO, f)))) continue;
  const [scores, hands, records] = longFiles.map((f) => readJson(f).runs);
  longOf[batch] = { scores, records };
  for (const x of [...scores, ...hands, ...records]) if (!longTasks.some((t) => t.id === x.task)) fail(`${batch}/${x.task}`, 'is not a long task in tasks/index.json');
  for (const t of longTasks) {
    const where = `${batch}/${t.id}`;
    const [s, h, r] = [scores, hands, records].map((xs) => xs.filter((x) => x.task === t.id));
    if (s.length !== 1 || h.length !== 1 || r.length !== 1) {
      fail(where, 'is not in scores.json, hand.json and steps.json exactly once each');
      continue;
    }
    const [score, hand, rec] = [s[0], h[0], r[0]];
    if (hand.run !== score.run || rec.run !== score.run) fail(where, 'has a different run in scores.json, hand.json and steps.json');
    const steps = readJson('tasks', t.steps);
    // A run again is held to sync + fresh alone; any other strategy in it is a problem below, not a strategy to check.
    const ran = again ? ['sync'].filter((p) => score.strategies[p]) : STRATEGIES;

    if (!again) {
      // The fork: past the mark at the first step boundary after the core steps, where the scores say it was.
      const fill = rec.phases.fill.filter((a) => a.counts);
      if (rec.fork_at !== steps.fork_at) fail(where, `was forked at a mark of ${rec.fork_at}, where its steps file says ${steps.fork_at}`);
      if (fill.length !== rec.fork.core + rec.fork.more || rec.fork.core !== steps.core.length) fail(where, 'does not count one fill attempt for each step before the fork');
      else if (fill.at(-1).step !== rec.fork.after || fill.at(-1).context_after !== rec.fork.context || rec.fork.context < rec.fork_at) {
        fail(where, 'is not forked where its last fill step ended, past the mark');
      } else if (fill.slice(rec.fork.core - 1, -1).some((a) => a.context_after >= rec.fork_at)) fail(where, 'passed the mark before the step it was forked after');
      if (score.fork.after !== rec.fork.after || score.fork.context !== rec.fork.context) fail(where, 'is forked at one point in scores.json and another in steps.json');
      for (const k of kinds) if (add(fill, k) !== score.fork.tokens[k]) fail(where, `its fill's ${k} tokens are not those of its counted steps`);
    } else {
      // Only the fresh session of sync + fresh ran again: from area 9's own fork, after area 9's own sync session.
      if (JSON.stringify(Object.keys(score.strategies)) !== '["sync"]' || JSON.stringify(Object.keys(rec.phases)) !== '["sync"]') fail(where, 'ran something other than sync + fresh again');
      const first = longOf[LONG_BATCH]?.scores.find((x) => x.task === t.id);
      const firstRec = longOf[LONG_BATCH]?.records.find((x) => x.task === t.id);
      if (!first || !firstRec || score.from !== `${LONG_BATCH}/${first.run}` || rec.from !== score.from) fail(where, `does not name ${LONG_BATCH}'s run of ${t.id} as the run it came from`);
      else {
        if (JSON.stringify(score.fork) !== JSON.stringify(first.fork) || JSON.stringify(rec.fork) !== JSON.stringify(firstRec.fork) || rec.fork_at !== firstRec.fork_at) {
          fail(where, `is not forked where ${LONG_BATCH}'s run of ${t.id} was`);
        }
        const syncOf = (x) => JSON.stringify(x.sync_sessions.filter((y) => y.counts).map((y) => y.tokens));
        if (syncOf(rec) !== syncOf(firstRec)) fail(where, `does not carry over ${LONG_BATCH}'s sync session`);
      }
    }
    const v = rec.versions;
    const pinned = again ? PINS.exposurieRebuilt.label : PINS.exposurie;
    if (!v.claude_code?.startsWith(PINS.claudeCode) || v.model !== PINS.model || v.exposurie !== pinned) fail(where, 'ran under versions other than the pinned ones');

    for (const p of ran) {
      const at = `${where} ${p}`;
      const sc = score.strategies[p];
      if (!sc) {
        fail(at, 'has no scores: the strategy did not finish');
        continue;
      }
      strategiesKeyed[batch] += 1;
      for (const g of LONG_GROUPS) {
        const want = steps.checks[g].map((c) => c.id);
        if (JSON.stringify(Object.keys(sc.checks[g]).sort()) !== JSON.stringify([...want].sort())) fail(at, `does not score each of its ${g} checks exactly once`);
        for (const id of want) {
          const script = sc.checks[g][id];
          const read = hand.verdicts[p]?.[g]?.[id];
          if (script === null && !read) fail(at, `${g} ${id} is read only by hand, and the hand read gives no verdict`);
          if (!read) continue;
          if (typeof read.verdict !== 'boolean') fail(at, `${g} ${id}: the hand verdict is neither true nor false`);
          if (!read.why) fail(at, `${g} ${id}: the hand verdict gives no reason`);
          if (script !== null && read.script !== script) fail(at, `${g} ${id}: the hand verdict overrides a script result it does not name, so the hand read is older than the scores`);
        }
      }
      const final = finalChecks(sc.checks, hand.verdicts[p]);
      for (const g of LONG_GROUPS) {
        const vs = Object.values(final[g]);
        const tally = `${vs.filter((c) => c.verdict === true).length}/${vs.length}`;
        if (hand.final?.[p]?.[g] !== tally) fail(at, `${g}: the hand read's tally is ${hand.final?.[p]?.[g]}, and its verdicts make ${tally}`);
      }
      const counted = rec.phases[p].filter((a) => a.counts);
      const want = steps.after.length + (p === 'compact' ? 1 : 0);
      if (counted.length !== want) fail(at, `counts ${counted.length} attempts, where its steps make ${want}`);
      if (p === 'compact' && !(counted[0]?.kind === 'compact' && counted[0].compactions?.length === 1 && counted[0].compactions[0].trigger === 'manual')) {
        fail(at, 'does not start with one /compact asked for');
      }
      const sync = p === 'sync' ? rec.sync_sessions.filter((x) => x.counts) : [];
      if (p === 'sync' && !(sync.length === 1 && sync[0].brain_after?.filed)) fail(at, 'has no sync session that filed the long session');
      for (const k of kinds) if (add([...counted, ...sync], k) !== sc.tokens[k]) fail(at, `its ${k} tokens are not those of its counted steps${p === 'sync' ? ' and its sync session' : ''}`);
    }
  }
}

// ---- part 13: each team task's scores, hand read and conditions agree with its task file and with one another
for (const id of TEAM_TASKS) {
  const files = ['scores', 'hand', 'conditions'].map((f) => `results/${id}/${f}.json`);
  for (const f of files.filter((x) => !existsSync(join(REPO, x)))) fail(f, `is missing; ${SAVE}`);
  if (!files.every((f) => existsSync(join(REPO, f)))) continue;
  const [s, h, k] = files.map((f) => readJson(f));
  const task = readJson('tasks', 'team', `${id}.json`);
  if (s.task !== id || h.task !== id || k.task !== id) fail(`results/${id}`, 'holds files that name another task');
  if (k.exposurie !== PINS.exposurie131.version) fail(`results/${id}/conditions.json`, `names exposurie ${k.exposurie}, not ${PINS.exposurie131.version}`);
  const agents = task.round_2.map((a) => a.agent).sort();
  for (const c of task.conditions) {
    const runs = s.conditions[c]?.runs ?? [];
    if (JSON.stringify(runs.map((r) => r.agent).sort()) !== JSON.stringify(agents)) fail(`${id} ${c}`, 'does not hold one run for each agent of round 2');
    for (const r of runs) {
      if (k.conditions[r.run] !== c || k.agents[r.run] !== r.agent) fail(`${id}/${r.run}`, `is not ${c}'s agent ${r.agent} in conditions.json`);
      if (r.status !== 'done' && !r.accepted) fail(`${id}/${r.run}`, `is ${r.status}, not done`);
    }
  }
  if (Object.keys(k.conditions).length !== task.conditions.length * agents.length) fail(`results/${id}/conditions.json`, 'names runs that have no score');
  const steps = task.round_1.reduce((n, a) => n + a.steps.length, 0);
  if (s.round_1.steps !== steps) fail(`${id} round 1`, `scores ${s.round_1.steps} steps, where its task has ${steps}`);
  if (!s.round_1.gate.passed) fail(`${id} round 1`, 'did not pass the gate');
  for (const r of s.round_1.repairs) {
    if (!existsSync(join(REPO, 'results', id, r.patch))) fail(`results/${id}/${r.patch}`, `is missing; ${SAVE}`);
    if (!r.what) fail(`${id} round 1`, `its repair ${r.patch} says nothing of what it changed`);
  }
  if (h.still_to_read?.length) fail(`results/${id}/hand.json`, `is not finished: ${h.still_to_read.length} still to read`);
  for (const c of task.conditions) {
    for (const d of task.decisions) {
      const v = h.decisions?.[c]?.[d.id];
      if (!v) fail(`${id} ${c} ${d.id}`, 'has no verdict from the hand read');
      else if (typeof v.kept !== 'boolean' || !v.why) fail(`${id} ${c} ${d.id}`, 'has a hand verdict that is not true or false with a reason');
    }
    const a = h.agreed?.[c];
    if (!a || typeof a.agreed !== 'boolean' || !a.why) fail(`${id} ${c}`, 'has no hand verdict, with a reason, on whether its three agents agreed');
  }
  const handOnly = task.checks.way.filter((x) => x.hand).map((x) => x.id);
  for (const r of task.conditions.flatMap((c) => s.conditions[c]?.runs ?? [])) {
    for (const check of handOnly) {
      const v = h.way?.[r.run]?.[check];
      if (!v || typeof v.holds !== 'boolean' || !v.why) fail(`${id}/${r.run}`, `${check} is read only by hand, and the hand read gives no verdict with a reason`);
    }
  }
  for (const d of task.decisions) if (typeof (h.filed?.[d.id] ?? s.sync.filed[d.id]?.filed) !== 'boolean') fail(`${id} sync`, `has no verdict on whether ${d.id} was filed`);
  if (!existsSync(join(REPO, 'results', id, 'hand.test.js'))) fail(`results/${id}/hand.test.js`, `is missing; ${SAVE}`);
}

// ---- results/ holds exactly what score/results.mjs writes
let written = {};
if (!problems.length) {
  written = outputs();
  for (const [rel, text] of Object.entries(written)) {
    if (!existsSync(join(REPO, rel))) fail(rel, `is missing; ${SAVE}`);
    else if (readFileSync(join(REPO, rel), 'utf8') !== text) fail(rel, `is not what score/results.mjs writes; ${SAVE}`);
  }
  const charts = join(REPO, 'results', 'charts');
  for (const name of existsSync(charts) ? readdirSync(charts) : []) {
    if (!(`results/charts/${name}` in written)) fail(`results/charts/${name}`, 'is not written by score/results.mjs');
  }
}

// ---- the charts keep to the look in CLAUDE.md, and every line of text fits inside its chart
// The colours and font stacks are read from CLAUDE.md itself, not from the
// script that draws the charts. Widths are estimated at Arial's, which is
// wider than Calibri and is what a reader without Calibri or Carlito gets.
const look = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8').split(/^## Look$/m)[1] ?? '';
const quoted = look.split('`').filter((_, i) => i % 2);
const colours = new Set(quoted.filter((q) => /^#[0-9A-Fa-f]{6}$/.test(q)).map((c) => c.toUpperCase()));
const fonts = new Set(quoted.filter((q) => q.includes(',')));
if (!colours.size || !fonts.size) fail('CLAUDE.md', 'has no Look section with colours and font stacks to hold the charts to');
const unescape = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
for (const [rel, text] of Object.entries(written).filter(([rel]) => rel.endsWith('.svg'))) {
  for (const [, c] of text.matchAll(/(#[0-9A-Fa-f]{6})/g)) if (!colours.has(c.toUpperCase())) fail(rel, `uses ${c}, which is not one of the look's colours`);
  for (const [, f] of text.matchAll(/font-family="([^"]+)"/g)) if (!fonts.has(f)) fail(rel, `uses the font "${f}", which is not one of the look's`);
  const width = Number(text.match(/<svg [^>]*width="(\d+)"/)[1]);
  for (const [, attrs, inner] of text.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)) {
    const at = (k) => attrs.match(new RegExp(`${k}="([^"]+)"`))?.[1];
    const words = unescape(inner);
    const w = words.length * Number(at('font-size')) * (at('font-weight') ? 0.6 : 0.55);
    const x = Number(at('x'));
    const [left, right] = at('text-anchor') === 'middle' ? [x - w / 2, x + w / 2] : at('text-anchor') === 'end' ? [x - w, x] : [x, x + w];
    if (left < 10 || right > width - 10) fail(rel, `"${words}" may run past the chart's edge`);
  }
}

// ---- nothing in results/ holds the sandbox login's address or names, or a machine path
const identity = loginIdentity();
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
for (const file of walk(join(REPO, 'results'))) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(REPO, file).replace(/\\/g, '/');
  if (identity.some((id) => find(text, id) >= 0)) fail(rel, "holds the sandbox login's own address or name");
  if (WINDOWS_PATH.test(text)) fail(rel, 'holds a Windows path');
}

// ---- what there is
const n = written['results/numbers.json'] ? JSON.parse(written['results/numbers.json']) : null;

// ---- the README gives part 13's headline as the numbers have it
const M = n?.many_agents;
if (M) {
  const headline = `By hand, round 2's merged work kept ${M.conditions.A.kept.held} of round 1's ${M.conditions.A.kept.of} decisions with no memory, ` +
    `${M.conditions.C.kept.held} with exposurie ${M.exposurie}, and ${M.conditions.D.kept.held} with a perfect notes file.`;
  if (!readFileSync(join(REPO, 'README.md'), 'utf8').includes(headline)) fail('README.md', `does not say, as results/numbers.json has it: "${headline}"`);
}
console.log(
  `${ALL_BATCHES.filter((b) => cellsOf[b]).length} batches keyed, ${Object.values(cellsOf).flat().length} runs. ` +
    (n ? `Right answers, areas 1–7: ${CONDITIONS.map((c) => `${c} ${n.right_answers.pooled[c]}`).join(', ')} of ${n.right_answers.of}, ` +
      `C ${n.rebuilt_read.right_answers.pooled.C} with ${REBUILT_NAME} (recorded as ${n.rebuilt_read.exposurie}), ` +
      `and C ${n.pointer_for_work.right_answers.pooled.C} with exposurie ${n.pointer_for_work.exposurie}. ` : '') +
    `Area 9: ${longTasks.length} long tasks, ${strategiesKeyed[LONG_BATCH]} strategies keyed, and ${strategiesKeyed[REBUILT_BATCH]} again. ` +
    (M ? `Part 13: kept ${['A', 'C', 'D'].map((c) => `${c} ${M.conditions[c].kept.held}`).join(', ')} of ${M.conditions.A.kept.of}. ` : '') +
    `${Object.keys(written).filter((r) => r.endsWith('.svg')).length} charts.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe results hold.');
