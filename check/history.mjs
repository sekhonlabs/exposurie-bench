// The history checker (part 3), and the rules every session is generated to
// (part 2). The generator holds each new session to `checkSession` before it
// keeps it, so a history that was generated is a history that passes here.
//
//   node check/history.mjs [developer|delegator]   every session, and the briefs
//   node check/history.mjs --briefs                the briefs only, before any session exists
//   node check/history.mjs --partial               sessions not written yet are notes, not problems
//   node check/history.mjs --readers               also convert each history and read it back
//                                                  with exposurie's own readers
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { around, colourCodes, find, mentions } from './text.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const USERS = ['developer', 'delegator'];
const readJson = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));

/** design.md: about 80K tokens of conversation per user, counted on the text exposurie reads. */
export const TARGET_TOKENS = 80_000;
const SIZE_BAND = [0.8, 1.2];
/** Characters per token for English prose with some code. The generation log keeps the API's own counts. */
export const CHARS_PER_TOKEN = 4;
/** A session far from its planned length was not written from its brief. */
const LENGTH_BAND = [0.5, 2];
const WORDS_PER_TOKEN = 0.75;
/** A run of this many words from a task's question is the question. */
const SHINGLE = 8;

export const sessionFile = (user, id) => join(REPO, 'users', user, 'sessions', `${id}.md`);
export const sourceOf = (s) => (s.surface === 'claude.ai' ? 'claude.ai' : 'claude-code');

/** Everything about one user that the rules are worked out from. */
export function loadUser(user) {
  const plan = readJson('users', user, 'plan.json');
  const sheet = readJson('users', user, 'facts.json');
  const allTasks = readJson('tasks', 'index.json').tasks;
  const rivals = readJson('check', 'rivals.json');
  const sessions = new Map(plan.sessions.map((s, order) => [s.id, { ...s, order }]));
  const facts = new Map(sheet.facts.map((f) => [f.id, f]));
  const order = (id) => sessions.get(id)?.order ?? Infinity;
  const exactList = new Set(rivals.exact_case);

  // The order of the session where a fact stops being current, or Infinity.
  const replacedAt = (f) => (f.replaced_by ? order(facts.get(f.replaced_by).first_session) : Infinity);
  // Current at session s, the replacing session included: it may still be named while it is replaced.
  const live = (f, s) => order(f.first_session) <= s.order && s.order <= replacedAt(f);

  const vocabulary = new Map();
  const addTerm = (term) => vocabulary.set(term.toLowerCase(), { term, exact: exactList.has(term) });
  for (const list of Object.values(rivals.terms)) list.forEach(addTerm);
  for (const f of facts.values()) for (const r of f.rejected || []) r.match.forEach(addTerm);

  // Area 7 tests whether a plan made only in claude.ai reaches the coding agent,
  // so nothing first said in those planning chats may reach a Claude Code session.
  const area7 = new Set(allTasks.filter((t) => t.user === user && t.area === 7).map((t) => t.id));
  const chats7 = new Set([...facts.values()].filter((f) => f.tasks.some((t) => area7.has(t))).map((f) => f.first_session));
  const chatOnly = [...facts.values()].filter((f) => chats7.has(f.first_session));

  return {
    user, plan, sheet, sessions, facts, order, replacedAt, live, vocabulary, exactList, chatOnly,
    tasks: allTasks.filter((t) => t.user === user),
  };
}

