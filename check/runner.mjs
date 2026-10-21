// The runner and scorer check (part 5): the benchmark run end to end against a
// fake `claude` (runner/fake-claude.mjs), before any real run.
//
//   node check/runner.mjs
//
// It works in a folder of its own under ../runs, with its own sandbox home, so
// the real home, which holds the login, is never touched; the check confirms
// that as well. Both users' brains are made by exposurie 1.2.0's own scaffold,
// as part 6 will make them, and kept with keep-brain. Then every task runs
// under every condition, and some runs are given trouble on purpose:
//
//   a usage limit, a crash, a hang, an API error       not run, then run again
//   a wrong tool list, an MCP server                   stopped at the start-up line
//   a read outside its folder, one with the shell, a   thrown out
//   transcript written, its condition edited,
//   something left in the home
//   a read outside its folder that was denied, and     kept, with a note
//   a shell command Claude Code allows by itself
//
// The scorer then scores every run with the run order moved out of its reach,
// the judge decides what the checks cannot (meeting one usage limit on the
// way), a hand verdict overrules the judge, and the repository save refuses a
// login address and a machine path.
//
// Run it with the sandbox's own Node. Exit 0 when everything holds; exit 1
// lists every problem.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPOSURIE, HOME, RUNS, ownNodeOnly, sandboxEnv } from '../runner/sandbox.mjs';
import { C_PATHS, Stop, allTasks, go, keepBrain, neutralProblems, plan, readRun } from '../runner/run.mjs';
import { saveToRepo, scoreBatch } from '../score/score.mjs';

ownNodeOnly();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USERS = ['developer', 'delegator'];
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
  walk(dir, '');
  return out.join('\n');
}
const realHome = snapshot(HOME);

// ---------------------------------------------------------------- a sandbox of its own

const root = join(RUNS, `part5-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const home = join(root, 'home');
for (const d of ['.claude', 'AppData/Local', 'AppData/Roaming']) mkdirSync(join(home, d), { recursive: true });
const scenarioFile = join(root, 'scenario.json');
const ctx = {
  home,
  brains: join(root, 'brains'),
  runs: join(root, 'runs'),
  lock: join(root, 'run.lock'),
  placed: join(root, 'placed.json'),
  claude: [process.execPath, join(REPO, 'runner', 'fake-claude.mjs')],
  env: { EXPOSURIE_BENCH_FAKE: scenarioFile },
  timeoutMs: 8000,
};
mkdirSync(ctx.runs, { recursive: true });

// ---------------------------------------------------------------- both brains, as part 6 makes them

for (const user of USERS) {
  const env = sandboxEnv({ home, exposurie: true });
  const r = spawnSync(process.execPath, [EXPOSURIE, 'scaffold', '--at', join(home, 'brain')], { env, cwd: home, encoding: 'utf8' });
  // Exit 10 means steps are left for the person, which a scaffold always has.
  expect(r.status === 0 || r.status === 10, `exposurie scaffold for the ${user} exited ${r.status}: ${r.stderr.slice(0, 200)}`);
  const wiki = join(home, 'brain', 'wiki', 'entities');
  mkdirSync(wiki, { recursive: true });
  writeFileSync(join(wiki, `Owner ${user}.md`), `---\ntype: entity\n---\n\n# Owner ${user}\n\nThis brain belongs to the ${user}.\n`);
  // What a finished sync leaves in the brain's state.
  writeFileSync(join(home, 'brain', '.exposurie', 'state.json'), JSON.stringify({ lastSyncUtc: new Date().toISOString(), unfiled: 0 }) + '\n');
  mkdirSync(join(home, '.claude', 'projects', 'history'), { recursive: true });
  writeFileSync(join(home, '.claude', 'projects', 'history', 'session.jsonl'), '{}\n');
  keepBrain(ctx, user);
  for (const rel of C_PATHS) expect(existsSync(join(ctx.brains, user, 'home', rel)), `keep-brain kept no ${rel} for the ${user}`);
  expect(existsSync(join(ctx.brains, user, 'history', '.claude', 'projects', 'history', 'session.jsonl')), `keep-brain moved no history out for the ${user}`);
  expect(!neutralProblems(ctx).length, `after keep-brain ${user}: ${neutralProblems(ctx).join('; ')}`);
}

// ---------------------------------------------------------------- trouble, on purpose

