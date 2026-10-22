// Area 9's scorer (part 8): the checks of a long task on each strategy's run,
// read from what runner/long.mjs left in its folder. A stream shows which
// strategy made it, so this is not blind; every run is read by hand as well,
// and the checks marked hand are listed for that.
//
//   node score/long.mjs <task>      scores ../runs/area-9/<run>/, writes scores.json beside long.json
//
// Run it with the sandbox's own Node.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONG_GROUPS, longScores } from './checks.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** What the checks read of one strategy: its last reply, the text files it changed since the fork, and everything it wrote. */
export function strategyRun(dir, phase) {
  const files = readJson(join(dir, phase, 'files.json'))
    .filter((f) => f.change !== 'deleted' && f.text)
    .map((f) => ({ path: f.path, text: readFileSync(join(dir, phase, 'files', f.path), 'utf8') }));
  return {
    answer: readFileSync(join(dir, phase, 'answer.md'), 'utf8'),
    files,
    writes: readJson(join(dir, phase, 'writes.json')),
  };
}

/** Every finished strategy's checks, with the record's tokens beside them. */
export function scoreLong(dir, task) {
  const L = readJson(join(dir, 'long.json'));
  const out = { task: task.id, run: L.run, scored: new Date().toISOString(), fork: L.fill.forked, strategies: {} };
  for (const phase of ['keep', 'compact', 'sync']) {
    if (!L[phase].finished) continue;
    const checks = longScores(task.checks, strategyRun(dir, phase));
    out.strategies[phase] = {
      checks,
      counts: Object.fromEntries(LONG_GROUPS.map((g) => {
        const v = Object.values(checks[g]).filter((x) => x !== null);
        return [g, { held: v.filter(Boolean).length, of: v.length }];
      })),
      tokens: L[phase].tokens,
      context_end: L[phase].context_end,
    };
  }
  out.by_hand = LONG_GROUPS.flatMap((g) => task.checks[g].filter((c) => c.hand).map((c) => `${g} ${c.id}: ${c.what}`));
  return out;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { longTask } = await import('../runner/long.mjs');
  const { ownNodeOnly, RUNS } = await import('../runner/sandbox.mjs');
  ownNodeOnly();
  const id = process.argv[2];
  const task = longTask(id);
  const batch = join(RUNS, 'area-9', 'batch.json');
  const cell = existsSync(batch) ? readJson(batch).cells.find((c) => c.task === id) : null;
  if (!cell || !existsSync(join(RUNS, 'area-9', cell.run, 'long.json'))) {
    console.error(`score/long: ${id} has not run`);
    process.exit(1);
  }
  const dir = join(RUNS, 'area-9', cell.run);
  const s = scoreLong(dir, task);
  writeFileSync(join(dir, 'scores.json'), `${JSON.stringify(s, null, 2)}\n`);
  for (const [phase, r] of Object.entries(s.strategies)) {
    console.log(`${phase.padEnd(8)} ${LONG_GROUPS.map((g) => `${g} ${r.counts[g].held}/${r.counts[g].of}`).join('  ')}  (${r.tokens.all_input} in, ${r.tokens.output} out after the fork)`);
  }
  console.log(`\nRead by hand as well:\n  ${s.by_hand.join('\n  ')}\nScores: ${join(dir, 'scores.json')}`);
}
