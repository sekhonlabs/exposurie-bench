// The brain build check (part 6): `build` and `keep-brain` end to end against
// the fake `claude` (runner/fake-claude.mjs), with exposurie 1.2.0's real sync
// staging and filing the history, before any real build.
//
//   node check/build.mjs
//
// It works under ../runs in sandbox homes of its own, so the real home, which
// holds the login, is never touched; the check confirms that as well.
//
//   the developer    a usage limit before the first batch is filed, then a
//                    second build that carries on, reads the raw history on
//                    the way, and finishes; keep-brain; one C run on the brain
//   the delegator    a session that stops after one batch, so the build starts
//                    a second; the claude.ai export arrives and leaves
//   trouble          a session that reads the answer key (accepted by hand),
//                    one that writes a transcript, one that never syncs, no
//                    retention set, a history folder already holding a session
//   the shell        the audit reads here-documents as text, not commands, and
//                    the null device as no place
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME, RUNS, ownNodeOnly } from '../runner/sandbox.mjs';
import { C_PATHS, DECLINED, Stop, audit, build, go, keepBrain, neutralProblems, plan, readRun } from '../runner/run.mjs';

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

const root = join(RUNS, `part6-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);

/** A sandbox of its own: a home with the sandbox's settings (or none), and the fake `claude`. */
function sandbox(name, { settings = true } = {}) {
  const dir = join(root, name);
  const home = join(dir, 'home');
  for (const d of ['.claude', 'AppData/Local', 'AppData/Roaming']) mkdirSync(join(home, d), { recursive: true });
  if (settings) copyFileSync(join(REPO, 'runner', 'sandbox-settings.json'), join(home, '.claude', 'settings.json'));
  const scenario = join(dir, 'scenario.json');
  const ctx = {
    home,
    brains: join(dir, 'brains'),
    runs: join(dir, 'runs'),
    lock: join(dir, 'run.lock'),
    placed: join(dir, 'placed.json'),
    claude: [process.execPath, join(REPO, 'runner', 'fake-claude.mjs')],
    env: { EXPOSURIE_BENCH_FAKE: scenario },
    timeoutMs: 8000,
    buildTimeoutMs: 120_000,
  };
  mkdirSync(ctx.runs, { recursive: true });
  return { ctx, scenario: (s) => writeFileSync(scenario, JSON.stringify(s, null, 2) + '\n') };
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

const record = (ctx, user) => readJson(join(ctx.runs, `build-${user}`, 'build.json'));
const stream = (ctx, user, n) => readFileSync(join(ctx.runs, `build-${user}`, `s${n}`, 'stream.jsonl'), 'utf8');
const brainState = (ctx) => readJson(join(ctx.home, 'brain', '.exposurie', 'state.json'));
const sessionsOf = (user) => readJson(join(REPO, 'users', user, 'plan.json')).sessions;
const historyCount = (user) => sessionsOf(user).filter((s) => s.surface !== 'claude.ai').length;

/** A finished build, as the record and the brain both tell it. */
function finished(ctx, user, sessions) {
  const b = record(ctx, user);
  expect(!!b.finished && !b.stopped, `the ${user}'s build did not finish: ${JSON.stringify(b.stopped ?? null)}`);
  expect(b.sessions.length === sessions, `the ${user}'s build took ${b.sessions.length} sessions, not ${sessions}`);
  for (const s of b.sessions) expect(!stream(ctx, user, s.session).includes('FAKE-PROBLEM'), `${user} s${s.session}: ${stream(ctx, user, s.session).match(/FAKE-PROBLEM[^"]*/)?.[0]}`);
  const st = brainState(ctx);
  expect(!!st.lastSyncUtc && !st.pendingBatch && st.unfiled === 0, `the ${user}'s brain is not synced to the end: ${JSON.stringify({ unfiled: st.unfiled, staged: !!st.pendingBatch })}`);
  expect(Object.keys(st.files ?? {}).length === sessionsOf(user).length, `the ${user}'s brain read ${Object.keys(st.files ?? {}).length} of ${sessionsOf(user).length} conversations`);
  const sum = b.sessions.reduce((n, s) => n + s.tokens.all_input, 0);
  expect(b.tokens?.all_input === sum && sum > 0, `the ${user}'s build counts ${b.tokens?.all_input} input tokens over sessions summing to ${sum}`);
  expect(b.brain?.pages > 0 && b.brain.pages === filesIn(join(ctx.home, 'brain', 'wiki')).filter((f) => f.endsWith('.md')).length, `the ${user}'s brain has ${b.brain?.pages} pages on record`);
  for (const id of DECLINED) expect(existsSync(join(ctx.home, 'brain', '.exposurie', 'declined', `${id}.md`)), `${id} was not declined in the ${user}'s brain`);
  expect(!filesIn(join(ctx.home, 'brain', '.exposurie', 'pending')).length, `the ${user}'s brain still has steps waiting for the person`);
  expect(b.sessions.every((s) => s.startup?.slash_commands.includes('exposurie-sync')), `a session of the ${user}'s build had no /exposurie-sync`);
  return b;
}

