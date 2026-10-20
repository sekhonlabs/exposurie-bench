// How the checkers read text. One rule, shared by the fact-sheet check
// (check/facts.mjs), the history checker (check/history.mjs) and the generator,
// so a spelling counts the same way everywhere.

/**
 * Does `text` mention `needle`, the way the scorer and the history checker read it?
 *
 * Case-insensitive unless `exactCase`, and whole words only where the needle
 * starts or ends with a letter or digit, so `ams` is not found in `teams` and
 * `MIT` is not found in `submit`.
 */
export function mentions(text, needle, exactCase = false) {
  return find(text, needle, exactCase) !== -1;
}

/** Where `needle` first appears in `text` under the same rule, or -1. */
export function find(text, needle, exactCase = false) {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pre = /^\w/.test(needle) ? '(?<!\\w)' : '';
  const post = /\w$/.test(needle) ? '(?!\\w)' : '';
  const m = new RegExp(pre + esc + post, exactCase ? 'u' : 'iu').exec(text);
  return m ? m.index : -1;
}

/**
 * Colour codes written as hex: six digits, or three when one of them is a
 * letter, so an issue number like #482 is not read as a colour.
 */
export function colourCodes(text) {
  const out = [];
  for (const m of text.matchAll(/#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Za-z_-])/g)) {
    if (m[0].length === 7 || /[A-Fa-f]/.test(m[0])) out.push(m[0].toUpperCase());
  }
  return out;
}

/** A short excerpt around position `at`, on one line, for a problem report. */
export function around(text, at, width = 60) {
  const from = Math.max(0, at - width);
  return (from > 0 ? '…' : '') + text.slice(from, at + width).replace(/\s+/g, ' ').trim() + '…';
}
