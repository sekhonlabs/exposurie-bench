// The team check (part 13): runner/team.mjs and score/team.mjs end to end
// against the fake `claude` (runner/fake-claude.mjs), before any real run.
//
//   node check/team.mjs
//
// It runs team-1 as it is written, with the developer's brain made the way
// the long-session check makes one and set a fortnight back, in sandbox homes
// of its own under ../runs, so the real home, which holds the login, is never
// touched; the check confirms that as well. exposurie 1.3.1 is the sandbox's
// own, and the sync is its real one, driven by the fake. The tests run on the
// reference implementation in tasks/team/team-1-examples/.
//
//   the task          team-1.mjs writes the same bytes again; the exports
//                     hold what the hidden tests expect; each decision is
//                     said in its own agent's second step and nowhere else in
//                     round 1, in condition D's notes, and in no ask of round 2
//   merging           the union merge on a made-up repository: a conflict kept
//                     both ways, a file one copy deletes and another changes,
//                     a binary file, and a file Git ignores
//   the whole of it   round 1 with a usage limit carried on after and a read
//                     outside its folder accepted by hand; its merge and gate;
//                     the sync filing round 1's three sessions; round 2's nine
//                     runs, blind, with a read outside and a saved session each
//                     accepted by hand; each condition merged; every step's
//                     tokens its own; then the scorer: C and D keep all six
//                     decisions and agree, A keeps none and does not, nothing
//                     of round 1 leaked, and the brain holds every decision
//   again, on 1.3.2   team-1 planned again from its own round 1 as team-1-132:
//                     what `again` refuses; round 1 copied, never run; the
//                     sync on 1.3.2's real sync, asked for each decision as the
//                     rule it set (1.3.1's never was), with the brain's own wiki
//                     prompt kept; round 2 in C alone, in team-1's order, a read
//                     outside accepted by hand; the scorer on C alone, with a
//                     plan meter of only what ran; team-1 untouched
//   the gate          a round 1 step that breaks the contract stops the task at
//                     the gate, `again` refuses it there, and a repair by hand,
//                     recorded, lets it go on
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXPOSURIE, HOME, POINTER_FOR_WORK, RULE_FOR_DECISIONS, RUNS, ownNodeOnly, sandboxEnv } from '../runner/sandbox.mjs';
import { DECLINED, Stop, keepBrain, neutralProblems } from '../runner/run.mjs';
import { originalKit } from '../runner/long.mjs';
import { TEAM, againTeam, goTeam, mergeCopies, planTeam, teamTask } from '../runner/team.mjs';
import { scoreTeam } from '../score/team.mjs';

ownNodeOnly();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const problems = [];
const expect = (ok, msg) => {
  if (!ok) problems.push(msg);
};

