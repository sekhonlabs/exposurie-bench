// Part 13, many agents, one job: team-1, Satchel's imports from Pocket,
// Instapaper and Omnivore, run by three agents in each of two rounds. The
// method is in docs/build-plan.md (part 13) and the decisions behind it in
// docs/decisions.md (2026-11-05).
//
//   node tasks/team/team-1.mjs     writes team-1.json, team-1-notes.md and team-1/
//
// It writes the same bytes every time, from nothing but this file:
//
//   team-1.json        the plan and steps of round 1, the asks of round 2, the
//                      decisions round 1 is told for round 2 (K1-K6), and the
//                      checks; runner/team.mjs and score/team.mjs read it
//   team-1-notes.md    condition D's file: K1-K6 and the commit style, one line
//                      each, written before anything runs
//   team-1/            the developer's own exports, which round 2 finds in tmp/
//
// Beside them, written by hand, is team-1-examples/: a reference
// implementation, which the fake (runner/fake-claude.mjs) writes in place of an
// agent, so the runner and the scorer can be checked without spending
// anything. No agent sees it.
//
// Round 1's steps are in the developer's voice: long, precise prompts. Round
// 2's asks are short, the way a ticket reads when the details are kept
// elsewhere, and none of them restates a decision of round 1. No step assumes
// what an agent wrote: a correction says what to make sure of, and to leave it
// if that is what it did.
//
// Run it with the sandbox's Node.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const lines = (...l) => l.join('\n');
const paras = (...p) => p.join('\n\n');

// ---------------------------------------------------------------- round 1

/** The same plan and contract opens every round 1 agent's first step. */
const PLAN = paras(
  "Satchel's import is moving into the background, and it's getting Pocket, Instapaper and Omnivore. I'm running three agents on it at once, each in its own copy of the repo, and you're one of them. This is round 1: one agent does the job that runs an import, one does a CSV reader and Pocket's reader, and one does the import page and the summary email. Instapaper and Omnivore come in round 2, once I've merged this round.",
  lines(
    "So that the three parts fit when I merge them, here's the contract:",
    "- `POST /import` takes a form with `service` and `file`. It saves the upload as `<DATA_DIR>/imports/<ulid>`, enqueues an `import_file` job with `{ userId, service, path }`, and shows the page again with a line saying the import has started. A pasted list of links still runs inside the request, the way it does now.",
    "- The job's handler is `src/jobs/handlers/import-file.js`. It loads `src/import/readers/<service>.js` by the service's name and calls its `read(text)`.",
    "- `read(text)` returns the items: `{ url, title, savedAt, tags, archived, read }`. `savedAt` is an ISO string, `tags` is an array of strings, and `archived` and `read` are separate, because Satchel keeps both.",
    "- When the import is done, the job calls `sendImportSummary(user, { service, added, duplicates, overLimit }, { sendEmail })` from `src/mail/import-summary.js`.",
    "- The page lists the services by the readers it finds in `src/import/readers/`.",
  ),
  "Stay in your own part's files: the other two are changing theirs right now. And leave no TODOs or notes in the code about round 2's work. I keep track of that myself.",
);

const BUILD = 'Read the code first, then build it.';

/** The third step is the same for all three. */
const TESTS = "Now the tests for your part, in `test/`, with `node:test` like the others. You can't run them here, so read them over once. Then tell me in a few lines what you changed, and give me a commit message for it.";

