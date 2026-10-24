// The results check (part 9): what the numbers are computed from is complete,
// and results/ holds exactly what score/results.mjs writes from it, in the look.
// For area 9 that means each long task's scores, its hand read and its record
// of every step agree with one another and with the task's steps file.
//
//   node check/results.mjs
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRATEGIES } from '../runner/long.mjs';
import { PINS, loginIdentity } from '../runner/sandbox.mjs';
import { LONG_GROUPS } from '../score/checks.mjs';
import { AREAS, BATCHES, CONDITIONS, LONG_BATCH, USERS, finalChecks, outputs } from '../score/results.mjs';
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
for (const batch of BATCHES) {
  const scores = readJson('results', batch, 'scores.json').runs;
  const key = join('results', batch, 'conditions.json');
  if (!existsSync(join(REPO, key))) {
    fail(key, `is missing; ${SAVE}`);
    continue;
  }
  const { conditions } = readJson(key);
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
};
for (const batch of BATCHES) {
  if (!cellsOf[batch]) continue;
  if (JSON.stringify(cellsOf[batch]) !== JSON.stringify(want[batch].sort())) fail(`results/${batch}`, `does not hold each of its ${want[batch].length} cells exactly once`);
}

// ---- the brain builds
const builds = existsSync(join(REPO, 'results', 'builds.json')) ? readJson('results', 'builds.json').builds : null;
if (!builds) fail('results/builds.json', `is missing; ${SAVE}`);
else for (const u of USERS) if (!(builds[u]?.tokens?.all_input > 0)) fail('results/builds.json', `has no tokens for the ${u}`);

// ---- area 9: each long task once, every strategy finished, every check with a final verdict, every token accounted for
const longTasks = readJson('tasks', 'index.json').tasks.filter((t) => t.area === 9);
const longFiles = ['scores', 'hand', 'steps'].map((f) => `results/${LONG_BATCH}/${f}.json`);
for (const f of longFiles.filter((x) => !existsSync(join(REPO, x)))) fail(f, `is missing; ${SAVE}`);
let strategiesKeyed = 0;
if (longFiles.every((f) => existsSync(join(REPO, f)))) {
  const [scores, hands, records] = longFiles.map((f) => readJson(f).runs);
  const kinds = ['all_input', 'input', 'cache_write', 'cache_read', 'output'];
  const add = (xs, k) => xs.reduce((n, x) => n + x.tokens[k], 0);
  for (const x of [...scores, ...hands, ...records]) if (!longTasks.some((t) => t.id === x.task)) fail(`${LONG_BATCH}/${x.task}`, 'is not a long task in tasks/index.json');
  for (const t of longTasks) {
    const where = `${LONG_BATCH}/${t.id}`;
    const [s, h, r] = [scores, hands, records].map((xs) => xs.filter((x) => x.task === t.id));
    if (s.length !== 1 || h.length !== 1 || r.length !== 1) {
      fail(where, 'is not in scores.json, hand.json and steps.json exactly once each');
      continue;
    }
    const [score, hand, rec] = [s[0], h[0], r[0]];
    if (hand.run !== score.run || rec.run !== score.run) fail(where, 'has a different run in scores.json, hand.json and steps.json');
    const steps = readJson('tasks', t.steps);

    // The fork: past the mark at the first step boundary after the core steps, where the scores say it was.
    const fill = rec.phases.fill.filter((a) => a.counts);
    if (rec.fork_at !== steps.fork_at) fail(where, `was forked at a mark of ${rec.fork_at}, where its steps file says ${steps.fork_at}`);
    if (fill.length !== rec.fork.core + rec.fork.more || rec.fork.core !== steps.core.length) fail(where, 'does not count one fill attempt for each step before the fork');
    else if (fill.at(-1).step !== rec.fork.after || fill.at(-1).context_after !== rec.fork.context || rec.fork.context < rec.fork_at) {
      fail(where, 'is not forked where its last fill step ended, past the mark');
    } else if (fill.slice(rec.fork.core - 1, -1).some((a) => a.context_after >= rec.fork_at)) fail(where, 'passed the mark before the step it was forked after');
    if (score.fork.after !== rec.fork.after || score.fork.context !== rec.fork.context) fail(where, 'is forked at one point in scores.json and another in steps.json');
    for (const k of kinds) if (add(fill, k) !== score.fork.tokens[k]) fail(where, `its fill's ${k} tokens are not those of its counted steps`);
    const v = rec.versions;
    if (!v.claude_code?.startsWith(PINS.claudeCode) || v.model !== PINS.model || v.exposurie !== PINS.exposurie) fail(where, 'ran under versions other than the pinned ones');

    for (const p of STRATEGIES) {
      const at = `${where} ${p}`;
      const sc = score.strategies[p];
      if (!sc) {
        fail(at, 'has no scores: the strategy did not finish');
        continue;
      }
      strategiesKeyed += 1;
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
console.log(
  `${BATCHES.filter((b) => cellsOf[b]).length} batches keyed, ${Object.values(cellsOf).flat().length} runs. ` +
    (n ? `Right answers, areas 1–7: ${CONDITIONS.map((c) => `${c} ${n.right_answers.pooled[c]}`).join(', ')} of ${n.right_answers.of}. ` : '') +
    `Area 9: ${longTasks.length} long tasks, ${strategiesKeyed} strategies keyed. ` +
    `${Object.keys(written).filter((r) => r.endsWith('.svg')).length} charts.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe results hold.');