const trouble = {
  'recall-2/A': 'limit',
  'never-3/A': 'crash',
  'your-way-1/A': 'hang',
  'your-way-2/D': 'api-error',
  'recall-3/B': 'wrong-tools',
  'across-3/D': 'mcp',
  'changed-1/C': 'outside',
  'changed-2/B': 'outside-denied',
  'changed-3/A': 'shell',
  'across-1/A': 'shell-inside',
  'never-1/B': 'persist',
  'never-2/D': 'edit-condition',
  'your-way-3/C': 'stray',
  'recall-1/C': 'email',
  'across-2/D': { example: 'judge', judge: 'right' },
  'chat-1/B': { example: 'judge', judge: 'wrong' },
};
/** What a later attempt no longer meets: the limit resets, and a crash, a hang or an API error does not repeat. */
const PASSING = ['limit', 'crash', 'hang', 'api-error'];
const THROWN = ['wrong-tools', 'mcp', 'outside', 'shell', 'persist', 'edit-condition', 'stray'];
/** A made-up stand-in for the sandbox login, so the check never handles the real one. */
const identity = 'login-check@example.invalid';
const tasks = new Map(allTasks().map((t) => [t.id, t]));
const scenario = { runs: { ...trouble }, identity, judge_limit: tasks.get('never-3').ask };
const writeScenario = () => writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2) + '\n');
writeScenario();

// ---------------------------------------------------------------- the plan

const b = plan(ctx, 'all');
const order = (x) => x.cells.map((c) => `${c.task}/${c.condition}`).join(' ');
expect(b.cells.length === 93, `planned ${b.cells.length} runs, not 93 (21 tasks under 4 conditions, area 8 under 3)`);
expect(order(plan(ctx, 'same-seed', { seed: 'all' })) === order(b), 'the same seed gave another order');
expect(order(plan(ctx, 'other-seed', { seed: 'other' })) !== order(b), 'another seed gave the same order');
expect(new Set(b.cells.slice(0, 24).map((c) => c.condition)).size === 4, 'the first 24 runs do not mix all four conditions');
expect(b.cells.every((c) => /^r\d{3}$/.test(c.run)), 'a run ID says more than its place in the order');
expect(!b.cells.some((c) => c.condition === 'D' && tasks.get(c.task).area === 8), 'area 8 has a D run');
try {
  plan(ctx, 'all');
  problems.push('a batch could be planned twice');
} catch (e) {
  expect(e instanceof Stop, `planning a batch twice: ${e.message}`);
}

// Claude Code would load an instructions file sitting above the runs into every one of them.
writeFileSync(join(ctx.runs, 'AGENTS.md'), 'above every run\n');
try {
  await go(ctx, 'all');
  problems.push('a batch ran with an AGENTS.md above it');
} catch (e) {
  expect(e instanceof Stop && /AGENTS\.md would reach every run/.test(e.message), `go with an AGENTS.md above the runs: ${e.message}`);
}
rmSync(join(ctx.runs, 'AGENTS.md'));
expect(!existsSync(join(ctx.runs, 'all', 'r001')), 'a run started with an AGENTS.md above it');

// ---------------------------------------------------------------- running it, stops and all

const at = (key) => b.cells.findIndex((c) => `${c.task}/${c.condition}` === key);
const dirOf = (cell) => join(ctx.runs, 'all', cell.run);
const STOPS = ['recall-2/A', 'your-way-3/C'];
const settled = (c) => ['done', 'thrown-out'].includes(readRun(dirOf(c))?.status);
const tried = () => new Set(b.cells.filter((c) => existsSync(join(dirOf(c), 'run.json'))).map((c) => c.run));
let before = new Set();
let passes = 0;
while (passes < 6) {
  passes += 1;
  if (passes === 2) {
    // A runner stopped part-way leaves its condition in the home; the next go takes it out.
    writeFileSync(ctx.placed, JSON.stringify({ run: 'r999', paths: ['.claude/CLAUDE.md'] }) + '\n');
    writeFileSync(join(home, '.claude', 'CLAUDE.md'), 'left behind\n');
  }
  let finished;
  try {
    finished = await go(ctx, 'all');
  } catch (e) {
    problems.push(`go, pass ${passes}: ${e.message}`);
    break;
  }
  // A usage limit, or something left in the home, stops the pass right there.
  const now = tried();
  const fresh = [...now].filter((r) => !before.has(r));
  for (const key of STOPS) {
    const i = at(key);
    if (!fresh.includes(b.cells[i].run)) continue;
    expect(!finished, `the pass that met ${key} did not stop`);
    expect(fresh.every((r) => b.cells.findIndex((c) => c.run === r) <= i), `the pass that met ${key} ran on after it`);
  }
  before = now;
  rmSync(join(home, 'AppData', 'Local', 'Stray'), { recursive: true, force: true });
  // Trouble that passes is met once: once its run has been tried, the next attempt goes through.
  for (const [k, v] of Object.entries(scenario.runs)) {
    if (PASSING.includes(v) && existsSync(join(dirOf(b.cells[at(k)]), 'run.json'))) delete scenario.runs[k];
  }
  writeScenario();
  if (finished && b.cells.every(settled)) break;
}
expect(b.cells.every(settled), `after ${passes} passes, runs are still open`);
expect(!neutralProblems(ctx).length, `the home after the batch: ${neutralProblems(ctx).join('; ')}`);