/** What session `id` must say, and what it must not. */
export function rulesFor(u, id) {
  const s = u.sessions.get(id);
  const facts = [...u.facts.values()];
  const exact = (m) => u.exactList.has(m);

  const planned = [];
  for (const f of facts) {
    if (u.live(f, s)) planned.push(f.value, ...f.match, f.why || '', ...(f.why_match || []));
    for (const r of f.rejected || []) if (r.session === id) planned.push(r.value, ...r.match);
  }
  const licensed = (term, ex) => planned.some((t) => mentions(t, term, ex));

  const required = facts
    .filter((f) => f.first_session === id)
    .map((f) => ({
      id: f.id, value: f.value, how: f.how, why: f.why || null, spellings: f.match,
      all: !!f.match_all, exact: !!f.exact_case, whyMatch: f.why_match || null,
    }));
  const rejected = facts.flatMap((f) =>
    (f.rejected || []).filter((r) => r.session === id).map((r) => ({ fact: f.id, value: r.value, spellings: r.match })),
  );

  const forbidden = new Map();
  const ban = (term, ex, why, mode = 'word') => {
    const key = `${mode}|${ex ? term : term.toLowerCase()}`;
    if (!forbidden.has(key)) forbidden.set(key, { term, exact: ex, why, mode });
  };
  for (const { term, exact: ex } of u.vocabulary.values()) {
    if (!licensed(term, ex)) ban(term, ex, 'not planned in this session');
  }
  for (const f of facts) {
    if (u.order(f.first_session) > s.order) {
      for (const m of f.match) if (!licensed(m, !!f.exact_case)) ban(m, !!f.exact_case, `first said in ${f.first_session}`);
    }
    if (u.replacedAt(f) < s.order) {
      const by = u.facts.get(f.replaced_by).first_session;
      for (const m of f.match) ban(m, !!f.exact_case, `replaced in ${by}`);
    }
  }
  if (sourceOf(s) === 'claude-code') {
    for (const f of u.chatOnly) for (const m of f.match) ban(m, !!f.exact_case, `planned only in claude.ai, in ${f.first_session}`);
  }
  for (const n of u.sheet.never_discussed || []) {
    for (const w of n.never_say) ban(w, false, `never discussed: ${n.topic}`, 'substring');
  }

  const colours = new Set(
    facts.filter((f) => u.live(f, s)).flatMap((f) => f.match.flatMap(colourCodes)),
  );
  return { session: s, required, rejected, forbidden: [...forbidden.values()], colours, exact };
}

const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every rule that can be checked on one session's text alone. */
export function checkText(u, id, text, rules = rulesFor(u, id)) {
  const out = [];
  const q = (m) => `"${m}"`;
  for (const r of rules.required) {
    const said = r.all
      ? r.spellings.every((m) => mentions(text, m, r.exact))
      : r.spellings.some((m) => mentions(text, m, r.exact));
    if (!said) out.push(`${r.id} is not said (${r.all ? 'all of' : 'one of'} ${r.spellings.map(q).join(', ')})`);
    if (r.whyMatch && !r.whyMatch.some((m) => mentions(text, m))) {
      out.push(`the reason for ${r.id} is not said (one of ${r.whyMatch.map(q).join(', ')})`);
    }
  }
  for (const x of rules.rejected) {
    if (!x.spellings.some((m) => mentions(text, m, rules.exact(m)))) {
      out.push(`${x.value}, turned down for ${x.fact}, is not named (${x.spellings.map(q).join(', ')})`);
    }
  }
  out.push(...forbiddenIn(text, rules));
  const shingles = u.tasks.flatMap((t) => {
    const w = norm(t.ask).split(' ');
    return w.length < SHINGLE ? [] : w.slice(0, w.length - SHINGLE + 1).map((_, i) => [t.id, w.slice(i, i + SHINGLE).join(' ')]);
  });
  const flat = ` ${norm(text)} `;
  for (const [task, sh] of shingles) {
    if (flat.includes(` ${sh} `)) out.push(`the question of ${task} appears: "${sh}"`);
  }
  return out;
}

/** The forbidden words and colour codes in `text`. Also run over the briefs themselves. */
export function forbiddenIn(text, rules) {
  const out = [];
  const lower = text.toLowerCase();
  for (const f of rules.forbidden) {
    const at = f.mode === 'substring' ? lower.indexOf(f.term.toLowerCase()) : find(text, f.term, f.exact);
    if (at >= 0) out.push(`"${f.term}" must not appear (${f.why}): ${around(text, at)}`);
  }
  for (const c of colourCodes(text)) {
    if (!rules.colours.has(c)) out.push(`colour ${c} is not planned here${rules.colours.size ? ` (only ${[...rules.colours].join(', ')})` : ''}`);
  }
  return out;
}

const DELIM = /^## (User|Assistant)\s*$/;

