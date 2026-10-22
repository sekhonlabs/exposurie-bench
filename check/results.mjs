// The results check (part 9): what the numbers are computed from is complete,
// and results/ holds exactly what score/results.mjs writes from it, in the look.
//
//   node check/results.mjs
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginIdentity } from '../runner/sandbox.mjs';
import { AREAS, BATCHES, CONDITIONS, USERS, outputs } from '../score/results.mjs';
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
  if (/(?<![A-Za-z])[A-Za-z]:\\/.test(text)) fail(rel, 'holds a Windows path');
}

// ---- what there is
const n = written['results/numbers.json'] ? JSON.parse(written['results/numbers.json']) : null;
console.log(
  `${BATCHES.filter((b) => cellsOf[b]).length} batches keyed, ${Object.values(cellsOf).flat().length} runs. ` +
    (n ? `Right answers, areas 1–7: ${CONDITIONS.map((c) => `${c} ${n.right_answers.pooled[c]}`).join(', ')} of ${n.right_answers.of}. ` : '') +
    `${Object.keys(written).filter((r) => r.endsWith('.svg')).length} charts.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe results hold.');