const ROUND_1 = [
  {
    agent: 1,
    part: 'the job',
    steps: [
      paras(
        PLAN,
        "Your part is the job: the route's side of the upload, the handler, and registering it in `src/jobs/handlers/index.js`. Batches of 500, each in its own `write.immediate` transaction, so the web process never waits long on the lock. A link that's already saved is skipped with `ON CONFLICT DO NOTHING` and counted as a duplicate. Don't reach for `INSERT OR REPLACE`: it deletes the old row first, and `ON DELETE CASCADE` takes the link's highlights and tags with it. Keep to the free plan the way the pasted list does, and count what didn't fit as `overLimit`. Every new link gets a `fetch_article` job, like the pasted list's. Delete the uploaded file once the job is done, or once it has failed for the last time.",
        BUILD,
      ),
      paras(
        "Two things. First, `saved_at`: an imported link keeps the date it was saved in the old service, not today's. Saturday's digest picks the week's links by `saved_at`, and two thousand Pocket links from 2019 would land in one email. If that's what you did, leave it.",
        "Second, so you know where this is going, but don't build it, another agent does in round 2: Instapaper's and Omnivore's readers will put highlights on their items, as `highlights: [{ text, note, createdAt }]`. The job then saves them with `source` set to `import`, so the reader can tell them apart from highlights made in Satchel. And an import adds a highlight once: the same link with the same text is the same highlight. Running an export again adds nothing, and a newer export adds only the new ones, including on links that were already saved.",
      ),
      TESTS,
    ],
  },
  {
    agent: 2,
    part: 'Pocket',
    steps: [
      paras(
        PLAN,
        "Your part is the CSV reader and Pocket's reader. First `src/lib/csv.js`, with no new dependency: I've had two CSV libraries go unmaintained under me, and the format is small. It has to handle quoted fields with commas, newlines and doubled quotes inside them, a byte order mark, and CRLF line endings. Then `src/import/readers/pocket.js`. Pocket's export looks like `test/fixtures/pocket.csv`: `time_added` is Unix seconds, `tags` are split on `|`, and `status` is `archive` or `unread`, where `archive` means archived and read.",
        BUILD,
      ),
      paras(
        "Two things. First, titles: in my real Pocket export, some rows have the URL as the title, or nothing at all. Make those `null`, and the fetch job fills them in later. If that's what you did, leave it.",
        "Second, for round 2, but don't build it, other agents do: Instapaper's export has a Folder column. Each folder becomes a `folder:<name>` tag, except Unread and Archive: those aren't folders, they're states. Archive means archived and read, and Unread means neither. And Omnivore keeps how far I got through each article: anything at 90% or more counts as read, archived or not. I finish most things there without ever archiving them.",
      ),
      TESTS,
    ],
  },
  {
    agent: 3,
    part: 'the page and the email',
    steps: [
      paras(
        PLAN,
        "Your part is the import page and the summary email. The page gets a select with the services, a file input, and the pasted list as it is now, with a line saying a file import runs in the background and an email comes when it's done. The email goes through Postmark like the others, plain text, in the digest's voice: how many links came in, how many were already saved, and, only if there were any, how many didn't fit in the free plan's 100 links.",
        BUILD,
      ),
      paras(
        "Two things. First, an import that adds nothing and finds no duplicates, so an empty file, sends no email at all. If that's what you did, leave it.",
        "Second, for round 2, but don't build it, another agent does: imports will bring highlights in from Instapaper and Omnivore, and the email will say how many came in, on its own line after the links. Leave it out of the email for now.",
      ),
      TESTS,
    ],
  },
];

// ---------------------------------------------------------------- round 2

const ROUND_2 = [
  {
    agent: 1,
    part: 'Instapaper',
    ask: "Round 2 of Satchel's import: Instapaper. My export is in `tmp/instapaper-export.csv`. Two other agents are doing Omnivore and the highlights side at the same time, each in its own copy, so stay in Instapaper's own files. Write its tests too, though you can't run them here, then give me a commit message.",
  },
  {
    agent: 2,
    part: 'Omnivore',
    ask: "Round 2 of Satchel's import: Omnivore. My export is in `tmp/omnivore-export.json`. Two other agents are doing Instapaper and the highlights side at the same time, each in its own copy, so stay in Omnivore's own files. Write its tests too, though you can't run them here, then give me a commit message.",
  },
  {
    agent: 3,
    part: 'highlights',
    ask: "Round 2 of Satchel's import: highlights. Two other agents are writing Instapaper's and Omnivore's readers at the same time, each in its own copy, so leave the readers to them and do the highlights side: the highlights their readers find should end up in Satchel. My exports are in `tmp/`. Write the tests too, though you can't run them here, then give me a commit message.",
  },
];

/** What every round 2 copy finds in tmp/, from team-1/. */
const FILES = {
  'tmp/instapaper-export.csv': 'instapaper-export.csv',
  'tmp/omnivore-export.json': 'omnivore-export.json',
};

// ---------------------------------------------------------------- the decisions

/**
 * What round 1 is told for round 2, each in its second step. `leak` searches
 * round 1's merged code, the files changed since the starter: a decision found
 * there was not said only in conversation, and is reported and scored apart.
 * Every match is read by hand.
 */
