// Part 9: the numbers of design.md and their charts, computed from the
// repository's results/ alone, so anyone can compute them again: areas 1–8
// from each batch's scores and conditions, and area 9's long sessions from
// their scores, their hand read and the record of every step.
//
//   node score/results.mjs           print the numbers
//   node score/results.mjs --save    first publish what they need from ../runs (each batch's conditions,
//                                    the brain builds' tokens, and area 9's scores, hand read and steps),
//                                    then write results/numbers.json and the charts in results/charts/
//
// The scores were made blind, and they stay as the scorer saved them. Which run
// had which condition is published beside them, as results/<batch>/conditions.json,
// only once every verdict was final. Area 9 cannot be scored blind: its scores
// stay as score/long.mjs saved them, beside the hand read that overrides them.
// Part 10's C again with exposurie's rebuilt read is published the same way,
// and its numbers sit beside 1.2.0's under rebuilt_read; 1.2.0's stay as they are.
// C again with exposurie 1.3.1, whose pointer also fires before work, sits
// beside both under pointer_for_work. Part 13, many agents, one job, is
// published from its scores and their hand read, under many_agents.
// Every result has a chart: at-a-glance, right-answers, tokens, many-agents,
// its-yours (part 12, drawn from results/its-yours/), long-sessions and versions.
// check/results.mjs holds results/ to what this writes.
//
// Run it with the sandbox's own Node.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REBUILT_BATCH, STRATEGIES } from '../runner/long.mjs';
import { Stop } from '../runner/run.mjs';
import { LONG_GROUPS } from './checks.mjs';
import { saveToRepo } from './score.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** The areas, named as design.md names them. */
export const AREAS = {
  1: 'Recall', 2: 'Across projects', 3: 'Changed decisions', 4: 'Never discussed',
  5: 'Your way', 6: 'Real work', 7: 'Chat to agent', 8: 'No past needed',
};
/** Areas 1–7 need the user's past, and the numbers pool over them: questions answered in a reply, and work tasks. */
const MEMORY = [1, 2, 3, 4, 5, 6, 7];
const QUESTIONS = [1, 2, 3, 4, 5];
const WORK = [6, 7];
/** Area 8 needs no past: it measures what exposurie costs on other work, and has no D. */
const OTHER = 8;
export const CONDITIONS = ['A', 'B', 'C', 'D'];
const NAMES = { A: 'fresh session', B: 'whole history', C: 'exposurie', D: 'perfect memory' };
export const USERS = ['developer', 'delegator'];
/** Every batch in results/. The numbers come from full and the stability check; the pilot stays a pilot. */
export const BATCHES = ['pilot', 'full', 'stability-1', 'stability-2'];
const STABILITY = ['stability-1', 'stability-2'];
const TOKEN_KINDS = ['all_input', 'input', 'cache_write', 'cache_read', 'output'];
/** Area 9's batch: each long task filled once in condition C, then carried on three ways from its fork. */
export const LONG_BATCH = 'area-9';
const STRATEGY_NAMES = { keep: 'keep going', compact: '/compact', sync: 'sync + fresh' };
/**
 * Part 10: C again with exposurie's rebuilt read, on the same brains. The full
 * run's C cells once, then area 3 under C twice more, and area 9's sync + fresh
 * again in REBUILT_BATCH. A, B and D have no exposurie, so their runs stand.
 */
export const REBUILT_BATCHES = ['full-2', 'stability-3', 'stability-4'];
/**
 * What the README and the charts call part 10's exposurie. Its runs recorded
 * 1.2.0+b6855ee, the package's version and the commit, because 1.3.0 was not on
 * npm yet; npm has served the same search and read as 1.3.0 since 2026-11-04,
 * byte for byte, so it is shown by its release. The records keep what was recorded.
 */
export const REBUILT_NAME = '1.3.0\'s read';
const REBUILT_STABILITY = ['stability-3', 'stability-4'];
/**
 * C again with exposurie 1.3.1, whose pointer also fires before work in the
 * user's projects, on the same brains, each run's copy made 3 days old: the
 * full run's C cells once. A, B and D stand.
 */
export const V131_BATCHES = ['full-3'];
/**
 * Part 13, many agents, one job: round 1's three agents in C on exposurie
 * 1.3.1, merged and synced, then three agents in each of A, C and D. Each is
 * published with its scores, the hand read that overrides them, the hand tests
 * the hand read rests on, and round 1's repairs by hand.
 */
export const TEAM_TASKS = ['team-1'];

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/** The middle value, or the mean of the middle two. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round = (x, places = 0) => Math.round(x * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------- inputs

/**
 * What the numbers need from ../runs, published into results/ once every
 * verdict is final: each batch's conditions, from the runner's batch.json, and
 * each brain build's tokens, from its build.json.
 */
function publishInputs(runs) {
  for (const batch of BATCHES) {
    const cells = readJson(join(runs, batch, 'batch.json')).cells;
    const conditions = Object.fromEntries(cells.map((c) => [c.run, c.condition]).sort(([a], [b]) => a.localeCompare(b)));
    console.log(`Saved ${saveToRepo(`results/${batch}/conditions.json`, json({ batch, conditions }))}`);
  }
  // A rebuilt or 1.3.1 batch's conditions also name the exposurie its runs recorded, which must be one.
  for (const batch of [...REBUILT_BATCHES, ...V131_BATCHES]) {
    const cells = readJson(join(runs, batch, 'batch.json')).cells;
    const labels = [...new Set(cells.map((c) => readJson(join(runs, batch, c.run, 'run.json')).versions?.exposurie))];
    if (labels.length !== 1 || !labels[0]) throw new Stop(`${batch}'s runs recorded ${labels.length} exposurie versions`);
    const conditions = Object.fromEntries(cells.map((c) => [c.run, c.condition]).sort(([a], [b]) => a.localeCompare(b)));
    console.log(`Saved ${saveToRepo(`results/${batch}/conditions.json`, json({ batch, exposurie: labels[0], conditions }))}`);
  }
  const builds = {};
  for (const user of USERS) {
    const b = readJson(join(runs, `build-${user}`, 'build.json'));
    builds[user] = {
      sessions: b.sessions.length,
      turns: sum(b.sessions.map((s) => s.turns)),
      duration_ms: sum(b.sessions.map((s) => s.duration_ms)),
      tokens: Object.fromEntries(TOKEN_KINDS.map((k) => [k, b.tokens[k]])),
      conversations_filed: b.brain.transcripts_read,
      pages: b.brain.pages,
    };
  }
  const note = 'Each brain build, as its own record gives it: every session of the build, every model, every token counted.';
  console.log(`Saved ${saveToRepo('results/builds.json', json({ note, builds }))}`);
  publishLong(runs, LONG_BATCH);
  publishLong(runs, REBUILT_BATCH);
  for (const id of TEAM_TASKS) publishTeam(runs, id);
}

const tokenKinds = (t) => Object.fromEntries(TOKEN_KINDS.map((k) => [k, t?.[k] ?? 0]));
/** Whether an attempt is the one a step keeps, as the runner decides it: the step's last, finished or kept by hand. */
const countsIn = (steps) => steps.map((r) => r === steps.filter((x) => x.n === r.n).at(-1) && (r.status === 'done' || !!r.accepted));

/** Why an attempt does not count, in fixed words: the runner's own reason can name the run's machine paths. */
function whyNot(r) {
  if (r.status === 'not-run') return /^usage limit/.test(r.reason ?? '') ? 'a usage limit stopped it' : 'it ended without a result';
  return r.status === 'thrown-out' ? 'it broke a check' : 'it ran again';
}

/**
 * One attempt at a step of a long task, as the published record keeps it: its
 * numbers, and what a person decided about it. Its notes and its reason name
 * the run's machine paths, so neither is kept, and nor are its session or the
 * plan's meters.
 */
function publicAttempt(r, counts) {
  return {
    step: r.step,
    kind: r.kind,
    status: r.status,
    counts,
    ...(counts ? {} : { why_not: whyNot(r) }),
    ...(r.accepted ? { kept_by_hand: r.accepted } : {}),
    tokens: tokenKinds(r.tokens),
    turns: r.turns ?? null,
    duration_ms: r.duration_ms ?? null,
    tool_calls: r.tool_calls ?? null,
    denied: r.denied ?? null,
    looked: r.looked ?? null,
    reads: r.reads ?? null,
    context_after: r.context_after ?? null,
    ...(r.compactions?.length ? {
      compactions: r.compactions.map((c) => ({ trigger: c.meta?.trigger ?? null, pre_tokens: c.meta?.pre_tokens ?? null, post_tokens: c.meta?.post_tokens ?? null })),
    } : {}),
    files_given: r.files_given?.length ?? 0,
    cost_usd_estimate: r.cost_usd_estimate ?? null,
  };
}

/**
 * A long task's record (long.json) without what is not public: every attempt at
 * every step, and each sync session. A run of some strategies again, from
 * another run's fork, keeps those phases alone and names the run it came from.
 */