/** Every file under a folder, with its size and time, to see whether anything changed it. */
function snapshot(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      const st = statSync(join(d, n));
      if (st.isDirectory()) walk(join(d, n), `${rel}${n}/`);
      else out.push(`${rel}${n}\t${st.size}\t${st.mtimeMs}`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}
const realHome = snapshot(HOME).join('\n');
const filesIn = (dir) => snapshot(dir).map((l) => l.split('\t')[0]);
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const root = join(RUNS, `part13-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(root, { recursive: true });
const task = teamTask('team-1');

/** What a call stops with, or null when it does not stop. */
async function stops(f) {
  try {
    await f();
    return null;
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    return e.message;
  }
}

// ---------------------------------------------------------------- the task

{
  const written = ['team-1.json', 'team-1-notes.md', 'team-1/instapaper-export.csv', 'team-1/omnivore-export.json'];
  const before = written.map((f) => sha(join(TEAM, f)));
  const g = spawnSync(process.execPath, [join(TEAM, 'team-1.mjs')], { encoding: 'utf8' });
  expect(g.status === 0, `team-1.mjs exited ${g.status}: ${g.stderr.slice(0, 300)}`);
  written.forEach((f, i) => expect(sha(join(TEAM, f)) === before[i], `team-1.mjs wrote ${f} differently: it is not the file the generator writes`));

  // The exports, read with the reference implementation's own CSV reader.
  const { readCsv } = await import(pathToFileURL(join(task.examplesDir, 'round-1', 'agent-2', 'step-1', 'src', 'lib', 'csv.js')).href);
  const rows = readCsv(readFileSync(join(task.filesDir, 'instapaper-export.csv'), 'utf8'));
  const I = task.expect.instapaper;
  const folders = {};
  for (const r of rows) if (!['Unread', 'Archive'].includes(r.Folder)) folders[`folder:${r.Folder}`] = (folders[`folder:${r.Folder}`] ?? 0) + 1;
  expect(rows.length === I.links, `the Instapaper export has ${rows.length} rows, not ${I.links}`);
  expect(JSON.stringify(rows.filter((r) => r.Selection).map((r) => r.Selection)) === JSON.stringify(I.selections), "the Instapaper export's Selections are not the ones expected");
  expect(JSON.stringify(folders) === JSON.stringify(I.folder_tags), `the Instapaper export's folders: ${JSON.stringify(folders)}`);
  expect(JSON.stringify(rows.filter((r) => r.Folder === 'Archive').map((r) => r.URL)) === JSON.stringify(I.archived_and_read), "the Instapaper export's Archive is not the one expected");
  expect(JSON.stringify(rows.filter((r) => r.Folder === 'Unread').map((r) => r.URL)) === JSON.stringify(I.unread), "the Instapaper export's Unread is not the one expected");
  expect(!I.newer_selection.includes(',') && rows[0].Selection === '' && rows[0].Folder === 'Long reads', "K3's newer export cannot be made from the first row");
  const items = readJson(join(task.filesDir, 'omnivore-export.json'));
  const O = task.expect.omnivore;
  const read = items.filter((x) => x.state === 'Archived' || x.readingProgress >= 90).map((x) => x.url);
  expect(items.length === O.links && JSON.stringify(read) === JSON.stringify(O.read), `the Omnivore export's read items: ${JSON.stringify(read)}`);
  expect(JSON.stringify(items.filter((x) => !read.includes(x.url)).map((x) => x.url)) === JSON.stringify(O.unread), "the Omnivore export's unread items are not the ones expected");
  expect(items.flatMap((x) => x.highlights).length === O.highlights && items.flatMap((x) => x.highlights).filter((h) => h.annotation).length === O.notes, "the Omnivore export's highlights are not the ones expected");
  expect(items.some((x) => x.state !== 'Archived' && x.readingProgress >= 90) && items.some((x) => x.state !== 'Archived' && x.readingProgress === 89), 'the Omnivore export cannot show K5');

  // Each decision in its own agent's second step and nowhere else in round 1; in D's notes; in no ask of round 2.
  const notes = readFileSync(task.notesFile, 'utf8');
  for (const d of task.decisions) {
    const says = (text) => d.filed.some((re) => new RegExp(re, 'iu').test(text));
    const where = task.round_1.flatMap((a) => a.steps.map((s, i) => (says(s) ? `${a.agent}/${i + 1}` : null))).filter(Boolean);
    expect(JSON.stringify(where) === JSON.stringify([`${d.told_to}/2`]), `${d.id} is said in round 1 at ${JSON.stringify(where)}, not only in agent ${d.told_to}'s second step`);
    expect(says(notes), `condition D's notes do not hold ${d.id}`);
    for (const a of task.round_2) expect(!says(a.ask), `round 2's ask for agent ${a.agent} restates ${d.id}`);
    for (const a of d.needed_by) expect(task.round_2.some((x) => x.agent === a), `${d.id} is needed by agent ${a}, whom round 2 does not have`);
  }
  expect(/no Conventional Commits prefixes/.test(notes), "condition D's notes do not hold the commit style");
  for (const a of task.round_2) {
    const from = new Set(task.decisions.filter((d) => d.needed_by.includes(a.agent)).map((d) => d.told_to));
    expect(from.size >= 2, `round 2's agent ${a.agent} needs decisions told to only ${from.size} round 1 agent(s)`);
  }
}

// ---------------------------------------------------------------- merging

{
  const m = join(root, 'merge');
  const base = join(m, 'base');
  const put = (dir, rel, body) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  };
  put(base, 'README.md', '# r\n\nline\n');
  put(base, 'a.txt', 'a\n');
  put(base, 'b.txt', 'b\n');
  put(base, 'bin.dat', Buffer.from([0, 1, 2, 3]));
  put(base, '.gitignore', 'tmp/\n');
  const one = join(m, 'one');
  const two = join(m, 'two');
  cpSync(base, one, { recursive: true });
  cpSync(base, two, { recursive: true });
  put(one, 'README.md', '# r\n\nline\none\n');
  put(one, 'bin.dat', Buffer.from([0, 9, 9, 9]));
  put(one, 'tmp/ignored.txt', 'never merged\n');
  put(one, 'c.txt', 'c\n');
  // A file the first copy deletes and the second changes.
  rmSync(join(one, 'b.txt'));
  put(two, 'README.md', '# r\n\nline\ntwo\n');
  put(two, 'b.txt', 'b2\n');
  put(two, 'bin.dat', Buffer.from([0, 7, 7, 7]));
  const r = mergeCopies({ base, copies: [{ name: '1', dir: one }, { name: '2', dir: two }], to: join(m, 'merged'), repo: join(m, 'repo') });
  const merged = (rel) => (existsSync(join(m, 'merged', rel)) ? readFileSync(join(m, 'merged', rel)) : null);
  expect(String(merged('README.md')).includes('one') && String(merged('README.md')).includes('two'), `a conflict was not kept both ways: ${merged('README.md')}`);
  expect(String(merged('b.txt')) === 'b2\n', `a file deleted on one side and changed on the other: ${merged('b.txt')}`);
  expect(merged('bin.dat')?.equals(Buffer.from([0, 7, 7, 7])), 'a binary conflict did not take the later copy');
  expect(String(merged('c.txt')) === 'c\n' && String(merged('a.txt')) === 'a\n', 'a file only one copy added, or none changed, is wrong');
  expect(!existsSync(join(m, 'merged', 'tmp')), 'a file Git ignores was merged');
  expect(JSON.stringify([...r.conflicts].sort()) === JSON.stringify(['2:README.md', '2:b.txt', '2:bin.dat']), `the conflicts recorded: ${JSON.stringify(r.conflicts)}`);
  expect(r.order.join() === '1,2' && r.merges.map((x) => x.copy).join() === '1,2', `the merge order recorded: ${r.order}, merged ${r.merges.map((x) => x.copy)}`);
  expect(r.merges[1].unresolved.includes('b.txt') && r.merges[1].unresolved.includes('bin.dat') && !r.merges[1].unresolved.includes('README.md'), `what the union could not merge: ${JSON.stringify(r.merges[1].unresolved)}`);
}

