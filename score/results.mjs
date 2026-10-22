// Part 9: the numbers of design.md and their charts, computed from the
// repository's results/ alone, so anyone can compute them again. Areas 1–8:
// area 9's long sessions are scored by score/long.mjs, once they have run.
//
//   node score/results.mjs           print the numbers
//   node score/results.mjs --save    first publish what they need from ../runs (each batch's conditions,
//                                    and the brain builds' tokens), then write results/numbers.json and
//                                    the charts in results/charts/
//
// The scores were made blind, and they stay as the scorer saved them. Which run
// had which condition is published beside them, as results/<batch>/conditions.json,
// only once every verdict was final. check/results.mjs holds results/ to what
// this writes.
//
// Run it with the sandbox's own Node.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stop } from '../runner/run.mjs';
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
    note: 'Written by score/results.mjs from results/ alone. Areas 1–8: area 9 has not run.',
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

/** Everything this writes into the repository, by path. */
export function outputs(N = computeNumbers()) {
  return {
    'results/numbers.json': json(N),
    'results/charts/right-answers.svg': rightAnswersChart(N),
    'results/charts/tokens.svg': tokensChart(N),
    'results/charts/break-even.svg': breakEvenChart(N),
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
