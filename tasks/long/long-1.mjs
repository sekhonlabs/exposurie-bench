// long-1, the first of area 9's long tasks (part 8): one long session in
// Satchel, the developer's read-later app. This file writes the task's steps
// file, tasks/long/long-1.json, and the material its steps hand over,
// tasks/long/long-1/: what the developer saved into the repository's tmp/
// folder for the agent to read. All of it is made up and seeded, so running
// this again writes the same bytes; check/tasks.mjs holds both to that.
//
//   node tasks/long/long-1.mjs
//
// The steps follow the blueprint in docs/build-plan.md, part 8. The core
// builds the Pocket import, with the decisions only later steps need and three
// approaches the developer asks for that then fail on their real data. The
// more steps are production questions about the same app, each answered from
// what the developer saved, and a few fixes, until the session passes 500,000
// tokens. The after steps finish the feature. No step assumes what the agent
// wrote: a failure is reported as what the developer saw. Where a step states
// a fact about its material (when the digest went out), the fact is read off
// the material, so the two cannot disagree.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STEPS_FILE = join(HERE, 'long-1.json');
export const MATERIAL_DIR = join(HERE, 'long-1');

// ---------------------------------------------------------------- seeded randomness

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HEX = '0123456789abcdef';

/** A random source of its own for each name, so changing one file's builder leaves every other file as it was. */
function seeded(name) {
  let a = 2166136261;
  for (const ch of name) a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const chars = (n, alphabet) => Array.from({ length: n }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** Log-normal around a median: durations, sizes. */
    around: (median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next())),
    ulid: (ms) => {
      let time = '';
      for (let i = 0, t = Math.floor(ms); i < 10; i += 1, t = Math.floor(t / 32)) time = B32[t % 32] + time;
      return time + chars(16, B32);
    },
    token: () => chars(43, B64URL),
    hex: (n) => chars(n, HEX),
  };
}

// ---------------------------------------------------------------- time and log lines

const T = (s) => Date.parse(s);
const iso = (ms) => new Date(Math.round(ms)).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Lisbon is UTC+1 until the clocks go back on 2026-10-25. */
const lisbonClock = (ms) => iso(ms + HOUR).slice(11, 16);

/** One line as src/log.js writes it. */
const logLine = (level, ms, msg, fields = {}) => ({ ms, text: JSON.stringify({ level, time: iso(ms), msg, ...fields }) });

/** The request logger's line, from src/app.js. */
const requestLine = (ms, method, path, status, took, user) => logLine('info', ms, 'request', { method, path, status, ms: took, user });

const MACHINE = '784e903f2d76d8';
/** A line as `fly logs` shows it. */
const flyLine = (ms, source, level, text) => ({ ms, text: `${iso(ms).slice(0, 19)}Z ${source}[${MACHINE}] ams [${level}]${text}` });
const asFly = (line) => flyLine(line.ms, 'app', 'info', line.text);

const sortLines = (lines) => lines.map((l, i) => ({ ...l, i })).sort((a, b) => a.ms - b.ms || a.i - b.i).map((l) => l.text);

/**
 * Lines split into files of about `size` characters each, so each is one Read:
 * `<dir>/<n>.log`, or `<base>-<n>.log` when given a base name in place of a folder.
 */
