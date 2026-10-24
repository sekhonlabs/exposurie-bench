// The scorer (part 5): every finished run of a batch, scored without knowing
// its condition.
//
//   node score/score.mjs <batch>             score every finished run, and judge what the checks cannot settle
//   node score/score.mjs <batch> --no-judge  the checks only; what needs the judge waits
//   node score/score.mjs <batch> --save      also write the scores into results/<batch>/scores.json
//
// It reads only what a run left in its own folder: run.json for the task,
// answer.md for the final reply, and the files it created or changed. Which
// condition a run had is in the runner's batch.json, and nothing here opens it.
//
// A run's verdict comes from its task's checks (score/checks.mjs). The judge
// (score/judge.mjs) decides every answer in areas 4 and 5, and any answer where
// every required check holds and a forbidden one does too. Each of those is
// also checked by hand: hand-check.md lists them with the judge's verdict and
// reason, and a verdict written into hand.json, such as {"r003": "right"},
// is final.
//
// Scores go to the batch's folder in ../runs. With --save they also go into the
// repository, and anything written there is first checked for the sandbox
// login's email address and names, which every run carries, and for machine
// paths.
//
// Run it with the sandbox's own Node.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { find } from '../check/text.mjs';
import { lockSandbox, loginIdentity, ownNodeOnly } from '../runner/sandbox.mjs';
import { Stop, allTasks, readRun, sandboxContext } from '../runner/run.mjs';
import { holds, verdict } from './checks.mjs';
import { judge } from './judge.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Run folders only: an earlier attempt kept beside one (r003-try1) is not scored. */
const runsIn = (dir) => readdirSync(dir).filter((n) => /^r\d{3,}$/.test(n)).sort();

/** What the scorer reads of a run, and all it reads. */
export function readForScoring(dir) {
  const run = readRun(dir);
  const files = existsSync(join(dir, 'files.json')) ? readJson(join(dir, 'files.json')) : [];
  return {
    ...run,
    answer: existsSync(join(dir, 'answer.md')) ? readFileSync(join(dir, 'answer.md'), 'utf8') : '',
    files: files
      .filter((f) => f.change !== 'deleted')
      .map((f) => ({ path: f.path, text: f.text ? readFileSync(join(dir, 'files', f.path), 'utf8') : null })),
  };
}

/** What a check reads: text files only. */
const asRun = (r) => ({ answer: r.answer, files: r.files.filter((f) => f.text !== null) });

/**
 * Score every finished run in a batch folder. `ctx` runs the judge; without it
 * (or with judge: false) answers that need the judge wait for a later pass.
 */
export function scoreBatch(dir, { ctx = null, judge: judging = true } = {}) {
  const tasks = new Map(allTasks().map((t) => [t.id, t]));
  const hand = existsSync(join(dir, 'hand.json')) ? readJson(join(dir, 'hand.json')) : {};
  const scores = [];
  let stopped = null;
  let release = null;
  try {
    for (const id of runsIn(dir)) {
      const r = readForScoring(join(dir, id));
      const task = tasks.get(r.task);
      const s = {
        run: id, task: r.task, area: task.area, user: task.user, status: r.status, verdict: null, by: null,
        checks: null, judge: null, hand: hand[id] ?? null,
        tokens: r.tokens ? { all_input: r.tokens.all_input, input: r.tokens.input, cache_write: r.tokens.cache_write, cache_read: r.tokens.cache_read, output: r.tokens.output } : null,
        turns: r.turns ?? null, duration_ms: r.duration_ms ?? null, tool_calls: r.tool_calls ?? null, looked: r.looked ?? null, reads: r.reads ?? null,
      };
      scores.push(s);
      if (r.status !== 'done') continue;
      const run = asRun(r);
      s.checks = { required: task.required.map((c) => holds(c, run)), forbidden: task.forbidden.map((c) => holds(c, run)) };
      const v = verdict(task, run);
      if (v !== 'judge') {
        s.verdict = v;
        s.by = 'checks';
      } else {
        const jdir = join(dir, 'judge', id);
        const saved = join(jdir, 'verdict.json');
        if (existsSync(saved)) s.judge = readJson(saved);
        else if (judging && ctx && !stopped) {
          release ??= lockSandbox(ctx.lock);
          try {
            s.judge = { ...judge(ctx, task, r, jdir), at: new Date().toISOString() };
            // Kept only once it holds a verdict, so a judge that did not give one is asked again next time.
            if (s.judge.verdict) writeFileSync(saved, JSON.stringify(s.judge, null, 2) + '\n');
          } catch (e) {
            if (!(e instanceof Stop)) throw e;
            stopped = e.message;
          }
        }
        if (s.judge?.verdict) {
          s.verdict = s.judge.verdict;
          s.by = 'judge';
        }
      }
      if (s.hand) {
        if (!['right', 'wrong'].includes(s.hand)) throw new Stop(`hand.json gives ${id} "${s.hand}"; a verdict is right or wrong`);
        s.verdict = s.hand;
        s.by = 'hand';
      }
    }
  } finally {
    release?.();
  }
  writeFileSync(join(dir, 'scores.json'), JSON.stringify({ scored: new Date().toISOString(), runs: scores }, null, 2) + '\n');
  writeFileSync(join(dir, 'hand-check.md'), handSheet(dir, scores, tasks));
  return { scores, stopped };
}