// ---------------------------------------------------------------- what each run left

const examples = readJson(join(REPO, 'tasks', 'examples.json')).examples;
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const ran = readJson(join(ctx.runs, 'all', 'batch.json'));
for (const cell of ran.cells.filter((c) => c.input)) {
  const t = tasks.get(cell.task);
  const file = { B: `history-${t.user}.md`, D: `facts-${t.id}.md` }[cell.condition];
  const got = cell.input.map((i) => i.file).join(', ');
  if (cell.condition === 'A') expect(cell.input.length === 0, `${cell.run} A was given ${got}`);
  if (file) {
    const ok = cell.input.length === 1 && cell.input[0].file === '.claude/CLAUDE.md' && cell.input[0].sha256 === sha256(join(REPO, 'tasks', 'conditions', file));
    expect(ok, `${cell.run} ${cell.condition} was not given ${file} as its instructions file`);
  }
  if (cell.condition === 'C') expect(got === C_PATHS.join(', '), `${cell.run} C was given ${got}`);
}
for (const cell of b.cells) {
  const key = `${cell.task}/${cell.condition}`;
  const t = trouble[key];
  const name = typeof t === 'string' ? t : null;
  const dir = dirOf(cell);
  const r = readRun(dir);
  const want = THROWN.includes(name) ? 'thrown-out' : 'done';
  if (r?.status !== want) {
    problems.push(`${cell.run} ${key}: ${r?.status ?? 'never ran'}${r?.reason ? ` (${r.reason})` : ''}, not ${want}`);
    continue;
  }
  expect(!('condition' in r) && !JSON.stringify(r).includes(`"${cell.condition}"`), `${cell.run} ${key}: run.json names its condition`);
  expect(existsSync(join(dir, tasks.get(cell.task).folder)), `${cell.run} ${key}: no ${tasks.get(cell.task).folder} folder`);
  const reasons = {
    'wrong-tools': /^start-up line: only the listed tools/, mcp: /^start-up line: no MCP servers/, outside: /reach outside its folder: Read/,
    shell: /reach outside its folder with the shell: cat/, persist: /wrote a transcript/, 'edit-condition': /changed \.claude\/CLAUDE\.md/,
    stray: /left AppData\/Local\/Stray/,
  };
  if (reasons[name]) expect(reasons[name].test(r.reason), `${cell.run} ${key}: thrown out for "${r.reason}"`);
  if (name === 'wrong-tools' || name === 'mcp') {
    expect(Date.parse(r.finished) - Date.parse(r.started) < ctx.timeoutMs, `${cell.run} ${key}: was not stopped at its start-up line`);
  }
  if (name === 'persist') expect(existsSync(join(dir, 'leaked', 'projects')), `${cell.run} ${key}: the transcript it wrote was not kept`);
  if (name === 'outside-denied') expect(r.notes.some((n) => /tried to reach outside its folder/.test(n)), `${cell.run} ${key}: no note of the denied read`);
  if (name === 'shell-inside') expect(r.notes.some((n) => /ran ls -la, which Claude Code allows by itself/.test(n)), `${cell.run} ${key}: no note of the shell command`);
  if (PASSING.includes(name)) {
    const first = readRun(`${dir}-try1`);
    const was = { limit: /^usage limit/, crash: /^no result line \(exit 3\)/, hang: /^no result within/, 'api-error': /overloaded_error \(529\)/ }[name];
    expect(first?.status === 'not-run' && was.test(first.reason), `${cell.run} ${key}: its first attempt was ${first?.status} (${first?.reason})`);
  }
  if (r.status !== 'done') continue;

  const answer = readFileSync(join(dir, 'answer.md'), 'utf8');
  expect(!answer.includes('FAKE-PROBLEM'), `${cell.run} ${key}: ${answer.slice(0, 400)}`);
  expect(r.looked === (cell.condition === 'C') && r.reads === (cell.condition === 'C' ? 1 : 0), `${cell.run} ${key}: looked ${r.looked}, ${r.reads} reads`);
  expect(r.tokens?.all_input > 6000, `${cell.run} ${key}: ${r.tokens?.all_input} input tokens`);
  if (cell.condition === 'B') expect(r.tokens.all_input > 50_000, `${cell.run} ${key}: B's whole history did not arrive (${r.tokens.all_input} input tokens)`);
  expect(r.versions?.claude_code && r.versions.model && r.versions.exposurie?.includes('1.2.0'), `${cell.run} ${key}: versions ${JSON.stringify(r.versions)}`);

  // The files it saved are the ones its answer wrote, against the starter.
  const kind = t?.example ?? (cell.condition === 'A' ? 'wrong' : 'right');
  const e = examples.find((x) => x.task === cell.task && x.expect === kind);
  const starter = tasks.get(cell.task).starter;
  const wantFiles = (e?.files ?? [])
    .map((f) => `${f.path} ${starter && existsSync(join(REPO, 'tasks', starter, f.path)) ? 'changed' : 'created'}`)
    .sort();
  const saved = readJson(join(dir, 'files.json')).map((f) => `${f.path} ${f.change}`).sort();
  expect(JSON.stringify(saved) === JSON.stringify(wantFiles), `${cell.run} ${key}: saved ${saved.join(', ') || 'no files'}, expected ${wantFiles.join(', ') || 'none'}`);
  for (const f of e?.files ?? []) {
    const copy = join(dir, 'files', f.path);
    expect(existsSync(copy) && readFileSync(copy, 'utf8') === f.text, `${cell.run} ${key}: ${f.path} was not saved as written`);
  }
}