/** The turns of a session body: `## User` and `## Assistant`, alternating. */
export function parseTurns(body) {
  const problems = [];
  const turns = [];
  let cur = null;
  const before = [];
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = DELIM.exec(line);
    if (m) {
      if (cur) turns.push(cur);
      cur = { role: m[1] === 'User' ? 'user' : 'assistant', lines: [] };
      continue;
    }
    if (!cur) {
      if (line.trim()) before.push(line);
      continue;
    }
    if (/^##? /.test(line)) problems.push(`a heading inside a turn: "${line.slice(0, 60)}"`);
    cur.lines.push(line);
  }
  if (cur) turns.push(cur);
  if (before.length) problems.push(`text before the first turn: "${before[0].slice(0, 60)}"`);
  const out = turns.map((t) => ({ role: t.role, text: t.lines.join('\n').trim() }));
  out.forEach((t, i) => {
    if (!t.text) problems.push(`turn ${i + 1} is empty`);
    if (t.role !== (i % 2 === 0 ? 'user' : 'assistant')) problems.push(`turn ${i + 1} should be the ${i % 2 === 0 ? 'user' : 'assistant'}`);
  });
  if (!out.length) problems.push('no turns');
  else if (out[out.length - 1].role !== 'assistant') problems.push('the last turn is not the assistant');
  return { turns: out, problems };
}

/** A session file: a header between `---` lines, then the turns. */
export function parseSession(md) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md.replace(/\r\n/g, '\n'));
  if (!m) return { header: null, turns: [], problems: ['no header'] };
  const header = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) header[kv[1]] = kv[2];
  }
  const { turns, problems } = parseTurns(md.replace(/\r\n/g, '\n').slice(m[0].length));
  return { header, turns, problems };
}

/** The header a session file carries, from its plan. */
export function headerFor(user, s) {
  const lines = [['id', s.id], ['user', user], ['at', s.at], ['surface', s.surface]];
  lines.push(s.surface === 'claude.ai' ? ['title', s.title] : ['project', s.project]);
  lines.push(['kind', s.kind]);
  return lines;
}

export const words = (text) => text.split(/\s+/).filter(Boolean).length;
export const textOf = (turns) => turns.map((t) => t.text).join('\n\n');

/** Everything about one session: its file's shape, its header, its text, its length. */
export function checkSession(u, id, md) {
  const s = u.sessions.get(id);
  const { header, turns, problems } = parseSession(md);
  const out = [...problems];
  if (header) {
    for (const [k, v] of headerFor(u.user, s)) {
      if (header[k] !== String(v)) out.push(`header ${k} is "${header[k] ?? ''}", the plan says "${v}"`);
    }
  }
  const users = turns.filter((t) => t.role === 'user').length;
  if (users < 3) out.push(`only ${users} user turn${users === 1 ? '' : 's'}`);
  const text = textOf(turns);
  out.push(...checkText(u, id, text));
  const want = s.brief?.tokens ? s.brief.tokens * WORDS_PER_TOKEN : null;
  const got = words(text);
  if (want && (got < want * LENGTH_BAND[0] || got > want * LENGTH_BAND[1])) {
    out.push(`${got} words, planned about ${Math.round(want)}`);
  }
  return { problems: out, turns, chars: text.length };
}