/**
 * `filed` searches the brain the sync leaves, its pages under wiki/, for the
 * decision in words a page would use. Both searches are read by hand, since a
 * page can say a decision in words no pattern foresaw.
 */
const DECISIONS = [
  {
    id: 'K1',
    told_to: 1,
    what: 'a reader puts highlights on its items as highlights: [{ text, note, createdAt }]',
    needed_by: [1, 2, 3],
    leak: { file: '{src,migrations}/**', patterns: ['\\bhighlights\\s*:'] },
    filed: ['\\btext\\b[^\\n]{0,20}\\bnote\\b[^\\n]{0,20}\\bcreatedAt\\b'],
  },
  {
    id: 'K2',
    told_to: 1,
    what: 'the job saves them with source set to import',
    needed_by: [3],
    leak: { file: '{src,migrations}/**', patterns: ['\\bsource\\b[\\s\\S]{0,200}?[\'"]import[\'"]', 'ALTER\\s+TABLE\\s+highlights'] },
    filed: ['\\bsource\\b[^\\n]{0,40}\\bimport\\b'],
  },
  {
    id: 'K3',
    told_to: 1,
    what: 'an import adds a highlight once: the same link and text are the same highlight, and new ones on links already saved are added',
    needed_by: [3],
    leak: { file: '{src,migrations}/**', patterns: ['INTO\\s+highlights', 'UNIQUE\\s*\\(\\s*link_id\\s*,\\s*text'] },
    filed: ['same (?:link|url)[^\\n]{0,60}same text', 'highlights?[^\\n]{0,60}\\bonce\\b', '\\bonce\\b[^\\n]{0,60}highlights?'],
  },
  {
    id: 'K4',
    told_to: 2,
    what: "Instapaper's folders become folder:<name> tags, except Unread and Archive, which are states; Archive means archived and read",
    needed_by: [1],
    leak: { file: '{src,migrations}/**', patterns: ['\\bfolder:'] },
    filed: ['\\bfolder:[\\s\\S]{0,200}\\bUnread\\b', '\\bUnread\\b[\\s\\S]{0,200}\\bfolder:'],
  },
  {
    id: 'K5',
    told_to: 2,
    what: 'an Omnivore item read 90% or more counts as read, archived or not',
    needed_by: [2],
    leak: { file: '{src,migrations}/**', patterns: ['readingProgress', '\\b90\\s*%'] },
    filed: ['\\b90\\s*(?:%|percent)', '\\b90 or more\\b'],
  },
  {
    id: 'K6',
    told_to: 3,
    what: 'the summary email says how many highlights came in',
    needed_by: [3],
    leak: { file: 'src/mail/**', patterns: ['highlight'] },
    filed: ['(?:email|summary)[^\\n]{0,80}highlights?', 'highlights?[^\\n]{0,80}(?:email|summary)'],
  },
];

// ---------------------------------------------------------------- condition D

/** Condition D's file, in the form every D file takes (tasks/conditions/facts-*.md). */
const NOTES = lines(
  '# Notes about the user',
  '',
  "From the user's earlier conversations with Claude.",
  '',
  '- satchel · import highlights: a reader puts highlights on its items as `highlights: [{ text, note, createdAt }]`.',
  '- satchel · import highlights: the import job saves them with `source` set to `import`, so the reader can tell them apart from highlights made in Satchel.',
  '- satchel · import highlights: an import adds a highlight once. The same link with the same text is the same highlight, so running an export again adds nothing, and a newer export adds only the new ones, including on links already saved.',
  '- satchel · instapaper import: each Folder becomes a `folder:<name>` tag, except Unread and Archive, which are states, not folders. Archive means archived and read; Unread means neither.',
  '- satchel · omnivore import: an item read 90% or more counts as read, archived or not.',
  '- satchel · import email: the summary email says how many highlights came in, on its own line after the links.',
  '- personal · commit style: no Conventional Commits prefixes: an imperative subject under 60 characters, and a body that says why.',
  '',
);

// ---------------------------------------------------------------- the checks