/** keep-brain after a build: the brain in the kit, the raw history and the staged batches beside it, the home as runs leave it. */
function kept(ctx, user, b) {
  const staged = filesIn(join(ctx.home, 'brain', '.exposurie', 'staged'));
  expect(staged.length > 0, `the ${user}'s build left no staged batch to move`);
  keepBrain(ctx, user);
  const kit = join(ctx.brains, user);
  for (const rel of C_PATHS) expect(existsSync(join(kit, 'home', rel)), `keep-brain kept no ${rel} for the ${user}`);
  expect(!existsSync(join(kit, 'home', 'brain', '.exposurie', 'staged')), `the ${user}'s staged batches stayed in the brain`);
  expect(JSON.stringify(filesIn(join(kit, 'history', 'staged'))) === JSON.stringify(staged), `the ${user}'s staged batches did not all move to the history`);
  expect(JSON.stringify(filesIn(join(kit, 'history', '.claude', 'projects'))) === JSON.stringify(b.history.files), `the ${user}'s history did not move out whole`);
  expect(filesIn(join(kit, 'history', 'Downloads')).length === (user === 'delegator' ? 1 : 0), `the ${user}'s export`);
  expect(!neutralProblems(ctx).length, `after keep-brain ${user}: ${neutralProblems(ctx).join('; ')}`);
}

// ---------------------------------------------------------------- the developer, then the delegator, in one home

{
  const { ctx, scenario } = sandbox('both');
  scenario({ build: { user: 'developer', sessions: { 1: 'limit', 2: 'read-history' } } });
  const first = await build(ctx, 'developer');
  expect(first === false, 'a build that met a usage limit reported itself finished');
  let b = record(ctx, 'developer');
  expect(b.sessions.length === 1 && b.sessions[0].status === 'not-run' && /^usage limit/.test(b.sessions[0].reason), `the limited session: ${JSON.stringify(b.sessions[0]?.reason)}`);
  expect(!!brainState(ctx).pendingBatch, 'the batch staged before the limit was not left staged');
  expect(b.history.transcripts === historyCount('developer') && !b.history.export, `the developer's history: ${JSON.stringify(b.history.transcripts)}`);
  expect(/has not finished/.test((await stops(() => keepBrain(ctx, 'developer'))) ?? ''), 'keep-brain took an unfinished build');
  expect(/is not for|did not/.test((await stops(() => build(ctx, 'developer', { accept: 'nothing to accept' }))) ?? ''), '--accept was taken by a build with no problem');

  const second = await build(ctx, 'developer');
  expect(second === true, 'the second build did not finish');
  b = finished(ctx, 'developer', 2);
  expect(b.sessions[1].notes.length === 0 && b.sessions[1].status === 'done', `reading the raw history counted against the build: ${JSON.stringify(b.sessions[1].problems)}`);
  expect(b.sessions[1].exposurie_commands.filter((c) => c === 'exposurie sync --done').length >= 3, `the developer's history filed in ${b.sessions[1].exposurie_commands.filter((c) => c === 'exposurie sync --done').length} batches`);
  expect(/is built/.test((await stops(() => build(ctx, 'developer'))) ?? ''), 'a finished build ran again');
  kept(ctx, 'developer', b);
  expect(/already holds/.test((await stops(() => build(ctx, 'developer'))) ?? ''), 'a build ran for a user whose brain is kept');

  // The built brain serves a C run.
  scenario({ runs: {} });
  plan(ctx, 'c-run', { tasks: ['recall-1'], conditions: ['C'] });
  await go(ctx, 'c-run');
  const run = readRun(join(ctx.runs, 'c-run', 'r001'));
  const answer = existsSync(join(ctx.runs, 'c-run', 'r001', 'answer.md')) ? readFileSync(join(ctx.runs, 'c-run', 'r001', 'answer.md'), 'utf8') : '';
  expect(run?.status === 'done' && run.looked && !answer.includes('FAKE-PROBLEM'), `a C run on the built brain: ${run?.status} (${run?.reason ?? answer.slice(0, 300)})`);

  scenario({ build: { user: 'delegator', sessions: { 1: 'stop-early' } } });
  const del = await build(ctx, 'delegator');
  expect(del === true, 'the delegator\'s build did not finish');
  b = finished(ctx, 'delegator', 2);
  expect(b.history.export && b.sessions[0].brain_after.newly_read > 0 && !b.sessions[0].brain_after.filed, 'the session that stopped early');
  kept(ctx, 'delegator', b);
}