/** The briefs in plan.json, held to the same rules before any session is written from them. */
export function checkBriefs(u) {
  const out = [];
  const projects = new Set(u.sheet.projects.map((p) => p.id));
  for (const p of projects) {
    if (!u.plan.machine?.folders?.[p]) out.push(`${u.user}: no working folder for ${p} in plan.json's machine.folders`);
    else if (!u.plan.machine.folders[p].endsWith(`/${p}`)) out.push(`${u.user}: ${p}'s folder must end in /${p}, the name exposurie gives the project`);
  }
  let tokens = 0;
  for (const s of u.sessions.values()) {
    const where = `${u.user}/${s.id}`;
    const b = s.brief;
    if (!b) {
      out.push(`${where}: no brief`);
      continue;
    }
    for (const k of ['story']) if (typeof b[k] !== 'string' || !b[k]) out.push(`${where}: the brief needs a ${k}`);
    for (const k of ['turns', 'tokens']) if (!Number.isInteger(b[k]) || b[k] <= 0) out.push(`${where}: the brief needs ${k}`);
    tokens += b.tokens || 0;
    const planted = [...u.facts.values()].filter((f) => f.first_session === s.id).map((f) => f.id);
    const told = Object.keys(b.facts || {});
    for (const id of planted) if (!told.includes(id)) out.push(`${where}: the brief does not say how ${id} comes up`);
    for (const id of told) if (!planted.includes(id)) out.push(`${where}: the brief plants ${id}, which facts.json first says in ${u.facts.get(id)?.first_session ?? 'no session'}`);
    for (const id of b.again || []) {
      const f = u.facts.get(id);
      if (!f) out.push(`${where}: comes up again: unknown fact ${id}`);
      else if (u.order(f.first_session) >= s.order) out.push(`${where}: ${id} cannot come up again before ${f.first_session}`);
      else if (!u.live(f, s)) out.push(`${where}: ${id} was replaced before this session`);
      else if (sourceOf(s) === 'claude-code' && u.chatOnly.includes(f)) out.push(`${where}: ${id} was planned only in claude.ai`);
    }
    const rules = rulesFor(u, s.id);
    const brief = [b.story, ...Object.values(b.facts || {})].join('\n');
    for (const p of forbiddenIn(brief, rules)) out.push(`${where}: the brief itself: ${p}`);
  }
  const lo = TARGET_TOKENS * SIZE_BAND[0];
  const hi = TARGET_TOKENS * SIZE_BAND[1];
  if (tokens < lo || tokens > hi) out.push(`${u.user}: the briefs plan ${tokens} tokens; the method says about ${TARGET_TOKENS}`);
  return { problems: out, tokens };
}

