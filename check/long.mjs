// The long-session check (part 8): runner/long.mjs end to end against the fake
// `claude` (runner/fake-claude.mjs), before any real long session.
//
//   node check/long.mjs
//
// It runs a made-up long task, with the developer's brain made the way the
// runner check makes one, in sandbox homes of its own under ../runs, so the
// real home, which holds the login, is never touched; the check confirms that
// as well. The sync is exposurie 1.2.0's real one, driven by the fake.
//
//   the whole of it   a usage limit in the fill, carried on after; the fill to
//                     500,000 tokens and the fork; keep, with a read outside
//                     its folder accepted by hand; compact, which tries a
//                     failed approach and takes it back; sync, which files the
//                     long session into a copy of the brain for a fresh session
//   trouble           a compaction nobody asked for, a step whose session was
//                     not saved, a session that runs out of steps short of the
//                     mark, and a session a stopped runner left in the home
//   writes            a shell command that writes into a file counts as a
//                     write, as Write and Edit do; one that reads does not
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPOSURIE, HOME, RUNS, ownNodeOnly, sandboxEnv } from '../runner/sandbox.mjs';
import { DECLINED, Stop, keepBrain, neutralProblems } from '../runner/run.mjs';
import { STRATEGIES, long, stepsFor, writesIn } from '../runner/long.mjs';

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