// ---------------------------------------------------------------- a session that reads the answer key, accepted by hand

{
  const { ctx, scenario } = sandbox('outside');
  scenario({ build: { user: 'developer', sessions: { 1: 'outside' } } });
  expect((await build(ctx, 'developer')) === false, 'a build that read the answer key reported itself finished');
  let b = record(ctx, 'developer');
  expect(b.stopped?.problems.some((p) => /reach outside its folder: Read .*facts\.json/.test(p)), `the read of the answer key: ${JSON.stringify(b.stopped)}`);
  expect(/stopped on a problem/.test((await stops(() => keepBrain(ctx, 'developer'))) ?? ''), 'keep-brain took a build that stopped on a problem');
  expect(/broke a check/.test((await stops(() => build(ctx, 'developer'))) ?? ''), 'a stopped build carried on without a decision');
  expect((await build(ctx, 'developer', { accept: 'read by hand: the fake read, nothing was written from it' })) === true, 'the accepted build did not finish');
  b = record(ctx, 'developer');
  expect(b.finished && b.sessions.length === 1 && b.accepted?.[0]?.session === 1, `the accepted build: ${JSON.stringify(b.accepted)}`);
}

// ---------------------------------------------------------------- a session that writes a transcript

{
  const { ctx, scenario } = sandbox('persist');
  scenario({ build: { user: 'developer', sessions: { 1: 'persist' } } });
  expect((await build(ctx, 'developer')) === false, 'a build that wrote a transcript reported itself finished');
  const b = record(ctx, 'developer');
  expect(b.stopped?.problems.some((p) => /wrote 1 transcript/.test(p)), `the transcript: ${JSON.stringify(b.stopped)}`);
  expect(filesIn(join(ctx.runs, 'build-developer', 's1', 'leaked')).length === 1, 'the transcript was not moved out');
  expect(JSON.stringify(filesIn(join(ctx.home, '.claude', 'projects'))) === JSON.stringify(b.history.files), 'the history folder holds more than the history');
}

// ---------------------------------------------------------------- a session that never syncs

{
  const { ctx, scenario } = sandbox('idle');
  scenario({ build: { user: 'delegator', sessions: { 1: 'idle' } } });
  expect((await build(ctx, 'delegator')) === false, 'a build whose session never synced reported itself finished');
  const b = record(ctx, 'delegator');
  expect(b.sessions.length === 1 && !b.stopped, `the idle build ran ${b.sessions.length} sessions`);
}

// ---------------------------------------------------------------- before any history goes in