// ---------------------------------------------------------------- a sandbox

/** A sandbox of its own: the developer's brain as keep-brain leaves it, synced a fortnight ago by 1.2.0, and the fake playing team-1. */
function sandbox(name, team = {}) {
  const dir = join(root, name);
  const home = join(dir, 'home');
  for (const d of ['.claude', 'AppData/Local', 'AppData/Roaming']) mkdirSync(join(home, d), { recursive: true });
  copyFileSync(join(REPO, 'runner', 'sandbox-settings.json'), join(home, '.claude', 'settings.json'));
  const scenarioFile = join(dir, 'scenario.json');
  const ctx = {
    home,
    brains: join(dir, 'brains'),
    runs: join(dir, 'runs'),
    lock: join(dir, 'run.lock'),
    placed: join(dir, 'placed.json'),
    claude: [process.execPath, join(REPO, 'runner', 'fake-claude.mjs')],
    env: { EXPOSURIE_BENCH_FAKE: scenarioFile },
    timeoutMs: 60_000,
    buildTimeoutMs: 120_000,
  };
  mkdirSync(ctx.runs, { recursive: true });
  const env = sandboxEnv({ home, exposurie: true });
  const exp = (...a) => spawnSync(process.execPath, [EXPOSURIE, ...a], { env, cwd: home, encoding: 'utf8' });
  const s = exp('scaffold', '--at', join(home, 'brain'));
  expect(s.status === 0 || s.status === 10, `${name}: exposurie scaffold exited ${s.status}: ${s.stderr.slice(0, 200)}`);
  for (const id of DECLINED) exp('decline', id);
  mkdirSync(join(home, 'brain', 'wiki', 'entities'), { recursive: true });
  writeFileSync(join(home, 'brain', 'wiki', 'entities', 'Owner developer.md'), '---\ntype: entity\n---\n\n# Owner developer\n\nThis brain belongs to the developer. Satchel is their read-later app.\n');
  const fortnight = new Date(Date.now() - 14 * 86_400_000).toISOString();
  writeFileSync(join(home, 'brain', '.exposurie', 'state.json'), JSON.stringify({ lastSyncUtc: fortnight, unfiled: 0, files: {} }) + '\n');
  keepBrain(ctx, 'developer');
  writeFileSync(scenarioFile, JSON.stringify({
    build: { user: 'developer', copy: true }, exposurie_dir: 'npm-131', team: { task: readJson(join(TEAM, 'team-1.json')), backdate: true, ...team },
  }, null, 2) + '\n');
  return { ctx, dir: join(ctx.runs, 'team-1') };
}