// ---------------------------------------------------------------- C waits for a fresh, finished brain

const stateOf = (user) => join(ctx.brains, user, 'home', 'brain', '.exposurie', 'state.json');
const states = Object.fromEntries(USERS.map((u) => [u, readFileSync(stateOf(u), 'utf8')]));
writeFileSync(stateOf('delegator'), JSON.stringify({ lastSyncUtc: new Date(Date.now() - 8 * 86_400_000).toISOString(), unfiled: 0 }) + '\n');
writeFileSync(stateOf('developer'), JSON.stringify({ lastSyncUtc: new Date().toISOString(), unfiled: 2 }) + '\n');
const aged = plan(ctx, 'stale-brains', { tasks: ['recall-3', 'recall-1'], conditions: ['C'] });
try {
  await go(ctx, 'stale-brains');
} catch (e) {
  problems.push(`go, with stale brains: ${e.message}`);
}
for (const [task, why] of [['recall-3', /synced 8 days ago/], ['recall-1', /2 conversations not filed yet/]]) {
  const r = readRun(join(ctx.runs, 'stale-brains', aged.cells.find((c) => c.task === task).run));
  expect(r?.status === 'not-run' && why.test(r.reason), `C with a stale brain (${task}): ${r?.status} (${r?.reason})`);
}
for (const u of USERS) writeFileSync(stateOf(u), states[u]);

// ---------------------------------------------------------------- scoring, blind

const batchDir = join(ctx.runs, 'all');
const hidden = join(root, 'batch.json.hidden-from-the-scorer');
renameSync(join(batchDir, 'batch.json'), hidden);
let s1 = { scores: [], stopped: null };
let s2 = { scores: [], stopped: null };
try {
  s1 = scoreBatch(batchDir, { ctx });
  s2 = scoreBatch(batchDir, { ctx });
} catch (e) {
  problems.push(`scoring without the run order: ${e.message}`);
} finally {
  renameSync(hidden, join(batchDir, 'batch.json'));
}
expect(/usage limit/.test(s1.stopped ?? ''), `the judge's usage limit did not stop the first scoring pass: ${s1.stopped}`);
expect(s1.scores.some((s) => s.status === 'done' && !s.verdict), 'nothing was left for the judge after its usage limit');
expect(!s2.stopped, `the second scoring pass stopped: ${s2.stopped}`);