/** Convert a user's history into a scratch folder and read every file back with exposurie's own readers. */
async function readBack(u, sessionsText) {
  const { RUNS, EXPOSURIE } = await import(pathToFileURL(join(REPO, 'runner', 'sandbox.mjs')).href);
  const { convertUser } = await import(pathToFileURL(join(REPO, 'gen', 'convert.mjs')).href);
  const src = join(dirname(dirname(EXPOSURIE)), 'src', 'extract');
  const { readTranscript } = await import(pathToFileURL(join(src, 'transcript.js')).href);
  const { readExport } = await import(pathToFileURL(join(src, 'webchat.js')).href);

  const out = [];
  const dir = join(RUNS, `check-${u.user}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const written = convertUser(u.user, dir);
  const surfaces = { terminal: 'terminal', vscode: 'vscode', desktop: 'desktop', 'claude.ai': 'claude.ai' };
  const same = (a, b) => a.length === b.length && a.every((t, i) => t.role === b[i].role && t.text === b[i].text);
  const order = [];
  for (const w of written.transcripts) {
    const s = u.sessions.get(w.session);
    const r = readTranscript(w.path);
    if (!r) out.push(`${w.session}: exposurie could not read ${w.path}`);
    else {
      if (!same(r.turns, sessionsText.get(w.session))) out.push(`${w.session}: exposurie reads different turns from the transcript than the session holds`);
      if (r.surface !== surfaces[s.surface]) out.push(`${w.session}: exposurie labels it ${r.surface}, the plan says ${s.surface}`);
      if (!r.cwd || !r.cwd.endsWith(`/${s.project}`)) out.push(`${w.session}: exposurie names it after ${r.cwd}, not ${s.project}`);
      order.push([w.session, w.mtime]);
    }
  }
  if (written.export) {
    const r = readExport(written.export.path);
    if (!r.ok) out.push(`the claude.ai export: ${r.error}`);
    else {
      const chats = [...u.sessions.values()].filter((s) => s.surface === 'claude.ai');
      if (r.sessions.length !== chats.length) out.push(`exposurie finds ${r.sessions.length} chats in the export, the plan has ${chats.length}`);
      for (const c of chats) {
        const got = r.sessions.find((x) => x.project === c.title);
        if (!got) out.push(`${c.id}: exposurie finds no chat titled "${c.title}"`);
        else {
          if (!same(got.turns, sessionsText.get(c.id))) out.push(`${c.id}: exposurie reads different turns from the export than the session holds`);
          order.push([c.id, Date.parse(got.updatedAt)]);
        }
      }
      if (r.standing && (r.standing.memory || r.standing.projects.length)) out.push('the export carries standing context; the method leaves it out');
    }
  }
  // exposurie works newest first, by file date and by a chat's updated_at, so those must follow the plan.
  const byDate = [...order].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const byPlan = [...order].sort((a, b) => u.order(a[0]) - u.order(b[0])).map(([id]) => id);
  if (byDate.join() !== byPlan.join()) out.push('the files\' dates do not follow the order of the sessions');
  return { problems: out, dir, files: written.transcripts.length + (written.export ? 1 : 0) };
}

export async function checkHistory(user, { briefsOnly = false, partial = false, readers = false } = {}) {
  const u = loadUser(user);
  const problems = [];
  const notes = [];
  const briefs = checkBriefs(u);
  problems.push(...briefs.problems);
  const summary = { user, planned: u.sessions.size, briefTokens: briefs.tokens, written: 0, chars: 0 };
  if (briefsOnly) return { problems, notes, summary };

  const dir = join(REPO, 'users', user, 'sessions');
  const texts = new Map();
  for (const s of u.sessions.values()) {
    const f = sessionFile(user, s.id);
    if (!existsSync(f)) {
      (partial ? notes : problems).push(`${user}/${s.id}: not written yet`);
      continue;
    }
    const r = checkSession(u, s.id, readFileSync(f, 'utf8'));
    summary.written += 1;
    summary.chars += r.chars;
    texts.set(s.id, r.turns);
    for (const p of r.problems) problems.push(`${user}/${s.id}: ${p}`);
  }
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f !== 'generation.json' && !(f.endsWith('.md') && u.sessions.has(f.slice(0, -3)))) problems.push(`${user}: ${f} is not a planned session`);
    }
  }
  summary.tokens = Math.round(summary.chars / CHARS_PER_TOKEN);
  if (summary.written === u.sessions.size) {
    const lo = TARGET_TOKENS * SIZE_BAND[0];
    const hi = TARGET_TOKENS * SIZE_BAND[1];
    if (summary.tokens < lo || summary.tokens > hi) problems.push(`${user}: about ${summary.tokens} tokens of conversation; the method says about ${TARGET_TOKENS}`);
  }
  if (readers) {
    if (summary.written < u.sessions.size) notes.push(`${user}: readers not run, the history is not complete`);
    else {
      const r = await readBack(u, texts);
      summary.readers = r;
      for (const p of r.problems) problems.push(`${user}: ${p}`);
    }
  }
  return { problems, notes, summary };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const users = args.filter((a) => USERS.includes(a));
  const opts = { briefsOnly: args.includes('--briefs'), partial: args.includes('--partial'), readers: args.includes('--readers') };
  const all = { problems: [], notes: [] };
  for (const user of users.length ? users : USERS) {
    const r = await checkHistory(user, opts);
    const s = r.summary;
    console.log(
      opts.briefsOnly
        ? `${user}: ${s.planned} briefs, planning ${s.briefTokens.toLocaleString('en-US')} tokens`
        : `${user}: ${s.written} of ${s.planned} sessions written, about ${s.tokens.toLocaleString('en-US')} tokens ` +
          `(${s.chars.toLocaleString('en-US')} characters)` +
          (s.readers ? `; exposurie read ${s.readers.files} files back from ${s.readers.dir}` : ''),
    );
    all.problems.push(...r.problems);
    all.notes.push(...r.notes);
  }
  if (all.notes.length) {
    console.log(`\n${all.notes.length} note${all.notes.length === 1 ? '' : 's'}:`);
    for (const n of all.notes) console.log(`  ${n}`);
  }
  if (all.problems.length) {
    console.log(`\n${all.problems.length} problem${all.problems.length === 1 ? '' : 's'}:`);
    for (const p of all.problems) console.log(`  ${p}`);
    process.exit(1);
  }
  console.log(opts.briefsOnly ? '\nThe briefs hold.' : '\nThe histories hold.');
}