const record = (dir) => readJson(join(dir, 'team.json'));
const lastTry = (steps, n) => steps.filter((r) => r.n === n).at(-1);
const noLeftovers = (ctx, where) => {
  expect(!neutralProblems(ctx).length, `${where}: ${neutralProblems(ctx).join('; ')}`);
  expect(!existsSync(join(dirname(ctx.placed), 'placed-session.json')), `${where}: the session marker was left behind`);
};
const fakeProblems = (dir) => filesIn(dir).filter((f) => f.endsWith('stream.jsonl') || f.endsWith('answer.md'))
  .filter((f) => readFileSync(join(dir, f), 'utf8').includes('FAKE-PROBLEM'));
/** Every tool result in a session's stream, as one text with its whitespace run together. */
const toolText = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean)
  .flatMap((l) => {
    try {
      return JSON.parse(l).message?.content ?? [];
    } catch {
      return [];
    }
  })
  .filter((c) => c?.type === 'tool_result')
  .map((c) => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)))
  .join('\n').replace(/\s+/g, ' ');

// ---------------------------------------------------------------- the whole of it

/** The sandbox the whole task ran in, which the rerun on 1.3.2 starts from. */
let whole = null;
{
  const { ctx, dir } = sandbox('whole', { steps: { 'round-1/2/2': 'limit', 'round-1/3/2': 'outside' }, runs: { 'C/2': 'outside', 'D/3': 'persist' } });
  whole = { ctx, dir };
  const b = planTeam(ctx, 'team-1');
  expect(b.cells.length === 9 && ['A', 'C', 'D'].every((c) => b.cells.filter((x) => x.condition === c).length === 3), `the plan: ${JSON.stringify(b.cells)}`);
  expect(b.cells.map((c) => c.run).join() === 'r001,r002,r003,r004,r005,r006,r007,r008,r009', 'the runs are not numbered in order');
  expect(/already planned/.test((await stops(() => planTeam(ctx, 'team-1'))) ?? ''), 'a team task was planned twice');
  const go = (o = {}) => goTeam(ctx, 'team-1', o);

  expect((await go()) === false, 'round 1 stopped by a usage limit reported itself finished');
  let T = record(dir);
  expect([0, 1, 2].every((n) => lastTry(T.round_1[1].steps, n)?.status === 'done'), 'agent 1 did not finish its three steps first');
  expect(lastTry(T.round_1[2].steps, 1)?.status === 'not-run' && /usage limit/.test(lastTry(T.round_1[2].steps, 1).reason), `the limited step: ${JSON.stringify(T.round_1[2].steps.map((r) => r.status))}`);
  noLeftovers(ctx, 'after the limit');
  expect(/round 1 is not finished/.test((await stops(() => againTeam(ctx, 'team-1', 'team-1-early', { exposurie: '1.3.2' }))) ?? ''), 'again took a round 1 that had not finished');
  expect(!existsSync(join(ctx.runs, 'team-1-early')), 'a refused again left a folder behind');

  expect((await go()) === false, 'a round 1 step that read outside its folder carried on');
  T = record(dir);
  expect(T.stopped?.where === 'round-1/agent-3/02' && T.stopped.problems.some((p) => /outside its folder/.test(p)), `the read outside: ${JSON.stringify(T.stopped)}`);
  expect(existsSync(join(dir, 'round-1', 'agent-2', '02-try1')), 'the limited step was not run again, with its first try kept');
  expect(/broke a check/.test((await stops(() => go())) ?? ''), 'a stopped team task carried on without a decision');
  expect(/is for a team task that stopped/.test((await stops(async () => {
    const t = record(dir);
    const copy = { ...t, stopped: null };
    writeFileSync(join(dir, 'team.json'), JSON.stringify(copy, null, 2) + '\n');
    try {
      await go({ accept: 'nothing stopped' });
    } finally {
      writeFileSync(join(dir, 'team.json'), JSON.stringify(t, null, 2) + '\n');
    }
  })) ?? ''), '--accept was taken with nothing stopped');

  let finished = await go({ accept: 'read by hand: the fake read the task file, nothing came of it' });
  for (let i = 0; i < 3 && !finished && record(dir).stopped?.kind === 'run'; i += 1) {
    finished = await go({ accept: `read by hand: run ${record(dir).stopped.where}, nothing came of it` });
  }
  expect(finished === true, 'the team task did not finish');
  T = record(dir);
  noLeftovers(ctx, 'at the end');
  expect(T.accepted.length === 3 && T.accepted.filter((x) => x.kind === 'run').length === 2, `the acceptances: ${JSON.stringify(T.accepted.map((x) => x.where))}`);

  // Round 1.
  const same = (a, c) => ['input', 'cache_write', 'cache_read'].every((k) => a[k] === c[k]);
  for (const a of [1, 2, 3]) {
    const steps = [0, 1, 2].map((n) => lastTry(T.round_1[a].steps, n));
    expect(steps.every((r) => r.status === 'done' || r.accepted), `agent ${a}'s steps: ${steps.map((r) => r.status)}`);
    for (const r of steps) {
      expect(same(r.tokens, r.call_tokens), `agent ${a} step ${r.step}: its tokens are not its own calls'`);
      expect(r.prepared?.state_line?.includes('last sync 3d ago') && r.prepared.updated.includes('.claude/CLAUDE.md'), `agent ${a} step ${r.step} was not brought up to 1.3.1 and made 3 days old: ${JSON.stringify(r.prepared)}`);
      expect(r.session.session === T.sessions[a] || r.session.resume === T.sessions[a], `agent ${a} step ${r.step} used another session`);
    }
    const kept = filesIn(join(dir, 'round-1', `agent-${a}`, 'session')).filter((f) => f.endsWith('.jsonl'));
    expect(kept.length === 1 && kept[0].endsWith(`${T.sessions[a]}.jsonl`), `agent ${a}'s kept session: ${kept}`);
  }
  const merged1 = filesIn(join(dir, 'round-1', 'merged'));
  for (const f of ['src/jobs/handlers/import-file.js', 'src/lib/csv.js', 'src/import/services.js', 'test/import-file.test.js', 'test/pocket.test.js', 'test/import-page.test.js']) {
    expect(merged1.includes(f), `round 1's merged code lacks ${f}`);
  }
  expect(T.round_1.merged.conflicts.length === 0 && T.round_1.gate?.passed === true, `round 1's merge and gate: ${JSON.stringify({ c: T.round_1.merged.conflicts, g: T.round_1.gate?.passed })}`);
  expect(T.round_1.gate.own.failed === 0 && T.round_1.gate.own.passed > 36 && T.round_1.gate.hidden.passed === 3, `the gate's tests: ${JSON.stringify({ own: T.round_1.gate.own, hidden: T.round_1.gate.hidden.results })}`);

  // The sync.
  const sync = T.sync.tries.at(-1);
  expect(sync.status === 'done' && sync.brain_after.filed && sync.brain_after.newly_read === 3, `the sync: ${JSON.stringify({ s: sync.status, r: sync.reason, b: sync.brain_after })}`);
  expect(readFileSync(join(dir, 'sync', 'kit', '.claude', 'CLAUDE.md'), 'utf8').includes(POINTER_FOR_WORK), "the sync's kit has no pointer for work");
  expect(readJson(join(dir, 'sync', 'kit', '.exposurie', 'config.json')).version === '1.3.1', "the sync's kit is not 1.3.1's");
  expect(!existsSync(join(dir, 'sync', 'kit', 'brain', '.exposurie', 'staged')), "the sync's staged batches were left in the kit");

  // Round 2.
  for (const cell of b.cells) {
    const r = readJson(join(dir, cell.run, 'run.json'));
    expect(!('condition' in r) && !JSON.stringify(r).includes(`"condition"`), `${cell.run}'s run.json names its condition`);
    expect(r.status === 'done' || r.accepted, `${cell.run}: ${r.status} ${r.reason ?? ''}`);
    const searched = (r.exposurie_commands ?? []).some((x) => /\bread\b/.test(x));
    expect(searched === (cell.condition === 'C'), `${cell.run} (${cell.condition}) ${searched ? 'ran' : 'never ran'} exposurie read`);
    // Straight after a sync, 1.3.1's state line says "synced today".
    if (cell.condition === 'C') expect(/synced today/.test(r.exposurie_state ?? '') && !/-> RUN:/.test(r.exposurie_state), `${cell.run}'s exposurie state: ${r.exposurie_state}`);
    expect(existsSync(join(dir, cell.run, 'files.json')) && existsSync(join(dir, cell.run, 'answer.md')), `${cell.run} left nothing for the scorer`);
  }
  const persisted = b.cells.find((c) => c.condition === 'D' && c.agent === 3);
  expect(existsSync(join(dir, persisted.run, 'leaked')), 'the run that saved its session did not have its transcript moved out');
  for (const c of ['A', 'C', 'D']) {
    expect(T.round_2.merged[c] && T.round_2.merged[c].conflicts.length === 0, `round 2's ${c} merge: ${JSON.stringify(T.round_2.merged[c]?.conflicts)}`);
    expect(T.round_2.merged[c]?.order.join() === '1,2,3', `round 2's ${c} merge order: ${T.round_2.merged[c]?.order}`);
  }
  expect(T.round_1.merged.order.join() === '1,2,3', `round 1's merge order: ${T.round_1.merged.order}`);
  expect(fakeProblems(dir).length === 0, `the fake found problems in: ${fakeProblems(dir).join(', ')}`);

  // The scorer.
  const s = scoreTeam(dir, task);
  writeFileSync(join(dir, 'scores.json'), JSON.stringify(s, null, 2) + '\n');
  for (const c of ['C', 'D']) {
    const r = s.conditions[c];
    expect(r.kept.merged === 6 && r.kept.said_only_in_conversation === 6 && r.agreed && r.tests.passed, `${c}: ${JSON.stringify({ kept: r.kept, agreed: r.agreed, passed: r.tests.passed, hidden: r.tests.hidden })}`);
    for (const d of task.decisions) for (const a of d.needed_by) expect(r.decisions[d.id].agents[a] !== false, `${c}: agent ${a} did not keep ${d.id} by script`);
    expect(r.runs.every((x) => x.way['commit-prefix'].holds === true && x.way['no-dependency'].holds === true), `${c}: the user's way: ${JSON.stringify(r.runs.map((x) => x.way))}`);
  }
  const A = s.conditions.A;
  expect(A.kept.merged === 0 && !A.agreed && !A.tests.passed && A.tests.own.failed === 0, `A: ${JSON.stringify({ kept: A.kept, agreed: A.agreed, own: A.tests.own })}`);
  expect(A.runs.every((x) => x.way['commit-prefix'].holds === false), "A's wrong commit messages passed the user's way");
  expect(['K1', 'K4', 'K5'].every((k) => Object.values(A.decisions[k].agents).every((v) => v === false)), `A's agents kept a decision by script: ${JSON.stringify(Object.fromEntries(Object.entries(A.decisions).map(([k, v]) => [k, v.agents])))}`);
  expect(A.tests.hidden['round-1 pocket: an export comes in through the import_file job'] === true, "A's merged work no longer imports Pocket");
  expect(Object.values(s.round_1.leaks).every((v) => !v.leaked), `round 1's code already holds: ${JSON.stringify(s.round_1.leaks)}`);
  expect(Object.values(s.sync.filed).every((v) => v.filed), `the brain lacks: ${JSON.stringify(Object.entries(s.sync.filed).filter(([, v]) => !v.filed).map(([k]) => k))}`);
  expect(s.round_1.steps === 9 && s.round_1.tokens.all_input > 0 && s.sync.tokens.all_input > 0, `round 1 and the sync's numbers: ${JSON.stringify({ steps: s.round_1.steps, r1: s.round_1.tokens, sync: s.sync.tokens })}`);
  expect(s.plan_meter.length === 19 && s.plan_meter.every((m) => m.seven_day !== null), `the plan meter: ${s.plan_meter.length} readings`);
  expect(s.conditions.C.looked === 3 && s.conditions.A.looked === 0 && s.conditions.D.looked === 0, `looked: ${['A', 'C', 'D'].map((c) => s.conditions[c].looked)}`);
  expect(/--repaired is for/.test((await stops(() => go({ repaired: 'nothing to repair' }))) ?? ''), '--repaired was taken with the gate passed');
}