const root = join(RUNS, `part8-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);

// ---------------------------------------------------------------- a made-up long task

const material = join(root, 'material');
mkdirSync(material, { recursive: true });
writeFileSync(join(material, 'worker.log'), '{"level":"info","msg":"digest sent"}\n');

/** A task shaped like a steps file, small enough for the fake: nine fill steps of 60,000 tokens pass the mark. */
const TASK = {
  id: 'long-check',
  area: 9,
  user: 'developer',
  folder: 'satchel',
  starter: null,
  fork_at: 500_000,
  resume_note: 'Picking up where the last session left off.',
  core: ['Read the code.', 'Write the first importer.', 'It failed: batch the inserts.', { say: 'Look at the worker log I saved.', files: { 'tmp/worker.log': 'worker.log' } }],
  more: Array.from({ length: 10 }, (_, i) => `More work, ${i + 1}.`),
  after: ['Add the second importer.', 'Wrap up, and give me the commit message.'],
  examples: {
    right: [
      { files: [{ path: 'src/imports/second.js', text: 'export const sql = "INSERT INTO links ... ON CONFLICT DO NOTHING"\n' }], answer: 'Added it.' },
      { files: [{ path: 'README.md', text: '# satchel\n\nImports: the first and the second.\n' }], answer: 'Add the second importer' },
    ],
    retry: [
      { files: [{ path: 'src/imports/second.js', text: 'export const sql = "INSERT OR REPLACE INTO links ..."\n' }], answer: 'Added it.' },
      { files: [{ path: 'src/imports/second.js', text: 'export const sql = "INSERT INTO links ... ON CONFLICT DO NOTHING"\n' }, { path: 'README.md', text: '# satchel\n' }], answer: 'Fixed the upsert.' },
    ],
  },
  material,
};

/** A sandbox of its own, with the developer's brain as keep-brain leaves it, and the fake `claude`. */
function sandbox(name) {
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
    timeoutMs: 8000,
    buildTimeoutMs: 120_000,
  };
  mkdirSync(ctx.runs, { recursive: true });
  const env = sandboxEnv({ home, exposurie: true });
  const exp = (...a) => spawnSync(process.execPath, [EXPOSURIE, ...a], { env, cwd: home, encoding: 'utf8' });
  const s = exp('scaffold', '--at', join(home, 'brain'));
  // Exit 10 means steps are left for the person, which a scaffold always has; the build declines two.
  expect(s.status === 0 || s.status === 10, `${name}: exposurie scaffold exited ${s.status}: ${s.stderr.slice(0, 200)}`);
  for (const id of DECLINED) exp('decline', id);
  mkdirSync(join(home, 'brain', 'wiki', 'entities'), { recursive: true });
  writeFileSync(join(home, 'brain', 'wiki', 'entities', 'Owner developer.md'), '---\ntype: entity\n---\n\n# Owner developer\n\nThis brain belongs to the developer.\n');
  writeFileSync(join(home, 'brain', '.exposurie', 'state.json'), JSON.stringify({ lastSyncUtc: new Date().toISOString(), unfiled: 0, files: {} }) + '\n');
  keepBrain(ctx, 'developer');
  const scenario = (sc) => writeFileSync(scenarioFile, JSON.stringify({ build: { user: 'developer' }, ...sc, long: { task: TASK, ...sc.long } }, null, 2) + '\n');
  return { ctx, scenario, run: join(dir, 'runs', 'r001') };
}

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

const record = (run) => readJson(join(run, 'long.json'));
const lastTry = (ph, n) => ph.steps.filter((r) => r.n === n).at(-1);
const streamsUnder = (dir) => filesIn(dir).filter((f) => f.endsWith('stream.jsonl')).map((f) => readFileSync(join(dir, f), 'utf8'));
const noLeftovers = (ctx, where) => {
  expect(!neutralProblems(ctx).length, `${where}: ${neutralProblems(ctx).join('; ')}`);
  expect(!existsSync(join(dirname(ctx.placed), 'placed-session.json')), `${where}: the session marker was left behind`);
};

// ---------------------------------------------------------------- the whole of it

{
  const { ctx, scenario, run } = sandbox('whole');
  scenario({ long: { backdate: true, steps: { 'fill/3': 'limit', 'keep/2': 'outside' }, write: { keep: 'right', compact: 'retry', sync: 'right' } } });
  const go = (opts = {}) => long(ctx, TASK.id, { task: TASK, dir: run, ...opts });

  expect((await go()) === false, 'a fill stopped by a usage limit reported itself finished');
  let L = record(run);
  expect(L.fill.steps.length === 3 && L.fill.steps[2].status === 'not-run' && /^usage limit/.test(L.fill.steps[2].reason), `the limited step: ${JSON.stringify(L.fill.steps.map((r) => r.status))}`);
  expect(filesIn(join(run, 'fill', 'work', 'notes')).join() === 'fill-1.md,fill-2.md', `the fill's snapshot after the limit: ${filesIn(join(run, 'fill', 'work', 'notes'))}`);
  expect(filesIn(join(run, 'fill', 'session')).length === 1, `the fill's saved session after the limit: ${filesIn(join(run, 'fill', 'session'))}`);
  noLeftovers(ctx, 'after the limit');

  expect((await go()) === false, 'a keep step that read outside its folder carried on');
  L = record(run);
  const filled = stepsFor(TASK, 'fill').map((_, i) => lastTry(L.fill, i)).filter((r) => r?.status === 'done');
  expect(existsSync(join(run, 'fill', '03-try1')) && lastTry(L.fill, 2).status === 'done', 'the limited step was not run again, with its first try kept');
  expect(!!L.fill.forked && L.fill.forked.context >= TASK.fork_at && L.fill.forked.core === TASK.core.length, `the fork: ${JSON.stringify(L.fill.forked)}`);
  expect(filled.length === L.fill.forked.core + L.fill.forked.more && filled.at(-2).context_after < TASK.fork_at, `the fill stopped ${filled.length} steps in, not at the first step past the mark`);
  expect(filled.every((r, i) => i === 0 || r.context_after > filled[i - 1].context_after), 'the context did not grow from step to step');
  expect(filesIn(join(run, 'fork', 'work')).includes('tmp/worker.log'), 'the file given with a core step is not in the fork');
  expect(filesIn(join(run, 'fork', 'session')).some((f) => basename(f) === `${L.sessions.fill}.jsonl`), `the fork holds no transcript of the fill: ${filesIn(join(run, 'fork', 'session'))}`);
  expect(L.stopped?.where === 'keep/02' && L.stopped.problems.some((p) => /reach outside its folder: Read .*index\.json/.test(p)), `the read outside the folder: ${JSON.stringify(L.stopped)}`);
  expect(/broke a check/.test((await stops(() => go())) ?? ''), 'a stopped long task carried on without a decision');

  expect((await go({ accept: 'read by hand: the fake read the task list, nothing came of it' })) === true, 'the accepted long task did not finish');
  L = record(run);
  expect(L.accepted.length === 1 && lastTry(L.keep, 1).accepted, `the acceptance: ${JSON.stringify(L.accepted)}`);
  for (const p of STRATEGIES) {
    expect(!!L[p].finished && L[p].tokens?.all_input > 0, `${p} did not finish with its tokens`);
    expect(filesIn(join(run, p, 'session')).some((f) => basename(f) === `${L.sessions[p]}.jsonl`), `${p}'s session was not kept: ${filesIn(join(run, p, 'session'))}`);
    const files = readJson(join(run, p, 'files.json')).map((f) => f.path);
    expect(files.includes('src/imports/second.js') && files.includes('README.md') && !files.some((f) => f.startsWith('notes/')), `${p}'s files since the fork: ${files}`);
    expect(readFileSync(join(run, p, 'files', 'src', 'imports', 'second.js'), 'utf8').includes('ON CONFLICT DO NOTHING'), `${p} ended on the wrong importer`);
  }
  const compacting = lastTry(L.compact, 0);
  expect(compacting.kind === 'compact' && compacting.compactions.length === 1 && compacting.compactions[0].meta?.trigger === 'manual', `the compact step: ${JSON.stringify(compacting.compactions)}`);
  expect(lastTry(L.compact, 1).context_after < 50_000 && lastTry(L.keep, 0).context_after > TASK.fork_at, 'compact did not shrink the session, or keep did not carry it whole');
  const writes = (p) => readJson(join(run, p, 'writes.json')).map((w) => w.text).join('\n');
  expect(writes('compact').includes('INSERT OR REPLACE') && !writes('keep').includes('INSERT OR REPLACE'), 'the approach compact tried and took back is not in its writes');
  const synced = L.sync.sync.at(-1);
  expect(synced.status === 'done' && synced.brain_after.filed && synced.brain_after.newly_read === 1, `the sync: ${JSON.stringify(synced.brain_after)} ${synced.reason ?? ''}`);
  expect(synced.exposurie_commands.some((c) => /^exposurie sync --done/.test(c)), 'the sync never filed its batch');
  expect(existsSync(join(run, 'sync', 'kit', 'brain')) && !existsSync(join(run, 'sync', 'kit', 'brain', '.exposurie', 'staged')) && filesIn(join(run, 'sync', 'staged')).length > 0,
    'the synced brain kept its staged batch, or none was moved out');
  expect(filesIn(join(run, 'sync', 'sync', 'history')).some((f) => basename(f) === `${L.sessions.fill}.jsonl`), "the sync did not read the fill's transcript");
  expect(lastTry(L.sync, 0).session.session === L.sessions.sync && !lastTry(L.sync, 0).session.resume, 'the fresh session was not fresh');
  expect(lastTry(L.keep, 0).session.fork && lastTry(L.keep, 0).session.resume === L.sessions.fill, 'keep did not fork the fill');
  for (const s of streamsUnder(run)) expect(!s.includes('FAKE-PROBLEM'), `a step: ${s.match(/FAKE-PROBLEM[^"]*/)?.[0]}`);
  expect(readFileSync(join(run, 'keep', 'answer.md'), 'utf8') === 'Add the second importer', 'keep\'s answer is not its last reply');
  noLeftovers(ctx, 'after the whole of it');
  expect((await go()) === true, 'a finished long task did not say so when run again');
  expect(record(run).fill.steps.length === L.fill.steps.length, 'a finished long task ran again');
  expect(/is for a long task that stopped/.test((await stops(() => go({ accept: 'nothing to accept' }))) ?? ''), '--accept was taken by a long task with no problem');
}