/** The runs a person checks by hand: every one that went to the judge. */
function handSheet(dir, scores, tasks) {
  const out = [
    '# Hand check',
    '',
    'Every answer the judge decided, or still has to. Read each against its rubric, and write any verdict you reach',
    'into hand.json, such as {"r003": "right"}. A verdict there is final. Nothing here says which condition a run had.',
    '',
  ];
  for (const s of scores.filter((x) => x.checks && (x.judge || x.by === 'hand' || (x.verdict === null)))) {
    const t = tasks.get(s.task);
    const r = readForScoring(join(dir, s.run));
    out.push('---', '', `## ${s.run} · ${s.task}`, '', `**Question:** ${t.ask}`, '', `**Rubric:** ${t.judge}`, '');
    out.push(`**Judge:** ${s.judge?.verdict ?? 'not yet'}${s.judge?.reason ? `. ${s.judge.reason}` : ''}`, '');
    if (s.hand) out.push(`**Hand:** ${s.hand}`, '');
    out.push('**Reply:**', '', ...r.answer.split('\n').map((l) => `> ${l}`), '');
    if (r.files.length) out.push(`**Files:** ${r.files.map((f) => f.path).join(', ')} (in ${s.run}/files/)`, '');
  }
  return `${out.join('\n')}\n`;
}

/** A drive's path, with either slash: a long run's notes write one with forward slashes. */
export const WINDOWS_PATH = /(?<![A-Za-z])[A-Za-z]:[\\/]/;

/**
 * Write a text into the repository, after the same check the histories pass:
 * no trace of the sandbox login's email address or names, and no machine path.
 * A failing text is never written, and the reason never quotes what was found.
 */
export function saveToRepo(rel, text, { root = REPO, identity = loginIdentity() } = {}) {
  const found = [];
  for (const id of identity) if (find(text, id) >= 0) found.push(`the sandbox login's own ${id.includes('@') ? 'email address' : 'name'}`);
  if (WINDOWS_PATH.test(text)) found.push('a Windows path');
  if (found.length) throw new Stop(`${rel} was not written: it holds ${found.join(' and ')}`);
  const to = join(root, rel);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, text.replace(/\r\n/g, '\n'));
  return to;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  ownNodeOnly();
  const [batch, ...flags] = process.argv.slice(2);
  const ctx = sandboxContext();
  const dir = join(ctx.runs, batch ?? '');
  try {
    if (!batch || !existsSync(dir)) throw new Stop('usage: node score/score.mjs <batch> [--no-judge] [--save]');
    const { scores, stopped } = scoreBatch(dir, { ctx, judge: !flags.includes('--no-judge') });
    const done = scores.filter((s) => s.status === 'done');
    const by = (k) => done.filter((s) => s.by === k).length;
    console.log(
      `${batch}: ${done.length} of ${scores.length} runs finished. ` +
        `${by('checks')} scored by their checks, ${by('judge')} by the judge, ${by('hand')} by hand, ` +
        `${done.filter((s) => !s.verdict).length} waiting for the judge. Scores: ${join(dir, 'scores.json')}`,
    );
    if (stopped) console.log(`\n${stopped}`);
    if (flags.includes('--save')) {
      const to = saveToRepo(`results/${batch}/scores.json`, JSON.stringify({ batch, runs: scores }, null, 2) + '\n');
      console.log(`Saved ${to}`);
    }
    process.exitCode = stopped ? 1 : 0;
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`score: ${e.message}`);
    process.exitCode = 1;
  }
}