// ---------------------------------------------------------------- again, on 1.3.2

{
  const { ctx, dir: from } = whole;
  const id = 'team-1-132';
  const dir = join(ctx.runs, id);
  const fromBefore = snapshot(from).join('\n');
  const tryAgain = (o = {}, src = 'team-1') => stops(() => againTeam(ctx, src, id, { exposurie: '1.3.2', ...o }));
  expect(/names a release installed from npm/.test((await tryAgain({ exposurie: '1.2.0' })) ?? ''), 'again took an exposurie not installed from npm');
  expect(/conditions are/.test((await tryAgain({ conditions: ['B'] })) ?? ''), 'again took a condition the task does not have');
  expect(/has not run/.test((await tryAgain({}, 'team-9')) ?? ''), 'again took a batch that never ran');
  expect(!existsSync(dir), 'a refused again left a folder behind');

  // The fake now finds 1.3.2's exposurie, and one run of round 2 reads outside its folder.
  const scenario = readJson(ctx.env.EXPOSURIE_BENCH_FAKE);
  writeFileSync(ctx.env.EXPOSURIE_BENCH_FAKE, JSON.stringify({
    ...scenario, exposurie_dir: 'npm-132', team: { ...scenario.team, steps: {}, runs: { 'C/1': 'outside' } },
  }, null, 2) + '\n');
  const b = againTeam(ctx, 'team-1', id, { exposurie: '1.3.2' });
  const was = readJson(join(from, 'batch.json'));
  expect(b.task === 'team-1' && b.exposurie === '1.3.2' && b.round_1_from === 'team-1' && b.conditions.join() === 'C', `the rerun's batch: ${JSON.stringify({ ...b, cells: undefined })}`);
  expect(b.cells.length === 3 && b.cells.every((c) => c.condition === 'C') && b.cells.map((c) => c.run).join() === 'r001,r002,r003', `the rerun's runs: ${JSON.stringify(b.cells)}`);
  expect(b.cells.map((c) => c.agent).join() === was.cells.filter((c) => c.condition === 'C').map((c) => c.agent).join(), "the rerun's agents are not in team-1's order");
  expect(/already exists/.test((await tryAgain()) ?? ''), 'a batch was planned again over itself');

  expect((await goTeam(ctx, id)) === false, "a run of the rerun that read outside its folder carried on");
  let T = record(dir);
  expect(T.stopped?.kind === 'run' && T.stopped.problems.some((p) => /outside its folder/.test(p)), `the rerun's read outside: ${JSON.stringify(T.stopped)}`);
  expect((await goTeam(ctx, id, { accept: 'read by hand: the fake read the task file, nothing came of it' })) === true, 'the rerun did not finish');
  T = record(dir);
  noLeftovers(ctx, 'after the rerun');

  // Round 1 did not run again: its record, sessions and merged code are team-1's, and no step ran.
  const T0 = record(from);
  expect(JSON.stringify(T.round_1) === JSON.stringify(T0.round_1) && JSON.stringify(T.sessions) === JSON.stringify(T0.sessions) && T.round_1_from?.batch === 'team-1',
    "the rerun's round 1 record is not team-1's");
  const same = (rel) => {
    const a = filesIn(join(from, rel));
    return a.length > 0 && JSON.stringify(a) === JSON.stringify(filesIn(join(dir, rel))) && a.every((f) => sha(join(from, rel, f)) === sha(join(dir, rel, f)));
  };
  expect(['round-1/merged', 'round-1/agent-1/session', 'round-1/agent-2/session', 'round-1/agent-3/session'].every(same), "the rerun's round 1 code or sessions are not team-1's");
  expect(!existsSync(join(dir, 'work')), 'a round 1 step ran in the rerun');

  // The sync ran on 1.3.2, whose write step asks for each decision as the rule it set; team-1's 1.3.1 sync was never asked.
  const sync = T.sync.tries.at(-1);
  expect(T.sync.tries.length === 1 && sync.status === 'done' && sync.brain_after.filed && sync.brain_after.newly_read === 3,
    `the rerun's sync: ${JSON.stringify({ s: sync?.status, r: sync?.reason, b: sync?.brain_after })}`);
  expect(toolText(join(dir, 'sync', 'sync', 'stream.jsonl')).includes(RULE_FOR_DECISIONS), "the rerun's sync was not asked to write each decision as the rule it set");
  expect(!toolText(join(from, 'sync', 'sync', 'stream.jsonl')).includes(RULE_FOR_DECISIONS), "team-1's sync on 1.3.1 was asked for rules too, so the check cannot tell the releases apart");
  expect(readJson(join(dir, 'sync', 'kit', '.exposurie', 'config.json')).version === '1.3.2' && sync.versions.exposurie === '1.3.2', "the rerun's sync did not run on 1.3.2");
  // The brain keeps its own wiki prompt: 1.3.2's update never touches it, so the prompt's new example never reaches the sync.
  const prompt = (kit) => join(kit, 'brain', '.exposurie', 'wiki-prompt.md');
  expect(sha(prompt(join(dir, 'sync', 'kit'))) === sha(prompt(originalKit(ctx, 'developer'))) && !readFileSync(prompt(join(dir, 'sync', 'kit')), 'utf8').includes('rule it set'),
    "the rerun's brain does not keep its own wiki prompt");

  // Round 2: C alone, on 1.3.2, each run looking in the brain the sync left.
  for (const cell of b.cells) {
    const r = readJson(join(dir, cell.run, 'run.json'));
    expect(r.status === 'done' || r.accepted, `rerun ${cell.run}: ${r.status} ${r.reason ?? ''}`);
    expect(r.versions?.exposurie === '1.3.2' && /synced today/.test(r.exposurie_state ?? '') && (r.exposurie_commands ?? []).some((x) => /\bread\b/.test(x)),
      `rerun ${cell.run}: ${JSON.stringify({ v: r.versions?.exposurie, state: r.exposurie_state, commands: r.exposurie_commands })}`);
  }
  expect(Object.keys(T.round_2.merged).join() === 'C' && T.round_2.merged.C.conflicts.length === 0 && T.round_2.merged.C.order.join() === '1,2,3',
    `the rerun's merges: ${JSON.stringify(T.round_2.merged)}`);
  expect(fakeProblems(dir).length === 0, `the fake found problems in the rerun: ${fakeProblems(dir).join(', ')}`);

  // The scorer, on C alone, with a plan meter of only what ran in the rerun.
  const s = scoreTeam(dir, task);
  const C = s.conditions.C;
  expect(Object.keys(s.conditions).join() === 'C' && s.batch === id && s.exposurie === '1.3.2', `the rerun's scores: ${JSON.stringify({ c: Object.keys(s.conditions), batch: s.batch, e: s.exposurie })}`);
  expect(C.kept.merged === 6 && C.agreed && C.tests.passed && C.looked === 3, `the rerun's C: ${JSON.stringify({ kept: C.kept, agreed: C.agreed, passed: C.tests.passed, looked: C.looked })}`);
  expect(s.round_1.from === 'team-1' && s.plan_meter.length === 4 && s.plan_meter.every((m) => m.seven_day !== null),
    `the rerun's round 1 and plan meter: ${JSON.stringify({ from: s.round_1.from, meter: s.plan_meter.map((m) => m.what) })}`);
  expect(Object.values(s.sync.filed).every((v) => v.filed), `the rerun's brain lacks: ${JSON.stringify(Object.entries(s.sync.filed).filter(([, v]) => !v.filed).map(([k]) => k))}`);
  expect(snapshot(from).join('\n') === fromBefore, 'the rerun changed team-1');
}