function publicRecord(L) {
  const phases = L.only ?? ['fill', ...STRATEGIES];
  const all = [...phases.flatMap((p) => L[p].steps), ...L.sync.sync].filter((r) => r.versions);
  const pinned = [...new Set(all.map(({ versions: { models_used, ...v } }) => JSON.stringify(v)))];
  if (pinned.length !== 1) throw new Stop(`${L.run}'s steps ran under ${pinned.length} sets of versions`);
  const syncs = countsIn(L.sync.sync.map((r) => ({ ...r, n: 0 })));
  return {
    run: L.run,
    task: L.task,
    user: L.user,
    ...(L.from ? { from: L.from } : {}),
    fork_at: L.fork_at,
    versions: { ...JSON.parse(pinned[0]), models_used: [...new Set(all.flatMap((r) => r.versions.models_used ?? []))].sort() },
    fork: { after: L.fill.forked.after, core: L.fill.forked.core, more: L.fill.forked.more, context: L.fill.forked.context },
    phases: Object.fromEntries(phases.map((p) => {
      const counts = countsIn(L[p].steps);
      return [p, L[p].steps.map((r, i) => publicAttempt(r, counts[i]))];
    })),
    sync_sessions: L.sync.sync.map((r, i) => ({
      status: r.status,
      counts: syncs[i],
      ...(syncs[i] ? {} : { why_not: whyNot(r) }),
      tokens: tokenKinds(r.tokens),
      turns: r.turns ?? null,
      duration_ms: r.duration_ms ?? null,
      tool_calls: r.tool_calls ?? null,
      denied: r.denied ?? null,
      exposurie_commands: r.exposurie_commands ?? [],
      brain_after: r.brain_after ? { filed: r.brain_after.filed, transcripts_read: r.brain_after.transcripts_read, newly_read: r.brain_after.newly_read, pages: r.brain_after.pages } : null,
      cost_usd_estimate: r.cost_usd_estimate ?? null,
    })),
  };
}

/**
 * A batch of area 9's runs, published from the runner's folder once every one
 * is read by hand: each long task's scores as score/long.mjs saved them, the
 * hand read that overrides them, and the public part of its record.
 */
function publishLong(runs, batch) {
  const cells = readJson(join(runs, batch, 'batch.json')).cells;
  const dir = (c) => join(runs, batch, c.run);
  const scores = cells.map((c) => readJson(join(dir(c), 'scores.json')));
  const hands = cells.map((c) => ({ run: c.run, ...readJson(join(dir(c), 'hand.json')) }));
  const steps = cells.map((c) => publicRecord(readJson(join(dir(c), 'long.json'))));
  const note = 'Every attempt at every step of each long task, as the runner recorded it, with its own tokens. ' +
    'An attempt counts when it is its step\'s last and it finished, or was kept by hand. A strategy\'s tokens ' +
    'after the fork add up its counted attempts, and the sync strategy\'s its sync session too. Left out: each ' +
    'attempt\'s notes and reason, which name the run\'s machine paths, its session, and the plan\'s meters.' +
    (batch === LONG_BATCH ? '' : ' Here only sync + fresh ran, again, from the fork of the run each names under from, ' +
      'against the brain that run\'s sync wrote. Its sync session is that run\'s, carried over.');
  console.log(`Saved ${saveToRepo(`results/${batch}/scores.json`, json({ batch, runs: scores }))}`);
  console.log(`Saved ${saveToRepo(`results/${batch}/hand.json`, json({ batch, runs: hands }))}`);
  console.log(`Saved ${saveToRepo(`results/${batch}/steps.json`, json({ batch, note, runs: steps }))}`);
}

/**
 * A team task of part 13, published from the runner's folder once it is read
 * by hand: its scores as score/team.mjs saved them, the hand read that
 * overrides them, the hand tests the hand read rests on, round 1's repairs by
 * hand with the run's machine paths taken out of their file names, and which
 * condition each run of round 2 had, with the one exposurie everything recorded.
 */
