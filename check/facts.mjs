// The fact-sheet check: both users' facts, their session lists and the task
// index, held against each other and against the method in docs/design.md,
// before any history exists. Part 3's history checker runs over the generated
// text with the same matching rule, `mentions`.
//
//   node check/facts.mjs
//
// Exit 0 when everything holds. Exit 1 lists every problem. Notes are printed
// either way and never fail the check.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USERS = ['developer', 'delegator'];
const SURFACES = ['terminal', 'vscode', 'desktop', 'claude.ai'];
const HOW = ['user', 'agent', 'correction'];
const CONTEXTS = ['personal', 'work'];

/** Tasks per area: three in each, two in area 9 (design.md, Size). */
const PER_AREA = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 };
/** Areas whose tasks are answered from planted facts. Area 4's answer is "not recorded". */
const FACT_AREAS = [1, 2, 3, 5, 6, 7];
/** design.md: 3–4 times more facts that no task asks about than facts a task does. */
const RATIO = [3, 4];

const problems = [];
const notes = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

const read = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));

/**
 * Does `text` mention `needle`, the way the scorer and the history checker read it?
 *
 * Case-insensitive unless the fact sets `exact_case`, and whole words only where
 * the needle starts or ends with a letter or digit, so `ams` is not found in
 * `teams` and `MIT` is not found in `submit`.
 */
export function mentions(text, needle, exactCase = false) {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pre = /^\w/.test(needle) ? '(?<!\\w)' : '';
  const post = /\w$/.test(needle) ? '(?!\\w)' : '';
  return new RegExp(pre + esc + post, exactCase ? 'u' : 'iu').test(text);
}

const tasks = read('tasks', 'index.json').tasks;
const taskById = new Map();
for (const t of tasks) {
  if (taskById.has(t.id)) fail('tasks', `${t.id} is listed twice`);
  taskById.set(t.id, t);
  if (!USERS.includes(t.user)) fail(t.id, `unknown user ${t.user}`);
  if (!PER_AREA[t.area]) fail(t.id, `unknown area ${t.area}`);
  if (!t.ask) fail(t.id, 'has no question');
}
for (const [area, n] of Object.entries(PER_AREA)) {
  const got = tasks.filter((t) => t.area === Number(area)).length;
  if (got !== n) fail('tasks', `area ${area} has ${got} tasks, the method says ${n}`);
}

const summaries = [];
for (const user of USERS) checkUser(user);

for (const line of summaries) console.log(line);
if (notes.length) {
  console.log(`\n${notes.length} note${notes.length === 1 ? '' : 's'}:`);
  for (const n of notes) console.log(`  ${n}`);
}
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe fact sheets hold.');