// ---------------------------------------------------------------- the gate

{
  const { ctx, dir } = sandbox('gate', { steps: { 'round-1/1/1': 'break' } });
  planTeam(ctx, 'team-1');
  expect((await goTeam(ctx, 'team-1')) === false, 'round 1 with a broken handler went past the gate');
  let T = record(dir);
  expect(T.round_1.gate?.passed === false && T.round_1.gate.hidden.failed > 0, `the gate on broken code: ${JSON.stringify(T.round_1.gate?.hidden)}`);
  expect(/has not passed its gate/.test((await stops(() => againTeam(ctx, 'team-1', 'team-1-again', { exposurie: '1.3.2' }))) ?? ''), 'again took a round 1 that failed its gate');
  expect(!existsSync(join(dir, 'sync')) && !existsSync(join(dir, 'r001')), 'something ran after the gate stopped the task');
  expect((await goTeam(ctx, 'team-1')) === false, 'the gate let broken code through on a second try');
  noLeftovers(ctx, 'after the gate');
  cpSync(join(task.examplesDir, 'round-1', 'agent-1', 'step-1', 'src', 'jobs', 'handlers', 'import-file.js'), join(dir, 'round-1', 'merged', 'src', 'jobs', 'handlers', 'import-file.js'));
  expect((await goTeam(ctx, 'team-1', { repaired: 'put back the import_file handler the step had broken' })) === true, 'the repaired task did not finish');
  T = record(dir);
  expect(T.round_1.gate.passed && T.round_1.repairs.length === 1, `the repair: ${JSON.stringify(T.round_1.repairs)}`);
  const patch = join(dir, 'round-1', T.round_1.repairs[0]?.patch ?? 'none');
  expect(existsSync(patch) && readFileSync(patch, 'utf8').includes('import-file.js') && readFileSync(patch, 'utf8').includes('-export const broken = true'), 'the repair was not recorded as a patch');
  noLeftovers(ctx, 'after the repair');
}

// The scorer's own command line loads and answers: on 2026-11-07 it awaited
// runner/team.mjs at the top level, which imports the scorer, and Node exited
// with code 13 before scoring anything. Everything above calls scoreTeam directly.
{
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../score/team.mjs', import.meta.url)), 'no-such-task'], { encoding: 'utf8', timeout: 60_000 });
  expect(r.status === 1 && (r.stderr ?? '').includes('score/team: no team task no-such-task'),
    `node score/team.mjs did not answer from its command line: exit ${r.status}, ${(r.stderr ?? '').trim().split('\n')[0]}`);
}

expect(snapshot(HOME).join('\n') === realHome, 'the real sandbox home changed during the check');

if (problems.length) {
  console.log(`check/team.mjs: ${problems.length} problem(s):\n  ${problems.join('\n  ')}\n\nThe check's runs are in ${root}`);
  process.exit(1);
}
console.log(`check/team.mjs: everything holds. The check's runs are in ${root}`);
