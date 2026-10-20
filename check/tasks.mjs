// The task check (part 4): every task, its checks, its starter and its
// condition files, held against the fact sheets and the method.
//
//   node check/tasks.mjs
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginIdentity } from '../runner/sandbox.mjs';
import { holds, looks, verdict } from '../score/checks.mjs';
import { USERS, checkHistory } from './history.mjs';
import { CONDITIONS, conditionFiles, factsFor } from '../tasks/conditions.mjs';
import { find } from './text.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = join(REPO, 'tasks');
const readJson = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));

/** Areas answered from what the history says; area 4's answer is that it never says. */
const JUDGED = [4, 5];
const WORK = [6, 7];
const SCOPES = ['answer', 'files', 'files+answer'];
const BUILT_LATER = 9;

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

const tasks = readJson('tasks', 'index.json').tasks;
const sheets = Object.fromEntries(USERS.map((u) => [u, readJson('users', u, 'facts.json')]));
const factOf = (user, id) => sheets[user].facts.find((f) => f.id === id);
const reads = (c, what) => c.in === what || c.in === 'files+answer';

/** Every file in a folder, with `/` in its path. */
function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push({ path: relative(dir, p).replace(/\\/g, '/'), full: p });
    }
  };
  walk(dir);
  return out;
}

const isText = (path) => !/\.(jpe?g|png|gif|webp|ico)$/i.test(path);