{
  const { ctx } = sandbox('no-retention', { settings: false });
  expect(/transcript retention/.test((await stops(() => build(ctx, 'developer'))) ?? ''), 'a build placed history with no retention set');
  expect(!existsSync(join(ctx.home, '.claude', 'projects')), 'history was placed with no retention set');
}
{
  const { ctx } = sandbox('login-session');
  mkdirSync(join(ctx.home, '.claude', 'projects', 'E--somewhere'), { recursive: true });
  writeFileSync(join(ctx.home, '.claude', 'projects', 'E--somewhere', 'login.jsonl'), '{}\n');
  expect(/holds a history/.test((await stops(() => build(ctx, 'developer'))) ?? ''), 'a build placed history beside a session already there');
  expect(!existsSync(join(ctx.home, 'brain')), 'a brain was scaffolded beside a session already there');
}

// ---------------------------------------------------------------- the audit's reading of the shell

{
  // The real build's first session appended to its log with a here-document
  // whose text held a backtick, and the audit read that line as a command.
  const work = join(root, 'audit', 'brain');
  const home = join(root, 'audit');
  const shell = (command) => audit(
    [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command } }] } }, { type: 'result', permission_denials: [] }],
    { work, home, roots: [work] },
  );
  const log = "cat >> log.md <<'EOF'\n\n## [2026-10-21] sync\n- Open: the input is both `sha` and `image_tag`; see ../notes and ~/x\nEOF\nexposurie sync --done";
  let a = shell(log);
  expect(!a.problems.length && JSON.stringify(a.notes) === JSON.stringify(["ran cat >> log.md <<'EOF', which Claude Code allows by itself"]), `a here-document's text read as commands: ${JSON.stringify(a)}`);
  a = shell("cat > notes.txt <<-END\n\tline with $(whoami)\n\tEND\ncat ../outside.txt");
  expect(a.problems.length === 1 && /cat \.\.\/outside\.txt/.test(a.problems[0]), `a command after a here-document went unread: ${JSON.stringify(a.problems)}`);
  a = shell('ls -R wiki | head -30; cat index.md');
  expect(!a.problems.length && a.notes.length === 3, `read-only commands inside the folder: ${JSON.stringify(a)}`);
  a = shell('cat ~/.claude/.credentials.json');
  expect(a.problems.length === 1, 'a shell read of the home went unflagged');
  // A full run's agent hid an error with 2>/dev/null, and the audit read the
  // null device as a place outside the folder.
  a = shell('cat README.md 2>/dev/null; ls -la src &>/dev/null');
  expect(!a.problems.length && a.notes.length === 2, `the null device read as a place: ${JSON.stringify(a)}`);
  a = shell('cat ../outside.txt 2>/dev/null; echo hi &>../x.txt');
  expect(a.problems.length === 2, `a place outside the folder went unflagged beside a redirect: ${JSON.stringify(a.problems)}`);
  // area 9's probe: a sync appended to its log with printf, and the audit read
  // the quoted text, which opens on \n and holds a backtick, as a place.
  a = shell("printf '\\n## [2026-10-21] sync | Fourth batch: 1 scratch session\\n- Nothing folded in: a `notes.txt` test\\n' >> log.md");
  expect(!a.problems.length && a.notes.length === 1, `quoted text read as a place: ${JSON.stringify(a)}`);
  a = shell("printf 'imports go to /data/imports/ and ~ nowhere else\\n' >> notes.txt; printf 'three\\n' >> notes.txt");
  expect(!a.problems.length && a.notes.length === 2, `a path inside quoted text read as a place: ${JSON.stringify(a)}`);
  a = shell("cat '../outside.txt'; cat \"E:/somewhere else/x.txt\"; echo \"$HOME\" > x");
  expect(a.problems.length === 3, `a quoted place outside the folder went unflagged: ${JSON.stringify(a.problems)}`);
}

// ---------------------------------------------------------------- the real home

expect(snapshot(HOME).join('\n') === realHome, 'the real sandbox home changed during the check');

console.log(`Output: ${root}`);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe brain build holds.');