function parts(dir, lines, size = 46_000, { base = null } = {}) {
  const out = new Map();
  let part = [];
  let length = 0;
  const flush = () => {
    if (part.length) out.set(base ? `${base}-${out.size + 1}.log` : `${dir}/${out.size + 1}.log`, `${part.join('\n')}\n`);
    part = [];
    length = 0;
  };
  for (const l of lines) {
    if (length + l.length > size && part.length) flush();
    part.push(l);
    length += l.length + 1;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- made-up sites, users and pages

const SITES = [
  'quietcraft.example', 'thecodelog.example', 'harbourpress.example', 'longform-weekly.example', 'nightly-notes.example',
  'fieldjournal.example', 'datahaus.example', 'smallweb.example', 'kitchen-ledger.example', 'atlas-review.example',
  'oss-digest.example', 'paperplane.example', 'the-daily-ledger.example', 'ops-review.example', 'slowtravel.example',
  'gardenletter.example', 'bytesized.example', 'citylab-notes.example', 'makerspace.example', 'deepdive.example',
];
const WORDS = (
  'notes quiet web database backups small tools sqlite production field guide sourdough writing indexes caching walking ' +
  'lighthouse keepers night trains europe fermentation printing history attention cities trams gardens soil compost ' +
  'memory leaks streams htmx html css layouts reading habits email queues retries backoff search ranking unicode time ' +
  'zones lisbon daylight scheduling types tests fixtures coverage design maps rivers bridges coffee bread kitchens knives ' +
  'furniture chairs paper ink notebooks film photography light music records radio essays letters travel ferries islands ' +
  'mountains running weather climate energy solar wind batteries repair bikes roads transit'
).split(' ');

const slug = (r, n = r.int(3, 6)) => Array.from({ length: n }, () => r.pick(WORDS)).join('-');
function pageUrl(r, site = r.pick(SITES)) {
  const style = r.int(0, 3);
  if (style === 0) return `https://${site}/${r.int(2019, 2026)}/${String(r.int(1, 12)).padStart(2, '0')}/${slug(r)}`;
  if (style === 1) return `https://${site}/posts/${slug(r)}`;
  if (style === 2) return `https://${site}/articles/${r.int(1000, 99999)}-${slug(r)}`;
  return `https://${site}/${slug(r, 2)}/${slug(r)}`;
}
const userIds = (r, n) => Array.from({ length: n }, () => r.ulid(T('2026-05-26T00:00:00Z') + r.next() * (T('2026-10-10T00:00:00Z') - T('2026-05-26T00:00:00Z'))));

// ---------------------------------------------------------------- errors as the worker logs them

const AT_WORKER = '    at async file:///app/src/worker.js:28:5';
const TICKS = '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)';
const AT_FETCH = '    at async fetchArticle (file:///app/src/jobs/handlers/fetch-article.js:32:15)';
const UNDICI = '    at node:internal/deps/undici/undici:13510:13';
const httpError = (status, url) => ({
  name: 'Error', message: `fetch ${status} ${url}`,
  stack: `Error: fetch ${status} ${url}\n    at fetchArticle (file:///app/src/jobs/handlers/fetch-article.js:37:21)\n${TICKS}\n${AT_WORKER}`,
});
const timeoutError = () => ({
  name: 'TimeoutError', message: 'The operation was aborted due to timeout',
  stack: `TimeoutError: The operation was aborted due to timeout\n${UNDICI}\n${TICKS}\n${AT_FETCH}\n${AT_WORKER}`,
});
const fetchFailed = () => ({ name: 'TypeError', message: 'fetch failed', stack: `TypeError: fetch failed\n${UNDICI}\n${TICKS}\n${AT_FETCH}\n${AT_WORKER}` });
const tooBig = () => ({
  name: 'Error', message: 'page over 5242880 bytes',
  stack: `Error: page over 5242880 bytes\n    at readCapped (file:///app/src/jobs/handlers/fetch-article.js:20:13)\n${TICKS}\n    at async fetchArticle (file:///app/src/jobs/handlers/fetch-article.js:39:31)\n${AT_WORKER}`,
});
const postmarkError = (code, message) => ({
  name: 'Error', message: `postmark 422 ${code}: ${message}`,
  stack: `Error: postmark 422 ${code}: ${message}\n    at sendEmail (file:///app/src/mail/postmark.js:31:11)\n${TICKS}\n    at async weeklyDigest (file:///app/src/jobs/handlers/weekly-digest.js:22:7)\n${AT_WORKER}`,
});

/** What fetching one page does, from a source of its own per job and attempt, so it never depends on the order the queue ran in. */
function fetchOutcome(job, mix = 'normal') {
  const r = seeded(`${job.id}:${job.attempts}`);
  const roll = r.next();
  const ok = () => ({ ms: Math.min(14_200, Math.max(260, r.around(6500, 0.55))) });
  if (mix === 'sites') {
    // One site always answers slowly, and one turns every fetch away.
    if (job.site === 'datahaus.example') return roll < 0.22 ? { ms: 15_000 + r.int(2, 60), error: timeoutError() } : { ms: r.int(10_800, 14_900) };
    if (job.site === 'bytesized.example') return { ms: r.int(140, 420), error: httpError(403, job.url) };
    if (roll < 0.03) return { ms: r.int(160, 900), error: httpError(404, job.url) };
    if (roll < 0.04) return { ms: 15_000 + r.int(2, 60), error: timeoutError() };
    return { ms: Math.min(14_200, Math.max(260, r.around(job.site.length * 210, 0.45))) };
  }
  if (mix === 'normal') {
    if (roll < 0.022) return { ms: r.int(160, 900), error: httpError(404, job.url) };
    if (roll < 0.034) return { ms: 15_000 + r.int(2, 60), error: timeoutError() };
    if (roll < 0.042) return { ms: r.int(180, 650), error: httpError(403, job.url) };
    if (roll < 0.047) return { ms: r.int(90, 2400), error: fetchFailed() };
    return ok();
  }
  // An old list of links: much of it is gone.
  if (job.site === 'oldblog.example' && job.burst) return { ms: r.int(120, 260), error: httpError(429, job.url) };
  if (roll < 0.17) return { ms: r.int(140, 800), error: httpError(404, job.url) };
  if (roll < 0.19) return { ms: r.int(140, 600), error: httpError(410, job.url) };
  if (roll < 0.25) return { ms: r.int(150, 700), error: httpError(403, job.url) };
  if (roll < 0.28) return { ms: r.int(300, 3000), error: httpError(r.pick([500, 502, 503]), job.url) };
  if (roll < 0.41) return { ms: r.int(40, 2500), error: fetchFailed() };
  if (roll < 0.47) return { ms: 15_000 + r.int(2, 60), error: timeoutError() };
  if (roll < 0.48) return { ms: r.int(2500, 9000), error: tooBig() };
  return ok();
}

// ---------------------------------------------------------------- the jobs table, simulated

/**
 * The worker's lines over a stretch of time, as src/worker.js writes them:
 * it claims the due job with the earliest run_at, one at a time, sleeps five
 * seconds when nothing is due, and puts a failed job back with a backoff of
 * 1, 2, 4 and 8 minutes, giving up on the fifth failure. `run` says what one
 * attempt did: how long it took, its error, and any lines it wrote itself.
 */
function workerRun({ from, to, jobs, run }) {
  const lines = [];
  const queue = jobs.map((j) => ({ attempts: 0, done: false, ...j }));
  let t = from;
  while (t < to) {
    let due = null;
    for (const j of queue) {
      if (!j.done && j.runAt <= t && (!due || j.runAt < due.runAt || (j.runAt === due.runAt && j.id < due.id))) due = j;
    }
    if (!due) {
      t += 5 * SEC;
      continue;
    }
    due.attempts += 1;
    if (due.attempts === 1) due.firstClaim = t;
    due.lastClaim = t;
    lines.push(logLine('info', t, 'job claimed', { id: due.id, kind: due.kind, attempts: due.attempts }));
    const out = run(due, t);
    for (const e of out.lines ?? []) lines.push(logLine(e.level, t + e.at, e.msg, e.fields));
    t += out.ms;
    due.endedAt = t;
    if (out.error) {
      const gaveUp = due.attempts >= 5;
      if (gaveUp) due.done = true;
      else due.runAt = t + 2 ** (due.attempts - 1) * MIN;
      lines.push(logLine('error', t, 'job failed', { id: due.id, kind: due.kind, attempts: due.attempts, gave_up: gaveUp, error: out.error }));
    } else {
      due.done = true;
      due.doneAt = t;
      lines.push(logLine('info', t, 'job done', { id: due.id, kind: due.kind, ms: Math.round(out.ms) }));
    }
    t += 3 + (due.attempts % 5);
  }
  return { lines, queue };
}

/** Fly's health check, every 30 seconds. */
function healthChecks(from, to, { offset = 7 * SEC } = {}) {
  const out = [];
  for (let t = from + offset; t < to; t += 30 * SEC) out.push(requestLine(t, 'GET', '/health', 200, t % 3 === 0 ? 1 : 0, null));
  return out;
}

/**
 * People using the app: request lines, and the jobs those requests enqueue.
 * `every` is the mean gap between requests.
 */
function browsing(r, { from, to, every, users, quiet = [] }) {
  const lines = [];
  const jobs = [];
  for (let t = from + r.int(0, every); t < to; t += Math.max(400, r.around(every, 0.9))) {
    if (quiet.some(([a, b]) => t >= a && t < b)) continue;
    const user = r.pick(users);
    const roll = r.next();
    const link = () => r.ulid(t - r.int(1, 120) * DAY);
    if (roll < 0.28) lines.push(requestLine(t, 'GET', '/', 200, r.int(3, 16), user));
    else if (roll < 0.5) lines.push(requestLine(t, 'GET', `/read/${link()}`, 200, r.int(3, 28), user));
    else if (roll < 0.62) {
      lines.push(requestLine(t, 'POST', '/links', 201, r.int(6, 19), user));
      jobs.push({ id: r.ulid(t), kind: 'fetch_article', runAt: t, url: pageUrl(r) });
    } else if (roll < 0.7) lines.push(requestLine(t, 'GET', '/search', 200, r.int(4, 90), user));
    else if (roll < 0.76) lines.push(requestLine(t, 'POST', `/links/${link()}/read`, 200, r.int(3, 9), user));
    else if (roll < 0.79) lines.push(requestLine(t, 'POST', `/links/${link()}/archived`, 200, r.int(3, 9), user));
    else if (roll < 0.84) lines.push(requestLine(t, 'GET', '/done', 200, r.int(4, 18), user));
    else if (roll < 0.87) lines.push(requestLine(t, 'GET', '/account', 200, r.int(3, 9), user));
    else if (roll < 0.9) lines.push(requestLine(t, 'GET', `/tags/${r.pick(WORDS)}`, 200, r.int(4, 14), user));
    else if (roll < 0.93) lines.push(requestLine(t, 'POST', `/read/${link()}/highlights`, 201, r.int(4, 10), user));
    else if (roll < 0.97) lines.push(requestLine(t, 'GET', '/css/app.css', 200, 1, user));
    else lines.push(requestLine(t, 'GET', '/archive', 200, r.int(4, 15), user));
  }
  return { lines, jobs };
}

const runJob = (job) => {
  if (job.kind === 'fetch_article') return fetchOutcome(job, job.mix);
  if (job.kind === 'send_magic_link') return { ms: 210 + (job.id.charCodeAt(12) % 300) };
  if (job.kind === 'paddle_event') return { ms: 9 + (job.id.charCodeAt(13) % 14) };
  throw new Error(`no simulated job ${job.kind}`);
};

// ---------------------------------------------------------------- core material

/** Core step 4: rows of the real Pocket export with a comma in the title, and what a split on commas makes of them. */
function pocketCommas() {
  const rows = [
    '"Thinking, Fast and Slow: My Notes",https://quietcraft.example/2021/03/thinking-fast-and-slow-notes,1615824000,books|psychology,archive',
    '"Yes, You Can Run SQLite in Production",https://thecodelog.example/posts/sqlite-in-production,1648120000,sqlite,unread',
    '"The ""Boring Technology"" Club, Revisited",https://ops-review.example/articles/2207-boring-technology-revisited,1661990000,,archive',
    '"Bread, Butter, and Backpressure",https://datahaus.example/2023/02/bread-butter-backpressure,1676000000,streams|distributed-systems,unread',
    '"Paris, London, Lisbon: Night Trains Compared",https://slowtravel.example/posts/night-trains-compared,1693000000,travel,archive',
    '"Small, Sharp, and Boring: Tools I Still Use",https://bytesized.example/posts/small-sharp-boring-tools,1702300000,tools,unread',
  ];
  const out = [
    'A few rows from my real Pocket export that have a comma in the title, and what a split on commas makes of each.',
    'Pocket puts quotes around a field that has a comma in it, and doubles any quote inside one.',
    'The header is: title,url,time_added,tags,status',
    '',
  ];
  for (const row of rows) {
    const fields = row.split(',');
    out.push(row, `  split on commas: ${fields.length} fields where there should be 5`);
    fields.forEach((f, i) => out.push(`    ${i + 1}  ${f}`));
    out.push(`  so the url is ${JSON.stringify(fields[1])}, and every field after it moves along by ${fields.length - 5}`, '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- the late digest (Saturday 2026-10-17)

/**
 * The app's log on Saturday morning: someone's link-list import at 06:47
 * enqueues hundreds of page fetches, the worker takes jobs oldest first, and
 * the digest, due at 07:00 UTC (08:00 in Lisbon), waits behind all of them.
 * The import's size is the smallest that keeps the digest waiting until 07:51,
 * found by search, which works because each fetch's outcome depends only on
 * its job.
 */
function digestMorning() {
  const from = T('2026-10-17T06:30:00Z');
  const to = T('2026-10-17T07:56:30Z');
  const r = seeded('app-2026-10-17');
  const users = userIds(r, 46);
  const importer = users[11];
  const web = browsing(r, { from, to, every: 24 * SEC, users });
  const signIns = [T('2026-10-17T06:36:12Z'), T('2026-10-17T07:09:14Z'), T('2026-10-17T07:23:51Z'), T('2026-10-17T07:38:02Z')]
    .map((ms) => ({ ms, id: r.ulid(ms), token: r.token() }));
  const digest = { id: r.ulid(T('2026-10-10T07:01:09.412Z')), kind: 'weekly_digest', runAt: T('2026-10-17T07:00:00Z') };
  const fixed = [
    digest,
    ...signIns.map((s) => ({ id: s.id, kind: 'send_magic_link', runAt: s.ms })),
    ...web.jobs.map((j) => ({ ...j, mix: 'normal' })),
  ];
  const importDone = T('2026-10-17T06:47:09.398Z');
  const importJobs = (n) => {
    const ir = seeded('app-2026-10-17/import');
    return Array.from({ length: n }, (_, i) => {
      const at = importDone - 380 + Math.floor((i * 370) / n);
      return { id: ir.ulid(at), kind: 'fetch_article', runAt: at, url: pageUrl(ir), mix: 'normal' };
    });
  };
  const digestUsers = 41;
  const run = (job) => {
    if (job.kind !== 'weekly_digest') return runJob(job);
    const dr = seeded(`${job.id}:digest`);
    const ms = digestUsers * dr.int(780, 980);
    return {
      ms,
      lines: [
        { at: Math.floor(ms * 0.37), level: 'error', msg: 'digest not sent', fields: { user: users[29], error: postmarkError(406, "You tried to send to recipient(s) that have been marked as inactive. Found inactive addresses: d.prado@post.example. Inactive recipients are ones that have generated a hard bounce, a spam complaint, or a manual suppression.") } },
        { at: ms - 4, level: 'info', msg: 'digest sent', fields: { users: digestUsers, sent: digestUsers - 1 } },
      ],
    };
  };
  const simulate = (n) => workerRun({ from, to, jobs: [...fixed, ...importJobs(n)], run });
  const claimOf = (sim) => sim.queue.find((j) => j.id === digest.id).firstClaim ?? Number.POSITIVE_INFINITY;
  let lo = 200;
  let hi = 1600;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (claimOf(simulate(mid)) >= T('2026-10-17T07:51:00Z')) hi = mid;
    else lo = mid + 1;
  }
  const sim = simulate(lo);
  const claimed = claimOf(sim);
  const sent = sim.queue.find((j) => j.id === digest.id).doneAt;
  const emailed = signIns.map((s) => sim.queue.find((j) => j.id === s.id).doneAt);
  // Each person clicks a minute or two after the email arrives; the link was made 15 minutes after they asked.
  const clicks = signIns.map((s, i) => {
    const at = emailed[i] + seeded(s.token).int(25, 110) * SEC;
    return { at, status: at < s.ms + 15 * MIN ? 302 : 410, s };
  });
  const lines = [
    ...healthChecks(from, to),
    ...web.lines,
    ...signIns.map((s) => requestLine(s.ms, 'POST', '/sign-in', 200, seeded(s.id).int(5, 11), null)),
    ...clicks.filter((c) => c.at < to).map((c) => requestLine(c.at, 'GET', `/auth/${c.s.token}`, c.status, c.status === 302 ? 6 : 3, null)),
    logLine('info', importDone, 'import finished', { user: importer, saved: lo, duplicates: 23, overLimit: 0, untitled: 31 }),
    requestLine(importDone + 4, 'POST', '/import', 200, 38_211, importer),
    ...sim.lines,
  ];
  return {
    files: parts('app-2026-10-17', sortLines(lines)),
    digestLisbon: lisbonClock(claimed),
    sentLisbon: lisbonClock(sent),
    expired: clicks.filter((c) => c.status === 410 && c.at < to).length,
    imported: lo,
    // The week of sign-ins shows these same four.
    signIns: signIns.map((s, i) => {
      const job = sim.queue.find((j) => j.id === s.id);
      return { asked: s.ms, id: s.id, token: s.token, claimed: job.firstClaim, sent: emailed[i], opens: clicks[i].at < to ? [{ at: clicks[i].at, status: clicks[i].status }] : [] };
    }),
  };
}

// ---------------------------------------------------------------- empty pages

const BACKUPS = [
  'Every team I have worked with had backups. Fewer had restores. The difference only shows up on the worst day of the year, when someone types the restore command for the first time and finds out what the backup really holds.',
  'A backup job that exits with status zero tells you that a program ran and stopped. It does not tell you that the file it wrote can be read, that it holds the tables you care about, or that it is newer than last Tuesday.',
  'The fix is boring and it works: restore on a schedule. Pick a machine that is not production, pull the latest backup, open it, and run a query whose answer you know. Count the rows in your biggest table and compare the number with what production reported an hour ago.',
  'Write down how long the restore took. That number is your real recovery time, and it is almost always longer than the one in the planning document. Large databases take a long time to copy, and nobody measures that until they have to.',
  'Check what the backup leaves out. Uploaded files, search indexes, secrets and the configuration of the machine itself are often not in it, and each of them can turn a twenty-minute restore into a two-day rebuild.',
  'Finally, make the restore loud. A test that fails in silence is a backup that lies with extra steps. Send the result somewhere a person will see it, and treat a missed restore test like a failed deploy.',
  'None of this is new. It is just rarely done, because the day it pays off is a day you hope never comes.',
];
const KEEPERS = [
  "The keeper's logbook for the night of the storm runs to four lines. Wind north-west, rising. Light lit at 17:40. Glass cracked in the lantern room, temporary repair. Light out at 07:15, all ships accounted for.",
  'For two hundred years, someone wrote lines like these on the island every night. The last of them left in 1998, when the light was automated and the cottages were boarded up.',
  'Three of the last keepers still meet once a year, on the mainland, in a café that faces the island. They talk about the weather mostly, the way people do who once lived by it.',
  'Automation made the light more reliable, they say, and they mean it. A machine does not fall asleep, or catch the flu, or argue with the relief keeper about whose turn it is to polish the brass.',
  'What it does not do is notice things. The keepers noticed the fishing boat that sat too low in the water, the yacht with no lights, the swimmer who had misjudged the tide.',
  'Nobody writes those things down any more. The light turns, and the log is a file on a server that records only whether the lamp drew the right current.',
  'When the café closes, the three of them stand outside for a while and watch the beam come round. They do not say much. They do not need to.',
];
const COMPONENTS = [
  'I wanted a small widget for this blog: a list of the posts in a series, with the current one marked. Every tutorial I found started by installing a framework, a compiler and a dev server. I wanted none of them.',
  'Custom elements are built into every current browser. A class that extends HTMLElement, one call to customElements.define, and the browser does the rest.',
  "The trick that made it pleasant is declarative shadow DOM. The server sends the element's markup inside a template element marked shadowrootmode, and the browser attaches it as the element's shadow root while it parses the page, before any script runs.",
  'That means the widget renders without JavaScript, and the script only adds behaviour: marking the current post and remembering whether the list was collapsed.',
  'The styles live inside the template too, so nothing leaks out into the rest of the page, and nothing from the page leaks in.',
  'The whole thing is forty lines. It will still work in ten years, which is more than I can say for anything I have built with a framework.',
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const navLinks = (r, site, n) =>
  Array.from({ length: n }, () => {
    const words = slug(r, r.int(1, 3)).replace(/-/g, ' ');
    return `<li class="nav__item"><a class="nav__link" href="https://${site}/${slug(r, 2)}" data-track="nav:${slug(r, 1)}">${esc(words[0].toUpperCase() + words.slice(1))}</a></li>`;
  }).join('');
const scriptTags = (r, base, n) =>
  Array.from({ length: n }, () => `<script src="${base}/${slug(r, 1)}-${r.hex(16)}.js" defer=""></script>`).join('');
const relatedJson = (r, site, n) =>
  Array.from({ length: n }, () => ({ id: r.int(10000, 99999), slug: slug(r), title: slug(r).replace(/-/g, ' '), url: pageUrl(r, site), image: `https://${site}/images/${r.hex(24)}.jpg`, readingTime: r.int(3, 19) }));

function emptyPages() {
  const files = new Map();
  // 1: a single-page app; the article is only in the data the script renders from.
  {
    const r = seeded('empty/1.html');
    const site = 'ops-review.example';
    const data = {
      props: {
        pageProps: {
          article: {
            id: 48211, slug: 'your-backups-are-lying', title: 'Your Backups Are Lying to You', subtitle: 'A status code is not a restore.',
            author: { name: 'Ops Review Staff', slug: 'staff' }, publishedAt: '2026-10-14T06:00:00.000Z', readingTime: 6,
            tags: ['backups', 'databases', 'operations'],
            body: BACKUPS.map((text) => ({ type: 'paragraph', children: [{ text }] })),
          },
          related: relatedJson(r, site, 24),
          navigation: Array.from({ length: 30 }, () => ({ label: slug(r, 2).replace(/-/g, ' '), href: `/${slug(r, 2)}` })),
          newsletter: { enabled: true, listId: r.hex(12), copy: 'Get the week in operations, every Friday.' },
        },
        __N_SSG: true,
      },
      page: '/articles/[slug]', query: { slug: 'your-backups-are-lying' }, buildId: r.hex(21), isFallback: false, gsp: true, scriptLoader: [],
    };
    files.set('empty/1.html', `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width"/><title>Your Backups Are Lying to You | Ops Review</title><meta name="description" content="A status code is not a restore."/><meta property="og:title" content="Your Backups Are Lying to You"/><meta property="og:type" content="article"/><meta property="og:url" content="https://${site}/articles/your-backups-are-lying"/><meta name="next-head-count" content="7"/><link rel="preload" href="/_next/static/media/${r.hex(20)}.woff2" as="font" type="font/woff2" crossorigin="anonymous"/><link rel="preload" href="/_next/static/css/${r.hex(16)}.css" as="style"/><link rel="stylesheet" href="/_next/static/css/${r.hex(16)}.css" data-n-g=""/><noscript data-n-css=""></noscript><script defer="" nomodule="" src="/_next/static/chunks/polyfills-${r.hex(16)}.js"></script>${scriptTags(r, '/_next/static/chunks', 34)}</head><body><div id="__next"><div class="shell"><header class="shell__header"><span class="shell__logo" aria-label="Ops Review"></span></header><main class="shell__main"><div class="skeleton skeleton--title"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line skeleton--short"></div></main></div></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>\n`);
  }
  // 2: a consent wall; the article is fetched by script once someone agrees, so it is not in the page at all.
  {
    const r = seeded('empty/2.html');
    const site = 'the-daily-ledger.example';
    const purposes = ['Store and/or access information on a device', 'Use limited data to select advertising', 'Create profiles for personalised advertising', 'Measure advertising performance', 'Measure content performance', 'Understand audiences through statistics', 'Develop and improve services'];
    const vendors = Array.from({ length: 118 }, (_, i) => ({ id: i + 1, name: `${slug(r, 2).replace(/-/g, ' ')} ${r.pick(['Media', 'Ads', 'Analytics', 'Group', 'Labs', 'Data'])}`, purposes: purposes.filter(() => r.chance(0.5)).map((_, k) => k + 1), retentionDays: r.int(30, 730), privacyUrl: `https://${slug(r, 1)}.example/privacy` }));
    files.set('empty/2.html', `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>City approves new tram line after a decade of delays - The Daily Ledger</title><meta name="description" content="The council voted 31 to 9 to fund the eastern line."><link rel="canonical" href="https://${site}/city/2026/10/16/tram-line-approved"><link rel="stylesheet" href="https://${site}/assets/main.${r.hex(10)}.css"><script>window.__CMP_CONFIG__=${JSON.stringify({ version: 4, language: 'en', purposes, vendors, theme: { accent: '#0b5cad' } })}</script><script src="https://${site}/assets/cmp.${r.hex(10)}.js"></script><script src="https://${site}/assets/article-loader.${r.hex(10)}.js" defer></script></head>\n<body class="consent-required"><header class="masthead"><a class="masthead__logo" href="/">The Daily Ledger</a><nav><ul class="nav">${navLinks(r, site, 26)}</ul></nav></header>\n<div id="cmp-wall" role="dialog" aria-modal="true" aria-labelledby="cmp-title"><h2 id="cmp-title">We value your privacy</h2><p>We and our ${vendors.length} partners store and access information on your device, such as cookies, and process personal data, such as unique identifiers and standard information sent by a device, for personalised advertising and content, advertising and content measurement, and audience research.</p><p>You can accept, or manage your choices, including your right to object where legitimate interest is used. Your choices apply to this site only.</p><button class="cmp-accept" type="button">Accept all</button><button class="cmp-manage" type="button">Manage options</button><button class="cmp-subscribe" type="button">Subscribe instead</button></div>\n<main id="content" data-article-id="2026-10-16-tram-line" data-load="after-consent"></main>\n<footer class="footer"><ul>${navLinks(r, site, 40)}</ul><p>&copy; 2026 The Daily Ledger</p></footer></body></html>\n`);
  }
  // 3: a paywall; the visible page has no article text, the full text is only in the structured data.
  {
    const r = seeded('empty/3.html');
    const site = 'longform-weekly.example';
    const ld = {
      '@context': 'https://schema.org', '@type': 'NewsArticle', headline: 'The Last Lighthouse Keepers', datePublished: '2026-10-11T07:00:00Z',
      author: { '@type': 'Organization', name: 'Longform Weekly' }, isAccessibleForFree: false,
      hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.article-body' },
      articleBody: KEEPERS.join('\n\n'), wordCount: KEEPERS.join(' ').split(/\s+/).length,
    };
    files.set('empty/3.html', `<!DOCTYPE html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<title>The Last Lighthouse Keepers | Longform Weekly</title>\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta property="og:title" content="The Last Lighthouse Keepers">\n<meta property="og:description" content="Three men, one light, and the night it was switched to a timer.">\n<link rel="stylesheet" href="https://${site}/static/site.${r.hex(8)}.css">\n<style>${Array.from({ length: 60 }, () => `.${slug(r, 2)}{margin:${r.int(0, 32)}px ${r.int(0, 24)}px;font-size:${r.int(12, 22)}px;color:#${r.hex(6)}}`).join('')}</style>\n<script type="application/ld+json">${JSON.stringify(ld)}</script>\n${scriptTags(r, `https://${site}/static`, 12)}\n</head>\n<body class="article is-metered">\n<header class="site-header"><a href="/" class="logo">Longform Weekly</a><nav><ul>${navLinks(r, site, 22)}</ul></nav></header>\n<article class="feature">\n<header class="feature__header"><p class="kicker">Features</p><h1 class="feature__title">The Last Lighthouse Keepers</h1><p class="feature__dek">Three men, one light, and the night it was switched to a timer.</p><p class="byline">By the Longform Weekly desk · 11 October 2026 · 14 min read</p></header>\n<div class="article-body" data-paywalled="true"></div>\n<aside class="paywall"><h2>Keep reading with a subscription</h2><p>Longform Weekly is funded by its readers. Subscribe for unlimited access to every feature, the archive back to 1998, and the Sunday edition.</p><a class="button" href="/subscribe?ref=paywall">Subscribe from £5 a month</a><p class="small">Already a subscriber? <a href="/login">Sign in</a></p></aside>\n</article>\n<footer class="site-footer"><ul>${navLinks(r, site, 36)}</ul></footer>\n</body>\n</html>\n`);
  }
  // 4: declarative shadow DOM; the whole post is inside a template element.
  {
    const r = seeded('empty/4.html');
    const site = 'smallweb.example';
    files.set('empty/4.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Building a web component without a framework</title>\n<link rel="alternate" type="application/rss+xml" href="/feed.xml">\n<style>:root{--measure:36rem;--ink:#222}body{margin:0;font:18px/1.6 Georgia,serif;color:var(--ink)}header,footer{max-width:var(--measure);margin:2rem auto}</style>\n<script type="module" src="/js/series-list.js"></script>\n</head>\n<body>\n<header><a href="/">smallweb</a> · <a href="/archive">archive</a> · <a href="/about">about</a></header>\n<blog-post slug="web-components-without-a-framework">\n  <template shadowrootmode="open">\n    <style>:host{display:block;max-width:var(--measure);margin:0 auto}h1{font-size:2rem;line-height:1.2}p{margin:1.2em 0}.meta{color:#666;font-size:.9rem}</style>\n    <article>\n      <h1>Building a web component without a framework</h1>\n      <p class="meta">17 October 2026 · part 3 of <a href="/series/no-build">No build step</a></p>\n${COMPONENTS.map((p) => `      <p>${esc(p)}</p>`).join('\n')}\n      <series-list series="no-build"><template shadowrootmode="open"><ol>${Array.from({ length: 6 }, (_, i) => `<li><a href="/posts/${slug(r)}">Part ${i + 1}</a></li>`).join('')}</ol></template></series-list>\n    </article>\n  </template>\n</blog-post>\n<footer><p>Written by hand. No tracking. <a href="/feed.xml">RSS</a></p><ul>${Array.from({ length: 30 }, () => `<li><a href="/posts/${slug(r)}">${slug(r).replace(/-/g, ' ')}</a></li>`).join('')}</ul></footer>\n</body>\n</html>\n`);
  }
  const r = seeded('empty/links.txt');
  files.set('empty/links.txt', [
    'Four links whose article came out empty (word_count 0). Next to this file is what Satchel fetched for each.',
    '',
    `1.html  ${r.ulid(T('2026-10-16T21:04:11Z'))}  https://ops-review.example/articles/your-backups-are-lying  saved 2026-10-16 21:04 UTC`,
    `2.html  ${r.ulid(T('2026-10-16T07:42:55Z'))}  https://the-daily-ledger.example/city/2026/10/16/tram-line-approved  saved 2026-10-16 07:42 UTC`,
    `3.html  ${r.ulid(T('2026-10-12T10:13:40Z'))}  https://longform-weekly.example/features/the-last-lighthouse-keepers  saved 2026-10-12 10:13 UTC`,
    `4.html  ${r.ulid(T('2026-10-17T19:30:02Z'))}  https://smallweb.example/posts/web-components-without-a-framework  saved 2026-10-17 19:30 UTC`,
    '',
  ].join('\n'));
  return files;
}

// ---------------------------------------------------------------- Fly logs: the worker that died, the deploy, the crash

const BOOT = [
  'INFO Starting init (commit: 6c3309ba)...',
  'INFO Mounting /dev/vdb at /data w/ uid: 0, gid: 0 and chmod 0755',
  'INFO Resized /data to 3217031168 bytes',
  'INFO Preparing to run: `scripts/start.sh` as root',
  'INFO [fly api proxy] listening at /.fly/api',
];

function flyLogs() {
  const files = new Map();
  const r = seeded('fly');
  const users = userIds(r, 52);
  // The page being fetched when the worker was killed: one job, in Tuesday's log and again in Wednesday's.
  const big = {
    id: seeded('fly/big').ulid(T('2026-10-13T18:20:31Z')), kind: 'fetch_article', runAt: T('2026-10-13T18:20:31Z'),
    url: 'https://datahaus.example/reports/2026/annual-benchmark-results-full-tables', mix: 'normal',
  };
  const worker = (from, to, extraJobs = []) => {
    const web = browsing(seeded(`fly-web-${from}`), { from, to, every: 21 * SEC, users });
    const jobs = [...web.jobs.map((j) => ({ ...j, mix: 'normal' })), ...extraJobs];
    return { web, jobs };
  };

  // Tuesday 2026-10-13: the worker is killed for memory at 18:20:44, and nothing starts it again.
  {
    const from = T('2026-10-13T18:00:00Z');
    const to = T('2026-10-13T18:52:00Z');
    const oom = T('2026-10-13T18:20:44Z');
    const { web, jobs } = worker(from, to, [big]);
    const sim = workerRun({
      from, to: oom, jobs,
      run: (job) => (job.id === big.id ? { ms: 60 * SEC } : runJob(job)),
    });
    const lines = [
      ...healthChecks(from, to).map(asFly),
      ...web.lines.map(asFly),
      ...sim.lines.filter((l) => l.ms < oom).map(asFly),
      flyLine(oom, 'app', 'info', '[87345.512342] Out of memory: Killed process 318 (node) total-vm:1489220kB, anon-rss:401832kB, file-rss:0kB, shmem-rss:0kB, UID:0 pgtables:1388kB oom_score_adj:0'),
    ];
    for (const [k, v] of parts(null, sortLines(lines), 46_000, { base: 'fly/2026-10-13-evening' })) files.set(k, v);
  }

  // Wednesday 2026-10-14: no worker all morning; the deploy at 09:04 brings it back, with the night's fetches waiting.
  {
    const from = T('2026-10-14T08:40:00Z');
    const down = T('2026-10-14T09:04:20Z');
    const up = T('2026-10-14T09:04:41Z');
    const to = T('2026-10-14T09:18:00Z');
    const br = seeded('fly-backlog');
    const backlog = Array.from({ length: 1340 }, (_, i) => {
      const at = T('2026-10-13T18:21:00Z') + Math.floor((i / 1340) * (T('2026-10-14T08:40:00Z') - T('2026-10-13T18:21:00Z'))) + br.int(0, 20_000);
      return { id: br.ulid(at), kind: 'fetch_article', runAt: at, url: pageUrl(br), mix: 'normal' };
    });
    const before = browsing(seeded('fly-web-wed-morning'), { from, to: down, every: 19 * SEC, users });
    // The page that was being fetched when the worker died is still claimed, and comes back first.
    const { web, jobs } = worker(up + 6 * SEC, to, [big, ...backlog, ...before.jobs.map((j) => ({ ...j, mix: 'normal' }))]);
    const sim = workerRun({ from: up + 3 * SEC, to, jobs, run: (job) => (job.id === big.id ? { ms: 12_412 } : runJob(job)) });
    const deploy = `registry.fly.io/satchel:deployment-${r.ulid(T('2026-10-14T09:02:51Z'))}`;
    const lines = [
      ...healthChecks(from, down).map(asFly),
      ...healthChecks(up + 8 * SEC, to).map(asFly),
      ...before.lines.map(asFly),
      ...web.lines.map(asFly),
      flyLine(T('2026-10-14T09:04:03Z'), 'runner', 'info', `Pulling container image ${deploy}`),
      flyLine(T('2026-10-14T09:04:12Z'), 'runner', 'info', `Successfully prepared image ${deploy} (8.871s)`),
      flyLine(T('2026-10-14T09:04:13Z'), 'runner', 'info', 'Configuring firecracker'),
      flyLine(down, 'app', 'info', ' INFO Sending signal SIGTERM to main child process w/ PID 313'),
      flyLine(down + 210, 'app', 'info', 'litestream: signal received, litestream shutting down'),
      flyLine(down + 1500, 'app', 'info', 'litestream: shut down'),
      flyLine(down + 1600, 'app', 'info', ' INFO Main child exited normally with code: 0'),
      flyLine(down + 1700, 'app', 'info', ' INFO Starting clean up.'),
      flyLine(down + 1800, 'app', 'info', ' INFO Umounting /dev/vdb from /data'),
      flyLine(down + 2600, 'app', 'info', '[171234.882314] reboot: Restarting system'),
      flyLine(up - 3000, 'runner', 'info', 'Machine started in 1.171s'),
      flyLine(up - 2900, 'app', 'info', '[    0.041322] PCI: Fatal: No config space access function found'),
      ...BOOT.map((b, i) => flyLine(up - 2000 + i * 120, 'app', 'info', ` ${b}`)),
      flyLine(up, 'app', 'info', 'litestream: database already exists, skipping restore'),
      flyLine(up + 400, 'app', 'info', 'litestream v0.3.13 replicating: db=/data/satchel.db'),
      flyLine(up + 500, 'app', 'info', 'litestream: replicating to: name="s3" type="s3" bucket="satchel-db" path="satchel" region="eu-central-003"'),
      asFly(logLine('info', up + 2400, 'worker started', { poll_ms: 5000 })),
      asFly(logLine('info', up + 2600, 'listening', { port: 3000 })),
      flyLine(up + 9 * SEC, 'health', 'info', 'Health check on port 3000 is now passing.'),
      ...sim.lines.map(asFly),
    ];
    for (const [k, v] of parts(null, sortLines(lines), 46_000, { base: 'fly/2026-10-14-morning' })) files.set(k, v);
  }

  // Thursday 2026-10-15: the web server is killed for memory at 22:14:07, which ends the machine's main process.
  {
    const from = T('2026-10-15T21:52:00Z');
    const oom = T('2026-10-15T22:14:07Z');
    const back = T('2026-10-15T22:14:41Z');
    const to = T('2026-10-15T22:36:00Z');
    const { web, jobs } = worker(from, to);
    // Saves the proxy turned away never happened, so they enqueued nothing.
    const served = jobs.filter((j) => j.runAt < oom || j.runAt > back + 3 * SEC);
    const sim1 = workerRun({ from, to: oom, jobs: served, run: runJob });
    // The job in flight when the machine went down stays claimed, and is claimed again once the claim is ten minutes old.
    const left = sim1.queue
      .filter((q) => !q.done || (q.lastClaim < oom && q.endedAt >= oom))
      .map((q) => (q.lastClaim < oom && q.endedAt >= oom ? { ...q, done: false, runAt: q.lastClaim + 10 * MIN + 1 } : q));
    const sim2 = workerRun({ from: back + 4 * SEC, to, jobs: left, run: runJob });
    const lines = [
      ...healthChecks(from, oom).map(asFly),
      ...healthChecks(back + 9 * SEC, to).map(asFly),
      ...web.lines.filter((l) => l.ms < oom || l.ms > back + 3 * SEC).map(asFly),
      ...web.lines.filter((l) => l.ms >= oom && l.ms <= back + 3 * SEC).map((l) =>
        flyLine(l.ms, 'proxy', 'error', '[PC01] instance refused connection. is your app listening on 0.0.0.0:3000? make sure it is not only listening on 127.0.0.1 (hint: look at your startup logs, servers often print the address they are listening on)')),
      ...sim1.lines.filter((l) => l.ms < oom).map(asFly),
      flyLine(oom, 'app', 'info', '[323918.204471] Out of memory: Killed process 297 (node) total-vm:1502844kB, anon-rss:388412kB, file-rss:0kB, shmem-rss:0kB, UID:0 pgtables:1404kB oom_score_adj:0'),
      flyLine(oom + 180, 'app', 'info', 'litestream: subprocess exited: signal: killed'),
      flyLine(oom + 260, 'app', 'info', 'litestream: shut down'),
      flyLine(oom + 400, 'app', 'info', ' INFO Main child exited normally with code: 1'),
      flyLine(oom + 500, 'app', 'info', ' INFO Starting clean up.'),
      flyLine(oom + 600, 'app', 'info', ' INFO Umounting /dev/vdb from /data'),
      flyLine(oom + 1400, 'app', 'info', '[323919.401132] reboot: Restarting system'),
      flyLine(oom + 15 * SEC, 'health', 'warn', 'Health check on port 3000 has failed. Your app is not responding properly. Services exposed on ports [80, 443] will have intermittent failures until the health check passes.'),
      flyLine(back - 4000, 'runner', 'info', 'machine has exited with exit code 1, restarting (attempt 1 of 10)'),
      flyLine(back - 3000, 'runner', 'info', 'Machine started in 1.104s'),
      flyLine(back - 2900, 'app', 'info', '[    0.040871] PCI: Fatal: No config space access function found'),
      ...BOOT.map((b, i) => flyLine(back - 2000 + i * 120, 'app', 'info', ` ${b}`)),
      flyLine(back, 'app', 'info', 'litestream: database already exists, skipping restore'),
      flyLine(back + 400, 'app', 'info', 'litestream v0.3.13 replicating: db=/data/satchel.db'),
      flyLine(back + 1200, 'app', 'info', 'litestream: sync: wal header mismatch at generation=9b1e4f20c7d83a56, starting a new generation'),
      flyLine(back + 1300, 'app', 'info', 'litestream: sync: new generation "e04c7a19b2f6d835", wal header mismatch'),
      asFly(logLine('info', back + 2400, 'worker started', { poll_ms: 5000 })),
      asFly(logLine('info', back + 2600, 'listening', { port: 3000 })),
      flyLine(back + 10 * SEC, 'health', 'info', 'Health check on port 3000 is now passing.'),
      ...sim2.lines.map(asFly),
    ];
    for (const [k, v] of parts(null, sortLines(lines), 46_000, { base: 'fly/2026-10-15-night' })) files.set(k, v);
  }
  return files;
}

// ---------------------------------------------------------------- Litestream

function litestream() {
  const r = seeded('litestream');
  const G1 = '9b1e4f20c7d83a56';
  const G2 = 'e04c7a19b2f6d835';
  const lines = [];
  const add = (ms, text) => lines.push({ ms, text: `${iso(ms).slice(0, 19)}Z ${text}` });
  let index = 1418;
  for (let d = T('2026-10-12T00:00:00Z'); d <= T('2026-10-18T00:00:00Z'); d += DAY) {
    const gen = d < T('2026-10-15T22:14:07Z') ? G1 : G2;
    index += r.int(18, 31);
    const size = 702_913_024 + Math.floor(((d - T('2026-10-12T00:00:00Z')) / DAY) * r.int(4_100_000, 5_300_000));
    add(d + r.int(1, 4) * SEC, `litestream: write snapshot satchel/s3 generation=${gen} index=${index} size=${size}`);
    add(d + r.int(140, 220) * SEC, `litestream: snapshot uploaded generation=${gen} index=${index} elapsed=${(r.int(1400, 2600) / 10).toFixed(1)}s`);
    const old = d - 7 * DAY;
    add(d + r.int(230, 260) * SEC, `litestream: retention: removed snapshot generation=${G1} created=${iso(old).slice(0, 10)}T00:00:0${r.int(1, 4)}Z`);
    for (let h = 1; h < 24; h += r.int(3, 7)) add(d + h * HOUR + r.int(0, 3500) * SEC, `litestream: checkpoint: mode=PASSIVE generation=${gen} wal=${r.int(4, 61)}MB`);
  }
  // The deploy on Wednesday morning: a clean shutdown, and the same generation carries on.
  add(T('2026-10-14T09:04:20Z'), 'litestream: signal received, litestream shutting down');
  add(T('2026-10-14T09:04:21Z'), `litestream: sync: final wal segment uploaded generation=${G1} index=${index - 92}`);
  add(T('2026-10-14T09:04:21Z'), 'litestream: shut down');
  add(T('2026-10-14T09:04:41Z'), 'litestream: database already exists, skipping restore');
  add(T('2026-10-14T09:04:41Z'), 'litestream v0.3.13 replicating: db=/data/satchel.db');
  add(T('2026-10-14T09:04:42Z'), `litestream: sync: resumed generation=${G1} index=${index - 92}`);
  // Thursday night's crash: the last second never reached the replica, so a new generation starts from the file on the volume.
  add(T('2026-10-15T22:14:06Z'), `litestream: sync: wal segment uploaded generation=${G1} index=${index - 66} offset=4120576`);
  add(T('2026-10-15T22:14:07Z'), 'litestream: subprocess exited: signal: killed');
  add(T('2026-10-15T22:14:07Z'), 'litestream: shut down');
  add(T('2026-10-15T22:14:41Z'), 'litestream: database already exists, skipping restore');
  add(T('2026-10-15T22:14:41Z'), 'litestream v0.3.13 replicating: db=/data/satchel.db');
  add(T('2026-10-15T22:14:42Z'), `litestream: sync: wal header mismatch at generation=${G1} index=${index - 66}, starting a new generation`);
  add(T('2026-10-15T22:14:42Z'), `litestream: sync: new generation "${G2}", wal header mismatch`);
  add(T('2026-10-15T22:14:43Z'), `litestream: write snapshot satchel/s3 generation=${G2} index=0 size=716203520`);
  add(T('2026-10-15T22:17:58Z'), `litestream: snapshot uploaded generation=${G2} index=0 elapsed=195.2s`);
  // Saturday's import: the worker and the web process hold the write lock in turn, and checkpoints wait.
  for (let t = T('2026-10-17T06:47:30Z'); t < T('2026-10-17T07:52:00Z'); t += r.int(180, 420) * SEC) {
    add(t, `litestream: checkpoint: database is locked, will retry generation=${G2}`);
  }
  const log = `${sortLines(lines).join('\n')}\n`;
  const snapshots = [
    'replica  generation        index  size       created',
    ...Array.from({ length: 4 }, (_, i) => `s3       ${G1}  ${1418 + 25 * (i + 1)}  ${702_913_024 + i * 4_700_000}  2026-10-${String(12 + i).padStart(2, '0')}T00:00:0${i + 1}Z`),
    `s3       ${G2}  0      716203520  2026-10-15T22:14:43Z`,
    ...Array.from({ length: 3 }, (_, i) => `s3       ${G2}  ${31 + 27 * i}     ${719_884_288 + i * 4_900_000}  2026-10-${String(16 + i).padStart(2, '0')}T00:00:0${i + 2}Z`),
    '',
  ].join('\n');
  const generations = [
    'name  generation        lag      start                 end',
    `s3    ${G1}  -        2026-10-04T13:42:18Z  2026-10-15T22:14:06Z`,
    `s3    ${G2}  1.4s     2026-10-15T22:14:43Z  2026-10-18T11:59:57Z`,
    '',
  ].join('\n');
  return new Map([['litestream/litestream.log', log], ['litestream/snapshots.txt', snapshots], ['litestream/generations.txt', generations]]);
}

// ---------------------------------------------------------------- Paddle

function paddle() {
  const r = seeded('paddle');
  const pid = (prefix, ms) => `${prefix}_${r.ulid(ms).toLowerCase()}`;
  const micro = (ms) => `${iso(ms).slice(0, 23)}${r.int(100, 999)}Z`;
  const PRICE = { id: 'pri_01j4yq7p3z8m2c6v1k0t9w5r3n', description: 'Satchel monthly', product_id: 'pro_01j4yq5s0x2b7n4m8q1v3c6z9d', billing_cycle: { interval: 'month', frequency: 1 }, unit_price: { amount: '400', currency_code: 'USD' } };
  const customers = [];
  const users = [];
  const people = ['ana.s', 'bruno.m', 'carla.f', 'diogo.t', 'eva.l', 'filipe.r', 'gabriela.n', 'hugo.p', 'joao.v', 'lara.b'];
  const domains = ['post.example', 'mailbox.example', 'inbox.example'];
  for (const [i, name] of people.entries()) {
    const created = T('2026-06-24T00:00:00Z') + r.int(0, 100) * DAY + r.int(0, 86_000) * SEC;
    const user = { id: r.ulid(T('2026-06-01T00:00:00Z') + r.int(0, 100) * DAY), email: `${name}@${domains[i % 3]}`, plan: 'paid' };
    const customer = { id: pid('ctm', created), email: user.email, created_at: micro(created) };
    user.paddle_customer_id = customer.id;
    user.paddle_subscription_id = pid('sub', created + 40 * SEC);
    users.push(user);
    customers.push({ customer, user, sub: user.paddle_subscription_id, started: created });
  }
  const marta = { id: r.ulid(T('2026-06-30T19:12:00Z')), email: 'marta.reis@post.example', plan: 'free', paddle_customer_id: null, paddle_subscription_id: null };
  const martaCustomer = { id: pid('ctm', T('2026-08-27T21:40:12Z')), email: marta.email, created_at: '2026-08-27T21:40:12.481203Z' };
  const martaTxn = pid('txn', T('2026-08-27T21:40:13Z'));
  const martaSub = pid('sub', T('2026-10-12T19:04:09Z'));

  const notifications = [];
  const events = [];
  const notify = (type, ms, data, { delivered = true } = {}) => {
    const event = { event_id: pid('evt', ms), event_type: type, occurred_at: micro(ms), notification_id: pid('ntf', ms + 300), data };
    events.push({ event, ms });
    notifications.push({
      id: event.notification_id, type, status: delivered ? 'delivered' : 'failed', payload: event, occurred_at: event.occurred_at,
      delivered_at: micro(ms + r.int(300, 2400)), replayed_at: null, origin: 'event', last_attempt_at: micro(ms + r.int(300, 2400)), retry_at: null,
      times_attempted: 1, notification_setting_id: 'ntfset_01j4yr2b8x6n0q3m7v5c9z1k4t',
    });
  };
  const subscription = (c, status, ms, extra = {}) => ({
    id: c.sub, status, customer_id: c.customer.id, address_id: `add_${c.customer.id.slice(4)}`, business_id: null, currency_code: 'USD',
    created_at: micro(c.started), updated_at: micro(ms), started_at: micro(c.started), first_billed_at: micro(c.started),
    next_billed_at: micro(ms + 30 * DAY), paused_at: null, canceled_at: null, collection_mode: 'automatic',
    billing_details: null, current_billing_period: { starts_at: micro(ms), ends_at: micro(ms + 30 * DAY) },
    billing_cycle: { interval: 'month', frequency: 1 }, scheduled_change: null,
    items: [{ status: 'active', quantity: 1, recurring: true, created_at: micro(c.started), updated_at: micro(ms), price: PRICE }],
    custom_data: c.user ? { user_id: c.user.id } : null, management_urls: { update_payment_method: null, cancel: null }, ...extra,
  });
  const transaction = (c, status, ms, origin, extra = {}) => ({
    id: pid('txn', ms), status, customer_id: c.customer.id, address_id: `add_${c.customer.id.slice(4)}`, business_id: null,
    custom_data: c.user ? { user_id: c.user.id } : null, origin, collection_mode: 'automatic', subscription_id: c.sub,
    invoice_id: status === 'completed' ? pid('inv', ms) : null, invoice_number: status === 'completed' ? `${r.int(14000, 15999)}-${r.int(10000, 99999)}` : null,
    billing_period: { starts_at: micro(ms), ends_at: micro(ms + 30 * DAY) }, currency_code: 'USD',
    details: { totals: { subtotal: '400', tax: String(r.pick([0, 0, 76, 84, 92])), discount: '0', total: '400', currency_code: 'USD' } },
    items: [{ price: PRICE, quantity: 1 }], created_at: micro(ms), updated_at: micro(ms + 2000), billed_at: status === 'completed' ? micro(ms + 2000) : null, ...extra,
  });

  // Renewals, a cancellation, a failed payment and two new customers: the ordinary fortnight.
  const from = T('2026-10-06T00:00:00Z');
  for (const c of customers) {
    let renew = c.started;
    while (renew < from) renew += 30 * DAY;
    if (renew > T('2026-10-20T00:00:00Z')) continue;
    if (c.customer.email.startsWith('hugo')) {
      notify('transaction.payment_failed', renew, transaction(c, 'past_due', renew, 'subscription_recurring', { payments: [{ status: 'error', error_code: 'declined' }] }));
      notify('subscription.past_due', renew + 2 * SEC, subscription(c, 'past_due', renew));
      notify('transaction.completed', renew + 3 * DAY + 9 * HOUR, transaction(c, 'completed', renew + 3 * DAY + 9 * HOUR, 'subscription_payment_method_change'));
      notify('subscription.updated', renew + 3 * DAY + 9 * HOUR + 3 * SEC, subscription(c, 'active', renew + 3 * DAY + 9 * HOUR));
      continue;
    }
    notify('transaction.created', renew - 10 * SEC, transaction(c, 'ready', renew - 10 * SEC, 'subscription_recurring'));
    notify('transaction.completed', renew, transaction(c, 'completed', renew, 'subscription_recurring'));
    notify('subscription.updated', renew + 2 * SEC, subscription(c, 'active', renew));
  }
  const leaving = customers.find((c) => c.customer.email.startsWith('eva'));
  notify('subscription.updated', T('2026-10-09T20:31:44Z'), subscription(leaving, 'active', T('2026-10-09T20:31:44Z'), { scheduled_change: { action: 'cancel', effective_at: micro(T('2026-10-24T13:02:11Z')), resume_at: null } }));
  for (const name of ['olga.k', 'pedro.g']) {
    const ms = T(name === 'olga.k' ? '2026-10-08T12:20:05Z' : '2026-10-16T08:51:39Z');
    const user = { id: r.ulid(ms - r.int(5, 60) * DAY), email: `${name}@inbox.example`, plan: 'paid' };
    const c = { customer: { id: pid('ctm', ms), email: user.email, created_at: micro(ms) }, user, sub: pid('sub', ms + 9 * SEC), started: ms };
    user.paddle_customer_id = c.customer.id;
    user.paddle_subscription_id = c.sub;
    users.push(user);
    notify('customer.created', ms, { ...c.customer, name: null, marketing_consent: false, status: 'active', custom_data: null, locale: 'en', updated_at: c.customer.created_at, import_meta: null });
    notify('transaction.completed', ms + 8 * SEC, transaction(c, 'completed', ms + 8 * SEC, 'web'));
    notify('subscription.created', ms + 9 * SEC, subscription(c, 'active', ms + 9 * SEC));
    notify('subscription.activated', ms + 9 * SEC + 400, subscription(c, 'active', ms + 9 * SEC + 400));
  }
  // Marta pays, at last, for the transaction the move to Paddle made for her in August. It carries no user.
  const m = { customer: martaCustomer, user: null, sub: martaSub, started: T('2026-10-12T19:04:09Z') };
  const paid = T('2026-10-12T19:04:01Z');
  notify('transaction.paid', paid, transaction(m, 'paid', paid, 'web', { id: martaTxn, created_at: '2026-08-27T21:40:13.552781Z', billing_period: { starts_at: micro(paid), ends_at: micro(paid + 30 * DAY) } }));
  notify('subscription.created', paid + 8 * SEC, subscription(m, 'active', paid + 8 * SEC, { transaction_id: martaTxn }));
  notify('subscription.activated', paid + 8 * SEC + 300, subscription(m, 'active', paid + 8 * SEC + 300));
  notify('transaction.completed', paid + 10 * SEC, transaction(m, 'completed', paid + 10 * SEC, 'web', { id: martaTxn, created_at: '2026-08-27T21:40:13.552781Z' }));

  events.sort((a, b) => a.ms - b.ms);
  notifications.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const received = events.map(({ event, ms }) => [event.event_id, event.event_type, event.occurred_at, iso(ms + r.int(400, 2600))].join('\t'));
  const jobRows = [];
  for (const { event, ms } of events.filter((e) => e.event.event_type.startsWith('subscription.'))) {
    const isMarta = event.data.customer_id === martaCustomer.id;
    const id = r.ulid(ms + 1500);
    if (!isMarta) {
      jobRows.push([id, 'paddle_event', iso(ms + 1500), 1, iso(ms + 1500 + r.int(2, 5000)), ''].join('\t'));
      continue;
    }
    let at = ms + 1500;
    for (let attempt = 1; attempt <= 5; attempt += 1) at += attempt === 1 ? r.int(1, 5000) : 2 ** (attempt - 2) * MIN + r.int(1, 5000);
    jobRows.push([id, 'paddle_event', iso(at), 5, iso(at + 19), `Error: no user for paddle customer ${martaCustomer.id}\\n    at paddleEvent (file:///app/src/jobs/handlers/paddle-event.js:16:21)\\n${TICKS.trim()}\\n${AT_WORKER.trim()}`].join('\t'));
  }
  users.push(marta);
  const usersTsv = ['id\temail\tplan\tpaddle_customer_id\tpaddle_subscription_id', ...users.map((u) => [u.id, u.email, u.plan, u.paddle_customer_id ?? '', u.paddle_subscription_id ?? ''].join('\t'))];
  const customer = {
    data: { id: martaCustomer.id, name: 'Marta Reis', email: marta.email, marketing_consent: false, status: 'active', custom_data: null, locale: 'pt', created_at: martaCustomer.created_at, updated_at: '2026-10-12T19:04:02.118204Z', import_meta: null },
    meta: { request_id: `${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}` },
  };
  return new Map([
    ['paddle/notifications.json', `${JSON.stringify(notifications, null, 2)}\n`],
    ['paddle/webhook_events.tsv', `${['id\ttype\toccurred_at\treceived_at', ...received].join('\n')}\n`],
    ['paddle/paddle-jobs.tsv', `${['id\tkind\trun_at\tattempts\tdone_at\tlast_error', ...jobRows].join('\n')}\n`],
    ['paddle/users.tsv', `${usersTsv.join('\n')}\n`],
    ['paddle/customer.json', `${JSON.stringify(customer, null, 2)}\n`],
  ]);
}

// ---------------------------------------------------------------- Postmark

function postmark() {
  const r = seeded('postmark');
  const bounces = [];
  const add = (b, ms) =>
    bounces.push({
      ID: 4_323_372_036_854_000_000 + bounces.length * 7919 + r.int(0, 7000), Type: b.type, TypeCode: b.code, Name: b.name, Tag: b.tag,
      MessageID: `${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}`, ServerID: 112_844, MessageStream: b.stream,
      Description: b.description, Details: b.details, Email: b.email, From: 'hello@satchel.example', BouncedAt: iso(ms),
      DumpAvailable: true, Inactive: b.inactive, CanActivate: b.inactive, Subject: b.tag === 'digest' ? `${r.int(3, 14)} links waiting in Satchel` : 'Your Satchel sign-in link',
    });
  const span = (from) => T(from) + r.int(0, 29) * DAY + r.int(0, 86_000) * SEC;
  // Mistyped addresses at sign-in: domains that do not exist, and mailboxes that do not.
  const typos = ['mailbox.exmaple', 'post.exampel', 'inbox.examle', 'mailbx.example', 'post.exmple'];
  for (let i = 0; i < 30; i += 1) {
    const domain = r.pick(typos);
    add({ type: 'DnsError', code: 256, name: 'DNS error', tag: 'magic-link', stream: 'outbound', description: 'The server could not temporarily deliver your message (ex: Message is delayed due to network troubles).', details: `DNS lookup failed for ${domain}: no MX or A record`, email: `${slug(r, 1)}.${slug(r, 1)}${r.int(1, 99)}@${domain}`, inactive: true }, span('2026-09-20T00:00:00Z'));
  }
  for (let i = 0; i < 12; i += 1) {
    add({ type: 'HardBounce', code: 1, name: 'Hard bounce', tag: 'magic-link', stream: 'outbound', description: 'The server was unable to deliver your message (ex: unknown user, mailbox not found).', details: 'smtp;550 5.1.1 The email account that you tried to reach does not exist.', email: `${slug(r, 1)}${r.pick(['', '.', '_'])}${slug(r, 1)}@${r.pick(['mailbox.example', 'post.example', 'inbox.example'])}`, inactive: true }, span('2026-09-20T00:00:00Z'));
  }
  // People who have left a company: the digest keeps going to them.
  for (let i = 0; i < 10; i += 1) {
    add({ type: 'HardBounce', code: 1, name: 'Hard bounce', tag: 'digest', stream: 'broadcast', description: 'The server was unable to deliver your message (ex: unknown user, mailbox not found).', details: 'smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup', email: `${slug(r, 1)}.${slug(r, 1)}@${r.pick(['acme-consulting.example', 'northwind-legal.example'])}`, inactive: true }, span('2026-09-20T00:00:00Z'));
  }
  // Spam complaints, all about the digest.
  for (let i = 0; i < 5; i += 1) {
    add({ type: 'SpamComplaint', code: 512, name: 'Spam complaint', tag: 'digest', stream: 'broadcast', description: 'The subscriber explicitly marked this message as spam.', details: 'Feedback loop report from the recipient\'s mail provider', email: `${slug(r, 1)}${r.int(10, 99)}@${r.pick(['mailbox.example', 'inbox.example'])}`, inactive: true }, span('2026-09-20T00:00:00Z'));
  }
  // One domain refuses the digest outright: it checks DMARC alignment, and the broadcast stream is not aligned.
  for (let i = 0; i < 22; i += 1) {
    add({ type: 'Blocked', code: 100006, name: 'ISP block', tag: 'digest', stream: 'broadcast', description: 'The message was blocked by the recipient\'s mail server.', details: 'smtp;550 5.7.509 Access denied, sending domain satchel.example does not pass DMARC verification and has a DMARC policy of reject.', email: `${slug(r, 1)}.${slug(r, 1)}@lisbon-studio.example`, inactive: false }, span('2026-09-20T00:00:00Z'));
  }
  // The ordinary noise: full mailboxes and greylisting, which retries on its own.
  for (let i = 0; i < 18; i += 1) {
    const full = r.chance(0.5);
    add({ type: full ? 'SoftBounce' : 'Transient', code: full ? 4096 : 2, name: full ? 'Soft bounce/Undeliverable' : 'Message delayed/Undeliverable', tag: r.pick(['digest', 'magic-link']), stream: 'outbound', description: full ? 'Unable to temporarily deliver this message.' : 'The server could not temporarily deliver your message.', details: full ? 'smtp;552 5.2.2 The email account that you tried to reach is over quota.' : 'smtp;451 4.7.1 Greylisted, please try again later', email: `${slug(r, 1)}${r.int(1, 999)}@${r.pick(['mailbox.example', 'post.example', 'inbox.example'])}`, inactive: false }, span('2026-09-20T00:00:00Z'));
  }
  bounces.sort((a, b) => a.BouncedAt.localeCompare(b.BouncedAt));
  const count = (f) => bounces.filter(f).length;
  const stats = {
    Period: { From: '2026-09-20', To: '2026-10-19' }, Sent: 9_421, Bounced: bounces.length, SMTPApiErrors: 0,
    BounceRate: Number(((bounces.length / 9_421) * 100).toFixed(2)), SpamComplaints: 5, SpamComplaintsRate: 0.09,
    Tags: [
      { Tag: 'magic-link', Sent: 3_642, Bounced: count((b) => b.Tag === 'magic-link'), SpamComplaints: 0 },
      { Tag: 'digest', Sent: 5_779, Bounced: count((b) => b.Tag === 'digest'), SpamComplaints: 5 },
    ],
    Streams: [
      { Stream: 'outbound', Sent: 3_642, Bounced: count((b) => b.MessageStream === 'outbound'), ReturnPath: 'pm-bounces.satchel.example', DKIM: 'satchel.example' },
      { Stream: 'broadcast', Sent: 5_779, Bounced: count((b) => b.MessageStream === 'broadcast'), ReturnPath: 'pm.mtasv.net', DKIM: 'pm.mtasv.net' },
    ],
  };
  return new Map([
    ['postmark/bounces.json', `${JSON.stringify({ TotalCount: bounces.length, Bounces: bounces }, null, 2)}\n`],
    ['postmark/stats.json', `${JSON.stringify(stats, null, 2)}\n`],
  ]);
}

// ---------------------------------------------------------------- search

function search() {
  const r = seeded('search');
  const heavy = userIds(r, 6);
  const light = userIds(r, 30);
  const lines = [];
  for (let i = 0; i < 230; i += 1) {
    const ms = T('2026-10-12T00:00:00Z') + Math.floor(r.next() * 7 * DAY);
    const isHeavy = r.chance(0.82);
    lines.push(requestLine(ms, 'GET', '/search', 200, isHeavy ? Math.floor(r.around(2900, 0.55)) : Math.floor(r.around(720, 0.25)), isHeavy ? r.pick(heavy) : r.pick(light)));
  }
  const timings = `${sortLines(lines).filter((l) => JSON.parse(l).ms >= 600).join('\n')}\n`;
  const plan = (terms, own, all, ms, tmp = true) => [
    `-- ${terms}: ${ms} ms`,
    `sqlite> SELECT count(*) FROM articles_fts WHERE articles_fts MATCH '${terms}';`,
    String(all),
    `sqlite> SELECT count(*) FROM articles_fts JOIN articles a ON a.rowid = articles_fts.rowid JOIN links l ON l.id = a.link_id WHERE articles_fts MATCH '${terms}' AND l.user_id = '${heavy[0]}';`,
    String(own),
    'sqlite> EXPLAIN QUERY PLAN <src/search/search.sql with these terms>',
    'QUERY PLAN',
    '|--SCAN articles_fts VIRTUAL TABLE INDEX 0:M2',
    '|--SEARCH a USING INTEGER PRIMARY KEY (rowid=?)',
    '|--SEARCH l USING INDEX sqlite_autoindex_links_1 (id=?)',
    ...(tmp ? ['`--USE TEMP B-TREE FOR ORDER BY'] : []),
    `Run Time: real ${(ms / 1000).toFixed(3)} user ${((ms * 0.83) / 1000).toFixed(6)} sys ${((ms * 0.12) / 1000).toFixed(6)}`,
    '',
  ];
  const explain = [
    'The slowest searches I could reproduce, run by hand against a copy of production, for the account that searches most.',
    `That account has 11,204 links and 10,962 articles. The whole database has 61,388 articles from 214 accounts.`,
    'Each search is src/search/search.sql with the terms quoted the way ftsTerms() quotes them.',
    '',
    ...plan('"data"', 1_207, 9_874, 2_912),
    ...plan('"sqlite"', 412, 3_120, 1_034),
    ...plan('"the" "web"', 3_088, 41_602, 9_480),
    ...plan('"design"', 966, 12_455, 3_607),
    ...plan('"lighthouse"', 3, 21, 4, false),
    '-- for comparison, the same account, the bm25 and snippet calls taken out:',
    `sqlite> SELECT l.id FROM articles_fts JOIN articles a ON a.rowid = articles_fts.rowid JOIN links l ON l.id = a.link_id WHERE articles_fts MATCH '"the" "web"' AND l.user_id = '${heavy[0]}' LIMIT 50;`,
    'Run Time: real 0.412 user 0.351904 sys 0.048112',
    '',
    'sqlite> PRAGMA compile_options;  (abridged)',
    'ENABLE_FTS5',
    'THREADSAFE=1',
    '',
  ].join('\n');
  return new Map([['search/timings.log', timings], ['search/explain.txt', explain]]);
}

// ---------------------------------------------------------------- Sunday's traffic (2026-10-18)

function sundayTraffic() {
  const r = seeded('requests-2026-10-18');
  const from = T('2026-10-18T02:40:00Z');
  const to = T('2026-10-18T04:10:00Z');
  const users = userIds(r, 40);
  const web = browsing(r, { from, to, every: 45 * SEC, users });
  const scraper = r.ulid(T('2026-10-18T03:08:21Z'));
  const token = r.token();
  const asked = T('2026-10-18T03:07:41Z');
  const opened = T('2026-10-18T03:08:21Z');
  const lines = [
    ...healthChecks(from, to),
    ...web.lines,
    requestLine(asked, 'POST', '/sign-in', 200, 8, null),
    requestLine(opened, 'GET', `/auth/${token}`, 302, 6, null),
  ];
  const probes = ['/.env', '/wp-login.php', '/admin', '/api/links', '/api/users', '/.git/config', '/export', '/backup.sql', '/server-status', '/graphql'];
  for (let t = T('2026-10-18T03:10:02Z'); t < T('2026-10-18T03:25:10Z'); t += r.int(900, 2100)) {
    const roll = r.next();
    if (roll < 0.78) lines.push(requestLine(t, 'GET', `/read/${r.ulid(T('2026-05-26T00:00:00Z') + r.next() * 140 * DAY)}`, 404, r.int(1, 3), scraper));
    else if (roll < 0.86) lines.push(requestLine(t, 'GET', `/auth/${r.token()}`, 410, r.int(2, 4), null));
    else if (roll < 0.9) lines.push(requestLine(t, 'GET', '/search', 200, r.int(3, 9), scraper));
    else if (roll < 0.94) lines.push(requestLine(t, 'GET', `/tags/${r.pick(WORDS)}`, 200, r.int(2, 6), scraper));
    else if (roll < 0.97) lines.push(requestLine(t, 'GET', r.pick(probes), 404, 1, scraper));
    else lines.push(requestLine(t, 'GET', r.pick(['/', '/done', '/archive', '/account']), 200, r.int(2, 7), scraper));
  }
  return {
    files: parts('requests-2026-10-18', sortLines(lines)),
    // The week of sign-ins shows this one too.
    signIn: { asked, id: r.ulid(asked), token, email: 'reads.a.lot.2026@mailbox.example', claimed: asked + 2140, sent: asked + 2431, opens: [{ at: opened, status: 302 }] },
  };
}

// ---------------------------------------------------------------- memory, packages, database size, support, stats

function memory() {
  const r = seeded('fly-memory');
  const rows = ['time,server_rss_mb,worker_rss_mb,litestream_rss_mb,machine_used_mb,machine_total_mb'];
  let worker = 71.4;
  const deploy = T('2026-10-18T10:12:00Z');
  for (let t = T('2026-10-16T00:00:00Z'); t < T('2026-10-20T00:00:00Z'); t += 10 * MIN) {
    if (t >= deploy && t < deploy + 10 * MIN) worker = 70.2;
    const burst = t >= T('2026-10-17T06:45:00Z') && t < T('2026-10-17T07:55:00Z');
    const daytime = new Date(t).getUTCHours() >= 7 && new Date(t).getUTCHours() <= 22;
    worker += (daytime ? 0.38 : 0.14) + (burst ? 2.1 : 0) + (r.next() - 0.5) * 0.16;
    const server = 96 + r.next() * 14;
    const ls = 34 + r.next() * 6;
    rows.push([iso(t).slice(0, 16) + 'Z', server.toFixed(1), worker.toFixed(1), ls.toFixed(1), (server + worker + ls + 61 + r.next() * 9).toFixed(1), '512'].join(','));
  }
  return new Map([['fly-memory.csv', `${rows.join('\n')}\n`]]);
}

function pnpmReports() {
  const outdated = [
    '┌──────────────────────┬─────────┬────────┐',
    '│ Package              │ Current │ Latest │',
    '├──────────────────────┼─────────┼────────┤',
    '│ hono                 │ 4.10.1  │ 4.12.3 │',
    '├──────────────────────┼─────────┼────────┤',
    '│ @hono/node-server    │ 1.19.5  │ 1.20.1 │',
    '├──────────────────────┼─────────┼────────┤',
    '│ better-sqlite3       │ 12.4.1  │ 12.6.0 │',
    '├──────────────────────┼─────────┼────────┤',
    '│ htmx.org             │ 2.0.7   │ 2.0.9  │',
    '├──────────────────────┼─────────┼────────┤',
    '│ pagesift             │ 0.4.2   │ 0.5.0  │',
    '├──────────────────────┼─────────┼────────┤',
    '│ @biomejs/biome (dev) │ 2.2.6   │ 2.3.2  │',
    '└──────────────────────┴─────────┴────────┘',
    '',
  ].join('\n');
  const advisory = (id, module, severity, title, vulnerable, patched, version, paths, overview, cwe) => [
    String(id),
    {
      findings: [{ version, paths }], id, created: '2026-09-30T14:02:11.000Z', updated: '2026-10-08T09:41:52.000Z', deleted: null,
      title, found_by: null, reported_by: null, module_name: module, cves: [], vulnerable_versions: vulnerable, patched_versions: patched,
      overview, recommendation: `Upgrade to version ${patched.replace('>=', '')} or later`, references: '', access: 'public', severity, cwe,
      metadata: { module_type: '', exploitability: severity === 'high' ? 6 : 3, affected_components: '' },
    },
  ];
  const audit = {
    actions: [
      { action: 'update', module: 'hono', target: '4.11.2', depth: 1, resolves: [{ id: 1104471, path: 'hono', dev: false, optional: false, bundled: false }] },
      { action: 'update', module: 'tar-fs', target: '2.1.4', depth: 3, resolves: [{ id: 1104502, path: 'better-sqlite3>prebuild-install>tar-fs', dev: false, optional: false, bundled: false }] },
      { action: 'update', module: '@hono/node-server', target: '1.19.7', depth: 1, resolves: [{ id: 1104520, path: '@hono/node-server', dev: false, optional: false, bundled: false }] },
    ],
    advisories: Object.fromEntries([
      advisory(1104471, 'hono', 'moderate', 'serveStatic can read files outside its root on Windows when a path holds encoded backslashes', '<4.11.2', '>=4.11.2', '4.10.1', ['hono'],
        'On Windows, the serveStatic middleware decoded a percent-encoded backslash after checking the path against its root, so a request such as /css/..%5c..%5cconfig could read files outside the static folder. Servers on Linux and macOS are not affected, since the backslash is not a path separator there.', ['CWE-22']),
      advisory(1104502, 'tar-fs', 'high', 'Link following when extracting a crafted tarball', '<2.1.4', '>=2.1.4', '2.1.2', ['better-sqlite3>prebuild-install>tar-fs'],
        'A crafted tarball can make tar-fs write outside the directory it extracts into by way of a symbolic link. prebuild-install uses tar-fs to unpack the prebuilt binary it downloads at install time; the code that runs the application does not use it.', ['CWE-59']),
      advisory(1104520, '@hono/node-server', 'low', 'Response headers may be written twice when a response stream errors', '<1.19.7', '>=1.19.7', '1.19.5', ['@hono/node-server'],
        'When a streamed response body threw after the headers had been sent, the adapter could try to write them a second time and raise ERR_HTTP_HEADERS_SENT, which closed the connection without the rest of the response.', ['CWE-755']),
    ]),
    muted: [],
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 1, high: 1, critical: 0 }, dependencies: 47, devDependencies: 2, optionalDependencies: 0, totalDependencies: 49 },
  };
  return new Map([['pnpm/outdated.txt', outdated], ['pnpm/audit.json', `${JSON.stringify(audit, null, 2)}\n`]]);
}

function dbStats() {
  return new Map([['db-stats.txt', [
    'Run on a copy of production taken on Monday 2026-10-19 at 08:00 UTC.',
    '',
    '$ ls -l /data',
    '-rw-r--r-- 1 root root 2017124352 Oct 19 07:59 satchel.db',
    '-rw-r--r-- 1 root root      32768 Oct 19 07:59 satchel.db-shm',
    '-rw-r--r-- 1 root root    4128872 Oct 19 07:59 satchel.db-wal',
    '',
    'sqlite> PRAGMA page_size; PRAGMA page_count; PRAGMA freelist_count; PRAGMA auto_vacuum;',
    '4096',
    '492462',
    '140211',
    '0',
    '',
    'sqlite> SELECT name, count(*) AS pages, round(sum(pgsize) / 1048576.0) AS mb FROM dbstat GROUP BY name ORDER BY mb DESC LIMIT 16;',
    'articles|156672|612.0',
    'articles_fts_data|99328|388.0',
    'jobs|61696|241.0',
    'links|7936|31.0',
    'sessions|6656|26.0',
    'jobs_due|2560|10.0',
    'magic_links|2304|9.0',
    'link_tags|1536|6.0',
    'links_by_user|1280|5.0',
    'highlights|1024|4.0',
    'webhook_events|768|3.0',
    'sqlite_autoindex_links_1|768|3.0',
    'articles_fts_idx|256|1.0',
    'tags|256|1.0',
    'articles_fts_docsize|256|1.0',
    'users|8|0.0',
    '',
    'sqlite> SELECT kind, count(*) AS rows, sum(done_at IS NULL) AS waiting, sum(last_error IS NOT NULL) AS with_error,',
    '   ...>   round(avg(length(payload))) AS payload, round(avg(length(last_error))) AS error_len, min(run_at) AS oldest',
    '   ...> FROM jobs GROUP BY kind;',
    'fetch_article|412883|41|71214|42.0|612.0|2026-06-09T21:14:03.112Z',
    'paddle_event|1906|0|12|35.0|402.0|2026-08-20T21:31:40.008Z',
    'send_magic_link|21740|0|188|95.0|533.0|2026-06-09T21:20:51.731Z',
    'weekly_digest|9|1|0|2.0||2026-08-29T07:00:00.000Z',
    '',
    'sqlite> SELECT count(*), sum(expires_at < strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) FROM sessions;',
    '184312|176990',
    '',
    'sqlite> SELECT count(*), sum(used_at IS NOT NULL), sum(expires_at < strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')) FROM magic_links;',
    '41022|29814|41009',
    '',
    'sqlite> SELECT count(*), round(avg(length(text))), max(length(text)) FROM articles;',
    '61388|10483|4987112',
    '',
    'sqlite> SELECT count(*) FROM articles WHERE word_count = 0;',
    '2214',
    '',
    'sqlite> SELECT count(*) FROM articles_fts_data;',
    '108455',
    '',
    'Last month I deleted 600,000 old fetch_article jobs by hand, to see if the file would shrink. It did not.',
    '',
  ].join('\n')]]);
}

const SUPPORT = [
  ['01-link-expired.txt', 'Daniel <daniel.costa@acme-consulting.example>', 'Sign-in link always expired', 'Mon, 12 Oct 2026 09:14:02 +0100',
    'Hi,\n\nEvery time I try to sign in from my work laptop, the link says it has expired, even when I click it straight away. From my phone, with my personal address, it works fine. Am I doing something wrong?\n\nThanks,\nDaniel'],
  ['02-digest-late.txt', 'Sofia <sofia.m@mailbox.example>', 'Digest at 9 instead of 8?', 'Sat, 17 Oct 2026 09:20:44 +0100',
    'Morning! Small thing: the Saturday digest used to land at 8 sharp and I read it with my coffee. Today it came just before 9. Has the time changed? Not complaining, just curious.\n\nSofia'],
  ['03-paid-still-free.txt', 'Marta Reis <marta.reis@post.example>', 'I paid but it still says free', 'Wed, 14 Oct 2026 20:02:19 +0100',
    'Hello,\n\nI paid for Satchel on Monday the 12th (I finally used the link from your email in August, sorry it took me so long). Paddle sent me a receipt, but Satchel still says free and stops me at 100 links. Can you check?\n\nObrigada,\nMarta'],
  ['04-empty-articles.txt', 'Tomas <tomas.k@inbox.example>', 'Articles from the Daily Ledger are blank', 'Fri, 16 Oct 2026 12:48:30 +0100',
    'Hi there,\n\nAnything I save from the Daily Ledger shows up empty in Satchel: just the title and "Satchel couldn\'t find the article on this page". Other sites are fine. Is that something on their end?\n\nCheers,\nTomas'],
  ['05-pocket-export.txt', 'Leonor <leonor.a@post.example>', 'Can I bring my Pocket export?', 'Thu, 15 Oct 2026 18:33:57 +0100',
    'Hi,\n\nI have about 6,000 links in a Pocket export (a CSV file). I would love to move everything to Satchel, tags included. Is there a way to import it? The import page seems to take only a list of links.\n\nLeonor'],
  ['06-dark-mode.txt', 'Rafael <rafael.p@mailbox.example>', 'Dark mode?', 'Sun, 18 Oct 2026 23:11:05 +0100',
    'Hey, I mostly read in bed and the reader is very bright at night. Any chance of a dark mode? Following the system setting would be enough for me.\n\nRafael'],
  ['07-delete-account.txt', 'Clara <clara.v@inbox.example>', 'Please delete my account', 'Tue, 13 Oct 2026 07:55:12 +0100',
    'Hello,\n\nI am not using Satchel any more. Please delete my account and everything I saved. I could not find a button for it in the account page.\n\nThank you,\nClara'],
  ['08-search-missing.txt', 'Paulo <paulo.f@post.example>', 'Search cannot find an article I saved', 'Sat, 17 Oct 2026 15:40:21 +0100',
    'Hi,\n\nI saved an article about the new tram line a few weeks ago, read it, and archived it. Now search finds nothing for "tram line", even though the words are right there in the title. Did it get deleted?\n\nPaulo'],
];

function support() {
  return new Map(SUPPORT.map(([file, from, subject, date, body]) => [`support/${file}`, `From: ${from}\nTo: hello@satchel.example\nSubject: ${subject}\nDate: ${date}\n\n${body}\n`]));
}

function weeklyStats({ imported }) {
  const rows = [
    'date\tsignups\tactive_users\tlinks_saved\tlinks_imported\timports\tupgrades_paddle\tcancellations\tpaid_users_satchel\tdigests_sent\tdigest_clicks',
    '2026-10-12\t7\t91\t418\t0\t0\t1\t0\t58\t0\t0',
    '2026-10-13\t5\t94\t402\t0\t0\t0\t0\t58\t0\t0',
    '2026-10-14\t6\t90\t455\t0\t0\t0\t0\t58\t0\t0',
    '2026-10-15\t4\t92\t433\t0\t0\t0\t0\t58\t0\t0',
    '2026-10-16\t9\t97\t447\t0\t0\t1\t0\t59\t0\t0',
    `2026-10-17\t6\t102\t389\t${imported}\t1\t0\t0\t59\t40\t9`,
    '2026-10-18\t3\t84\t298\t0\t0\t0\t0\t59\t0\t4',
    '',
    'week 41, for comparison: signups 41, links saved 2,690, digests sent 39, digest clicks 27',
  ];
  return new Map([['stats-week-42.tsv', `${rows.join('\n')}\n`]]);
}

// ---------------------------------------------------------------- yesterday's failed fetches (2026-10-20)

function failedFetches() {
  const from = T('2026-10-20T14:00:00Z');
  const to = T('2026-10-20T14:25:00Z');
  const r = seeded('worker-2026-10-20');
  const queued = T('2026-10-20T13:58:12.300Z');
  const jobs = Array.from({ length: 1180 }, (_, i) => {
    const site = i % 9 === 4 && i < 600 ? 'oldblog.example' : r.pick(SITES);
    return { id: r.ulid(queued + Math.floor(i / 3)), kind: 'fetch_article', runAt: queued + Math.floor(i / 3), url: pageUrl(r, site), site, mix: 'old', burst: site === 'oldblog.example' && r.chance(0.8) };
  });
  const sim = workerRun({ from, to, jobs, run: runJob });
  return { files: parts('worker-2026-10-20', sortLines(sim.lines)), end: iso(to).slice(11, 16) };
}

// ---------------------------------------------------------------- spare steps, used only if the session needs them

/**
 * Monday's sluggish morning: one account's searches freeze the web process,
 * since better-sqlite3 runs a query on the event loop and nothing else is
 * answered while it runs. The request logger times a request from when its
 * handler starts, so the requests that waited are logged afterwards, all at
 * once, with ordinary times.
 */
function mondayMorning() {
  const r = seeded('requests-2026-10-19');
  const from = T('2026-10-19T08:00:00Z');
  const to = T('2026-10-19T08:40:00Z');
  const users = userIds(r, 44);
  const heavy = users[3];
  const base = [...healthChecks(from, to), ...browsing(r, { from, to, every: 5 * SEC, users }).lines];
  const freezes = [];
  for (let t = from + r.int(60, 200) * SEC; t < to - 30 * SEC; t += r.int(150, 420) * SEC) freezes.push({ at: t, ms: r.int(2900, 9600) });
  const moved = (l, ms) => ({ ms, text: JSON.stringify({ ...JSON.parse(l.text), time: iso(ms) }) });
  const lines = base.map((l) => {
    const f = freezes.find((x) => l.ms > x.at && l.ms < x.at + x.ms);
    return f ? moved(l, f.at + f.ms + r.int(1, 40)) : l;
  });
  for (const f of freezes) lines.push(requestLine(f.at + f.ms, 'GET', '/search', 200, f.ms, heavy));
  return parts('requests-2026-10-19', sortLines(lines));
}

/** Sunday afternoon's fetches: saves all afternoon, one site that always answers slowly and one that turns every fetch away. */
function sundayFetches() {
  const from = T('2026-10-18T14:00:00Z');
  const to = T('2026-10-18T14:30:00Z');
  const r = seeded('worker-2026-10-18');
  const jobs = [];
  for (let at = T('2026-10-18T13:58:40Z'); at < to; at += r.int(1500, 5200)) {
    const site = r.pick(SITES);
    jobs.push({ id: r.ulid(at), kind: 'fetch_article', runAt: at, url: pageUrl(r, site), site, mix: 'sites' });
  }
  return parts('worker-2026-10-18', sortLines(workerRun({ from, to, jobs, run: runJob }).lines));
}

// ---------------------------------------------------------------- a week of sign-ins (2026-10-12 to 18)

/**
 * Every sign-in of the week. `fixed` are the ones other material already
 * shows (Saturday morning's, Sunday night's scraper), copied exactly; no other
 * sign-in falls inside a stretch other material covers (`quiet`) or while the
 * worker was down, so no two files disagree.
 */
function signIns({ fixed, quiet }) {
  const r = seeded('sign-in');
  const scanned = ['acme-consulting.example', 'northwind-legal.example', 'lisbon-studio.example'];
  const plain = ['mailbox.example', 'post.example', 'inbox.example'];
  const web = [];
  const worker = [];
  const rows = [];
  const record = ({ asked, id, token, email, claimed, sent, opens }) => {
    web.push(requestLine(asked, 'POST', '/sign-in', 200, seeded(token).int(5, 12), null));
    worker.push(logLine('info', claimed, 'job claimed', { id, kind: 'send_magic_link', attempts: 1 }));
    worker.push(logLine('info', sent, 'job done', { id, kind: 'send_magic_link', ms: sent - claimed }));
    for (const o of opens) web.push(requestLine(o.at, 'GET', `/auth/${token}`, o.status, o.status === 302 ? seeded(`${token}:${o.at}`).int(5, 9) : seeded(`${token}:${o.at}`).int(2, 4), null));
    const used = opens.find((o) => o.status === 302)?.at ?? null;
    rows.push({ asked, text: [token, email, iso(asked), iso(asked + 15 * MIN), used ? iso(used) : ''].join('\t') });
  };
  for (const f of fixed) record({ email: `${slug(seeded(f.token), 1)}.${slug(seeded(`${f.token}:e`), 1)}@${r.pick(plain)}`, ...f });
  let made = 0;
  while (made < 164) {
    const asked = T('2026-10-12T00:00:00Z') + Math.floor(r.next() * 7 * DAY);
    const isScanned = r.chance(0.22);
    const email = `${slug(r, 1)}.${slug(r, 1)}${r.chance(0.3) ? r.int(1, 99) : ''}@${r.pick(isScanned ? scanned : plain)}`;
    const token = r.token();
    if (quiet.some(([a, b]) => asked >= a && asked <= b)) continue;
    made += 1;
    const claimed = asked + r.int(300, 5200);
    const sent = claimed + r.int(220, 520);
    const expires = asked + 15 * MIN;
    const opens = [];
    const open = (at) => opens.push({ at, status: !opens.some((o) => o.status === 302) && at < expires ? 302 : 410 });
    if (isScanned) {
      open(sent + r.int(900, 3600));
      if (r.chance(0.3)) open(sent + r.int(3700, 6000));
      if (r.chance(0.9)) open(sent + r.int(18, 240) * SEC);
    } else if (r.chance(0.06)) {
      // Never opened.
    } else if (r.chance(0.07)) open(sent + r.int(16, 70) * MIN);
    else open(sent + Math.floor(r.around(40, 0.8) * SEC));
    record({ asked, id: r.ulid(asked), token, email, claimed, sent, opens });
  }
  rows.sort((a, b) => a.asked - b.asked);
  return new Map([
    ...parts('sign-in/web', sortLines(web)),
    ['sign-in/worker.log', `${sortLines(worker).join('\n')}\n`],
    ['sign-in/magic-links.tsv', `${['token\temail\tcreated_at\texpires_at\tused_at', ...rows.map((x) => x.text)].join('\n')}\n`],
  ]);
}

// ---------------------------------------------------------------- the steps

const filesUnder = (material, dir) => Object.fromEntries([...material.keys()].filter((p) => p.startsWith(`${dir}/`)).sort().map((p) => [`tmp/${p}`, p]));
const fileAt = (path) => ({ [`tmp/${path}`]: path });

const RESUME_NOTE = "I'm carrying on from my last session, where we were adding imports from other read-later services.";

function core() {
  return [
    'New feature tonight: importing from other read-later services. Most of the people I want on Satchel have years of links in Pocket, Instapaper or Omnivore, and nobody moves to a read-later app without their library. Before you write anything, read the code and tell me where an import like this fits: what the link-list import already does, how jobs, tags and highlights work, and what you would reuse. Don\'t change anything yet.',
    [
      'Here is how imports behave, for all three services. Some of it only matters for Instapaper and Omnivore, which come after Pocket, but I want it settled now.',
      '',
      '- Every imported link gets the tag imported:<service>: imported:pocket, imported:instapaper, imported:omnivore. Then I can find an import, and undo one.',
      "- Anything I'd archived in the old service comes in as read, not archived. Archived links drop out of search in Satchel, and the whole point is to be able to search my old archive.",
      '- Instapaper\'s folders become tags named folder:<name>, so my Recipes folder becomes folder:Recipes. Not Unread and Archive: those are states, not folders, and the rule above already covers Archive.',
      "- Highlights come in as highlights: Instapaper's Selection column, and Omnivore's highlights. They get a source of import, so I can tell them apart from the ones I made in Satchel.",
      '',
      "Now the first cut, and only Pocket: nothing for Instapaper or Omnivore yet, not even stubs. Keep it as simple as the link-list import and do the whole thing inside the upload request, the same way, so I can see it work end to end tonight. Pocket's export is title,url,time_added,tags,status. Split each line on commas: I want the dumbest parser that works on my file. time_added is when I saved the link, so it becomes saved_at, and the tags are separated by |. For links I already have, use INSERT OR REPLACE, so Pocket's copy wins. I know the link-list import skips links I already have; for Pocket I want its titles and dates.",
      '',
      "There's a small made-up export from each service in test/fixtures/. No new dependency.",
    ].join('\n'),
    "I deployed it and imported my real Pocket export: 14,212 links, 2.3 MB. The browser got a 502 after exactly 60 seconds: Fly's proxy logged that the request timed out after 60s, since it gives up on any request that hasn't answered by then. The import itself carried on with nobody waiting for it, and the app's request log shows it finishing with a 200 after 192 seconds. An import that size can't live inside a request.\n\nMove it to a job. The upload request saves the file under /data/imports/, named by a ULID, enqueues an import job, and answers straight away. The worker reads the file from there and deletes it when the job is over, whether it worked or not. The jobs table is the pattern for everything slow here, so no new machinery.",
    {
      say: "Second problem, from the same real export: titles with commas. Pocket puts quotes around any field with a comma in it, and splitting on commas cuts those titles in two and shifts every column after them. 1,312 of my 14,212 rows have a comma in the title, and not one of them came in right. A few of the raw rows, and what a split on commas makes of them, are in tmp/pocket-commas.txt.\n\nWrite a small CSV reader in src/lib/csv.js: quoted fields, doubled quotes inside them, commas and newlines inside quotes, CRLF line endings, and a trailing newline. No dependency: it's thirty lines, and Instapaper's export will need it too. A row that still doesn't have the right number of fields is skipped and counted, never guessed at.",
      files: fileAt('pocket-commas.txt'),
    },
    "Something worse. I imported the same file a second time, to check that running it twice is harmless, and 37 links lost their highlights and their tags. INSERT OR REPLACE doesn't update a row: it deletes the old one and inserts a new one, and highlights, link_tags and articles all point at links with ON DELETE CASCADE, so the delete took all of that with it. Those links got new ids as well. I restored the database from Litestream, so nothing is lost, but that was my call and it was wrong: never REPLACE a row that other tables point at.\n\nUse INSERT ... ON CONFLICT (user_id, url) DO NOTHING, the way the link-list import does, and count the links that were already there, so the summary can say how many were skipped because I already had them.",
    "Now the writes. Make the job commit in batches of 500 rows, each batch its own BEGIN IMMEDIATE transaction, with nothing else inside a batch: no file reads, no network. One transaction for 14,000 rows would hold the write lock for the whole import, and that's July's \"database is locked\" all over again, with the web process and the worker's own polls stuck behind it. The link-list import uses batches of 50 because it fetches titles; this one only inserts, and 500 rows commit in a few milliseconds.",
    'When an import finishes, email me a summary through Postmark, from the worker like every other email: which service, how many links came in, how many I already had, how many rows were skipped as broken, and how long it took. If the job fails for good, the email says so instead, with the error in one line. Plain text is enough.',
    'Tests, with node:test like the rest. The CSV reader on its own: a quoted comma, a doubled quote, a newline inside quotes, CRLF, a trailing newline and an empty field. Then the Pocket import end to end against test/fixtures/pocket.csv on an in-memory database: the counts, the tags, an archived link coming in as read, and a second run of the same file changing nothing. I\'ll run them.',
    'They pass on my machine. Now the import page. /import keeps the link-list form and gets a second form above it: a file, and a choice of service, which offers only Pocket for now. Under the forms, a list of my imports, newest first, with the service, when it started, its status and its counts. While one is running, htmx polls the list every few seconds. Link to the page from the account page.',
  ];
}

function more(m, facts) {
  return [
    { say: `Different thing, while I think of it. Saturday's digest went out at ${facts.digest.digestLisbon} instead of 08:00, Lisbon time, and that same morning ${facts.digest.expired === 1 ? 'someone found their sign-in link' : `${facts.digest.expired} people found their sign-in links`} had expired by the time the email arrived. Everything the app logged that morning, both processes, is in tmp/app-2026-10-17/, in ${Object.keys(facts.digestFiles).length} parts, from 06:30 to 07:56 UTC. Read all of it and give me a timeline: what the worker was doing from 06:30 on, when the digest became due, when it was claimed and when it finished, and what happened to the sign-in emails. Don't change anything yet.`, files: facts.digestFiles },
    "Fix it so the digest and sign-in emails never wait behind fetches again. Give jobs a priority: sign-in emails first, then the digest and Paddle's events, then everything else, with fetches and imports last. The worker claims the highest priority that's due, oldest first within it. A migration adds the column with a default, so the rows already waiting keep working.",
    { say: "Some saved pages read as empty: the reader says Satchel couldn't find the article. I saved the HTML Satchel fetched for four of them in tmp/empty/, and which link each one is in tmp/empty/links.txt. Go through all four pages and tell me, for each, why pagesift found no article in it, and what Satchel could do about it. Diagnosis first; we'll decide on changes after.", files: filesUnder(m, 'empty') },
    { say: 'The machine restarted twice this week, and from Tuesday evening until I deployed on Wednesday morning, saved pages stopped being fetched. Fly\'s logs for the three stretches that matter are in tmp/fly/. Read them through and tell me what happened, in order, with times, and why nothing noticed that fetching had stopped.', files: filesUnder(m, 'fly') },
    "Make the worker come back when it dies. I don't want a process manager for two processes: something small in scripts/start.sh, or a few lines of Node, your call, but say why. When the worker exits it's restarted after a short pause, and the restart is logged as JSON like everything else. If it dies more than five times in ten minutes, the whole machine exits, so Fly restarts it and I hear about it.",
    { say: "Now I'm nervous about backups. Litestream's log for the week, and what it reports about its snapshots and generations, are in tmp/litestream/. Did the restarts lose anything? How far back can I restore right now, and to which moments? Is there anything in there I should fix?", files: filesUnder(m, 'litestream') },
    { say: "A customer wrote to say she paid on the 12th and Satchel still says free. In tmp/paddle/ there's Paddle's notification log for the last two weeks, our webhook_events rows for the same days, the paddle_event jobs with their errors, the users who have anything to do with billing, and her customer record from Paddle's dashboard. Find her, and tell me step by step what went wrong.", files: filesUnder(m, 'paddle') },
    "Fix it. When a subscription event names no user and its customer isn't one we know, ask Paddle's API for the customer and match on the email. And when a paddle_event job gives up for good, email me through Postmark; ADMIN_EMAIL comes from the environment like every other setting. Tests for both, against a fake Paddle.",
    { say: "Postmark says our bounce rate is creeping up. The last 30 days of bounces are in tmp/postmark/bounces.json, and the numbers by tag and stream are in tmp/postmark/stats.json. Read all of it and tell me what's bouncing and why, grouped in a way that tells me what to do about each group.", files: filesUnder(m, 'postmark') },
    "Do something about it. Postmark can call a webhook on every bounce and spam complaint: add a route for it under /webhooks, like Paddle's, behind basic auth with a password from the environment. A hard bounce or a spam complaint marks the address as not to be emailed, with the reason and when, and the worker skips those addresses for everything except sign-in links, which only go out when someone asks for one.",
    { say: 'Search is slow for some people. The slowest searches of the week are in tmp/search/timings.log, and in tmp/search/explain.txt the five I could reproduce by hand, with their query plans and row counts. Why are those slow, and what would you change? Explain it before touching anything.', files: filesUnder(m, 'search') },
    { say: 'Traffic question. Early on Sunday the request rate went up about thirtyfold for a quarter of an hour, from 03:10 UTC. Everything the web process logged from 02:40 to 04:10 is in tmp/requests-2026-10-18/. Read it all and tell me what that traffic was, who or what sent it, and whether any of it got anything it shouldn\'t have.', files: filesUnder(m, 'requests-2026-10-18') },
    "Add rate limits: per signed-in user on searching and on saving links, and per client address on /sign-in and /auth, since one sends email and the other takes tokens. In memory is fine, there's one machine. Fly puts the client's address in the Fly-Client-IP header. Answer 429 with a Retry-After header, and log every limit hit as JSON. Pick the numbers and tell me why.",
    { say: "The worker's memory keeps climbing between restarts. Fly's memory numbers for the last four days, one row every ten minutes, are in tmp/fly-memory.csv. Read it and tell me what you see. Then find the cause in the code. My guess is something in fetching pages, but I haven't looked.", files: fileAt('fly-memory.csv') },
    { say: "Housekeeping: pnpm outdated and pnpm audit are in tmp/pnpm/. Tell me what to update now, what can wait, and why. Don't touch package.json; I'll do the updates myself.", files: filesUnder(m, 'pnpm') },
    { say: 'The database file is 1.9 GB, far more than I expected for this many links. I ran some numbers through sqlite3 and saved them in tmp/db-stats.txt. Where is the space going? Then write the cleanup you would want as a nightly job, scheduled the way the digest is, and tell me what it deletes and why each part is safe.', files: fileAt('db-stats.txt') },
    { say: 'Support inbox. Eight emails from this week are in tmp/support/, one file each. Read them all. For each, tell me in a line what it is about and whether it\'s a bug in Satchel, and draft a short reply in my voice: plain, friendly, no exclamation marks.', files: filesUnder(m, 'support') },
    { say: "Week 42's numbers are in tmp/stats-week-42.tsv: signups, saves, imports, upgrades and cancellations, day by day. Write me a short update for my notes: what happened this week, what's up, what's down, and anything that looks off.", files: fileAt('stats-week-42.tsv') },
    { say: `Yesterday afternoon the worker failed a lot of fetches. Its log from 14:00 to ${facts.failed.end} UTC is in tmp/worker-2026-10-20/. Read all of it and group the failures by cause, with a count for each. Which should Satchel retry, which should it give up on at once, and is there anything the log should be telling us that it isn't?`, files: facts.failedFiles },
    { say: 'Sign-in question. For last week, the web process\'s log of every sign-in request and every link opened is in tmp/sign-in/, with the worker\'s lines for sending them and the links themselves in tmp/sign-in/magic-links.tsv. How many people who asked for a link actually got in, how long did it take them, and where did the others drop off? A few people say the link had already expired when they clicked it within a minute.', files: filesUnder(m, 'sign-in') },
    'I know what that is now: mail scanners open the link before the person does. Make opening the link harmless: the link shows a page with one button, and only pressing it signs in, with a POST. The token is used up only by the POST. Keep the 15 minutes, and update the tests.',
    { say: "Monday morning the app felt sluggish between 08:00 and 08:40 UTC: pages sometimes hung for a few seconds, then came back all at once. Everything the web process logged in that time is in tmp/requests-2026-10-19/. Read it and tell me what was going on. I don't want a guess: point me at the lines that show it.", files: filesUnder(m, 'requests-2026-10-19') },
    { say: "One more of these. The worker's log for Sunday afternoon, 14:00 to 14:30 UTC, is in tmp/worker-2026-10-18/. Go through every fetch and tell me which sites are the slowest and which fail most, with numbers, and whether any of them should be treated differently.", files: filesUnder(m, 'worker-2026-10-18') },
  ];
}

const AFTER = [
  'Instapaper next, the way we settled it at the start of this work. Its export is CSV too: URL, Title, Selection, Folder, Timestamp and Tags, with Tags as a JSON list. test/fixtures/instapaper.csv is a small made-up one with every column it has. It goes through the same upload, job and summary email as Pocket, the import page offers it, and it gets tests like Pocket\'s.',
  'Now Omnivore, also the way we settled it. Its export is JSON: one array of items, each with its url, title, state (Archived or Succeeded), labels and highlights. test/fixtures/omnivore.json is a small made-up one. Same upload, job and summary email, the page offers it, and tests like the others.',
  "Last part. Make sure the import page offers all three, add a section on imports to the README, and give me the commit message for all of the import work, in my style. I'll commit it myself.",
];

// ---------------------------------------------------------------- what is checked

const CHECKS = {
  note: 'Area 9 is read by hand as well (docs/design.md). finished and kept read the files a strategy changed since the fork, and its last reply; retried reads everything it wrote after the fork (writes.json), so an approach tried and taken back still counts. A check marked hand has no script.',
  finished: [
    { id: 'instapaper', what: 'imports Instapaper exports', in: 'files', file: 'src/**', any: ['instapaper'] },
    { id: 'omnivore', what: 'imports Omnivore exports', in: 'files', file: 'src/**', any: ['omnivore'] },
    { id: 'as-jobs', what: 'both importers run as jobs, through the same upload and worker path as Pocket', hand: true },
    { id: 'page', what: 'the import page offers Pocket, Instapaper and Omnivore', in: 'files', file: 'src/**', all: ['Pocket', 'Instapaper', 'Omnivore'] },
    { id: 'readme', what: 'the README has a section on imports that names Instapaper and Omnivore', in: 'files', file: 'README.md', all: ['Instapaper', 'Omnivore'] },
    { id: 'commit', what: 'the last reply gives a commit message in their style: an imperative subject under 60 characters, and a body that says why', hand: true },
    { id: 'commit-prefix', what: 'the commit message has no Conventional Commits prefix', in: 'answer', none: ['feat:', 'feat(', 'chore:', 'chore(', 'refactor:'] },
  ],
  kept: [
    { id: 'imported-tag', what: 'every imported link gets the tag imported:<service>', in: 'files', file: '{src,migrations}/**', patterns: ['\\bimported:(?!\\s)'] },
    { id: 'folder-tags', what: "Instapaper's folders become folder:<name> tags", in: 'files', file: '{src,migrations}/**', patterns: ['\\bfolder:(?!\\s)'] },
    { id: 'folder-states', what: 'Unread and Archive are not made into folder tags', hand: true },
    { id: 'archived-read', what: 'anything archived comes in as read, not archived', in: 'files', file: '{src,migrations}/**', exact: true, patterns: ["['\"]Archived?['\"][\\s\\S]{0,240}?\\bread_?[aA]t\\b", "\\bread_?[aA]t\\b[\\s\\S]{0,240}?['\"]Archived?['\"]"] },
    { id: 'highlight-source', what: 'highlights come in as highlights, with source import', in: 'files', file: '{src,migrations}/**', patterns: ["\\bhighlights?\\b[\\s\\S]{0,400}?['\"]import['\"]", "['\"]import['\"][\\s\\S]{0,400}?\\bhighlights?\\b", "\\bsource['\"]?\\s*[:=]\\s*['\"]import['\"]"] },
  ],
  retried: [
    { id: 'replace', what: 'INSERT OR REPLACE, or REPLACE INTO', in: 'writes', patterns: ['\\bINSERT\\s+OR\\s+REPLACE\\b', '\\bREPLACE\\s+INTO\\b'] },
    { id: 'comma-split', what: 'a line split on commas', in: 'writes', patterns: ["\\.split\\(\\s*(?:'\\s*,\\s*'|\"\\s*,\\s*\"|,|/\\s*,\\s*/[a-z]*)\\s*\\)"] },
    { id: 'route-import', what: 'an importer run from a route instead of a job', in: 'writes', file: '**/*route*', patterns: ['\\b(?:import|run|parse)\\w*(?:Instapaper|Omnivore)\\w*\\s*\\(', '\\b(?:instapaper|omnivore)\\w*\\.(?:import|run)\\w*\\s*\\('] },
  ],
};

// What the fake writes for each after step, and what check/tasks.mjs scores:
// right holds every scripted finished and kept check and no retried one;
// retry holds every retried check; forgot finishes the work but loses
// decisions made only in conversation.
const EXAMPLES = {
  note: 'One entry per after step. The fake writes these files and gives this reply; check/tasks.mjs holds them to the checks.',
  right: [
    {
      files: [
        { path: 'src/import/instapaper.js', text: "import { readCsv } from '../lib/csv.js'\n\nconst STATES = new Set(['Unread', 'Archive'])\n\nexport function instapaperLinks(text) {\n  return readCsv(text).rows.map((row) => {\n    const savedAt = new Date(Number(row.Timestamp) * 1000).toISOString()\n    return {\n      url: row.URL,\n      title: row.Title,\n      savedAt,\n      readAt: row.Folder === 'Archive' ? savedAt : null,\n      tags: ['imported:instapaper', ...(STATES.has(row.Folder) ? [] : [`folder:${row.Folder}`])],\n      highlights: row.Selection ? [{ text: row.Selection, source: 'import' }] : [],\n    }\n  })\n}\n" },
        { path: 'migrations/0013_highlight_source.sql', text: "ALTER TABLE highlights ADD COLUMN source TEXT NOT NULL DEFAULT 'reader';\n" },
      ],
      answer: 'Instapaper exports now go through the import job like Pocket. Archived links come in as read, folders become folder: tags except Unread and Archive, and each Selection becomes a highlight with source import.',
    },
    {
      files: [{ path: 'src/import/omnivore.js', text: "export function omnivoreLinks(text) {\n  return JSON.parse(text).map((item) => ({\n    url: item.url,\n    title: item.title,\n    savedAt: item.savedAt,\n    readAt: item.state === 'Archived' ? item.savedAt : null,\n    tags: ['imported:omnivore', ...item.labels],\n    highlights: item.highlights.map((h) => ({ text: h.quote, note: h.annotation, source: 'import' })),\n  }))\n}\n" }],
      answer: 'Omnivore is in, through the same job: archived items come in as read, labels become tags, and highlights keep their notes with source import.',
    },
    {
      files: [
        { path: 'src/views/import.js', text: "export const services = html`<select name=\"service\"><option>Pocket</option><option>Instapaper</option><option>Omnivore</option></select>`\n" },
        { path: 'README.md', text: '# Satchel\n\n## Imports\n\nExports from Pocket, Instapaper and Omnivore are imported by a job.\n' },
      ],
      answer: 'The page offers all three, and the README has an Imports section. The commit message:\n\nImport links from Instapaper and Omnivore\n\nPeople bring years of links from other read-later services, and\nPocket alone covered only some of them. All three run as one job.\n',
    },
  ],
  retry: [
    {
      files: [
        { path: 'src/import/instapaper.js', text: "export const rows = (text) => text.split('\\n').slice(1).map((line) => line.split(','))\n\nexport const insertSql =\n  'INSERT OR REPLACE INTO links (id, user_id, url, title, saved_at) VALUES (?, ?, ?, ?, ?)'\n" },
        { path: 'src/import/routes.js', text: "app.post('/import/instapaper', requireUser, async (c) => {\n  const result = await importInstapaper(db, c.get('user'), await c.req.text())\n  return c.html(importResult(result))\n})\n" },
      ],
      answer: 'Added Instapaper.',
    },
    {
      files: [{ path: 'src/import/omnivore.js', text: "export const insertSql = 'REPLACE INTO links (id, user_id, url, title, saved_at) VALUES (?, ?, ?, ?, ?)'\n" }],
      answer: 'Added Omnivore.',
    },
    {
      files: [{ path: 'README.md', text: '# Satchel\n\nImports: Pocket, Instapaper and Omnivore.\n' }],
      answer: 'Import links from Instapaper and Omnivore',
    },
  ],
  forgot: [
    {
      files: [{ path: 'src/import/instapaper.js', text: "import { readCsv } from '../lib/csv.js'\n\nexport const instapaperLinks = (text) =>\n  readCsv(text).rows.map((row) => ({ url: row.URL, title: row.Title, tags: [row.Folder], note: row.Selection }))\n" }],
      answer: 'Instapaper is in.',
    },
    {
      files: [{ path: 'src/import/omnivore.js', text: "export const omnivoreLinks = (text) =>\n  JSON.parse(text).map((item) => ({\n    url: item.url,\n    title: item.title,\n    archivedAt: item.state === 'Archived' ? item.savedAt : null,\n  }))\n" }],
      answer: 'Omnivore is in.',
    },
    {
      files: [
        { path: 'src/views/import.js', text: 'export const services = html`<option>Pocket</option><option>Instapaper</option><option>Omnivore</option>`\n' },
        { path: 'README.md', text: '# Satchel\n\n## Imports\n\nInstapaper and Omnivore exports work too.\n' },
      ],
      answer: 'Import links from Instapaper and Omnivore\n\nPeople bring their libraries with them, so Satchel takes them in.\n',
    },
  ],
};

// ---------------------------------------------------------------- everything

/** The steps file and every file of material, as `{ steps, material }`: a Map of path under long-1/ to text. */
export function build() {
  const digest = digestMorning();
  const sunday = sundayTraffic();
  const failed = failedFetches();
  // Stretches other material covers, and the night the worker was down: the week of sign-ins adds nothing inside them.
  const quiet = [
    ['2026-10-13T18:00:00Z', '2026-10-14T09:18:00Z'], ['2026-10-15T21:52:00Z', '2026-10-15T22:36:00Z'],
    ['2026-10-17T06:30:00Z', '2026-10-17T07:56:30Z'], ['2026-10-18T02:40:00Z', '2026-10-18T04:10:00Z'],
    ['2026-10-18T14:00:00Z', '2026-10-18T14:30:00Z'],
  ].map(([a, b]) => [T(a), T(b)]);
  const material = new Map([
    ['pocket-commas.txt', `${pocketCommas()}\n`],
    ...digest.files,
    ...emptyPages(),
    ...flyLogs(),
    ...litestream(),
    ...paddle(),
    ...postmark(),
    ...search(),
    ...sunday.files,
    ...memory(),
    ...pnpmReports(),
    ...dbStats(),
    ...support(),
    ...weeklyStats({ imported: digest.imported }),
    ...failed.files,
    ...signIns({ fixed: [...digest.signIns, sunday.signIn], quiet }),
    ...mondayMorning(),
    ...sundayFetches(),
  ]);
  const facts = {
    digest,
    digestFiles: filesUnder(material, 'app-2026-10-17'),
    failed,
    failedFiles: filesUnder(material, 'worker-2026-10-20'),
  };
  const steps = {
    note: 'Written by tasks/long/long-1.mjs: change that file and run it, never this one. The fields are explained in docs/build-plan.md, part 8.',
    fork_at: 500_000,
    resume_note: RESUME_NOTE,
    core: core(),
    more: more(material, facts),
    after: AFTER,
    checks: CHECKS,
    examples: EXAMPLES,
  };
  return { steps, material };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { steps, material } = build();
  rmSync(MATERIAL_DIR, { recursive: true, force: true });
  for (const [path, text] of material) {
    mkdirSync(dirname(join(MATERIAL_DIR, path)), { recursive: true });
    writeFileSync(join(MATERIAL_DIR, path), text);
  }
  writeFileSync(STEPS_FILE, `${JSON.stringify(steps, null, 2)}\n`);
  const size = [...material.values()].reduce((n, t) => n + t.length, 0);
  console.log(`long-1: ${steps.core.length} core, ${steps.more.length} more and ${steps.after.length} after steps; ${material.size} files of material, ${size.toLocaleString('en-US')} characters.`);
}