const byRun = new Map(s2.scores.map((s) => [s.run, s]));
for (const cell of b.cells) {
  const s = byRun.get(cell.run);
  if (s?.status !== 'done') continue;
  const key = `${cell.task}/${cell.condition}`;
  const t = trouble[key];
  const judged = tasks.get(cell.task).score === 'judge' || t?.example === 'judge';
  const want = t?.example === 'judge' ? t.judge : cell.condition === 'A' ? 'wrong' : 'right';
  expect(s.verdict === want, `${cell.run} ${key}: scored ${s.verdict}, not ${want}`);
  expect(s.by === (judged ? 'judge' : 'checks'), `${cell.run} ${key}: scored by ${s.by}`);
  if (judged) {
    const prompt = join(batchDir, 'judge', cell.run, 'prompt.md');
    const material = existsSync(prompt) ? readFileSync(prompt, 'utf8') : '';
    expect(material.includes(tasks.get(cell.task).judge) && !material.includes(home), `${cell.run} ${key}: the judge's material`);
  }
}

// A verdict by hand is final.
const judgedRun = s2.scores.find((s) => s.by === 'judge');
if (!judgedRun) problems.push('no run was scored by the judge');
else {
  writeFileSync(join(batchDir, 'hand.json'), JSON.stringify({ [judgedRun.run]: judgedRun.verdict === 'right' ? 'wrong' : 'right' }) + '\n');
  const s3 = scoreBatch(batchDir, { ctx }).scores.find((s) => s.run === judgedRun.run);
  expect(s3.by === 'hand' && s3.verdict !== judgedRun.verdict, `a hand verdict did not overrule the judge on ${judgedRun.run}`);
  const sheet = readFileSync(join(batchDir, 'hand-check.md'), 'utf8');
  expect(sheet.includes(`## ${judgedRun.run}`) && !/condition [ABCD]\b/.test(sheet), 'the hand-check sheet');
}

// ---------------------------------------------------------------- what may enter the repository

const repoCopy = join(root, 'repo-copy');
const refuses = (text, what) => {
  try {
    saveToRepo('results/x.md', text, { root: repoCopy, identity: [identity] });
    problems.push(`the repository save took a text with ${what}`);
  } catch (e) {
    expect(e instanceof Stop && !e.message.includes(identity), `the repository save, on ${what}: ${e.message}`);
  }
};
const emailAnswer = join(dirOf(b.cells.find((c) => `${c.task}/${c.condition}` === 'recall-1/C')), 'answer.md');
if (existsSync(emailAnswer)) refuses(readFileSync(emailAnswer, 'utf8'), "the sandbox login's address");
else problems.push("the run that wrote the login's address never ran");
refuses('raw output is in E:\\bench\\runs', 'a Windows path');
expect(!existsSync(join(repoCopy, 'results', 'x.md')), 'a refused text was written');
const saved = saveToRepo('results/all/scores.json', '{"runs": []}\r\n', { root: repoCopy, identity: [identity] });
expect(readFileSync(saved, 'utf8') === '{"runs": []}\n', 'the repository save did not write LF');

// ---------------------------------------------------------------- the command lines

const cli = (file, ...a) => spawnSync(process.execPath, [join(REPO, file), ...a], { encoding: 'utf8' });
const st = cli('runner/run.mjs', 'status', 'no-such-batch');
expect(st.status === 1 && /no batch no-such-batch/.test(st.stderr), `run.mjs status on a missing batch: exit ${st.status}, ${st.stderr}`);
const sc = cli('score/score.mjs');
expect(sc.status === 1 && /usage/.test(sc.stderr), `score.mjs with no batch: exit ${sc.status}, ${sc.stderr}`);

// ---------------------------------------------------------------- the real home

expect(snapshot(HOME) === realHome, 'the real sandbox home changed during the check');

const done = s2.scores.filter((s) => s.status === 'done');
console.log(
  `\n${b.cells.length} runs in ${passes} passes: ${done.length} done, ${s2.scores.filter((s) => s.status === 'thrown-out').length} thrown out. ` +
    `${done.filter((s) => s.by === 'checks').length} scored by their checks, ${done.filter((s) => s.by === 'judge').length} by the judge. Output: ${root}`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log('\nThe runner and scorer hold.');
