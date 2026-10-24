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
// check/results.mjs holds results/ to what this writes.
//
// Run it with the sandbox's own Node.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRATEGIES } from '../runner/long.mjs';
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

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => sum(xs) / xs.length;
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
  publishLong(runs);
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

/** A long task's record (long.json) without what is not public: every attempt at every step, and each sync session. */
function publicRecord(L) {
  const phases = ['fill', ...STRATEGIES];
  const all = [...phases.flatMap((p) => L[p].steps), ...L.sync.sync].filter((r) => r.versions);
  const pinned = [...new Set(all.map(({ versions: { models_used, ...v } }) => JSON.stringify(v)))];
  if (pinned.length !== 1) throw new Stop(`${L.run}'s steps ran under ${pinned.length} sets of versions`);
  const syncs = countsIn(L.sync.sync.map((r) => ({ ...r, n: 0 })));
  return {
    run: L.run,
    task: L.task,
    user: L.user,
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
 * Area 9's runs, published from the runner's folder once every one is read by
 * hand: each long task's scores as score/long.mjs saved them, the hand read
 * that overrides them, and the public part of its record.
 */
function publishLong(runs) {
  const cells = readJson(join(runs, LONG_BATCH, 'batch.json')).cells;
  const dir = (c) => join(runs, LONG_BATCH, c.run);
  const scores = cells.map((c) => readJson(join(dir(c), 'scores.json')));
  const hands = cells.map((c) => ({ run: c.run, ...readJson(join(dir(c), 'hand.json')) }));
  const steps = cells.map((c) => publicRecord(readJson(join(dir(c), 'long.json'))));
  const note = 'Every attempt at every step of each long task, as the runner recorded it, with its own tokens. ' +
    'An attempt counts when it is its step\'s last and it finished, or was kept by hand. A strategy\'s tokens ' +
    'after the fork add up its counted attempts, and the sync strategy\'s its sync session too. Left out: each ' +
    'attempt\'s notes and reason, which name the run\'s machine paths, its session, and the plan\'s meters.';
  console.log(`Saved ${saveToRepo(`results/${LONG_BATCH}/scores.json`, json({ batch: LONG_BATCH, runs: scores }))}`);
  console.log(`Saved ${saveToRepo(`results/${LONG_BATCH}/hand.json`, json({ batch: LONG_BATCH, runs: hands }))}`);
  console.log(`Saved ${saveToRepo(`results/${LONG_BATCH}/steps.json`, json({ batch: LONG_BATCH, note, runs: steps }))}`);
}

/** A batch's scored runs, each with its condition. */
function runsOf(root, batch) {
  const { conditions } = readJson(join(root, 'results', batch, 'conditions.json'));
  return readJson(join(root, 'results', batch, 'scores.json')).runs.map((s) => ({ ...s, condition: conditions[s.run] }));
}

// ---------------------------------------------------------------- numbers

/**
 * Every number in design.md's table, for areas 1–8. Tokens are every input
 * token, cached or not (`all_input`), as design.md counts them; output is
 * counted beside them, and the cached/uncached split is in `token_totals`.
 */
export function computeNumbers(root = REPO) {
  const tasks = readJson(join(root, 'tasks', 'index.json')).tasks.filter((t) => AREAS[t.area]);
  const full = runsOf(root, 'full');
  const { builds } = readJson(join(root, 'results', 'builds.json'));
  const pick = (c, areas, user = null) => full.filter((r) => r.condition === c && areas.includes(r.area) && (!user || r.user === user));
  const right = (rs) => rs.filter((r) => r.verdict === 'right').length;
  const tokens = (rs, k = 'all_input') => rs.map((r) => r.tokens[k]);
  const each = (f, cs = CONDITIONS) => Object.fromEntries(cs.map((c) => [c, f(c)]));

  const pooled = each((c) => right(pick(c, MEMORY)));
  const byUser = Object.fromEntries(USERS.map((u) => [u, { of: pick('A', MEMORY, u).length, ...each((c) => right(pick(c, MEMORY, u))) }]));
  const potential = (r) => ({ value: round((r.C - r.A) / (r.D - r.A), 3), closed: r.C - r.A, of: r.D - r.A });
  const totals = each((c) => {
    const rs = pick(c, MEMORY);
    return { runs: rs.length, ...Object.fromEntries(TOKEN_KINDS.map((k) => [k, sum(tokens(rs, k))])) };
  });

  // A break-even adds savings up, so a session's saving is the mean of B's tokens less the mean of C's.
  const kinds = { areas_1_to_7: MEMORY, questions: QUESTIONS, work: WORK };
  const breakEven = Object.fromEntries(USERS.map((u) => {
    const build = builds[u].tokens.all_input;
    const saving = Object.fromEntries(Object.entries(kinds).map(([k, areas]) => [k, mean(tokens(pick('B', areas, u))) - mean(tokens(pick('C', areas, u)))]));
    return [u, {
      build_tokens: build,
      saving_per_session: Object.fromEntries(Object.entries(saving).map(([k, s]) => [k, round(s)])),
      sessions: Object.fromEntries(Object.entries(saving).map(([k, s]) => [k, round(build / s, 1)])),
    }];
  }));

  const c7 = pick('C', MEMORY);
  const other = (c) => pick(c, [OTHER]);
  const stab = [pick('C', [3]), ...STABILITY.map((b) => runsOf(root, b))];
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
    note: 'Written by score/results.mjs from results/ alone. Areas 1–8, then area 9, the long sessions, under area_9.',
    tokens: 'Every input token, cached or not (all_input), is the primary number. Output is counted beside it.',
    conditions: NAMES,
    runs: {
      full: full.length,
      stability: sum(STABILITY.map((b) => runsOf(root, b).length)),
      scored_by: Object.fromEntries(['checks', 'judge', 'hand'].map((k) => [k, full.filter((r) => r.by === k).length])),
    },
    right_answers: {
      of: pick('A', MEMORY).length,
      pooled,
      by_user: byUser,
      by_area: Object.keys(AREAS).map(Number).map((a) => ({
        area: a, name: AREAS[a], of: tasks.filter((t) => t.area === a).length,
        ...Object.fromEntries(CONDITIONS.filter((c) => pick(c, [a]).length).map((c) => [c, right(pick(c, [a]))])),
      })),
    },
    potential_reached: { pooled: potential(pooled), ...Object.fromEntries(USERS.map((u) => [u, potential(byUser[u])])) },
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
    break_even: breakEven,
    stability: { area: 3, condition: 'C', batches: ['full', ...STABILITY], runs: area3.length * stab.length, right: right(stab.flat()), changed: area3.filter((t) => new Set(t.verdicts).size > 1).length, by_task: area3 },
    by_task: tasks.map((t) => ({
      task: t.id, area: t.area, user: t.user,
      ...Object.fromEntries(CONDITIONS.flatMap((c) => full.filter((r) => r.task === t.id && r.condition === c).map((r) => [c, r.verdict]))),
    })),
    area_9: longNumbers(root),
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
 */
export function longNumbers(root = REPO) {
  const dir = join(root, 'results', LONG_BATCH);
  const [scores, hands, records] = ['scores', 'hand', 'steps'].map((f) => readJson(join(dir, `${f}.json`)).runs);
  const asks = new Map(readJson(join(root, 'tasks', 'index.json')).tasks.map((t) => [t.id, t.ask]));
  const cost = (xs) => round(sum(xs.map((x) => x.cost_usd_estimate ?? 0)), 2);
  const tasks = scores.map((s) => {
    const hand = hands.find((h) => h.run === s.run);
    const rec = records.find((r) => r.run === s.run);
    // The decisions the fork's code did not hold yet, by the hand read: they were said only in the conversation.
    const saidOnly = Object.keys(hand.fork_code).filter((k) => hand.fork_code[k] === false);
    const strategies = Object.fromEntries(STRATEGIES.map((p) => {
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
      fork: {
        after_step: Number(s.fork.after), core: s.fork.core, more: s.fork.more, context: s.fork.context,
        tokens: { all_input: s.fork.tokens.all_input, output: s.fork.tokens.output },
        cost_usd_estimate: cost(rec.phases.fill.filter((a) => a.counts)),
      },
      said_only_in_conversation: saidOnly,
      strategies,
      keep_to: { compact: round(t('keep') / t('compact'), 1), sync: round(t('keep') / t('sync'), 1) },
    };
  });
  const pooled = Object.fromEntries(STRATEGIES.map((p) => {
    const xs = tasks.map((x) => x.strategies[p]);
    const add = (k, n = 'held') => ({ [n]: sum(xs.map((x) => x[k][n])), of: sum(xs.map((x) => x[k].of)) });
    return [p, {
      finished: add('finished'), kept: add('kept'), kept_said_only: add('kept_said_only'), retried: add('retried', 'tried'),
      all_input: sum(xs.map((x) => x.tokens.all_input)), output: sum(xs.map((x) => x.tokens.output)),
    }];
  }));
  return {
    note: 'Two long tasks, each filled live in condition C to the first step boundary past 500,000 tokens, then carried on three ways from that fork. ' +
      'Not blind: every strategy was read by hand, and the hand read overrides the scripts.',
    strategies: STRATEGY_NAMES,
    tasks,
    pooled,
  };
}

// ---------------------------------------------------------------- charts
// Every chart keeps to the look in CLAUDE.md: white, the logo's black, its
// orange for exposurie (C) and greys for the other conditions, Georgia titles
// and Calibri text, and no grid lines or decoration.

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

/** Right answers by area: one dot per task, filled when its answer was right. */
function rightAnswersChart(N) {
  const W = 880;
  const H = 580;
  const col = { A: 400, B: 525, C: 650, D: 775 };
  const rowY = (i) => 164 + i * 34;
  const out = [
    text(40, 46, 'Right answers, by area', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'One run per task and condition. Each dot is one task, filled when its answer was right.', { colour: LOOK.grey[1] }),
  ];
  const y8 = rowY(MEMORY.length) + 64;
  out.push(rect(col.C - 56, 92, 112, y8 + 24 - 92, LOOK.tint));
  for (const c of CONDITIONS) {
    out.push(text(col[c], 118, c, { font: FONTS.title, size: 20, colour: LOOK.ink, anchor: 'middle' }));
    out.push(text(col[c], 138, NAMES[c], { size: 14, colour: LOOK.grey[1], anchor: 'middle' }));
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
    const tasks = N.by_task.filter((t) => t.area === area);
    for (const c of conditions) dots(c, y, tasks.map((t) => t[c]));
  };
  MEMORY.forEach((a, i) => row(a, rowY(i), CONDITIONS));
  const ruleY = rowY(MEMORY.length) - 14;
  out.push(rule(40, 840, ruleY));
  out.push(text(40, ruleY + 38, `Areas 1–7, of ${N.right_answers.of}`, { size: 16, colour: LOOK.ink, bold: true }));
  for (const c of CONDITIONS) out.push(text(col[c], ruleY + 39, N.right_answers.pooled[c], { size: 22, colour: LOOK.ink, anchor: 'middle', bold: true }));
  row(OTHER, y8, ['A', 'B', 'C']);
  out.push(text(col.D, y8 + 5, 'not run', { size: 14, colour: LOOK.grey[2], anchor: 'middle' }));
  const p = N.potential_reached.pooled;
  const r = N.right_answers.pooled;
  out.push(text(40, H - 46, `Potential reached, (C − A) ÷ (D − A): (${r.C} − ${r.A}) ÷ (${r.D} − ${r.A}) = ${p.value.toFixed(2)}.`, { size: 16, colour: LOOK.ink }));
  out.push(text(40, H - 20, 'Area 8 needs no past, so it has no D and stays out of the totals.', { size: 14, colour: LOOK.grey[1] }));
  return svg(W, H, 'Right answers, by area and condition', out);
}

/** Horizontal bars on one scale, labelled with their conditions and values. */
function bars(out, { top, scale, rows, x0 = 200, len = 470 }) {
  rows.forEach(({ c, value, extra }, i) => {
    const y = top + i * 34;
    out.push(text(40, y + 16, c, { size: 15, colour: LOOK.ink, bold: true }));
    out.push(text(60, y + 16, NAMES[c], { size: 15 }));
    const w = Math.max(2, (value / scale) * len);
    out.push(rect(x0, y, w, 22, barColour(c)));
    out.push(text(x0 + w + 8, y + 16, `${fmt(value)}${extra ? `  ·  ${extra}` : ''}`, { size: 15, colour: c === 'C' ? LOOK.ink : LOOK.body, bold: c === 'C' }));
  });
  return top + rows.length * 34;
}

/** Tokens per run and per right answer in areas 1–7, and per run in area 8, on one scale. */
function tokensChart(N) {
  const W = 880;
  const out = [
    text(40, 46, 'Tokens', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Every input token, cached or not, with all three panels on one scale.', { colour: LOOK.grey[1] }),
    text(40, 92, `Output is counted apart: a median of ${fmt(Math.min(...Object.values(N.tokens_per_run.output_median)))} to ${fmt(Math.max(...Object.values(N.tokens_per_run.output_median)))} tokens a run, alike in every condition.`, { colour: LOOK.grey[1] }),
  ];
  const scale = Math.max(...Object.values(N.tokens_per_right_answer), ...Object.values(N.tokens_per_run.median), ...Object.values(N.overhead.per_run_median));
  const panel = (top, title, rows) => {
    out.push(text(40, top, title, { size: 16, colour: LOOK.ink, bold: true }));
    return bars(out, { top: top + 16, scale, rows });
  };
  let y = panel(136, 'Per run: the median of areas 1–7', CONDITIONS.map((c) => ({ c, value: N.tokens_per_run.median[c] })));
  y = panel(y + 42, 'Per right answer: all of a condition\'s tokens in areas 1–7 ÷ its right answers', CONDITIONS.map((c) => ({ c, value: N.tokens_per_right_answer[c], extra: `${N.right_answers.pooled[c]} right` })));
  y = panel(y + 42, 'Per run on work that needs no past: the median of area 8', ['A', 'B', 'C'].map((c) => ({ c, value: N.overhead.per_run_median[c] })));
  const t = N.overhead.by_task.map((x) => x.C - x.A);
  out.push(text(40, y + 30, ['In area 8, C never ran ', { code: 'exposurie read' }, `, and what exposurie installs added ${fmt(Math.min(...t))} to ${fmt(Math.max(...t))} tokens a run.`], { size: 14, colour: LOOK.grey[1] }));
  return svg(W, y + 56, 'Tokens per run and per right answer, by condition', out);
}

/** Sessions until each user's brain pays for itself against B, by kind of session. */
function breakEvenChart(N) {
  const W = 880;
  const out = [
    text(40, 46, 'Sessions until a brain pays for itself', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'The tokens that built the brain, divided by the tokens a C session saves against B.', { colour: LOOK.grey[1] }),
  ];
  const kinds = [
    ['questions', 'A question, areas 1–5'],
    ['work', 'A work task, areas 6–7'],
    ['areas_1_to_7', 'Areas 1–7, as run here'],
  ];
  const scale = Math.max(...USERS.flatMap((u) => Object.values(N.break_even[u].sessions)));
  const x0 = 300;
  const len = 400;
  let y = 116;
  for (const u of USERS) {
    const b = N.break_even[u];
    out.push(text(40, y, `The ${u}: ${fmt(b.build_tokens)} tokens to build`, { size: 16, colour: LOOK.ink, bold: true }));
    y += 16;
    for (const [k, label] of kinds) {
      out.push(text(40, y + 15, label, { size: 15 }));
      out.push(text(40, y + 33, `C saves ${fmt(b.saving_per_session[k])} tokens a session`, { size: 13, colour: LOOK.grey[1] }));
      const w = (b.sessions[k] / scale) * len;
      out.push(rect(x0, y + 1, w, 22, LOOK.orange));
      out.push(text(x0 + w + 8, y + 17, `${b.sessions[k].toFixed(1)} sessions`, { size: 15, colour: LOOK.ink, bold: true }));
      y += 48;
    }
    y += 30;
  }
  out.push(text(40, y, 'B holds only what was said; a real long session also carries tool output, so B costs less here than', { size: 14, colour: LOOK.grey[1] }));
  out.push(text(40, y + 20, 'the habit it stands for. Keeping a brain synced as its history grows costs tokens too, not counted here.', { size: 14, colour: LOOK.grey[1] }));
  return svg(W, y + 46, 'Sessions until a brain pays for itself, by user and kind of session', out);
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
  const out = [
    text(40, 46, 'Long sessions: three ways on from 500,000 tokens', { font: FONTS.title, size: 24, colour: LOOK.ink }),
    text(40, 72, 'Two long tasks, each one session filled to 500,000 tokens, then carried on three ways from there.', { colour: LOOK.grey[1] }),
    text(40, 92, 'Each dot is one check after the fork, filled when it held; the hand read overrides the script.', { colour: LOOK.grey[1] }),
  ];
  // Where each group's dots start, where its count stands, and its heading.
  const col = { finished: 240, kept: 540, retried: 730 };
  const count = { finished: 436, kept: 636 };
  const heads = [['finished', 'Finished', 'the work\'s checks'], ['kept', 'Kept', 'the decisions'], ['retried', 'Retried', 'a failed approach']];
  for (const [g, head, sub] of heads) {
    const x = g === 'retried' ? col[g] : col[g] - 7;
    out.push(text(x, 132, head, { size: 15, colour: LOOK.ink, bold: true }));
    out.push(text(x, 150, sub, { size: 13, colour: LOOK.grey[1] }));
  }
  const dot = (cx, cy, held, p) => out.push(held
    ? `<circle cx="${cx}" cy="${cy}" r="7" fill="${p === 'sync' ? LOOK.orange : LOOK.grey[1]}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="6.25" fill="${LOOK.white}" stroke="${LOOK.rule[1]}" stroke-width="1.5"/>`);
  let y = 190;
  for (const t of A.tasks) {
    out.push(text(40, y, t.task, { size: 16, colour: LOOK.ink, bold: true }));
    out.push(text(104, y, t.ask, { size: 15 }));
    out.push(text(40, y + 22, `Forked after step ${t.fork.after_step}, at ${fmt(t.fork.context)} tokens: ${t.fork.core} core steps and ${t.fork.more} more.`, { size: 14, colour: LOOK.grey[1] }));
    y += 56;
    for (const p of STRATEGIES) {
      const v = t.strategies[p];
      if (p === 'sync') out.push(rect(30, y - 16, 820, 32, LOOK.tint));
      out.push(text(40, y + 5, strategyLabel(p), { size: 15, colour: p === 'sync' ? LOOK.ink : LOOK.body }));
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
  const scale = Math.max(...A.tasks.flatMap((t) => STRATEGIES.map((p) => t.strategies[p].tokens.all_input)));
  const x0 = 200;
  const len = 470;
  for (const t of A.tasks) {
    out.push(text(40, y + 22, t.task, { size: 15, colour: LOOK.ink, bold: true }));
    y += 34;
    for (const p of STRATEGIES) {
      const v = t.strategies[p];
      out.push(text(60, y + 16, strategyLabel(p), { size: 15 }));
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
  }
  return svg(W, y + 30, 'Long sessions: what each strategy kept after the fork, and its tokens', out);
}

/** Everything this writes into the repository, by path. */
export function outputs(N = computeNumbers()) {
  return {
    'results/numbers.json': json(N),
    'results/charts/right-answers.svg': rightAnswersChart(N),
    'results/charts/tokens.svg': tokensChart(N),
    'results/charts/break-even.svg': breakEvenChart(N),
    'results/charts/long-sessions.svg': longSessionsChart(N),
  };
}

function printNumbers(N) {
  const list = (o) => Object.entries(o).map(([c, v]) => `${c} ${typeof v === 'number' ? fmt(v) : v}`).join(', ');
  const r = N.right_answers;
  const l = N.looked_vs_found;
  console.log(`Right answers, areas 1–7, of ${r.of}: ${list(r.pooled)}. Potential reached ${N.potential_reached.pooled.value} (${N.potential_reached.pooled.closed} of ${N.potential_reached.pooled.of}).`);
  console.log(`Tokens per run, median of areas 1–7: ${list(N.tokens_per_run.median)}.`);
  console.log(`Tokens per right answer: ${list(N.tokens_per_right_answer)}.`);
  console.log(`Area 8, median per run: ${list(N.overhead.per_run_median)}; C − A ${fmt(N.overhead.c_minus_a)}.`);
  console.log(`Made-up answers, area 4: ${list(Object.fromEntries(CONDITIONS.map((c) => [c, N.made_up_answers[c]])))}.`);
  console.log(`Looked vs found: C looked in ${l.looked} of ${l.runs}, right in ${l.right_when_looked} of those; right in ${l.right_when_not} of the ${l.runs - l.looked} that did not.`);
  for (const u of USERS) {
    const s = N.break_even[u].sessions;
    console.log(`Break-even, the ${u}: ${s.questions} sessions of questions, ${s.work} of work tasks, ${s.areas_1_to_7} of areas 1–7 as run here.`);
  }
  console.log(`Stability: area 3 under C right in ${N.stability.right} of ${N.stability.runs}; tasks whose verdict changed: ${N.stability.changed}.`);
  for (const t of N.area_9.tasks) {
    console.log(`Area 9, ${t.task}, forked after step ${t.fork.after_step} at ${fmt(t.fork.context)}:`);
    for (const p of STRATEGIES) {
      const v = t.strategies[p];
      console.log(`  ${STRATEGY_NAMES[p].padEnd(13)} finished ${v.finished.held} of ${v.finished.of}, kept ${v.kept.held} of ${v.kept.of} ` +
        `(said only in the conversation ${v.kept_said_only.held} of ${v.kept_said_only.of}), retried ${v.retried.tried} of ${v.retried.of}; ` +
        `${fmt(v.tokens.all_input)} input tokens after the fork, about $${v.cost_usd_estimate.toFixed(2)}`);
    }
  }
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