// ---- each task on its own
const built = tasks.filter((t) => t.area !== BUILT_LATER);
for (const t of built) {
  const sheet = sheets[t.user];
  if (!sheet) {
    fail(t.id, `unknown user ${t.user}`);
    continue;
  }
  for (const k of ['ask', 'folder', 'judge']) if (typeof t[k] !== 'string' || !t[k].trim()) fail(t.id, `needs ${k}`);
  for (const k of ['required', 'forbidden']) if (!Array.isArray(t[k])) fail(t.id, `needs a ${k} list`);
  if (!Array.isArray(t.required) || !Array.isArray(t.forbidden)) continue;

  const judged = JUDGED.includes(t.area);
  if (t.score !== (judged ? 'judge' : 'script')) fail(t.id, `area ${t.area} is scored by ${judged ? 'the judge' : 'its checks'}, not "${t.score}"`);
  if (!judged && !t.required.some(looks)) fail(t.id, 'has no check to score it by');
  if (WORK.includes(t.area)) {
    if (!t.required.some((c) => looks(c) && reads(c, 'files'))) fail(t.id, 'a work task is checked from the files it writes');
  } else {
    if (t.starter !== null) fail(t.id, 'only areas 6 and 7 have starters');
    if (t.folder !== 'scratch') fail(t.id, `runs in an empty folder named scratch, not ${t.folder}`);
  }

  for (const [list, c] of [...t.required.map((c) => ['required', c]), ...t.forbidden.map((c) => ['forbidden', c])]) {
    const where = `${t.id} ${list}${c.fact ? ` ${c.fact}` : ''}`;
    if (c.fact !== null && !factOf(t.user, c.fact)) fail(where, 'no such fact');
    if (!looks(c)) {
      if (!judged || c.fact === null) fail(where, 'a check needs spellings or patterns');
      continue;
    }
    if (judged) fail(where, 'a judged task lists its facts without checks');
    if (!SCOPES.includes(c.in)) fail(where, `reads "${c.in}", not one of ${SCOPES.join(', ')}`);
    if (c.file && !reads(c, 'files')) fail(where, 'narrows to a file but reads no files');
    if (c.text && c.text !== 'visible') fail(where, `unknown text "${c.text}"`);
    const kinds = ['all', 'none'].filter((k) => c[k]);
    if (kinds.length > 1 || (kinds.length && (c.any || c.patterns))) fail(where, 'mixes all, none and any');
    for (const s of [...(c.any ?? []), ...(c.all ?? []), ...(c.none ?? [])]) {
      if (typeof s !== 'string' || !s) fail(where, 'an empty spelling');
      else if (/[`‘’“”]/.test(s)) fail(where, `"${s}": answers are read without backticks and with straight quotes`);
    }
    for (const p of c.patterns ?? []) {
      try {
        new RegExp(p, 'mu');
      } catch (e) {
        fail(where, `pattern ${p}: ${e.message}`);
      }
    }
  }

  // The facts that answer a task, and the ones that would be wrong, come from the fact sheet.
  const required = new Set(t.required.map((c) => c.fact).filter(Boolean));
  const forbidden = new Set(t.forbidden.map((c) => c.fact).filter(Boolean));
  for (const f of sheet.facts) {
    if (f.tasks.includes(t.id) && !required.has(f.id)) fail(t.id, `${f.id} answers it, but no required check names it`);
    if (f.traps.includes(t.id) && !forbidden.has(f.id)) fail(t.id, `${f.id} is a trap for it, but no forbidden check names it`);
  }
  for (const id of required) if (!factOf(t.user, id)?.tasks.includes(t.id)) fail(t.id, `requires ${id}, whose tasks do not list it`);
  for (const id of forbidden) {
    if (!required.has(id) && !factOf(t.user, id)?.traps.includes(t.id)) fail(t.id, `forbids ${id}, whose traps do not list it`);
  }

  // A fact check must not pass on the question itself, or on a fresh agent's guess.
  for (const c of t.required.filter((c) => c.fact && looks(c) && !c.none)) {
    if (reads(c, 'answer') && holds(c, { answer: t.ask })) fail(`${t.id} ${c.fact}`, 'the question itself passes this check');
    const guess = factOf(t.user, c.fact)?.guess;
    if (guess && reads(c, 'answer') && holds(c, { answer: guess })) fail(`${t.id} ${c.fact}`, `the fresh guess "${guess}" passes this check`);
  }

  // A starter is a copy of the project as the history leaves it. A run that
  // changes one of its files brings that whole file into scope, so no file of
  // it may pass a fact check on its own.
  if (t.starter) {
    const dir = join(TASKS, t.starter);
    if (!existsSync(dir)) {
      fail(t.id, `starter ${t.starter} does not exist`);
      continue;
    }
    for (const f of filesIn(dir).filter((f) => isText(f.path))) {
      const file = { path: f.path, text: readFileSync(f.full, 'utf8') };
      for (const c of t.required.filter((c) => c.fact && looks(c) && !c.none && reads(c, 'files'))) {
        if (holds(c, { answer: '', files: [file] })) fail(`${t.id} starter`, `${f.path} already passes the check for ${c.fact}`);
      }
    }
  }
}

// ---- what no file under tasks/ may hold
const LOGIN = loginIdentity();
const chatOnly = Object.fromEntries(USERS.map((u) => {
  const area7 = new Set(tasks.filter((t) => t.user === u && t.area === 7).map((t) => t.id));
  return [u, sheets[u].facts.filter((f) => f.tasks.some((id) => area7.has(id)))];
}));
for (const t of built.filter((t) => t.starter && existsSync(join(TASKS, t.starter)))) {
  for (const f of filesIn(join(TASKS, t.starter)).filter((f) => isText(f.path))) {
    const text = readFileSync(f.full, 'utf8');
    for (const fact of chatOnly[t.user]) {
      // A starter is what Claude Code built; area 7's plans were only ever made in claude.ai.
      for (const m of fact.match) if (find(text, m, !!fact.exact_case) >= 0) fail(`${t.id} starter`, `${f.path} holds "${m}", planned only in claude.ai`);
    }
  }
}
for (const f of filesIn(TASKS).filter((f) => isText(f.path))) {
  const text = readFileSync(f.full, 'utf8');
  const where = `tasks/${f.path}`;
  if (/\r\n/.test(text)) fail(where, 'has CRLF line endings');
  if (/(?<![A-Za-z])[A-Za-z]:\\/.test(text)) fail(where, 'holds a Windows path');
  for (const id of LOGIN) if (find(text, id) >= 0) fail(where, `holds the sandbox login's own ${id.includes('@') ? 'email address' : 'name'}`);
}

// ---- the condition files are what tasks/conditions.mjs writes
const want = conditionFiles();
const have = existsSync(CONDITIONS) ? readdirSync(CONDITIONS) : [];
for (const [name, text] of want) {
  if (!have.includes(name)) fail('tasks/conditions', `${name} is missing; run node tasks/conditions.mjs`);
  else if (readFileSync(join(CONDITIONS, name), 'utf8') !== text) fail('tasks/conditions', `${name} is out of date; run node tasks/conditions.mjs`);
}
for (const name of have) if (!want.has(name)) fail('tasks/conditions', `${name} is not a condition file`);
for (const t of built.filter((t) => t.area !== 8)) {
  if (!factsFor(t).length) fail(t.id, 'D would get no facts for it');
}

// ---- the checks read the examples the way they were written to be read
const examples = readJson('tasks', 'examples.json').examples;
for (const e of examples) {
  const t = built.find((x) => x.id === e.task);
  if (!t) {
    fail('tasks/examples.json', `an example for unknown task ${e.task}`);
    continue;
  }
  const got = verdict(t, { answer: e.answer ?? '', files: e.files ?? [] });
  if (got !== e.expect) fail(`${t.id} example`, `expected ${e.expect}, scored ${got}: "${(e.answer ?? '').slice(0, 60)}"`);
}
for (const t of built.filter((t) => t.score === 'script')) {
  for (const want of ['right', 'wrong']) {
    if (!examples.some((e) => e.task === t.id && e.expect === want)) fail(t.id, `needs an example scored ${want}`);
  }
}

// ---- no question appears in the history (the history checker's own rule)
for (const user of USERS) {
  const r = await checkHistory(user);
  for (const p of r.problems.filter((p) => p.includes('the question of'))) fail(user, p);
}

// ---- what there is
const by = (pred) => built.filter(pred).length;
console.log(
  `${built.length} tasks built, ${tasks.length - built.length} for part 8: ` +
    `${by((t) => t.score === 'script')} scored by their checks, ${by((t) => t.score === 'judge')} by the judge, ` +
    `${by((t) => t.starter)} with a starter. ${want.size} condition files: ` +
    `${[...want.keys()].filter((n) => n.startsWith('history-')).length} for B, ${[...want.keys()].filter((n) => n.startsWith('facts-')).length} for D. ` +
    `${examples.length} examples scored.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe tasks hold.');