// ---------------------------------------------------------------- trouble

{
  const { ctx, scenario, run } = sandbox('compacted');
  scenario({ long: { steps: { 'fill/2': 'compact-itself' } } });
  expect((await long(ctx, TASK.id, { task: TASK, dir: run })) === false, 'a session that compacted by itself carried on');
  const L = record(run);
  expect(L.stopped?.where === 'fill/02' && L.stopped.problems.some((p) => /compacted without being asked/.test(p)), `the compaction: ${JSON.stringify(L.stopped)}`);
  noLeftovers(ctx, 'after the compaction');
}
{
  const { ctx, scenario, run } = sandbox('unsaved');
  scenario({ long: { steps: { 'fill/1': 'no-save' } } });
  expect((await long(ctx, TASK.id, { task: TASK, dir: run })) === false, 'a step whose session was not saved carried on');
  expect(record(run).stopped?.problems.some((p) => /no transcript of session/.test(p)), `the unsaved session: ${JSON.stringify(record(run).stopped)}`);
}
{
  const { ctx, scenario, run } = sandbox('short');
  scenario({ long: { grow: 1000 } });
  // A runner stopped part-way left a session in the home.
  mkdirSync(join(ctx.home, '.claude', 'projects', 'E--somewhere'), { recursive: true });
  writeFileSync(join(ctx.home, '.claude', 'projects', 'E--somewhere', 'left.jsonl'), '{}\n');
  writeFileSync(join(dirname(ctx.placed), 'placed-session.json'), JSON.stringify({ run, from: 'nowhere' }) + '\n');
  expect((await long(ctx, TASK.id, { task: TASK, dir: run })) === false, 'a session that never reached the mark was forked');
  const L = record(run);
  expect(!L.fill.forked && L.fill.steps.length === stepsFor(TASK, 'fill').length, `the short session: ${L.fill.steps.length} steps, forked ${JSON.stringify(L.fill.forked)}`);
  expect(readdirSync(run).some((n) => n.startsWith('recovered-')), 'the session left in the home was not kept in its run');
  noLeftovers(ctx, 'after the short session');
}