/**
 * Each round 2 agent's own files, by script, in the form score/checks.mjs reads
 * (`holds`): `in` is `files` (what the agent changed since round 1's merged
 * code) or `answer` (its last reply). A check looks for one kind of thing, so a
 * decision with several parts has several checks under its ID, and holds for
 * an agent when every one of them holds. The merged work is checked by the
 * hidden tests in score/team/, which import both exports through the merged
 * job. A check marked hand has no script; the hand read settles every one.
 */
const CHECKS = {
  note: "Each agent is checked on its own files here, and the merged work by the hidden tests in score/team/. A decision holds for an agent when every check under its ID holds. Both are read by hand.",
  agents: {
    1: [
      { id: 'K1', what: 'Instapaper items carry highlights', in: 'files', file: 'src/import/readers/**', all: ['highlights'] },
      { id: 'K1', what: "each highlight's words are its text", in: 'files', file: 'src/import/readers/**', patterns: ['\\btext\\s*:'] },
      { id: 'K4', what: 'folders become folder:<name> tags', in: 'files', file: 'src/import/readers/**', patterns: ['\\bfolder:'] },
      { id: 'K4', what: 'Unread and Archive are not made into folder tags, and Archive means archived and read', hand: true },
    ],
    2: [
      { id: 'K1', what: 'Omnivore items carry highlights with createdAt', in: 'files', file: 'src/import/readers/**', all: ['highlights', 'createdAt'] },
      { id: 'K1', what: "each highlight's quote is its text", in: 'files', file: 'src/import/readers/**', patterns: ['\\btext\\s*:'] },
      { id: 'K1', what: "each highlight's annotation is its note", in: 'files', file: 'src/import/readers/**', patterns: ['\\bnote\\s*:'] },
      { id: 'K5', what: 'an item read 90% or more counts as read', in: 'files', file: 'src/import/readers/**', patterns: ['readingProgress[\\s\\S]{0,80}?(?:>=\\s*90\\b|>\\s*89\\b)', '(?:\\b90\\s*<=|\\b89\\s*<)[\\s\\S]{0,80}?readingProgress'] },
    ],
    3: [
      { id: 'K1', what: "the job reads each item's highlights, with createdAt", in: 'files', file: '{src,migrations}/**', all: ['highlights', 'createdAt'] },
      { id: 'K1', what: "it reads a highlight's text and note", in: 'files', file: '{src,migrations}/**', all: ['text', 'note'] },
      { id: 'K2', what: 'imported highlights are saved with source import', in: 'files', file: '{src,migrations}/**', patterns: ['\\bsource\\b[\\s\\S]{0,300}?[\'"]import[\'"]', '[\'"]import[\'"][\\s\\S]{0,300}?\\bsource\\b'] },
      { id: 'K3', what: 'a highlight already there for the same link and text is not added again', in: 'files', file: '{src,migrations}/**', patterns: ['NOT\\s+EXISTS[\\s\\S]{0,300}?\\btext\\b', 'UNIQUE\\s*\\(\\s*link_id\\s*,\\s*text\\s*\\)', 'ON\\s+CONFLICT\\s*\\(\\s*link_id\\s*,\\s*text\\s*\\)'] },
      { id: 'K3', what: 'new highlights on links already saved are added', hand: true },
      { id: 'K6', what: 'the summary email says how many highlights came in', in: 'files', file: 'src/mail/**', patterns: ['highlight'] },
    ],
  },
  way: [
    { id: 'commit-prefix', what: 'the commit message has no Conventional Commits prefix', in: 'answer', none: ['feat:', 'feat(', 'fix:', 'fix(', 'chore:', 'chore(', 'refactor:', 'refactor(', 'test:', 'test(', 'docs:', 'docs('] },
    { id: 'commit-style', what: 'an imperative subject under 60 characters, and a body that says why', hand: true },
    { id: 'no-dependency', what: "no new dependency: package.json's dependencies and devDependencies as round 1 left them", in: 'dependencies' },
    { id: 'sql-files', what: "SQL stays in .sql files, as everywhere in Satchel's code", hand: true },
  ],
};

// ---------------------------------------------------------------- the exports

/**
 * The developer's own Instapaper export, in Instapaper's columns. Its folders
 * are Unread, Archive and Starred, Instapaper's own, beside three of the
 * developer's; five rows have a Selection, one of them in Archive and one in
 * Unread.
 */
