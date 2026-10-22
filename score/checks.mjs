// How a task's checks read a run: its final answer, and the files it created or
// changed in its folder. Written in part 4, so the task check can hold the
// starters and the questions to the same rules the scorer (part 5) uses.
//
// A check, from tasks/index.json:
//
//   in        "answer", "files" or "files+answer": what it reads; area 9 also
//             has "writes", everything the agent wrote after the fork
//   file      a glob that narrows "files", such as "PR.md" or "**/*.html"
//   text      "visible": an HTML file's visible text only
//   any       passes when one of these spellings appears
//   all       passes when every one of them appears
//   none      passes when none of them appears
//   patterns  regular expressions, read like `any` (multiline)
//   exact     case matters
//
// Spellings match as whole words, the way check/text.mjs reads history, and
// every text is read through `answerText` first, so backticks and curly quotes
// never decide a match.

import { answerText, mentions, visibleText } from '../check/text.mjs';

/** A glob as a regular expression: `**` crosses folders, `*` does not, `{a,b}` is either. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * The text a check reads. `run` is `{ answer, files }`, where `files` holds the
 * files the run created or changed, as `{ path, text }` with `/` in paths.
 */
export function scope(check, run) {
  const parts = [];
  if (check.in === 'answer' || check.in === 'files+answer') parts.push(run.answer ?? '');
  if (check.in === 'files' || check.in === 'files+answer') {
    const only = check.file ? globToRegExp(check.file) : null;
    for (const f of run.files ?? []) {
      if (only && !only.test(f.path)) continue;
      parts.push(check.text === 'visible' && /\.html?$/i.test(f.path) ? visibleText(f.text) : f.text);
    }
  }
  return answerText(parts.join('\n\n'));
}

const found = (text, check) => (s) => mentions(text, s, !!check.exact);
const matches = (text, check) => (p) => new RegExp(p, check.exact ? 'mu' : 'imu').test(text);

/** Does the check hold for this run? Files a check narrows to but the run did not touch read as empty. */
export function holds(check, run) {
  const text = scope(check, run);
  if (check.none) return !check.none.some(found(text, check));
  if (check.all) return check.all.every(found(text, check));
  return (check.any ?? []).some(found(text, check)) || (check.patterns ?? []).some(matches(text, check));
}

/** True when the check has something to look for: judged tasks list their facts without spellings. */
export const looks = (check) => !!(check.any || check.all || check.none || check.patterns);

/** The groups of an area 9 task's checks (part 8). */
export const LONG_GROUPS = ['finished', 'kept', 'retried'];

/**
 * An area 9 strategy's checks, by group and id: true or false from a script,
 * or null for a check read only by hand. `run` holds the last reply
 * (`answer`), the files changed since the fork (`files`), and everything the
 * agent wrote after the fork (`writes`, `{ path, text }`, path null for a
 * shell command). A check reading "writes" reads them as files, so an
 * approach tried and taken back still counts.
 */
export function longScores(checks, run) {
  const score = (c) => {
    if (!looks(c)) return null;
    if (c.in !== 'writes') return holds(c, run);
    return holds({ ...c, in: 'files' }, { files: (run.writes ?? []).map((w) => ({ path: w.path ?? '', text: w.text })) });
  };
  return Object.fromEntries(LONG_GROUPS.map((g) => [g, Object.fromEntries((checks[g] ?? []).map((c) => [c.id, score(c)]))]));
}

/**
 * A run's verdict from its checks alone: "right", "wrong", or "judge" when the
 * judge must decide (a judged task, or every required check holding while a
 * forbidden one is found as well).
 */
export function verdict(task, run) {
  if (task.score === 'judge') return 'judge';
  if (!task.required.every((c) => holds(c, run))) return 'wrong';
  return task.forbidden.some((c) => holds(c, run)) ? 'judge' : 'right';
}