function checkUser(user) {
  const plan = read('users', user, 'plan.json');
  const sheet = read('users', user, 'facts.json');
  const projects = new Set(sheet.projects.map((p) => p.id));

  // ---- sessions
  const sessions = new Map();
  let last = 0;
  for (const s of plan.sessions) {
    const where = `${user}/${s.id}`;
    if (sessions.has(s.id)) fail(where, 'listed twice');
    const at = Date.parse(s.at);
    if (Number.isNaN(at)) fail(where, `time ${s.at} does not parse`);
    else if (at <= last) fail(where, 'is not later than the session before it');
    last = at;
    if (!SURFACES.includes(s.surface)) fail(where, `unknown surface ${s.surface}`);
    if (s.surface === 'claude.ai') {
      if (!s.title) fail(where, 'a claude.ai chat needs a title');
      if (!['planning', 'life'].includes(s.kind)) fail(where, `a claude.ai chat cannot be "${s.kind}"`);
    } else {
      if (!projects.has(s.project)) fail(where, `unknown project ${s.project}`);
      if (!['build', 'distractor'].includes(s.kind)) fail(where, `a Claude Code session cannot be "${s.kind}"`);
    }
    sessions.set(s.id, { ...s, order: sessions.size });
  }
  const sourceOf = (s) => (s.surface === 'claude.ai' ? 'claude.ai' : 'claude-code');

  // ---- facts
  const facts = new Map();
  for (const f of sheet.facts) {
    const where = `${user}/${f.id}`;
    if (facts.has(f.id)) fail(where, 'listed twice');
    facts.set(f.id, f);
    if (!CONTEXTS.includes(f.context)) fail(where, `unknown context ${f.context}`);
    if (f.project !== null && !projects.has(f.project)) fail(where, `unknown project ${f.project}`);
    for (const k of ['kind', 'value']) if (typeof f[k] !== 'string' || !f[k]) fail(where, `needs a ${k}`);
    if (!Array.isArray(f.match) || !f.match.length || f.match.some((m) => typeof m !== 'string' || !m)) {
      fail(where, 'needs at least one spelling in match');
    }
    if (f.guess !== null && typeof f.guess !== 'string') fail(where, 'guess must be text or null');
    if (!HOW.includes(f.how)) fail(where, `unknown how ${f.how}`);
    const s = sessions.get(f.first_session);
    if (!s) fail(where, `unknown session ${f.first_session}`);
    else if (f.source !== sourceOf(s)) fail(where, `source ${f.source}, but ${s.id} is ${sourceOf(s)}`);
    for (const list of ['tasks', 'traps']) {
      if (!Array.isArray(f[list])) {
        fail(where, `needs a ${list} list`);
        f[list] = [];
      }
      for (const id of f[list]) {
        const t = taskById.get(id);
        if (!t) fail(where, `unknown task ${id}`);
        else if (t.user !== user) fail(where, `task ${id} belongs to the ${t.user}`);
      }
    }
    for (const r of f.rejected || []) {
      if (!r.value || !Array.isArray(r.match) || !r.match.length) fail(where, 'a rejected option needs a value and spellings');
      if (!sessions.has(r.session)) fail(where, `rejected option ${r.value} names unknown session ${r.session}`);
    }
  }

  // ---- replaced decisions
  for (const f of facts.values()) {
    const where = `${user}/${f.id}`;
    if (f.replaced_by) {
      const next = facts.get(f.replaced_by);
      if (!next) fail(where, `replaced by unknown fact ${f.replaced_by}`);
      else {
        if (next.replaces !== f.id) fail(where, `${next.id} does not say it replaces ${f.id}`);
        if (next.kind !== f.kind) fail(where, `replaced by a fact of another kind (${next.kind})`);
        const a = sessions.get(f.first_session);
        const b = sessions.get(next.first_session);
        if (a && b && b.order <= a.order) fail(where, `its replacement is said no later than it is`);
      }
    }
    if (f.replaces && facts.get(f.replaces)?.replaced_by !== f.id) {
      fail(where, `${f.replaces} does not say it is replaced by ${f.id}`);
    }
  }

  // ---- every session plants something, unless it is a distractor
  for (const s of sessions.values()) {
    const planted = [...facts.values()].filter((f) => f.first_session === s.id).length;
    if (s.kind === 'distractor' && planted) fail(`${user}/${s.id}`, `a distractor, but ${planted} fact(s) are first said in it`);
    if (s.kind !== 'distractor' && !planted) fail(`${user}/${s.id}`, 'no fact is first said in it; make it a distractor or plant one');
  }
  for (const p of projects) {
    if (![...sessions.values()].some((s) => s.project === p)) fail(`${user}/${p}`, 'no session takes place in this project');
  }

  // ---- facts a task asks about must not be guessable
  const asked = [...facts.values()].filter((f) => f.tasks.length || f.traps.length);
  for (const f of asked) {
    if (!f.tasks.length || f.guess === null) continue;
    if (f.match.some((m) => mentions(f.guess, m, f.exact_case))) {
      fail(`${user}/${f.id}`, `the fresh agent's guess "${f.guess}" already gives the answer`);
    }
  }
  const unasked = facts.size - asked.length;
  const ratio = unasked / asked.length;
  if (ratio < RATIO[0] || ratio > RATIO[1]) {
    fail(user, `${unasked} unasked facts to ${asked.length} asked is ${ratio.toFixed(2)}x; the method says ${RATIO[0]}-${RATIO[1]}x`);
  }

  // ---- tasks and the facts that answer them
  const mine = tasks.filter((t) => t.user === user);
  const answers = (t) => [...facts.values()].filter((f) => f.tasks.includes(t.id));
  for (const t of mine) {
    const n = answers(t).length;
    if (FACT_AREAS.includes(t.area) && !n) fail(t.id, 'no fact answers it');
    if (!FACT_AREAS.includes(t.area) && n) fail(t.id, `area ${t.area} is not answered from facts, but ${n} fact(s) list it`);
    if (t.area === 7) {
      for (const f of answers(t)) {
        if (f.source !== 'claude.ai') fail(t.id, `${f.id} is said in Claude Code; area 7's facts come only from claude.ai`);
      }
    }
  }

  // ---- area 4: what is never discussed
  const never = sheet.never_discussed || [];
  for (const t of mine.filter((x) => x.area === 4)) {
    if (!never.some((n) => n.tasks.includes(t.id))) fail(t.id, 'area 4 needs a never_discussed entry');
  }
  for (const n of never) {
    const where = `${user}/${n.id}`;
    for (const id of n.tasks) {
      const t = taskById.get(id);
      if (!t || t.user !== user || t.area !== 4) fail(where, `${id} is not one of this user's area 4 tasks`);
    }
    for (const id of n.near) if (!facts.has(id)) fail(where, `near fact ${id} does not exist`);
    // A planted fact that uses a forbidden word would put the topic in the history itself.
    for (const f of facts.values()) {
      const said = [f.value, f.why || '', ...f.match, ...(f.rejected || []).flatMap((r) => [r.value, ...r.match])]
        .join(' \n ')
        .toLowerCase();
      for (const w of n.never_say) {
        if (said.includes(w.toLowerCase())) fail(where, `"${w}" is in ${f.id}, so the topic would be discussed`);
      }
    }
  }

  // ---- spellings planned to appear before a fact's own session
  // Allowed: "Postgres" may be rejected for Satchel before work's Postgres is
  // first said. But when every spelling of a fact is planned earlier, the history
  // checker cannot see where the fact itself is first said.
  const plannedIn = new Map([...sessions.keys()].map((id) => [id, []]));
  for (const f of facts.values()) {
    plannedIn.get(f.first_session)?.push(...f.match);
    for (const r of f.rejected || []) plannedIn.get(r.session)?.push(...r.match);
  }
  for (const f of facts.values()) {
    const own = sessions.get(f.first_session);
    if (!own) continue;
    const earlier = [...sessions.values()].filter((s) => s.order < own.order);
    const early = (m) => earlier.find((s) => plannedIn.get(s.id).some((p) => mentions(p, m, f.exact_case)));
    if (f.match.every(early)) {
      notes.push(`${user}/${f.id}: every spelling is planned before ${f.first_session} (first in ${early(f.match[0]).id})`);
    }
  }

  // ---- what there is, in numbers
  const cc = [...sessions.values()].filter((s) => s.surface !== 'claude.ai');
  const work = cc.filter((s) => sheet.projects.find((p) => p.id === s.project)?.context === 'work').length;
  const web = sessions.size - cc.length;
  const byAgent = asked.filter((f) => f.tasks.length && f.how === 'agent').length;
  const answered = asked.filter((f) => f.tasks.length).length;
  summaries.push(
    `${user}: ${cc.length} Claude Code sessions (${work} at work)` +
      (web ? ` and ${web} claude.ai chats` : '') +
      `, ${sheet.projects.length} projects, ${facts.size} facts: ${asked.length} asked, ${unasked} not ` +
      `(${ratio.toFixed(2)}x), ${byAgent} of ${answered} answers proposed by the agent, ` +
      `${mine.length} tasks, ${never.length} never discussed`,
  );
}