const INSTAPAPER = lines(
  'URL,Title,Selection,Folder,Timestamp,Tags',
  'https://example.org/long-reads/the-last-lamplighter,The Last Lamplighter,,Long reads,1717000000,[]',
  'https://example.com/essays/slow-software,"Slow Software, Fast Teams",Most of the time a fast tool saves is spent waiting on a slow decision.,Long reads,1717600000,"[""software""]"',
  'https://example.net/recipes/one-pan-gnocchi,One-Pan Gnocchi,,Recipes,1718200000,"[""weeknight""]"',
  'https://example.com/recipes/miso-butter-corn,Miso Butter Corn,Brown the butter before the miso goes in.,Recipes,1718800000,"[""weeknight"",""summer""]"',
  'https://example.org/notes/on-backups,On Backups,"A backup you have never restored is a hope, not a backup.",Archive,1715000000,"[""ops""]"',
  'https://example.com/blog/sqlite-at-the-edge,SQLite at the Edge,,Archive,1715600000,"[""sqlite""]"',
  'https://example.net/blog/htmx-in-production,htmx in Production,,Archive,1716200000,[]',
  'https://example.org/talks/boring-technology,"Choose ""Boring"" Technology",,Starred,1714400000,"[""talks""]"',
  'https://example.com/essays/small-web,The Small Web,Small sites are easier to keep alive.,Starred,1714000000,[]',
  'https://example.net/news/fly-volumes,Fly Volumes Explained,,Unread,1719400000,"[""fly""]"',
  'https://example.org/blog/litestream-restores,Litestream Restores in Practice,"Test the restore, not the backup.",Unread,1720000000,"[""sqlite"",""ops""]"',
  'https://example.com/posts/postmark-streams,Postmark Message Streams,,Unread,1720600000,[]',
  'https://example.net/posts/ulid-vs-uuid,ULIDs vs UUIDs,,Unread,1721200000,[]',
  'https://example.org/work/estimates,Estimates Are Guesses,,Work notes,1721800000,"[""work""]"',
  '',
);

