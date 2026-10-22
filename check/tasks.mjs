// The task check (part 4): every task, its checks, its starter and its
// condition files, held against the fact sheets and the method.
//
//   node check/tasks.mjs
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loginIdentity } from '../runner/sandbox.mjs';
import { LONG_GROUPS, holds, longScores, looks, verdict } from '../score/checks.mjs';
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

// ---- area 9: the long sessions (part 8), held to design.md's method
const long = tasks.filter((t) => t.area === BUILT_LATER);
const LONG_SCOPES = [...SCOPES, 'writes'];
const stepText = (s) => (typeof s === 'string' ? s : s?.say);
let longSteps = 0;
let longMaterial = 0;
for (const t of long) {
  if (t.user !== 'developer') fail(t.id, "both long tasks are the developer's");
  if (!t.steps) continue;
  for (const k of ['folder', 'starter', 'steps']) if (typeof t[k] !== 'string' || !t[k]) fail(t.id, `needs ${k}`);
  const file = join(TASKS, t.steps);
  if (!existsSync(file)) {
    fail(t.id, `steps file ${t.steps} does not exist`);
    continue;
  }
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const where = `tasks/${t.steps}`;
  // Interrupted at half of Sonnet 5.5's 1,000,000-token window, as decided on 2026-10-21.
  if (s.fork_at !== 500_000) fail(where, `fork_at is ${s.fork_at}, not 500000`);
  if (typeof s.resume_note !== 'string' || !/^[^.!?]+[.!?]$/.test(s.resume_note.trim())) fail(where, 'the resume note is one sentence');
  const steps = ['core', 'more', 'after'].flatMap((phase) => {
    if (!Array.isArray(s[phase]) || !s[phase].length) fail(where, `needs ${phase} steps`);
    return (s[phase] ?? []).map((step, i) => ({ phase, i, step }));
  });
  longSteps += steps.length;

  // Each step is its text, and what the developer saved for it, from the task's material.
  const material = join(dirname(file), t.id);
  const handed = new Set();
  for (const { phase, i, step } of steps) {
    const at = `${where} ${phase}[${i}]`;
    const say = stepText(step);
    if (typeof say !== 'string' || !say.trim()) fail(at, 'has no text');
    // Windows caps a whole command line at 32,767 characters, and a step goes in as one argument.
    else if (say.length > 8000) fail(at, `is ${say.length} characters, too long to pass as an argument`);
    if (typeof step !== 'string' && Object.keys(step).some((k) => !['say', 'files'].includes(k))) fail(at, 'a step is { say, files }');
    for (const [to, from] of Object.entries(step.files ?? {})) {
      if (!to.startsWith('tmp/')) fail(at, `${to}: what the developer saves goes in tmp/`);
      if (!existsSync(join(material, from))) fail(at, `${from} is not in tasks/long/${t.id}/`);
      handed.add(from);
    }
  }
  if (s.after?.some((step) => typeof step !== 'string' && step.files)) fail(where, 'an after step hands over nothing, so every strategy gets the same steps');
  const materialFiles = existsSync(material) ? filesIn(material) : [];
  longMaterial += materialFiles.length;
  for (const f of materialFiles) if (!handed.has(f.path)) fail(`tasks/long/${t.id}/${f.path}`, 'no step hands it over');

  // The checks: finished, kept and retried, each a script or read by hand.
  const ids = new Set();
  for (const g of LONG_GROUPS) {
    if (!s.checks?.[g]?.length) fail(where, `needs ${g} checks`);
    for (const c of s.checks?.[g] ?? []) {
      const at = `${where} ${g} ${c.id}`;
      if (!c.id || ids.has(c.id)) fail(at, 'needs an id of its own');
      ids.add(c.id);
      if (typeof c.what !== 'string' || !c.what) fail(at, 'needs what');
      if (c.hand) {
        if (looks(c)) fail(at, 'a check read by hand has no script');
        continue;
      }
      if (!looks(c)) {
        fail(at, 'needs spellings or patterns, or hand');
        continue;
      }
      if (!LONG_SCOPES.includes(c.in)) fail(at, `reads "${c.in}", not one of ${LONG_SCOPES.join(', ')}`);
      if (g === 'retried' && c.in !== 'writes') fail(at, 'a retried check reads every write after the fork');
      if (c.file && c.in === 'answer') fail(at, 'narrows to a file but reads no files');
      const kinds = ['all', 'none'].filter((k) => c[k]);
      if (kinds.length > 1 || (kinds.length && (c.any || c.patterns))) fail(at, 'mixes all, none and any');
      for (const p of c.patterns ?? []) {
        try {
          new RegExp(p, 'mu');
        } catch (e) {
          fail(at, `pattern ${p}: ${e.message}`);
        }
      }
    }
  }
  const scripted = (g) => (s.checks?.[g] ?? []).filter((c) => !c.hand && looks(c));

  // A decision said only in conversation must not come back in the steps after the fork.
  for (const text of [s.resume_note, ...(s.after ?? []).map(stepText)]) {
    for (const c of scripted('kept')) {
      if (holds({ ...c, in: 'answer', file: undefined }, { answer: text ?? '' })) fail(`${where} kept ${c.id}`, `an after step gives it away: "${String(text).slice(0, 60)}…"`);
    }
  }

  // The examples score the way they were written to.
  for (const kind of ['right', 'retry', 'forgot']) {
    const ex = s.examples?.[kind];
    if (!Array.isArray(ex) || ex.length !== (s.after ?? []).length) {
      fail(where, `needs ${kind} examples, one per after step`);
      continue;
    }
    const files = new Map();
    for (const e of ex) for (const f of e.files ?? []) files.set(f.path, f.text);
    const run = { answer: ex.at(-1).answer ?? '', files: [...files].map(([path, text]) => ({ path, text })), writes: ex.flatMap((e) => e.files ?? []) };
    const got = longScores(s.checks ?? {}, run);
    const off = (g, want) => Object.entries(got[g]).filter(([, v]) => v !== null && v !== want).map(([id]) => id);
    if (kind === 'right') {
      for (const g of ['finished', 'kept']) if (off(g, true).length) fail(`${where} right`, `${g} misses ${off(g, true).join(', ')}`);
      if (off('retried', false).length) fail(`${where} right`, `retried finds ${off('retried', false).join(', ')}`);
    }
    if (kind === 'retry' && off('retried', true).length) fail(`${where} retry`, `retried misses ${off('retried', true).join(', ')}`);
    if (kind === 'forgot') {
      if (off('finished', true).length) fail(`${where} forgot`, `finished misses ${off('finished', true).join(', ')}`);
      if (!Object.values(got.kept).some((v) => v === false)) fail(`${where} forgot`, 'loses no decision');
    }
  }

  // The starter is the repository before the session: no file of it passes a
  // check on its own, since a strategy that changes the file brings it all into
  // scope, and none holds a failed approach a rewrite would carry along.
  const starter = join(TASKS, t.starter ?? '');
  if (!t.starter || !existsSync(starter)) fail(t.id, `starter ${t.starter} does not exist`);
  else {
    for (const f of filesIn(starter).filter((f) => isText(f.path))) {
      const one = { path: f.path, text: readFileSync(f.full, 'utf8') };
      for (const c of [...scripted('finished'), ...scripted('kept')].filter((c) => c.in !== 'answer')) {
        if (holds(c, { answer: '', files: [one] })) fail(`${t.id} starter`, `${f.path} already passes ${c.id}`);
      }
      for (const c of scripted('retried')) {
        if (holds({ ...c, in: 'files' }, { files: [one] })) fail(`${t.id} starter`, `${f.path} already holds ${c.id}`);
      }
    }
  }

  // The steps file and the material are what the task's own script writes.
  const script = join(TASKS, 'long', `${t.id}.mjs`);
  if (!existsSync(script)) fail(t.id, `no tasks/long/${t.id}.mjs writes its steps`);
  else {
    const { build } = await import(pathToFileURL(script).href);
    const { steps: want, material: wantMaterial } = build();
    if (`${JSON.stringify(want, null, 2)}\n` !== readFileSync(file, 'utf8')) fail(where, `is out of date; run node tasks/long/${t.id}.mjs`);
    const have = new Map(materialFiles.map((f) => [f.path, f.full]));
    for (const [path, text] of wantMaterial) {
      if (!have.has(path)) fail(`tasks/long/${t.id}/${path}`, `is missing; run node tasks/long/${t.id}.mjs`);
      else if (readFileSync(have.get(path), 'utf8') !== text) fail(`tasks/long/${t.id}/${path}`, `is out of date; run node tasks/long/${t.id}.mjs`);
    }
    for (const path of have.keys()) if (!wantMaterial.has(path)) fail(`tasks/long/${t.id}/${path}`, `is not written by tasks/long/${t.id}.mjs`);
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
    `${examples.length} examples scored. Long tasks written: ${long.filter((t) => t.steps).map((t) => t.id).join(', ') || 'none'}, ` +
    `${longSteps} steps, ${longMaterial} files of material.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe tasks hold.');