function publishTeam(runs, id) {
  const dir = join(runs, id);
  const scores = readJson(join(dir, 'scores.json'));
  const hand = readJson(join(dir, 'hand.json'));
  if (scores.task !== id || hand.task !== id) throw new Stop(`${id}'s scores or hand read name another task`);
  if (hand.still_to_read?.length) throw new Stop(`${id}'s hand read is not finished: ${hand.still_to_read.join('; ')}`);
  const T = readJson(join(dir, 'team.json'));
  const b = readJson(join(dir, 'batch.json'));
  const recorded = [
    ...Object.entries(T.round_1).filter(([k]) => /^\d+$/.test(k)).flatMap(([, a]) => a.steps.map((r) => r.versions?.exposurie)),
    ...T.sync.tries.map((r) => r.versions?.exposurie),
    ...b.cells.map((c) => readJson(join(dir, c.run, 'run.json')).versions?.exposurie),
  ];
  const labels = [...new Set(recorded)];
  if (labels.length !== 1 || !labels[0]) throw new Stop(`${id}'s steps and runs recorded ${labels.length} exposurie versions`);
  const conditions = Object.fromEntries(b.cells.map((c) => [c.run, c.condition]).sort(([x], [y]) => x.localeCompare(y)));
  const agents = Object.fromEntries(b.cells.map((c) => [c.run, c.agent]).sort(([x], [y]) => x.localeCompare(y)));
  console.log(`Saved ${saveToRepo(`results/${id}/conditions.json`, json({ task: id, exposurie: labels[0], conditions, agents }))}`);
  console.log(`Saved ${saveToRepo(`results/${id}/scores.json`, json(scores))}`);
  console.log(`Saved ${saveToRepo(`results/${id}/hand.json`, json(hand))}`);
  console.log(`Saved ${saveToRepo(`results/${id}/hand.test.js`, readFileSync(join(runs, `${id}-hand`, 'hand.test.js'), 'utf8'))}`);
  for (const r of scores.round_1.repairs) {
    const patch = readFileSync(join(dir, 'round-1', r.patch), 'utf8').replace(/\b([ab])\/[A-Za-z]:\/\S*?\/round-1\/merged(?:-as-merged)?\//g, '$1/');
    console.log(`Saved ${saveToRepo(`results/${id}/${r.patch}`, patch)}`);
  }
}

/** A batch's scored runs, each with its condition. */
function runsOf(root, batch) {
  const { conditions } = readJson(join(root, 'results', batch, 'conditions.json'));
  return readJson(join(root, 'results', batch, 'scores.json')).runs.map((s) => ({ ...s, condition: conditions[s.run] }));
}

// ---------------------------------------------------------------- numbers

/**
 * design.md's numbers for areas 1–8 over one set of runs: `full` holds one run
 * of each cell, with its condition, and `stab` holds area 3 under C once from
 * the full run and once from each stability batch, which `batches` names.
 */
function areaNumbers({ tasks, full, stab, batches }) {
  const pick = (c, areas, user = null) => full.filter((r) => r.condition === c && areas.includes(r.area) && (!user || r.user === user));
  const right = (rs) => rs.filter((r) => r.verdict === 'right').length;
  const tokens = (rs, k = 'all_input') => rs.map((r) => r.tokens[k]);
  const each = (f, cs = CONDITIONS) => Object.fromEntries(cs.map((c) => [c, f(c)]));

  const pooled = each((c) => right(pick(c, MEMORY)));
  const byUser = Object.fromEntries(USERS.map((u) => [u, { of: pick('A', MEMORY, u).length, ...each((c) => right(pick(c, MEMORY, u))) }]));
  const totals = each((c) => {
    const rs = pick(c, MEMORY);
    return { runs: rs.length, ...Object.fromEntries(TOKEN_KINDS.map((k) => [k, sum(tokens(rs, k))])) };
  });

  const c7 = pick('C', MEMORY);
  const other = (c) => pick(c, [OTHER]);
  const area3 = tasks.filter((t) => t.area === 3).map((t) => {
    const rs = stab.map((batch) => batch.find((r) => r.task === t.id));
    return { task: t.id, verdicts: rs.map((r) => r.verdict), all_input: rs.map((r) => r.tokens.all_input) };
  });
  const overhead = {
    per_run_median: each((c) => median(tokens(other(c))), ['A', 'B', 'C']),
    by_task: tasks.filter((t) => t.area === OTHER).map((t) => ({ task: t.id, ...each((c) => other(c).find((r) => r.task === t.id).tokens.all_input, ['A', 'B', 'C']) })),
    c_looked: other('C').filter((r) => r.looked).length,
  };

  return {
    right_answers: {
      of: pick('A', MEMORY).length,
      pooled,
      by_user: byUser,
      by_area: Object.keys(AREAS).map(Number).map((a) => ({
        area: a, name: AREAS[a], of: tasks.filter((t) => t.area === a).length,
        ...Object.fromEntries(CONDITIONS.filter((c) => pick(c, [a]).length).map((c) => [c, right(pick(c, [a]))])),
      })),
    },
    made_up_answers: { area: 4, of: pick('A', [4]).length, ...each((c) => pick(c, [4]).filter((r) => r.verdict === 'wrong').length) },
    looked_vs_found: {
      runs: c7.length,
      looked: c7.filter((r) => r.looked).length,
      right_when_looked: right(c7.filter((r) => r.looked)),
      right_when_not: right(c7.filter((r) => !r.looked)),
      reads_median: median(c7.filter((r) => r.looked).map((r) => r.reads)),
      misses: c7.filter((r) => r.verdict !== 'right').map((r) => ({ task: r.task, run: r.run, looked: r.looked })),
    },
    tokens_per_run: {
      median: each((c) => median(tokens(pick(c, MEMORY)))),
      median_questions: each((c) => median(tokens(pick(c, QUESTIONS)))),
      median_work: each((c) => median(tokens(pick(c, WORK)))),
      output_median: each((c) => median(tokens(pick(c, MEMORY), 'output'))),
    },
    tokens_per_right_answer: each((c) => (pooled[c] ? round(totals[c].all_input / pooled[c]) : null)),
    token_totals: totals,
    overhead: { area: OTHER, ...overhead, c_minus_a: overhead.per_run_median.C - overhead.per_run_median.A, b_minus_a: overhead.per_run_median.B - overhead.per_run_median.A },
    stability: { area: 3, condition: 'C', batches, runs: area3.length * stab.length, right: right(stab.flat()), changed: area3.filter((t) => new Set(t.verdicts).size > 1).length, by_task: area3 },
    by_task: tasks.map((t) => ({
      task: t.id, area: t.area, user: t.user,
      ...Object.fromEntries(CONDITIONS.flatMap((c) => full.filter((r) => r.task === t.id && r.condition === c).map((r) => [c, r.verdict]))),
    })),
  };
}

const scoredBy = (rs) => Object.fromEntries(['checks', 'judge', 'hand'].map((k) => [k, rs.filter((r) => r.by === k).length]));
const area3Of = (rs) => rs.filter((r) => r.condition === 'C' && r.area === 3);

/**
 * Every number in design.md's table, for areas 1–8, then area 9, then part 10's
 * C again with exposurie's rebuilt read beside 1.2.0's. Tokens are every input
 * token, cached or not (`all_input`), as design.md counts them; output is
 * counted beside them, and the cached/uncached split is in `token_totals`.
 */
export function computeNumbers(root = REPO) {
  const tasks = readJson(join(root, 'tasks', 'index.json')).tasks.filter((t) => AREAS[t.area]);
  const full = runsOf(root, 'full');
  const stability = STABILITY.map((b) => runsOf(root, b));
  const [againBatch] = REBUILT_BATCHES;
  const again = runsOf(root, againBatch);
  const againStability = REBUILT_STABILITY.map((b) => runsOf(root, b));
  const [v131Batch] = V131_BATCHES;
  const v131 = runsOf(root, v131Batch);
  return {
    note: 'Written by score/results.mjs from results/ alone. Areas 1–8, then area 9, the long sessions, under area_9; ' +
      'then C again with exposurie\'s rebuilt read, under rebuilt_read, and with exposurie 1.3.1, under pointer_for_work; ' +
      'then part 13, many agents, one job, under many_agents.',
    tokens: 'Every input token, cached or not (all_input), is the primary number. Output is counted beside it.',
    conditions: NAMES,
    runs: { full: full.length, stability: sum(stability.map((rs) => rs.length)), scored_by: scoredBy(full) },
    ...areaNumbers({ tasks, full, stab: [area3Of(full), ...stability], batches: ['full', ...STABILITY] }),
    area_9: longNumbers(root),
    rebuilt_read: {
      note: 'Part 10: condition C again, with exposurie\'s read rebuilt, on the same brains as 1.2.0\'s C. A, B and D have no ' +
        'exposurie, so their runs stand, and every number here sets C\'s new runs beside them. Area 9 is sync + fresh again.',
      exposurie: readJson(join(root, 'results', againBatch, 'conditions.json')).exposurie,
      runs: { [againBatch]: again.length, stability: sum(againStability.map((rs) => rs.length)), scored_by: scoredBy(again) },
      ...areaNumbers({
        tasks, full: [...full.filter((r) => r.condition !== 'C'), ...again], stab: [area3Of(again), ...againStability], batches: REBUILT_BATCHES,
      }),
      area_9: longNumbers(root, REBUILT_BATCH),
    },
    pointer_for_work: {
      note: 'Condition C again, with exposurie 1.3.1, whose pointer also fires before work in the user\'s projects, on the same ' +
        'brains as 1.2.0\'s C, each run\'s copy made 3 days old, as part 10\'s brains were. A, B and D stand. Area 3 under C ran once here.',
      exposurie: readJson(join(root, 'results', v131Batch, 'conditions.json')).exposurie,
      runs: { [v131Batch]: v131.length, scored_by: scoredBy(v131) },
      ...areaNumbers({ tasks, full: [...full.filter((r) => r.condition !== 'C'), ...v131], stab: [area3Of(v131)], batches: V131_BATCHES }),
    },
    many_agents: teamNumbers(root),
  };
}

/** Every check of a strategy with its final verdict: the hand read's where it gave one, else the script's. */
export function finalChecks(checks, hand = {}) {
  return Object.fromEntries(LONG_GROUPS.map((g) => [g, Object.fromEntries(Object.entries(checks[g]).map(([id, script]) => {
    const h = hand[g]?.[id];
    return [id, h ? { verdict: h.verdict, by: 'hand', script } : { verdict: script, by: 'script', script }];
  }))]));
}

/**
 * Area 9's numbers, from results/area-9/ alone. A check's verdict is the hand
 * read's where it gave one, else the script's. A strategy's tokens are those
 * after the fork, as score/long.mjs saved them: one attempt per step, with the
 * /compact call and the sync session included. Attempts that did not count,
 * such as one a usage limit stopped, ran again from the same point, so they
 * are counted apart. Costs are Claude Code's own estimates, beside the tokens.
 * A batch that ran sync + fresh again from another batch's forks (part 10) has
 * that strategy alone, and names the run each task came from.
 */
export function longNumbers(root = REPO, batch = LONG_BATCH) {
  const dir = join(root, 'results', batch);
  const [scores, hands, records] = ['scores', 'hand', 'steps'].map((f) => readJson(join(dir, `${f}.json`)).runs);
  const asks = new Map(readJson(join(root, 'tasks', 'index.json')).tasks.map((t) => [t.id, t.ask]));
  const cost = (xs) => round(sum(xs.map((x) => x.cost_usd_estimate ?? 0)), 2);
  const tasks = scores.map((s) => {
    const hand = hands.find((h) => h.run === s.run);
    const rec = records.find((r) => r.run === s.run);
    // The decisions the fork's code did not hold yet, by the hand read: they were said only in the conversation.
    const saidOnly = Object.keys(hand.fork_code).filter((k) => hand.fork_code[k] === false);
    const ran = STRATEGIES.filter((p) => s.strategies[p]);
    const strategies = Object.fromEntries(ran.map((p) => {
      const final = finalChecks(s.strategies[p].checks, hand.verdicts[p]);
      const ids = (g, v) => Object.keys(final[g]).filter((id) => final[g][id].verdict === v);
      const held = (g) => ({ held: ids(g, true).length, of: Object.keys(final[g]).length });
      const team = Object.keys(final.finished).filter((id) => id.startsWith('team-'));
      const read = LONG_GROUPS.flatMap((g) => Object.values(final[g])).filter((c) => c.by === 'hand');
      const counted = rec.phases[p].filter((a) => a.counts);
      const apart = rec.phases[p].filter((a) => !a.counts);
      const sync = p === 'sync' ? rec.sync_sessions.filter((x) => x.counts) : [];
      const after = counted.filter((a) => a.kind === 'after');
      return [p, {
        checks: Object.fromEntries(LONG_GROUPS.map((g) => [g, Object.fromEntries(Object.entries(final[g]).map(([id, c]) => [id, c.verdict]))])),
        finished: { ...held('finished'), missed: ids('finished', false) },
        kept: { ...held('kept'), missed: ids('kept', false) },
        kept_said_only: { held: saidOnly.filter((id) => final.kept[id]?.verdict === true).length, of: saidOnly.length },
        ...(team.length ? { team_conventions: { held: team.filter((id) => final.finished[id].verdict === true).length, of: team.length } } : {}),
        retried: { tried: ids('retried', true).length, of: Object.keys(final.retried).length, which: ids('retried', true) },
        by_hand: { checks: read.length, overturned: read.filter((c) => c.script !== null && c.script !== c.verdict).length },
        tokens: tokenKinds(s.strategies[p].tokens),
        ...(p === 'compact' ? { compact_call: sum(counted.filter((a) => a.kind === 'compact').map((a) => a.tokens.all_input)) } : {}),
        ...(p === 'sync' ? { sync_session: sum(sync.map((x) => x.tokens.all_input)) } : {}),
        context_end: s.strategies[p].context_end,
        looked: { steps: after.filter((a) => a.looked).length, of: after.length, reads: sum(after.map((a) => a.reads ?? 0)) },
        cost_usd_estimate: cost([...counted, ...sync]),
        apart: { attempts: apart.length, all_input: sum(apart.map((a) => a.tokens.all_input)), output: sum(apart.map((a) => a.tokens.output)), cost_usd_estimate: cost(apart) },
      }];
    }));
    const t = (p) => strategies[p].tokens.all_input;
    return {
      task: s.task,
      run: s.run,
      ask: asks.get(s.task),
      ...(rec.from ? { from: rec.from } : {
        fork: {
          after_step: Number(s.fork.after), core: s.fork.core, more: s.fork.more, context: s.fork.context,
          tokens: { all_input: s.fork.tokens.all_input, output: s.fork.tokens.output },
          cost_usd_estimate: cost(rec.phases.fill.filter((a) => a.counts)),
        },
      }),
      said_only_in_conversation: saidOnly,
      strategies,
      ...(ran.length === STRATEGIES.length ? { keep_to: { compact: round(t('keep') / t('compact'), 1), sync: round(t('keep') / t('sync'), 1) } } : {}),
    };
  });
  const ran = STRATEGIES.filter((p) => tasks.every((x) => x.strategies[p]));
  const pooled = Object.fromEntries(ran.map((p) => {
    const xs = tasks.map((x) => x.strategies[p]);
    const add = (k, n = 'held') => ({ [n]: sum(xs.map((x) => x[k][n])), of: sum(xs.map((x) => x[k].of)) });
    return [p, {
      finished: add('finished'), kept: add('kept'), kept_said_only: add('kept_said_only'), retried: add('retried', 'tried'),
      all_input: sum(xs.map((x) => x.tokens.all_input)), output: sum(xs.map((x) => x.tokens.output)),
    }];
  }));
  return {
    note: batch === LONG_BATCH
      ? 'Two long tasks, each filled live in condition C to the first step boundary past 500,000 tokens, then carried on three ways from that fork. ' +
        'Not blind: every strategy was read by hand, and the hand read overrides the scripts.'
      : 'sync + fresh again in each long task, with exposurie\'s rebuilt read: the same fork, the same sync session and the very brain it wrote, ' +
        'and a new fresh session. Not blind: it was read by hand, and the hand read overrides the scripts.',
    strategies: Object.fromEntries(ran.map((p) => [p, STRATEGY_NAMES[p]])),
    tasks,
    pooled,
  };
}

// ---------------------------------------------------------------- charts
// Every chart keeps to the look in CLAUDE.md: white, the logo's black, its
// orange for exposurie (C) and greys for the other conditions, Georgia titles
// and Calibri text, and no grid lines or decoration.

/**
 * Part 13's numbers, from results/<task>/ alone. A decision kept, the three
 * agreeing, a decision filed and a check of the user's way are the hand read's
 * where it gave one, else the scorer's, and how many the hand read overturned
 * is counted beside them. Tokens are every input token, cached or not, and
 * costs are Claude Code's own estimates, beside them. The plan meter is the
 * seven-day reading after the first and the last thing that ran.
 */
export function teamNumbers(root = REPO, id = TEAM_TASKS[0]) {
  const s = readJson(join(root, 'results', id, 'scores.json'));
  const h = readJson(join(root, 'results', id, 'hand.json'));
  const { exposurie } = readJson(join(root, 'results', id, 'conditions.json'));
  const ids = Object.keys(s.sync.filed);
  const held = (o) => Object.values(o).filter(Boolean).length;
  const conditions = {};
  for (const [c, v] of Object.entries(s.conditions)) {
    const byScript = Object.fromEntries(ids.map((k) => [k, v.decisions[k].merged]));
    const kept = Object.fromEntries(ids.map((k) => [k, h.decisions?.[c]?.[k]?.kept ?? byScript[k]]));
    const way = {};
    for (const r of v.runs) {
      for (const [check, w] of Object.entries(r.way)) {
        way[check] ??= { held: 0, of: 0 };
        way[check].of += 1;
        if (h.way?.[r.run]?.[check]?.holds ?? w.holds) way[check].held += 1;
      }
    }
    const hidden = Object.values(v.tests.hidden);
    conditions[c] = {
      kept: { held: held(kept), of: ids.length, by_script: held(byScript), overturned_by_hand: ids.filter((k) => kept[k] !== byScript[k]).length },
      decisions: kept,
      agreed: h.agreed?.[c]?.agreed ?? v.agreed,
      looked: { runs: v.looked, of: v.runs.length },
      way,
      tests: { hidden: { passed: hidden.filter(Boolean).length, of: hidden.length }, own: { passed: v.tests.own.passed, of: v.tests.own.total } },
      conflicts: v.merge.conflicts.length,
      tokens: tokenKinds(v.tokens),
      cost_usd_estimate: round(v.cost_usd_estimate, 2),
    };
  }
  const r1 = s.round_1;
  const filed = Object.fromEntries(ids.map((k) => [k, h.filed?.[k] ?? s.sync.filed[k].filed]));
  const meter = s.plan_meter.map((m) => m.seven_day).filter((x) => typeof x === 'number');
  const cost = r1.cost_usd_estimate + s.sync.cost_usd_estimate + sum(Object.values(s.conditions).map((v) => v.cost_usd_estimate));
  return {
    note: 'Part 13: one job split across three agents. Round 1 ran once, in C, and was merged, tested and synced; then three ' +
      'agents in each of A, C and D needed decisions told only to round 1. A verdict is the hand read\'s where it gave one, else the scorer\'s.',
    task: id,
    exposurie,
    decisions: ids,
    round_1: {
      steps: r1.steps,
      tokens: tokenKinds(r1.tokens),
      cost_usd_estimate: round(r1.cost_usd_estimate, 2),
      looked: r1.looked,
      conflicts: r1.merge.conflicts,
      repaired_by_hand: r1.repairs.length,
      gate: {
        passed: r1.gate.passed,
        own: { passed: r1.gate.own.passed, of: r1.gate.own.total },
        hidden: { passed: Object.values(r1.gate.hidden).filter(Boolean).length, of: Object.keys(r1.gate.hidden).length },
      },
      decisions_in_code: Object.values(r1.leaks).filter((l) => l.leaked).length,
    },
    sync: { tokens: tokenKinds(s.sync.tokens), cost_usd_estimate: round(s.sync.cost_usd_estimate, 2), pages: s.sync.pages, filed: { held: held(filed), of: ids.length } },
    conditions,
    plan_meter: { seven_day_first: meter[0] ?? null, seven_day_last: meter.at(-1) ?? null },
    cost_usd_estimate: round(cost, 2),
    scorer_faults_found_by_hand: h.scorer_faults?.length ?? 0,
  };
}

const LOOK = {
  ink: '#141414', body: '#2B2B2B', grey: ['#474747', '#6B6B6B', '#8C8C8C'], rule: ['#E3E3E3', '#C9C9C9'],
  panel: '#F5F5F4', white: '#FFFFFF', orange: '#E37D4E', tint: '#FCF0E9',
};
const FONTS = { title: 'Georgia, serif', body: 'Calibri, Carlito, Arial, sans-serif', code: 'Consolas, Menlo, monospace' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const barColour = (c) => (c === 'C' ? LOOK.orange : LOOK.grey[2]);

/** A line of text. `s` is a string, or a list of strings and `{ code }` parts, which are set in Consolas. */
function text(x, y, s, { size = 15, colour = LOOK.body, anchor = 'start', bold = false, font = FONTS.body } = {}) {
  const a = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
  const body = [s].flat().map((p) => (typeof p === 'object' ? `<tspan font-family="${FONTS.code}">${esc(p.code)}</tspan>` : esc(p))).join('');
  return `<text x="${round(x, 1)}" y="${y}" font-family="${font}" font-size="${size}" fill="${colour}"${a}${bold ? ' font-weight="bold"' : ''}>${body}</text>`;
}
const rect = (x, y, w, h, colour) => `<rect x="${x}" y="${y}" width="${round(w, 1)}" height="${h}" fill="${colour}"/>`;
const rule = (x1, x2, y) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${LOOK.rule[0]}" stroke-width="1"/>`;

function svg(width, height, label, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`,
    `<title>${esc(label)}</title>`,
    rect(0, 0, width, height, LOOK.white),
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

/**
 * Right answers by area: one dot per task, filled when its answer was right.
 * C is exposurie 1.3.1, the version on npm, beside the same runs of A, B and
 * D, as pointer_for_work counts them. The versions of C before it are in the
 * README's history, not here.
 */
function rightAnswersChart(N) {
  const W = 840;
  const H = 578;
  const V = N.pointer_for_work;
  const cols = CONDITIONS;
  const col = { A: 410, B: 525, C: 640, D: 755 };
  const sub = { ...NAMES, C: `exposurie ${V.exposurie}` };
  const totals = V.right_answers.pooled;
  const rowY = (i) => 184 + i * 34;
  const out = [
    text(40, 46, 'Right answers, by area', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'One run per task and condition. Each dot is one task, filled when its answer was right.', { colour: LOOK.grey[1] }),
    text(40, 92, `C is exposurie ${V.exposurie}, the version on npm. A, B and D have no exposurie; their runs stand.`, { colour: LOOK.grey[1] }),
  ];
  const y8 = rowY(MEMORY.length) + 64;
  out.push(rect(col.C - 60, 112, 120, y8 + 24 - 112, LOOK.tint));
  for (const c of cols) {
    out.push(text(col[c], 138, c, { font: FONTS.title, size: 20, colour: LOOK.ink, anchor: 'middle' }));
    out.push(text(col[c], 158, sub[c], { size: 14, colour: LOOK.grey[1], anchor: 'middle' }));
  }
  const dots = (c, cy, verdicts) => verdicts.forEach((v, j) => {
    const cx = col[c] + (j - (verdicts.length - 1) / 2) * 20;
    out.push(v === 'right'
      ? `<circle cx="${cx}" cy="${cy}" r="7" fill="${c === 'C' ? LOOK.orange : LOOK.grey[1]}"/>`
      : `<circle cx="${cx}" cy="${cy}" r="6.25" fill="${LOOK.white}" stroke="${LOOK.rule[1]}" stroke-width="1.5"/>`);
  });
  const row = (area, y, conditions) => {
    out.push(text(40, y + 5, area, { size: 15, colour: LOOK.grey[2] }));
    out.push(text(64, y + 5, AREAS[area], { size: 16 }));
    const tasks = V.by_task.filter((t) => t.area === area);
    for (const c of conditions) dots(c, y, tasks.map((t) => t[c]));
  };
  MEMORY.forEach((a, i) => row(a, rowY(i), cols));
  const ruleY = rowY(MEMORY.length) - 14;
  out.push(rule(40, W - 40, ruleY));
  out.push(text(40, ruleY + 38, `Areas 1–7, of ${V.right_answers.of}`, { size: 16, colour: LOOK.ink, bold: true }));
  for (const c of cols) out.push(text(col[c], ruleY + 39, totals[c], { size: 22, colour: LOOK.ink, anchor: 'middle', bold: true }));
  row(OTHER, y8, ['A', 'B', 'C']);
  out.push(text(col.D, y8 + 5, 'not run', { size: 14, colour: LOOK.grey[2], anchor: 'middle' }));
  out.push(text(40, H - 20, 'Area 8 needs no past, so it has no D and stays out of the totals.', { size: 14, colour: LOOK.grey[1] }));
  return svg(W, H, 'Right answers, by area and condition', out);
}

/** Horizontal bars on one scale, labelled with their conditions (or a name of their own) and values. */
function bars(out, { top, scale, rows, x0 = 200, len = 470 }) {
  rows.forEach(({ c, name = NAMES[c], value, extra }, i) => {
    const y = top + i * 34;
    out.push(text(40, y + 16, c, { size: 15, colour: LOOK.ink, bold: true }));
    out.push(text(60, y + 16, name, { size: 15 }));
    const w = Math.max(2, (value / scale) * len);
    out.push(rect(x0, y, w, 22, barColour(c)));
    out.push(text(x0 + w + 8, y + 16, `${fmt(value)}${extra ? `  ·  ${extra}` : ''}`, { size: 15, colour: c === 'C' ? LOOK.ink : LOOK.body, bold: c === 'C' }));
  });
  return top + rows.length * 34;
}

/** Tokens per run and per right answer in areas 1–7, and per run in area 8, on one scale, with C as exposurie 1.3.1 beside the same A, B and D. */
function tokensChart(N) {
  const W = 880;
  const V = N.pointer_for_work;
  const outputs = Object.values(V.tokens_per_run.output_median);
  const out = [
    text(40, 46, 'Tokens', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Every input token, cached or not, with all three panels on one scale.', { colour: LOOK.grey[1] }),
    text(40, 92, `Output is counted apart: a median of ${fmt(Math.min(...outputs))} to ${fmt(Math.max(...outputs))} tokens a run, alike in every condition.`, { colour: LOOK.grey[1] }),
    text(40, 112, `C is exposurie ${V.exposurie}, the version on npm, beside the same runs of A, B and D.`, { colour: LOOK.grey[1] }),
  ];
  const scale = Math.max(...Object.values(V.tokens_per_right_answer), ...Object.values(V.tokens_per_run.median), ...Object.values(V.overhead.per_run_median));
  const panel = (top, title, rows) => {
    out.push(text(40, top, title, { size: 16, colour: LOOK.ink, bold: true }));
    return bars(out, { top: top + 16, scale, rows });
  };
  const rows = (cs, f) => cs.map((c) => ({ c, ...(c === 'C' ? { name: `exposurie ${V.exposurie}` } : {}), ...f(c) }));
  let y = panel(156, 'Per run: the median of areas 1–7', rows(CONDITIONS, (c) => ({ value: V.tokens_per_run.median[c] })));
  y = panel(y + 42, 'Per right answer: all of a condition\'s tokens in areas 1–7 ÷ its right answers', rows(CONDITIONS, (c) => ({ value: V.tokens_per_right_answer[c], extra: `${V.right_answers.pooled[c]} right` })));
  y = panel(y + 42, 'Per run on work that needs no past: the median of area 8', rows(['A', 'B', 'C'], (c) => ({ value: V.overhead.per_run_median[c] })));
  const t = V.overhead.by_task.map((x) => x.C - x.A);
  out.push(text(40, y + 30, ['In area 8, C never ran ', { code: 'exposurie read' }, `, and used ${fmt(Math.min(...t))} to ${fmt(Math.max(...t))} tokens a run more than A.`], { size: 14, colour: LOOK.grey[1] }));
  return svg(W, y + 56, 'Tokens per run and per right answer, by condition', out);
}

/** A strategy's name, with /compact set as the command it is. */
const strategyLabel = (p) => (p === 'compact' ? [{ code: '/compact' }] : STRATEGY_NAMES[p]);

/**
 * Area 9: for each long task, what each strategy got right after the fork,
 * one dot per check in the task's own order, and then every strategy's input
 * tokens after the fork on one scale. sync + fresh is exposurie's strategy, so
 * it takes the orange.
 */
function longSessionsChart(N) {
  const W = 880;
  const A = N.area_9;
  /** A task's sync + fresh again with the rebuilt read (part 10), if it ran, shown by its release. */
  const again = (t) => N.rebuilt_read.area_9.tasks.find((x) => x.task === t.task)?.strategies.sync;
  const label = REBUILT_NAME;
  const out = [
    text(40, 46, 'Long sessions: three ways on from 500,000 tokens', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Two long tasks, each one session filled to 500,000 tokens, then carried on three ways from there.', { colour: LOOK.grey[1] }),
    text(40, 92, 'Each dot is one check after the fork, filled when it held; the hand read overrides the script.', { colour: LOOK.grey[1] }),
    text(40, 112, `All three ran on exposurie 1.2.0. Rows marked ${label} are sync + fresh's fresh session again.`, { colour: LOOK.grey[1] }),
  ];
  // Where each group's dots start, where its count stands, and its heading.
  const col = { finished: 240, kept: 540, retried: 730 };
  const count = { finished: 436, kept: 636 };
  const heads = [['finished', 'Finished', 'the work\'s checks'], ['kept', 'Kept', 'the decisions'], ['retried', 'Retried', 'a failed approach']];
  for (const [g, head, sub] of heads) {
    const x = g === 'retried' ? col[g] : col[g] - 7;
    out.push(text(x, 152, head, { size: 15, colour: LOOK.ink, bold: true }));
    out.push(text(x, 170, sub, { size: 13, colour: LOOK.grey[1] }));
  }
  const dot = (cx, cy, held, p) => out.push(held
    ? `<circle cx="${cx}" cy="${cy}" r="7" fill="${p === 'sync' ? LOOK.orange : LOOK.grey[1]}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="6.25" fill="${LOOK.white}" stroke="${LOOK.rule[1]}" stroke-width="1.5"/>`);
  /** Each strategy's row, then sync + fresh's again under it, indented: [strategy, label, numbers, x]. */
  const rowsOf = (t) => [
    ...STRATEGIES.map((p) => [p, strategyLabel(p), t.strategies[p], 0]),
    ...(again(t) ? [['sync', label, again(t), 20]] : []),
  ];
  let y = 210;
  for (const t of A.tasks) {
    out.push(text(40, y, t.task, { size: 16, colour: LOOK.ink, bold: true }));
    out.push(text(104, y, t.ask, { size: 15 }));
    out.push(text(40, y + 22, `Forked after step ${t.fork.after_step}, at ${fmt(t.fork.context)} tokens: ${t.fork.core} core steps and ${t.fork.more} more.`, { size: 14, colour: LOOK.grey[1] }));
    y += 56;
    for (const [p, label, v, indent] of rowsOf(t)) {
      if (p === 'sync' && !indent) out.push(rect(30, y - 16, 820, again(t) ? 66 : 32, LOOK.tint));
      out.push(text(40 + indent, y + 5, label, { size: 15, colour: p === 'sync' ? LOOK.ink : LOOK.body }));
      for (const g of ['finished', 'kept']) {
        Object.values(v.checks[g]).forEach((held, j) => dot(col[g] + j * 20, y, held === true, p));
        out.push(text(count[g], y + 5, `${v[g].held} of ${v[g].of}`, { size: 14, colour: LOOK.ink }));
      }
      out.push(text(col.retried, y + 5, `${v.retried.tried} of ${v.retried.of}`, { size: 14, colour: LOOK.ink }));
      y += 34;
    }
    y += 26;
  }

  out.push(text(40, y, 'Input tokens after the fork, cached or not, on one scale', { size: 16, colour: LOOK.ink, bold: true }));
  y += 16;
  const scale = Math.max(...A.tasks.flatMap((t) => rowsOf(t).map(([, , v]) => v.tokens.all_input)));
  const x0 = 200;
  const len = 470;
  for (const t of A.tasks) {
    out.push(text(40, y + 22, t.task, { size: 15, colour: LOOK.ink, bold: true }));
    y += 34;
    for (const [p, label, v, indent] of rowsOf(t)) {
      out.push(text(60 + indent, y + 16, label, { size: 15 }));
      const w = Math.max(2, (v.tokens.all_input / scale) * len);
      out.push(rect(x0, y, w, 22, p === 'sync' ? LOOK.orange : LOOK.grey[2]));
      const extra = p === 'compact' ? [', the ', { code: '/compact' }, ` call's ${fmt(v.compact_call)} included`]
        : p === 'sync' ? [`, the sync session's ${fmt(v.sync_session)} included`] : [];
      out.push(text(x0 + w + 8, y + 16, [fmt(v.tokens.all_input), ...extra], { size: 15, colour: p === 'sync' ? LOOK.ink : LOOK.body, bold: p === 'sync' }));
      y += 34;
    }
  }
  const lost = A.tasks.find((t) => t.strategies.sync.kept_said_only.held < t.strategies.sync.kept_said_only.of);
  if (lost) {
    y += 22;
    out.push(text(40, y, `In ${lost.task}, the brain held every rule the fresh session lost, but the session searched for whole phrases,`, { size: 14, colour: LOOK.grey[1] }));
    out.push(text(40, y + 20, 'which exposurie 1.2.0\'s search matches as one substring. It found no page, and went on without them.', { size: 14, colour: LOOK.grey[1] }));
    y += 20;
    const found = again(lost);
    if (found) {
      const said = found.kept_said_only;
      const team = found.team_conventions;
      out.push(text(40, y + 30, `Run again with ${label}, a new fresh session's searches found the brain's pages.`, { size: 14, colour: LOOK.grey[1] }));
      out.push(text(40, y + 50, `It kept ${said.held} of the ${said.of} decisions said only in the conversation` +
        (team ? `, and ${team.held} of the team's ${team.of} conventions.` : '.'), { size: 14, colour: LOOK.grey[1] }));
      y += 50;
    }
  }
  return svg(W, y + 30, 'Long sessions: what each strategy kept after the fork, and its tokens', out);
}

/** A filled dot, orange for exposurie and grey otherwise, or an empty ring when it did not hold. */
const mark = (cx, cy, held, orange) => (held
  ? `<circle cx="${round(cx, 1)}" cy="${cy}" r="7" fill="${orange ? LOOK.orange : LOOK.grey[1]}"/>`
  : `<circle cx="${round(cx, 1)}" cy="${cy}" r="6.25" fill="${LOOK.white}" stroke="${LOOK.rule[1]}" stroke-width="1.5"/>`);

/** "1, 2 and 3", for a short list. */
const andList = (xs) => (xs.length < 2 ? `${xs[0] ?? ''}` : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** One value when both users' are the same, else both: "11", or "59 and 40". */
const pair = (xs) => (xs.every((x) => x === xs[0]) ? `${xs[0]}` : andList(xs));

/** Area 9's long task whose sync + fresh changed with part 10's read, beside what it kept with each. */
function longChanged(N) {
  const again = (t) => N.rebuilt_read.area_9.tasks.find((x) => x.task === t.task)?.strategies.sync;
  const t = N.area_9.tasks.find((x) => again(x) && (again(x).finished.held !== x.strategies.sync.finished.held || again(x).kept.held !== x.strategies.sync.kept.held));
  return t ? { t, before: t.strategies.sync, after: again(t), compact: t.strategies.compact, again } : { again };
}

/**
 * The results at a glance: one tile per finding, each the number exposurie got,
 * with what it stands beside. Every number is one the other charts draw, and
 * each tile's orange edge marks it as exposurie's.
 */
function glanceChart(N, Y) {
  const W = 880;
  const P = N.pointer_for_work;
  const M = N.many_agents;
  const pooled = P.right_answers.pooled;
  const med = P.tokens_per_run.median;
  const { t: long, after, compact } = longChanged(N);
  const level = long && after.finished.held === compact.finished.held && after.kept.held === compact.kept.held;
  const releases = [N, N.rebuilt_read, P].map((R) => R.right_answers.pooled.C);
  const tiles = [
    ['Right answers about the user\'s past', `${pooled.C} of ${P.right_answers.of}`, `A ${pooled.A} · B ${pooled.B} · D ${pooled.D}, areas 1–7, one run each`],
    ['Tokens a run, median of areas 1–7', fmt(med.C), `B ${fmt(med.B)} · A ${fmt(med.A)} · D ${fmt(med.D)}`],
    ['Extra tokens on work that needs no past', `+${fmt(P.overhead.c_minus_a)}`, 'a run more than A, as measured (area 8)'],
    ['Made-up answers, in any condition', `${sum(CONDITIONS.map((c) => P.made_up_answers[c]))}`, 'on questions the history never discussed'],
    ['Decisions carried from agent to agent', `${M.conditions.C.kept.held} of ${M.conditions.C.kept.of}`, `A ${M.conditions.A.kept.held} · D ${M.conditions.D.kept.held}, by hand (part 13)`],
    ['Checks of its own layer that held', `${Y.lines.filter((l) => l.pass).length} of ${Y.lines.length}`, 'for both users (part 12)'],
    ...(long ? [['A long session, after sync + fresh', `${after.finished.held} of ${after.finished.of} · ${after.kept.held} of ${after.kept.of}`,
      `${long.task} with ${REBUILT_NAME}; ${level ? 'level with /compact' : `/compact ${compact.finished.held} · ${compact.kept.held}`}`]] : []),
    ['Right answers across three releases', releases.join(' → '), `1.2.0, ${REBUILT_NAME} and ${P.exposurie}, of ${P.right_answers.of}`],
  ];
  const out = [
    text(40, 46, 'exposurie-bench at a glance', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, `Same tasks, model and tools in every condition. C is exposurie ${P.exposurie}, the version on npm.`, { colour: LOOK.grey[1] }),
    text(40, 92, 'A is a fresh session, B the whole history in context, D a perfect memory of what each task needs.', { colour: LOOK.grey[1] }),
  ];
  tiles.forEach(([label, value, beside], i) => {
    const x = 40 + (i % 2) * 410;
    const y = 124 + Math.floor(i / 2) * 138;
    out.push(rect(x, y, 390, 118, LOOK.panel), rect(x, y, 4, 118, LOOK.orange));
    out.push(text(x + 22, y + 32, label, { size: 15, colour: LOOK.ink, bold: true }));
    out.push(text(x + 22, y + 78, value, { size: 36, colour: LOOK.ink, bold: true }));
    out.push(text(x + 22, y + 104, beside, { size: 14, colour: LOOK.grey[1] }));
  });
  return svg(W, 124 + Math.ceil(tiles.length / 2) * 138 + 12, 'exposurie-bench at a glance: every result in one view', out);
}

/** Short names for part 13's six decisions, for its chart. Each one in full is in tasks/team/<task>.json. */
const TEAM_DECISION_NAMES = {
  K1: 'Highlights\' shape: text, note, createdAt',
  K2: 'Imported highlights get source: import',
  K3: 'A highlight is added only once',
  K4: 'Instapaper folders become folder: tags',
  K5: 'Omnivore: read 90% or more counts as read',
  K6: 'The summary email counts highlights',
};

/**
 * Part 13: one dot per decision round 1 was told and round 2 needed, filled
 * when round 2's merged work kept it, by hand, in each condition, and then
 * what else round 2 showed. C is exposurie, so it takes the orange.
 */
function manyAgentsChart(N, task) {
  const W = 880;
  const M = N.many_agents;
  const cols = ['A', 'C', 'D'];
  const col = { A: 540, C: 660, D: 780 };
  const sub = { A: 'no memory', C: `exposurie ${M.exposurie}`, D: 'perfect notes' };
  const told = Object.fromEntries(task.decisions.map((d) => [d.id, d]));
  const out = [
    text(40, 46, 'Many agents, one job', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, `Round 1: three agents built one feature with exposurie ${M.exposurie}, each in its own copy.`, { colour: LOOK.grey[1] }),
    text(40, 92, 'In chat, each was also told decisions for later work, and not to build them.', { colour: LOOK.grey[1] }),
    text(40, 112, 'Round 2: three new agents in each condition built the rest, blind, from one short ask each.', { colour: LOOK.grey[1] }),
    text(40, 132, 'Each dot is one decision, filled when round 2\'s merged work kept it, by hand.', { colour: LOOK.grey[1] }),
  ];
  const rowY = (i) => 252 + i * 46;
  const ruleY = rowY(M.decisions.length) - 12;
  const more = [
    ['The three agreed on the highlights\' shape', (v) => (v.agreed ? 'yes' : 'no')],
    ['Agents that opened the brain', (v, c) => (c === 'C' ? `${v.looked.runs} of ${v.looked.of}` : 'no brain')],
    ['Commit messages in the developer\'s style', (v) => `${v.way['commit-style'].held} of ${v.way['commit-style'].of}`],
    ['The repository\'s own tests after the merge', (v) => `${v.tests.own.passed} of ${v.tests.own.of}`],
    ['Input tokens in round 2', (v) => fmt(v.tokens.all_input)],
    ['Cost, in Claude Code\'s estimate', (v) => `$${v.cost_usd_estimate.toFixed(2)}`],
  ];
  const moreY = (i) => ruleY + 104 + i * 32;
  const end = moreY(more.length - 1) + 16;
  out.push(rect(col.C - 62, 152, 124, end - 152, LOOK.tint));
  for (const c of cols) {
    out.push(text(col[c], 182, c, { font: FONTS.title, size: 20, colour: LOOK.ink, anchor: 'middle' }));
    out.push(text(col[c], 202, sub[c], { size: 14, colour: LOOK.grey[1], anchor: 'middle' }));
  }
  M.decisions.forEach((k, i) => {
    const y = rowY(i);
    out.push(text(40, y + 5, k, { size: 15, colour: LOOK.grey[2] }));
    out.push(text(76, y + 5, TEAM_DECISION_NAMES[k] ?? k, { size: 16 }));
    out.push(text(76, y + 24, `told to agent ${told[k].told_to} of round 1; needed by ${andList(told[k].needed_by)} of round 2`, { size: 13, colour: LOOK.grey[1] }));
    for (const c of cols) out.push(mark(col[c], y, M.conditions[c].decisions[k] === true, c === 'C'));
  });
  out.push(rule(40, W - 40, ruleY));
  out.push(text(40, ruleY + 38, `Decisions kept, of ${M.decisions.length}`, { size: 16, colour: LOOK.ink, bold: true }));
  out.push(text(40, ruleY + 66, 'by the scorer, before the hand read', { size: 14, colour: LOOK.grey[1] }));
  for (const c of cols) {
    out.push(text(col[c], ruleY + 39, M.conditions[c].kept.held, { size: 22, colour: LOOK.ink, anchor: 'middle', bold: true }));
    out.push(text(col[c], ruleY + 66, M.conditions[c].kept.by_script, { size: 14, colour: LOOK.grey[1], anchor: 'middle' }));
  }
  more.forEach(([label, f], i) => {
    out.push(text(40, moreY(i), label, { size: 15 }));
    for (const c of cols) out.push(text(col[c], moreY(i), f(M.conditions[c], c), { size: 15, colour: c === 'C' ? LOOK.ink : LOOK.body, anchor: 'middle', bold: c === 'C' }));
  });
  let y = end + 36;
  const missed = M.decisions.filter((k) => !M.conditions.C.decisions[k] && M.conditions.D.decisions[k]);
  if (missed.length === 1 && missed[0] === 'K1') {
    out.push(text(40, y, 'C\'s one miss: its Instapaper agent read the page that holds the highlights\' shape, but the page', { size: 14, colour: LOOK.grey[1] }));
    out.push(text(40, y + 20, 'words it as a plan, and the agent left Instapaper\'s highlights to another. D\'s notes word it as a rule.', { size: 14, colour: LOOK.grey[1] }));
    y += 40;
  }
  if (M.round_1.repaired_by_hand) {
    out.push(text(40, y, 'Round 1\'s merge collided, and was repaired by hand before round 2 ran, with nothing of round 2 in it.', { size: 14, colour: LOOK.grey[1] }));
    y += 20;
  }
  return svg(W, y + 18, 'Many agents, one job: the decisions round 2 kept, by condition', out);
}

/**
 * Part 12: its six lines, each a script run for both users, with what each
 * found in short, from results/its-yours/ alone. Every line is exposurie's own,
 * so a line that held for a user takes the orange.
 */
function itsYoursChart(Y) {
  const W = 880;
  const col = Object.fromEntries(Y.users.map((u, i) => [u, 735 + i * 80]));
  const of = (l, f) => Y.users.map((u) => f(l.evidence[u]));
  const n = (x) => (Array.isArray(x) ? x.length : Number(x ?? 0));
  const none = (l, f) => of(l, (e) => n(f(e))).every((x) => x === 0);
  const found = {
    1: (l) => `${pair(of(l, (e) => e.files))} files, ${none(l, (e) => e.notUtf8) ? 'all UTF-8 text' : 'not all UTF-8 text'}; ` +
      `${pair(of(l, (e) => e.links))} links, ${none(l, (e) => e.dead) ? 'none dead' : 'some dead'}`,
    2: (l) => (none(l, (e) => e.leftAfterUninstall)
      ? `uninstall took back all ${pair(of(l, (e) => n(e.setupWrote)))} files setup wrote outside the brain` : 'uninstall left files behind') +
      (none(l, (e) => e.pagesChangedFromInstallToUninstall) ? '; no page changed' : '; a page changed'),
    3: (l) => `a trap in every Node process, npm's too, recorded ${none(l, (e) => e.attempts) ? 'no connection' : 'connections'} in ${pair(of(l, (e) => n(e.commands)))} commands`,
    4: (l) => `stdin closed and no credentials in reach; ${none(l, (e) => e.asks) ? 'no command asked for a login or key' : 'a command asked for a login'}`,
    5: (l) => {
      const agents = l.evidence[Y.users[0]].agents;
      const ok = of(l, (e) => e.agents.every((a) => a.pointer && a.once && a.same && a.usersLinesKept)).every(Boolean);
      return `${ok ? 'the same pointer, once,' : 'not the same pointer'} in ${agents.length} files: ${andList([...new Set(agents.map((a) => a.agent))])}`;
    },
    6: (l) => {
      const reached = Object.entries(l.evidence[Y.users[0]].reachedTheBatch);
      const missing = reached.filter(([, r]) => !r).map(([k]) => k);
      return `chats from ${andList(reached.map(([k]) => k))} ${missing.length ? `reached one sync, but not ${andList(missing)}` : 'reached one sync'}`;
    },
  };
  const out = [
    text(40, 46, `It's yours: six checks of exposurie ${Y.exposurie}'s own layer`, { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Each line is a script, run for both users in a throwaway home, with exposurie installed from npm', { colour: LOOK.grey[1] }),
    text(40, 92, 'and removed at the end. Each dot is one user, filled when the line held for them.', { colour: LOOK.grey[1] }),
    text(40, 112, 'No agent session ran: this checks what exposurie itself writes, reaches for and leaves behind.', { colour: LOOK.grey[1] }),
  ];
  for (const u of Y.users) out.push(text(col[u], 160, u, { size: 14, colour: LOOK.grey[1], anchor: 'middle' }));
  Y.lines.forEach((l, i) => {
    const y = 200 + i * 54;
    out.push(text(40, y + 5, l.id, { size: 15, colour: LOOK.grey[2] }));
    out.push(text(76, y + 5, l.name, { size: 16, colour: LOOK.ink }));
    out.push(text(76, y + 25, found[l.id]?.(l) ?? '', { size: 13, colour: LOOK.grey[1] }));
    for (const u of Y.users) out.push(mark(col[u], y, l.evidence[u].pass === true, true));
  });
  const ruleY = 200 + Y.lines.length * 54 - 10;
  out.push(rule(40, W - 40, ruleY));
  out.push(text(40, ruleY + 38, `Lines that held, of ${Y.lines.length}`, { size: 16, colour: LOOK.ink, bold: true }));
  for (const u of Y.users) out.push(text(col[u], ruleY + 39, Y.lines.filter((l) => l.evidence[u].pass).length, { size: 22, colour: LOOK.ink, anchor: 'middle', bold: true }));
  const left = pair(of(Y.lines[1], (e) => n(e.emptyFoldersLeft)));
  const notes = [
    ['Line 3 leaves out ', { code: 'update' }, ', the one command that downloads, by what it is for.'],
    `${left} empty folders that setup made stay after uninstall. The files that were in them are gone.`,
    'Not shown: an agent reading the pointer, or finding its way with exposurie gone. One machine, on Windows.',
  ];
  notes.forEach((s, i) => out.push(text(40, ruleY + 84 + i * 20, s, { size: 14, colour: LOOK.grey[1] })));
  return svg(W, ruleY + 84 + notes.length * 20 + 8, 'It\'s yours: the six lines, and whether each held for each user', out);
}

/**
 * C on the same tasks with each release of exposurie: 1.2.0, part 10's read
 * (1.3.0's) and 1.3.1, each beside the same A, B and D. One dot per task of
 * areas 1–7, then C's tokens on one scale, then the long task whose sync +
 * fresh changed, beside /compact. Every row but /compact is exposurie's.
 */
function versionsChart(N) {
  const W = 880;
  const P = N.pointer_for_work;
  const V = [
    { name: '1.2.0', what: 'the release first measured', R: N },
    { name: REBUILT_NAME, what: 'search: words in any order or form', R: N.rebuilt_read },
    { name: P.exposurie, what: 'the pointer also fires before work', R: P },
  ];
  const latest = (i) => i === V.length - 1;
  const out = [
    text(40, 46, 'How C got here: three releases on the same tasks', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Condition C ran again with each release of exposurie, on the same brains, with the same Claude', { colour: LOOK.grey[1] }),
    text(40, 92, 'Code, model, tools and scoring. A, B and D have no exposurie, so their runs stand.', { colour: LOOK.grey[1] }),
  ];
  const tasks = (R) => R.by_task.filter((t) => MEMORY.includes(t.area));
  const order = tasks(N).map((t) => t.task);
  const dotX = (j) => 310 + Math.floor(j / 3) * 56 + (j % 3) * 16;
  let y = 138;
  out.push(text(40, y, 'Right answers, areas 1–7: one dot per task, filled when right', { size: 16, colour: LOOK.ink, bold: true }));
  out.push(text(40, y + 30, 'area', { size: 12, colour: LOOK.grey[2] }));
  MEMORY.forEach((a, g) => out.push(text(dotX(g * 3 + 1), y + 30, a, { size: 12, colour: LOOK.grey[2], anchor: 'middle' })));
  y += 62;
  const missed = new Set();
  V.forEach((v, i) => {
    out.push(text(40, y + 5, v.name, { size: 15, colour: LOOK.ink, bold: latest(i) }));
    out.push(text(40, y + 23, v.what, { size: 13, colour: LOOK.grey[1] }));
    const verdict = Object.fromEntries(tasks(v.R).map((t) => [t.task, t.C]));
    order.forEach((id, j) => {
      if (verdict[id] !== 'right') missed.add(id);
      out.push(mark(dotX(j), y, verdict[id] === 'right', true));
    });
    out.push(text(dotX(order.length - 1) + 26, y + 5, `${v.R.right_answers.pooled.C} of ${v.R.right_answers.of}`, { size: 15, colour: LOOK.ink, bold: latest(i) }));
    y += 46;
  });
  if (missed.size) {
    out.push(text(40, y + 4, 'the tasks a release missed:', { size: 12, colour: LOOK.grey[1] }));
    for (const id of order.filter((x) => missed.has(x))) out.push(text(dotX(order.indexOf(id)), y + 4, id, { size: 12, colour: LOOK.grey[1], anchor: 'middle' }));
  }
  y += 56;
  const scale = Math.max(...V.flatMap((v) => [v.R.tokens_per_run.median.C, v.R.tokens_per_right_answer.C]));
  const tokenPanel = (title, f) => {
    out.push(text(40, y, title, { size: 16, colour: LOOK.ink, bold: true }));
    y += 16;
    V.forEach((v, i) => {
      out.push(text(40, y + 16, v.name, { size: 15, colour: LOOK.ink, bold: latest(i) }));
      const w = Math.max(2, (f(v.R) / scale) * 400);
      out.push(rect(310, y, w, 22, LOOK.orange));
      out.push(text(310 + w + 8, y + 16, fmt(f(v.R)), { size: 15, colour: LOOK.ink, bold: latest(i) }));
      y += 34;
    });
    y += 32;
  };
  tokenPanel('Tokens per run: the median of areas 1–7', (R) => R.tokens_per_run.median.C);
  tokenPanel('Tokens per right answer: all of C\'s tokens in areas 1–7 ÷ its right answers', (R) => R.tokens_per_right_answer.C);

  const { t: long, before, after, compact, again } = longChanged(N);
  if (long) {
    out.push(text(40, y, `${long.task}: what sync + fresh kept after the fork at ${fmt(long.fork.context)} tokens`, { size: 16, colour: LOOK.ink, bold: true }));
    out.push(text(303, y + 26, 'the work\'s checks', { size: 13, colour: LOOK.grey[1] }));
    out.push(text(583, y + 26, 'the decisions', { size: 13, colour: LOOK.grey[1] }));
    y += 60;
    const row = (label, v, orange, bold) => {
      out.push(text(40, y + 5, label, { size: 15, colour: LOOK.ink, bold }));
      if (!v) out.push(text(303, y + 5, 'not run', { size: 14, colour: LOOK.grey[2] }));
      else {
        Object.values(v.checks.finished).forEach((held, j) => out.push(mark(310 + j * 18, y, held === true, orange)));
        out.push(text(310 + Object.keys(v.checks.finished).length * 18 + 8, y + 5, `${v.finished.held} of ${v.finished.of}`, { size: 14, colour: LOOK.ink }));
        Object.values(v.checks.kept).forEach((held, j) => out.push(mark(590 + j * 18, y, held === true, orange)));
        out.push(text(590 + Object.keys(v.checks.kept).length * 18 + 8, y + 5, `${v.kept.held} of ${v.kept.of}`, { size: 14, colour: LOOK.ink }));
      }
      y += 34;
    };
    row('1.2.0', before, true, false);
    row(REBUILT_NAME, after, true, false);
    row(P.exposurie, null, true, true);
    row([{ code: '/compact' }, ', for reference'], compact, false, false);
    const other = N.area_9.tasks.find((x) => x !== long && again(x));
    if (other) {
      const [a, b] = [other.strategies.sync, again(other)];
      const same = a.finished.held === b.finished.held && a.kept.held === b.kept.held;
      out.push(text(40, y + 4, same ? `${other.task}'s sync + fresh finished ${a.finished.held} of ${a.finished.of} and kept ${a.kept.held} of ${a.kept.of} with both reads. 1.3.1 did not run area 9.`
        : `${other.task}'s sync + fresh: ${a.finished.held} and ${b.finished.held} of ${a.finished.of} finished, ${a.kept.held} and ${b.kept.held} of ${a.kept.of} kept.`, { size: 14, colour: LOOK.grey[1] }));
      y += 24;
    }
    y += 22;
  }
  const looked = V.map((v) => v.R.looked_vs_found);
  const extra = V.map((v) => v.R.overhead);
  out.push(text(40, y, ['C ran ', { code: 'exposurie read' }, ` in ${andList(looked.map((l) => l.looked))} of its ${looked[0].runs} runs, and was right in ${andList(looked.map((l) => l.right_when_looked))} of those.`], { size: 14, colour: LOOK.grey[1] }));
  out.push(text(40, y + 20, `On work that needs no past (area 8), C ${extra.every((o) => !o.c_looked) ? 'never opened the brain, in any release,' : 'sometimes opened the brain,'}`, { size: 14, colour: LOOK.grey[1] }));
  out.push(text(40, y + 40, `and used ${andList(extra.map((o) => fmt(o.c_minus_a)))} tokens a run more than A.`, { size: 14, colour: LOOK.grey[1] }));
  return svg(W, y + 66, 'How C got here: right answers and tokens for each release of exposurie', out);
}

/** Everything this writes into the repository, by path, from results/ and the task files alone. */
export function outputs(N = computeNumbers(), root = REPO) {
  const yours = join(root, 'results', 'its-yours', 'its-yours.json');
  const Y = existsSync(yours) ? readJson(yours) : null;
  const team = readJson(join(root, 'tasks', 'team', `${N.many_agents.task}.json`));
  return {
    'results/numbers.json': json(N),
    ...(Y ? { 'results/charts/at-a-glance.svg': glanceChart(N, Y) } : {}),
    'results/charts/right-answers.svg': rightAnswersChart(N),
    'results/charts/tokens.svg': tokensChart(N),
    'results/charts/many-agents.svg': manyAgentsChart(N, team),
    ...(Y ? { 'results/charts/its-yours.svg': itsYoursChart(Y) } : {}),
    'results/charts/long-sessions.svg': longSessionsChart(N),
    'results/charts/versions.svg': versionsChart(N),
  };
}

function printNumbers(N) {
  const list = (o) => Object.entries(o).map(([c, v]) => `${c} ${typeof v === 'number' ? fmt(v) : v}`).join(', ');
  const r = N.right_answers;
  const l = N.looked_vs_found;
  console.log(`Right answers, areas 1–7, of ${r.of}: ${list(r.pooled)}.`);
  console.log(`Tokens per run, median of areas 1–7: ${list(N.tokens_per_run.median)}.`);
  console.log(`Tokens per right answer: ${list(N.tokens_per_right_answer)}.`);
  console.log(`Area 8, median per run: ${list(N.overhead.per_run_median)}; C − A ${fmt(N.overhead.c_minus_a)}.`);
  console.log(`Made-up answers, area 4: ${list(Object.fromEntries(CONDITIONS.map((c) => [c, N.made_up_answers[c]])))}.`);
  console.log(`Looked vs found: C looked in ${l.looked} of ${l.runs}, right in ${l.right_when_looked} of those; right in ${l.right_when_not} of the ${l.runs - l.looked} that did not.`);
  console.log(`Stability: area 3 under C right in ${N.stability.right} of ${N.stability.runs}; tasks whose verdict changed: ${N.stability.changed}.`);
  const strategy = (name, v) => console.log(`  ${name.padEnd(13)} finished ${v.finished.held} of ${v.finished.of}, kept ${v.kept.held} of ${v.kept.of} ` +
    `(said only in the conversation ${v.kept_said_only.held} of ${v.kept_said_only.of}), retried ${v.retried.tried} of ${v.retried.of}; ` +
    `${fmt(v.tokens.all_input)} input tokens after the fork, about $${v.cost_usd_estimate.toFixed(2)}`);
  for (const t of N.area_9.tasks) {
    console.log(`Area 9, ${t.task}, forked after step ${t.fork.after_step} at ${fmt(t.fork.context)}:`);
    for (const p of STRATEGIES) strategy(STRATEGY_NAMES[p], t.strategies[p]);
  }

  const C = (o) => fmt(o.C);
  /** C again, beside the same A, B and D: part 10's rebuilt read, or 1.3.1. */
  const again = (R) => {
    const name = R === N.rebuilt_read ? `${REBUILT_NAME} (recorded as ${R.exposurie})` : `exposurie ${R.exposurie}`;
    console.log(`\nC again, with ${name}, beside the same A, B and D:`);
    console.log(`Right answers, areas 1–7, of ${R.right_answers.of}: C ${R.right_answers.pooled.C}.`);
    console.log(`Tokens per run, median of areas 1–7: C ${C(R.tokens_per_run.median)}; of a question ${C(R.tokens_per_run.median_questions)}, of a work task ${C(R.tokens_per_run.median_work)}.`);
    console.log(`Tokens per right answer: C ${C(R.tokens_per_right_answer)}.`);
    console.log(`Area 8, median per run: C ${C(R.overhead.per_run_median)}; C − A ${fmt(R.overhead.c_minus_a)}; C looked in ${R.overhead.c_looked} of 3.`);
    console.log(`Made-up answers, area 4: C ${R.made_up_answers.C}.`);
    const l2 = R.looked_vs_found;
    console.log(`Looked vs found: C looked in ${l2.looked} of ${l2.runs}, right in ${l2.right_when_looked} of those; right in ${l2.right_when_not} of the ${l2.runs - l2.looked} that did not.`);
    console.log(`Stability: area 3 under C right in ${R.stability.right} of ${R.stability.runs}; tasks whose verdict changed: ${R.stability.changed}.`);
  };
  const R = N.rebuilt_read;
  again(R);
  for (const t of R.area_9.tasks) {
    console.log(`Area 9, ${t.task}, again from ${t.from}'s fork:`);
    strategy(STRATEGY_NAMES.sync, t.strategies.sync);
  }
  again(N.pointer_for_work);

  const M = N.many_agents;
  console.log(`\nMany agents, one job (${M.task}, exposurie ${M.exposurie}):`);
  console.log(`Round 1: ${M.round_1.steps} steps, ${fmt(M.round_1.tokens.all_input)} input tokens, about $${M.round_1.cost_usd_estimate.toFixed(2)}; ` +
    `conflicts ${M.round_1.conflicts.length}, repaired by hand ${M.round_1.repaired_by_hand}; gate ${M.round_1.gate.passed ? 'passed' : 'failed'}.`);
  console.log(`Sync: filed ${M.sync.filed.held} of ${M.sync.filed.of} decisions, ${fmt(M.sync.tokens.all_input)} input tokens, about $${M.sync.cost_usd_estimate.toFixed(2)}.`);
  for (const [c, v] of Object.entries(M.conditions)) {
    console.log(`  ${c} ${NAMES[c].padEnd(15)} kept ${v.kept.held} of ${v.kept.of} (by script ${v.kept.by_script}), agreed ${v.agreed ? 'yes' : 'no'}, ` +
      `looked in ${v.looked.runs} of ${v.looked.of}, commit style ${v.way['commit-style'].held} of ${v.way['commit-style'].of}; ` +
      `${fmt(v.tokens.all_input)} input tokens, about $${v.cost_usd_estimate.toFixed(2)}`);
  }
  console.log(`About $${M.cost_usd_estimate.toFixed(2)} in all; the seven-day meter read ${M.plan_meter.seven_day_first} after the first step and ${M.plan_meter.seven_day_last} after the last run.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { ownNodeOnly, RUNS } = await import('../runner/sandbox.mjs');
  ownNodeOnly();
  try {
    if (process.argv.includes('--save')) {
      publishInputs(RUNS);
      for (const [rel, text] of Object.entries(outputs())) console.log(`Saved ${saveToRepo(rel, text)}`);
      console.log('');
    }
    printNumbers(computeNumbers());
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    console.error(`results: ${e.message}`);
    process.exitCode = 1;
  }
}