const omnivoreItem = (n, title, url, state, readingProgress, labels, savedAt, highlights) => {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const h = createHash('sha256').update(`omnivore ${n} ${url}`).digest('hex');
  const saved = Date.parse(savedAt);
  return {
    id: `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`,
    slug: `${slug}-${h.slice(32, 43)}`,
    title,
    description: null,
    author: null,
    url,
    state,
    readingProgress,
    thumbnail: null,
    labels,
    savedAt,
    updatedAt: new Date(saved + (n + 2) * 86_400_000).toISOString(),
    publishedAt: new Date(saved - (n + 5) * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000Z',
    highlights: highlights.map(([quote, annotation, hours]) => ({
      quote,
      annotation,
      createdAt: new Date(saved + hours * 3_600_000).toISOString(),
    })),
  };
};

/**
 * The developer's own Omnivore export, in Omnivore's fields. Three items are
 * archived, one of them read only 40%; of the rest, two are read 95% and 91%,
 * and one 89%. Six highlights, three with an annotation.
 */
const OMNIVORE = [
  omnivoreItem(1, 'Writing for the Web Again', 'https://example.org/essays/writing-for-the-web-again', 'Archived', 100, ['essays'], '2024-05-01T08:12:44.000Z', [
    ['Write the page you would want to find.', 'Opening line for the newsletter.', 36],
    ['Every link is a promise.', null, 37],
  ]),
  omnivoreItem(2, 'The Case for Plain Text', 'https://example.com/essays/plain-text', 'Archived', 100, [], '2024-05-09T19:40:02.000Z', [
    ['Plain text outlives every app that edits it.', 'Quote this in the README.', 3],
  ]),
  omnivoreItem(3, 'Sourdough Without a Schedule', 'https://example.net/cooking/sourdough-without-a-schedule', 'Archived', 40, ['cooking'], '2024-05-18T10:05:31.000Z', []),
  omnivoreItem(4, 'How Indexes Really Work', 'https://example.com/databases/how-indexes-work', 'Succeeded', 95, ['databases'], '2024-06-02T21:17:09.000Z', [
    ['An index is a second copy of the data, sorted for one question.', null, 26],
  ]),
  omnivoreItem(5, 'Caching at the Edge', 'https://example.org/web/caching-at-the-edge', 'Succeeded', 91, ['web'], '2024-06-11T07:51:48.000Z', []),
  omnivoreItem(6, 'Backpressure, Explained', 'https://example.net/engineering/backpressure', 'Succeeded', 60, ['performance'], '2024-06-20T18:33:15.000Z', [
    ['A queue without a limit is a memory leak with extra steps.', 'Think about the jobs table.', 50],
  ]),
  omnivoreItem(7, 'A Year of Litestream', 'https://example.com/ops/a-year-of-litestream', 'Succeeded', 0, [], '2024-07-03T12:00:27.000Z', []),
  omnivoreItem(8, 'Small Tools, Long Lives', 'https://example.org/essays/small-tools', 'Succeeded', 0, ['web', 'essays'], '2024-07-14T09:26:53.000Z', []),
  omnivoreItem(9, 'Reading Query Plans', 'https://example.net/databases/reading-query-plans', 'Succeeded', 89, [], '2024-07-22T22:48:10.000Z', []),
  omnivoreItem(10, 'Postmortems Without Blame', 'https://example.com/ops/postmortems', 'Succeeded', 12, ['ops'], '2024-08-05T16:14:39.000Z', [
    ['Ask what made the mistake easy to make.', null, 4],
  ]),
];

/**
 * What the hidden tests expect of the exports, so they and this file can never
 * disagree. score/team/ reads it from team-1.json.
 */
const EXPECT = {
  instapaper: {
    links: 14,
    highlights: 5,
    selections: [
      'Most of the time a fast tool saves is spent waiting on a slow decision.',
      'Brown the butter before the miso goes in.',
      'A backup you have never restored is a hope, not a backup.',
      'Small sites are easier to keep alive.',
      'Test the restore, not the backup.',
    ],
    folder_tags: { 'folder:Long reads': 2, 'folder:Recipes': 2, 'folder:Starred': 2, 'folder:Work notes': 1 },
    never_tags: ['folder:Unread', 'folder:Archive'],
    archived_and_read: ['https://example.org/notes/on-backups', 'https://example.com/blog/sqlite-at-the-edge', 'https://example.net/blog/htmx-in-production'],
    unread: ['https://example.net/news/fly-volumes', 'https://example.org/blog/litestream-restores', 'https://example.com/posts/postmark-streams', 'https://example.net/posts/ulid-vs-uuid'],
    // K3's newer export: the first row, already saved, with a Selection it lacked.
    newer_selection: 'A lamp is a promise kept every night.',
  },
  omnivore: {
    links: 10,
    highlights: 6,
    notes: 3,
    archived: ['https://example.org/essays/writing-for-the-web-again', 'https://example.com/essays/plain-text', 'https://example.net/cooking/sourdough-without-a-schedule'],
    read: [
      'https://example.org/essays/writing-for-the-web-again', 'https://example.com/essays/plain-text', 'https://example.net/cooking/sourdough-without-a-schedule',
      'https://example.com/databases/how-indexes-work', 'https://example.org/web/caching-at-the-edge',
    ],
    unread: [
      'https://example.net/engineering/backpressure', 'https://example.com/ops/a-year-of-litestream', 'https://example.org/essays/small-tools',
      'https://example.net/databases/reading-query-plans', 'https://example.com/ops/postmortems',
    ],
  },
};

// ---------------------------------------------------------------- write it

const task = {
  note: 'Part 13 (docs/build-plan.md). Written by tasks/team/team-1.mjs; change that, not this.',
  id: 'team-1',
  user: 'developer',
  starter: 'starters/long-1',
  folder: 'satchel',
  conditions: ['A', 'C', 'D'],
  round_1: ROUND_1,
  round_2: ROUND_2,
  files: FILES,
  notes: 'team-1-notes.md',
  examples: 'team-1-examples',
  decisions: DECISIONS,
  checks: CHECKS,
  expect: EXPECT,
};

const write = (rel, text) => {
  const to = join(HERE, rel);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, text);
};

write('team-1.json', JSON.stringify(task, null, 2) + '\n');
write('team-1-notes.md', NOTES);
write('team-1/instapaper-export.csv', INSTAPAPER);
write('team-1/omnivore-export.json', JSON.stringify(OMNIVORE, null, 2) + '\n');
console.log('Wrote team-1.json, team-1-notes.md and team-1/.');