// ---------------------------------------------------------------- what counts as a write

{
  // The probe saw Claude Code let `printf ... >> notes.txt` run by itself
  // inside the folder, so a shell command that writes counts as a write.
  const work = join(root, 'writes', 'satchel');
  const call = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  const w = writesIn([
    call('t1', 'Bash', { command: "printf 'INSERT OR REPLACE INTO links' >> src/queries/x.sql" }),
    call('t2', 'Bash', { command: 'cat src/app.js 2>/dev/null; ls &>/dev/null' }),
    call('t3', 'Bash', { command: 'exposurie read --search "INSERT OR REPLACE"' }),
    call('t4', 'Bash', { command: "sed -i 's/a/b/' src/app.js" }),
    call('t5', 'Edit', { file_path: join(work, 'src', 'app.js'), old_string: 'a', new_string: 'line.split(",")' }),
    call('t6', 'Write', { file_path: join(work, 'notes.md'), content: 'hi' }),
    { type: 'result', permission_denials: [{ tool_use_id: 't5' }] },
  ], work);
  expect(JSON.stringify(w.map((x) => [x.tool, x.path, x.denied])) === JSON.stringify([['Bash', null, false], ['Bash', null, false], ['Edit', 'src/app.js', true], ['Write', 'notes.md', false]]),
    `what counts as a write: ${JSON.stringify(w)}`);
}

// ---------------------------------------------------------------- the real home

expect(snapshot(HOME).join('\n') === realHome, 'the real sandbox home changed during the check');

console.log(`Output: ${root}`);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe long sessions hold.');
