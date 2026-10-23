// long-2, the second of area 9's long tasks (part 8): one long session at
// work, in tidewell-api, on one Linear ticket. This file writes the task's
// steps file, tasks/long/long-2.json, and the material its steps hand over,
// tasks/long/long-2/: what the developer saved into the repository's tmp/
// folder for the agent to read. All of it is made up and seeded, so running
// this again writes the same bytes; check/tasks.mjs holds both to that.
//
//   node tasks/long/long-2.mjs
//
// The steps follow the blueprint in docs/build-plan.md, part 8. The core
// builds webhooks for project events (ENG-447), with the decisions only later
// steps need and three approaches the developer asks for that then fail on
// staging. The developer is on call this week, so the more steps are
// production questions about the same API, each answered from what the
// developer saved, and a few fixes, until the session passes 500,000 tokens.
// The after steps finish the ticket. The team's conventions are never said in
// the session: they are known only from the history and the brain. No step
// assumes what the agent wrote: a failure is reported as what the developer or
// the partner saw, and what the material shows of the new code (a header, an
// event's body, the retry schedule) is what the developer specified.

import { createHmac } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STEPS_FILE = join(HERE, 'long-2.json');
export const MATERIAL_DIR = join(HERE, 'long-2');

// ---------------------------------------------------------------- seeded randomness

const B32 = '0123456789abcdefghjkmnpqrstvwxyz';
const HEX = '0123456789abcdef';
const ALNUM = 'abcdefghijkmnopqrstuvwxyz23456789';

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
  const r = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** Log-normal around a median: durations, sizes. */
    around: (median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(next() || 1e-12)) * Math.cos(2 * Math.PI * next())),
    hex: (n) => chars(n, HEX),
    b32: (n) => chars(n, B32),
    alnum: (n) => chars(n, ALNUM),
    uuid: () => `${chars(8, HEX)}-${chars(4, HEX)}-4${chars(3, HEX)}-${'89ab'[Math.floor(next() * 4)]}${chars(3, HEX)}-${chars(12, HEX)}`,
  };
  return r;
}

// ---------------------------------------------------------------- time and log lines

const T = (s) => Date.parse(s);
const iso = (ms) => new Date(Math.round(ms)).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const unix = (ms) => Math.floor(ms / 1000);

/** One line as src/log.ts writes it. */
const logLine = (level, ms, msg, fields = {}) => ({ ms, json: { level, time: iso(ms), msg, ...fields } });

/** The API's request line, from src/middleware/requestLog.ts. */
const requestLine = (ms, { method, path, status, took, org = null, key = null, ua = null, ip }) =>
  logLine('info', ms, 'request', { method, path, status, ms: took, org, key, ua, ip });

/** A line as `aws logs tail` prints it: when it was ingested, its stream, the message. */
const tailed = (stream) => (line) => ({ ms: line.ms, text: `${iso(line.ms + 180).slice(0, 23)}000+00:00 ${stream} ${JSON.stringify(line.json)}` });

const sortLines = (lines) => lines.map((l, i) => ({ ...l, i })).sort((a, b) => a.ms - b.ms || a.i - b.i).map((l) => l.text);

/**
 * Lines split into files of about `size` characters each, so each is one Read:
 * `<dir>/<n>.log`, or `<base>-<n>.<ext>` when given a base name in place of a folder.
 */
function parts(dir, lines, size = 46_000, { base = null, ext = 'log', head = null } = {}) {
  const out = new Map();
  let part = head ? [head] : [];
  let length = head ? head.length + 1 : 0;
  const flush = () => {
    if (part.length > (head ? 1 : 0)) out.set(base ? `${base}-${out.size + 1}.${ext}` : `${dir}/${out.size + 1}.${ext}`, `${part.join('\n')}\n`);
    part = head ? [head] : [];
    length = head ? head.length + 1 : 0;
  };
  for (const l of lines) {
    if (length + l.length > size && part.length > (head ? 1 : 0)) flush();
    part.push(l);
    length += l.length + 1;
  }
  flush();
  return out;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// ---------------------------------------------------------------- Tidewell's world

const DB_HOST = 'tidewell-prod.cnx0kq3p7y2b.eu-west-1.rds.amazonaws.com';
const ERR = {
  closed: { name: 'PrismaClientKnownRequestError', code: 'P1017', message: 'Server has closed the connection.' },
  unreachable: { name: 'PrismaClientInitializationError', code: 'P1001', message: `Can't reach database server at \`${DB_HOST}:5432\`\n\nPlease make sure your database server is running at \`${DB_HOST}:5432\`.` },
  pool: { name: 'PrismaClientKnownRequestError', code: 'P2024', message: 'Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 10)' },
  unique: { name: 'PrismaClientKnownRequestError', code: 'P2002', message: 'Unique constraint failed on the fields: (`organization_id`,`email`)' },
  json: { name: 'SyntaxError', message: 'Unexpected token \'}\', ..."ail.com",}" is not valid JSON' },
};

const NAME_A = 'Harbour North Ember Copper Willow Granite Juniper Meridian Ash Linden Quarry Saltmarsh Cobalt Fennel Orchard Lantern Tidal Ironbark Bramble Kestrel Larch Alder Basalt Cinder Driftwood Elm Foxglove Garnet Heather Indigo'.split(' ');
const NAME_B = 'Studio Labs Partners Works Collective Group Digital Co Agency Systems Design Consulting Media Logistics Health Analytics Ventures Foundry Supply Outdoors'.split(' ');

/** The organisations of the week's material, with their API keys' prefixes. */
const ORGS = (() => {
  const r = seeded('orgs');
  const seen = new Set();
  const out = [];
  while (out.length < 150) {
    const name = `${r.pick(NAME_A)} ${r.pick(NAME_B)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: r.uuid(), name, keys: Array.from({ length: r.chance(0.2) ? 2 : 1 }, () => `tw_${r.alnum(8)}`), projects: Math.round(r.around(900, 1.3)) });
  }
  // Two large customers the week's questions turn on.
  out[7].name = 'Harbour & Finch';
  out[7].projects = 41_380;
  out[12].name = 'Meridian Logistics';
  out[12].projects = 182_406;
  return out;
})();
const BY_NAME = Object.fromEntries(ORGS.map((o) => [o.name, o]));

/** Ferrowell works for forty of these organisations, each through that organisation's own key. */
const FERROWELL = {
  ua: 'Ferrowell-Sync/2.3 (+https://ferrowell.example/bot)',
  ips: ['203.0.113.41', '203.0.113.42', '203.0.113.43'],
  orgs: ORGS.filter((_, i) => i % 3 === 1 && i !== 7 && i !== 12).slice(0, 40),
  sandbox: { first: '5c0f2a9e-7d41-4b8e-9a3f-1e6b2d8c4f70', second: 'b8e14d02-3a6c-4f19-8d7e-62c09a5f13be' },
};
const OTHER_UAS = ['tidewell-js/3.4.1 node/22.11.0', 'python-requests/2.32.3', 'tidewell-py/1.9.0 CPython/3.12.6', 'Go-http-client/2.0', 'curl/8.7.1', 'Zapier', 'PostmanRuntime/7.43.0', 'okhttp/4.12.0'];
const clientIp = (r) => (r.chance(0.5) ? `198.51.100.${r.int(2, 254)}` : `192.0.2.${r.int(2, 254)}`);
const taskId = (r) => r.hex(32);

// ---------------------------------------------------------------- the steps

const filesUnder = (material, dir) => Object.fromEntries([...material.keys()].filter((p) => p.startsWith(`${dir}/`)).sort().map((p) => [`tmp/${p}`, p]));
const fileAt = (...paths) => Object.fromEntries(paths.map((p) => [`tmp/${p}`, p]));

const RESUME_NOTE = "I'm carrying on from my last session, where we were adding webhooks for project events, ENG-447.";

const SIGNING_VECTOR = { secret: 'whsec_test', t: 1792656000, body: '{"a":1}' };

function core() {
  return [
    "New ticket this morning, ENG-447: webhooks for project events. Partners who build on our API poll the projects list to find out what changed, and Ferrowell, the biggest of them, polls every organisation it works for every few seconds. They want us to call them instead. I'm also on call this week, so other things will land in the middle of this. Before you write anything, read the code and tell me where webhooks fit: how projects change today, how the worker and the jobs table work, how flags work, and what you would reuse. Don't change anything yet.",
    [
      'Here is how the webhooks behave. Some of it only matters later, but I want it settled now.',
      '',
      '- Event names are project.<verb in the past tense>: project.created and project.archived now, and the same pattern for anything we add later.',
      "- Every delivery's body is one envelope: { id, type, created_at, data }. id is the event's id, the same on every attempt at it; type is the event's name; created_at is when the event happened; data is the project, exactly as GET /v2/organizations/:id/projects/:projectId returns it.",
      "- Dead letters are ours to deal with, not the customer's. Anything that lists or replays them goes under the admin routes, staff only; a customer's API key never sees them. Support talks to the customer.",
      '- We keep deliveries for 45 days. Partners reconcile monthly, and a month and a half covers a late one. A nightly job deletes anything older, delivered or dead.',
      '',
      'Now the first cut. An organisation registers an endpoint with POST /v2/organizations/:id/webhooks: a URL, and we answer with a secret, shown that once. The events are project.created and project.archived. When one happens, the API writes a delivery row for each endpoint of that organisation, and the worker sends them. Ship it dark behind the Unleash flag eng-447-project-webhooks, which I have created: an organisation without the flag gets no deliveries.',
      '',
      'Keep this cut simple, so I can see it work on staging today:',
      '- When a delivery fails, schedule its next attempt in the worker with setTimeout, a minute later. I don\'t want a row per attempt yet.',
      "- Sign each body: SHA-256 of the endpoint's secret followed by the body, hex, through createHash, in a Tidewell-Signature header.",
      '- Claim and send inside one interactive Prisma transaction, so a delivery is never marked sent unless it really went out.',
      '',
      "Prisma for the queries, like everything else. Change the schema as you need, but don't write the migration yet; I'll ask for it at the end.",
    ].join('\n'),
    "It's on staging. Ferrowell pointed their sandbox receiver at it, and their receiver was down for a deploy of their own from 11:02 to 11:09 UTC, answering 503. At 11:05 a staging deploy, someone else's merge, replaced our worker's task. Every delivery that was waiting in a setTimeout went with the old task: 14 deliveries were never tried again, and nothing in the database says they were ever due. A retry has to outlive the process that scheduled it.\n\nMove retries into the database. A delivery row gets next_attempt_at, the worker polls for deliveries that are due, the way it polls the jobs table, and a failed attempt sets the next one. No timers holding state.",
    "Second problem, from Ferrowell's developer: they can't verify any of our signatures. Every provider they take webhooks from signs with an HMAC, and their verifier is one function for all of them. They won't special-case us, and they're right: a hash of the secret glued to the body isn't a MAC.\n\nSign it properly: HMAC-SHA256 with the endpoint's secret, through createHmac, over the timestamp, a dot and the raw body. Send it as Tidewell-Signature: t=<unix seconds>,v1=<hex>. t is when that attempt is sent, so every attempt signs afresh. Write down in the README how a receiver checks it, including that they should refuse a t more than five minutes old.",
    "Something worse on staging this afternoon. Ferrowell's sandbox hung on one request for 41 seconds before answering. Our interactive transaction had expired at 5 seconds, Prisma's default, and the worker logged P2028: \"Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 41230 ms passed since the start of the transaction.\" So the delivery went out but was never marked sent, the next poll sent it again, and they got the same event six times. While the transaction was open it also held one of the worker's five database connections, and invites queued up behind it.\n\nNever hold a transaction open across a network call. Claim the due rows in a short transaction that marks them taken until a lease runs out, send outside any transaction with a 10-second timeout, then record the result in its own small write. A lease that runs out makes the row claimable again, so a worker that dies mid-send doesn't strand it.",
    'Now the schedule. After a failed attempt, the next one comes 1 minute later, then 5 minutes, 15 minutes, 1 hour, 3 hours, 6 hours and 12 hours. The eighth failure dead-letters the delivery: it stops, keeping its last status code and error. Any 2xx is a success. A 410 Gone means the endpoint is gone: the delivery dead-letters at once and the endpoint is disabled. Anything else, and a timeout, is a failure.',
    `Tests, in Jest like the rest, with Prisma mocked the way the existing tests do it. The signature against a fixed vector: secret ${SIGNING_VECTOR.secret}, t=${SIGNING_VECTOR.t}, body ${SIGNING_VECTOR.body}. The schedule attempt by attempt, and dead-lettering on the eighth failure and on a 410. Claiming: a row under a lease isn't claimed again until the lease runs out. The envelope's shape. I'll run them.`,
    "They pass on my machine. Now the migration for all of it: the tables, columns and indexes this needs, as one migration in prisma/migrations/, written the way our migrations are. The deliveries table will be large and polled every few seconds, so think about the index the worker's poll needs, and tell me what the migration locks.",
  ];
}

const AFTER = [
  "Projects get renamed too, through PATCH. Send an event when a project's name changes, the way we settled events at the start of this work, with tests like the others.",
  'Now the dead letters and the old deliveries, the way we settled them at the start of this work: a way to replay a dead-lettered delivery, under /v2, and the cleanup of old deliveries. Tests for both.',
  "Last part. Write PR.md for ENG-447: the branch name, the pull request's title and its description, a note for whoever reviews the migration, and the deploy note. I'll open the pull request myself.",
];

// ---------------------------------------------------------------- what is checked

/** Text with its braces balanced, three levels deep, as little as possible of it. */
const BALANCED = '(?:[^{}]|\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\})*?';

const CHECKS = {
  note: "Area 9 is read by hand as well (docs/design.md). finished and kept read the files a strategy changed since the fork, and its last reply; retried reads everything it wrote after the fork (writes.json), so an approach tried and taken back still counts. A check marked hand has no script. The checks named team- are the team's conventions, never said in the session: a pull request that breaks them isn't finished.",
  finished: [
    { id: 'renamed', what: "a change to a project's name sends an event", in: 'files', file: 'src/**', patterns: ['\\brenam\\w*', '\\bname_changed\\b'] },
    { id: 'replay', what: 'a dead-lettered delivery can be replayed', in: 'files', file: 'src/**', patterns: ['\\breplay\\w*', '\\bredeliver\\w*', '\\bresend\\w*', '/retry\\b'] },
    { id: 'cleanup', what: 'a nightly job deletes old deliveries', in: 'files', file: '{src,prisma}/**', patterns: ['\\b(?:purge|prune|clean|delete)\\w*[\\s\\S]{0,300}?deliver', '\\bdeliver\\w*[\\s\\S]{0,300}?\\b(?:purge|prune|cleanup|deleteMany)\\b'] },
    { id: 'tests', what: 'the rename, the replay and the cleanup have tests', hand: true },
    { id: 'pr', what: 'PR.md is written for ENG-447', in: 'files', file: 'PR.md', any: ['ENG-447'] },
    { id: 'team-branch', what: "the team's branch: the ticket key and a slug, no prefix", in: 'files', file: 'PR.md', exact: true, patterns: ['(?<![\\w/-])ENG-447-[a-z0-9]+(?:-[a-z0-9]+)*'] },
    { id: 'team-title', what: "the team's title: it starts with the ticket key", in: 'files', file: 'PR.md', exact: true, patterns: ['(?<![\\w/-])ENG-447: \\S'] },
    { id: 'team-sections', what: "the team's sections: Why, What changed, How I tested, Rollback", in: 'files', file: 'PR.md', all: ['What changed', 'How I tested', 'Rollback'] },
    { id: 'team-reviewer', what: 'the note for the migration is for Ana, who reviews every migration', in: 'files', file: 'PR.md', exact: true, any: ['Ana'] },
    { id: 'team-deploy-note', what: 'the deploy note is for #eng-deploys, says the flag stays off, and gives the rollback as the promote workflow with the previous image', hand: true },
  ],
  kept: [
    { id: 'event-name', what: 'the event is named project.renamed', in: 'files', file: 'src/**', exact: true, patterns: ['\\bproject\\.renamed\\b'] },
    { id: 'envelope', what: 'it goes out in the same envelope, { id, type, created_at, data }, with data the project as the API returns it', hand: true },
    {
      id: 'dead-letters-admin',
      what: 'replaying a dead letter is under the admin routes, staff only',
      in: 'files',
      file: 'src/**',
      patterns: [
        'requireAdmin[\\s\\S]{0,600}?\\b(?:replay|redeliver|resend|dead[\\s_-]?letter)\\w*',
        '\\b(?:replay|redeliver|resend|dead[\\s_-]?letter)\\w*[\\s\\S]{0,600}?requireAdmin',
        '\\badmin\\b[^\\n]{0,80}\\b(?:webhook|deliver|dead|replay)\\w*',
        '\\badmin(?:Webhook|Deliver|Dead|Replay)\\w*',
      ],
    },
    {
      id: 'retention',
      what: 'deliveries are kept for 45 days',
      in: 'files',
      file: '{src,prisma}/**',
      patterns: [
        '\\b45\\s*\\*\\s*(?:24\\b|\\w*day\\w*|86_?400)',
        '\\b45\\b[^\\n]{0,40}\\bdays?\\b',
        '\\bdays?\\b[^\\n]{0,30}\\b45\\b',
        '\\b\\w*(?:retention|keep|retain|ttl)\\w*\\s*[:=]\\s*45\\b',
        '\\w*days?\\(\\s*[^,()]*,\\s*45\\s*\\)',
      ],
    },
  ],
  retried: [
    {
      id: 'timer-retry',
      what: 'a retry scheduled with setTimeout',
      in: 'writes',
      patterns: [
        'setTimeout\\(\\s*(?:async\\s*)?\\(\\s*\\)\\s*=>\\s*\\{?\\s*(?:void\\s+|await\\s+|return\\s+)?(?:this\\.|\\w+\\.)?(?:deliver|send|dispatch|retry|attempt|post|redeliver)\\w*\\s*\\(',
        'setTimeout\\(\\s*(?:this\\.|\\w+\\.)?(?:deliver|send|dispatch|retry|attempt)\\w*\\s*(?:,|\\.bind\\()',
      ],
    },
    {
      id: 'hash-signature',
      what: 'a signature made with createHash instead of an HMAC',
      in: 'writes',
      patterns: ['createHash\\(\\s*[\'"]sha256[\'"]\\s*\\)[\\s\\S]{0,200}?\\b(?:secret|signing|signature)\\w*', '\\b(?:secret|signing)\\w*[\\s\\S]{0,160}?\\bcreateHash\\('],
    },
    {
      id: 'http-in-transaction',
      what: 'a network call inside an interactive Prisma transaction',
      in: 'writes',
      // Inside the callback's body at any depth, never past its closing brace:
      // balanced groups are skipped, and a group still open may be entered.
      patterns: [`\\$transaction\\(\\s*async\\s*(?:function\\s*)?(?:\\([^)]*\\)|\\w+)\\s*(?:=>\\s*)?\\{${BALANCED}(?:\\{${BALANCED})*?\\b(?:fetch|deliver\\w*|send\\w*|post\\w*|dispatch\\w*|request|axios\\.\\w+|got|undici\\.\\w+)\\s*\\(`],
    },
  ],
};

// What the fake writes for each after step, and what check/tasks.mjs scores:
// right holds every scripted finished and kept check and no retried one;
// retry holds every retried check; forgot finishes the work but loses
// decisions made only in conversation.
const PR_RIGHT = [
  '# ENG-447: Webhooks for project events',
  '',
  'Branch: `ENG-447-project-webhooks`',
  'Title: ENG-447: Webhooks for project events',
  '',
  '## Why',
  '',
  'Partners poll the projects list to find out what changed. Webhooks tell them instead.',
  '',
  '## What changed',
  '',
  '- Endpoints, events and deliveries, behind eng-447-project-webhooks.',
  '',
  '## How I tested',
  '',
  'Jest, and on staging against a partner sandbox.',
  '',
  '## Rollback',
  '',
  'Turn the flag off. To roll back the code, run the promote workflow again with the previous image.',
  '',
  '## Note for Ana',
  '',
  'The migration creates two tables and their indexes, and locks nothing that exists.',
  '',
  '## Deploy note (#eng-deploys)',
  '',
  'ENG-447 goes out dark: the flag stays off until we turn it on for one partner.',
  '',
].join('\n');

const EXAMPLES = {
  note: 'One entry per after step. The fake writes these files and gives this reply; check/tasks.mjs holds them to the checks.',
  right: [
    {
      files: [
        { path: 'src/webhooks/events.ts', text: "import type { ApiProject } from '../services/projects';\n\nexport type EventType = 'project.created' | 'project.archived' | 'project.renamed';\n\nexport function envelope(id: string, type: EventType, createdAt: Date, data: ApiProject) {\n  return { id, type, created_at: createdAt.toISOString(), data };\n}\n" },
        { path: 'src/services/projects.ts', text: "  if (before.name !== project.name) await recordEvent(organizationId, 'project.renamed', project);\n" },
      ],
      answer: 'A name change now sends project.renamed, in the same envelope as the others, with the project as the API returns it.',
    },
    {
      files: [
        { path: 'src/routes/v2/admin/index.ts', text: "admin.use(requireAdmin);\nadmin.use('/organizations', adminOrganizations);\nadmin.use('/webhook-deliveries', adminWebhookDeliveries);\n" },
        { path: 'src/routes/v2/admin/webhookDeliveries.ts', text: "export const adminWebhookDeliveries = Router();\n\nadminWebhookDeliveries.post('/:deliveryId/replay', async (req, res) => {\n  res.status(202).json(await replayDelivery(req.params.deliveryId));\n});\n" },
        { path: 'src/jobs/handlers/purgeWebhookDeliveries.ts', text: "export const KEEP_DELIVERIES_DAYS = 45;\n\nexport async function purgeWebhookDeliveries() {\n  const before = new Date(Date.now() - KEEP_DELIVERIES_DAYS * 24 * 60 * 60 * 1000);\n  await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: before } } });\n}\n" },
      ],
      answer: 'Staff can replay a dead letter under /v2/admin/webhook-deliveries, and a nightly job deletes deliveries older than 45 days.',
    },
    {
      files: [{ path: 'PR.md', text: PR_RIGHT }],
      answer: 'PR.md is written: the branch, the title, the four sections, the note for Ana and the deploy note.',
    },
  ],
  retry: [
    {
      files: [
        { path: 'src/webhooks/send.ts', text: "export function sign(secret: string, body: string) {\n  return createHash('sha256').update(secret + body).digest('hex');\n}\n\nexport function retryLater(delivery: Delivery) {\n  setTimeout(() => void deliver(delivery), 60_000);\n}\n" },
      ],
      answer: 'Added the rename.',
    },
    {
      files: [
        { path: 'src/webhooks/worker.ts', text: "export async function sendDue() {\n  await prisma.$transaction(async (tx) => {\n    const due = await tx.webhookDelivery.findMany({ where: { status: 'pending' }, take: 10 });\n    for (const d of due) {\n      const res = await fetch(d.url, { method: 'POST', body: d.body });\n      await tx.webhookDelivery.update({ where: { id: d.id }, data: { status: res.ok ? 'delivered' : 'failed' } });\n    }\n  });\n}\n" },
      ],
      answer: 'Replay and cleanup are in.',
    },
    {
      files: [{ path: 'PR.md', text: '# Webhooks\n' }],
      answer: 'PR.md is written.',
    },
  ],
  forgot: [
    {
      files: [{ path: 'src/webhooks/events.ts', text: "export type EventType = 'project.created' | 'project.archived' | 'project.name_changed';\n" }],
      answer: 'A name change now sends project.name_changed.',
    },
    {
      files: [
        { path: 'src/routes/v2/webhooks.ts', text: "webhooks.post('/:id/webhooks/deliveries/:deliveryId/replay', requireOrgAccess, async (req, res) => {\n  res.status(202).json(await replayDelivery(res.locals.organizationId, req.params.deliveryId));\n});\n" },
        { path: 'src/jobs/handlers/purgeWebhookDeliveries.ts', text: "export async function purgeWebhookDeliveries() {\n  const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);\n  await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: before } } });\n}\n" },
      ],
      answer: 'An organisation can replay its own dead letters, and a nightly job deletes deliveries older than 30 days.',
    },
    {
      files: [{ path: 'PR.md', text: PR_RIGHT }],
      answer: 'PR.md is written.',
    },
  ],
};

// ---------------------------------------------------------------- requests, as the API answers them

/** Each organisation's client: what it sends as its user agent, and from where. */
const CLIENTS = (() => {
  const r = seeded('clients');
  return new Map(ORGS.map((o) => {
    const ferrowell = FERROWELL.orgs.includes(o);
    return [o.id, {
      ua: ferrowell ? FERROWELL.ua : r.pick(OTHER_UAS),
      ips: ferrowell ? FERROWELL.ips : [clientIp(r), ...(r.chance(0.3) ? [clientIp(r)] : [])],
      weight: ferrowell ? 0 : r.around(1, 1.1),
    }];
  }));
})();
const WEIGHTED = ORGS.filter((o) => CLIENTS.get(o.id).weight > 0);
const TOTAL_WEIGHT = WEIGHTED.reduce((n, o) => n + CLIENTS.get(o.id).weight, 0);

function pickOrg(r) {
  let x = r.next() * TOTAL_WEIGHT;
  for (const o of WEIGHTED) {
    x -= CLIENTS.get(o.id).weight;
    if (x <= 0) return o;
  }
  return WEIGHTED.at(-1);
}

const KINDS = [
  ['list', 0.44], ['get', 0.17], ['org', 0.05], ['create', 0.1], ['patch', 0.09], ['archive', 0.03],
  ['bulk', 0.012], ['export', 0.02], ['no-key', 0.012], ['bad-key', 0.012], ['empty-name', 0.008], ['bad-json', 0.004],
];
function pickKind(r) {
  let x = r.next();
  for (const [k, p] of KINDS) {
    x -= p;
    if (x <= 0) return k;
  }
  return 'list';
}

/** How long a list takes for an organisation: big ones are slow, and slower the deeper the page. */
const listMs = (r, org, page = 1) => Math.round(org.projects > 20_000 ? r.around(380 + page * 9.5, 0.25) : r.around(9 + org.projects / 160, 0.45));

/** One request: what it asked for and how it was answered, before anything goes wrong. */
function answer(r, kind, org, { page = 1 } = {}) {
  const base = `/v2/organizations/${org.id}`;
  const c = CLIENTS.get(org.id);
  const who = { org: org.id, key: r.pick(org.keys), ua: c.ua, ip: r.pick(c.ips) };
  switch (kind) {
    case 'list': return { method: 'GET', path: `${base}/projects`, status: 200, took: listMs(r, org, page), ...who };
    case 'get': return { method: 'GET', path: `${base}/projects/${r.uuid()}`, status: r.chance(0.04) ? 404 : 200, took: r.int(3, 9), ...who };
    case 'org': return { method: 'GET', path: base, status: 200, took: r.int(3, 7), ...who };
    case 'create': return { method: 'POST', path: `${base}/projects`, status: 201, took: r.int(9, 24), ...who };
    case 'patch': return { method: 'PATCH', path: `${base}/projects/${r.uuid()}`, status: r.chance(0.05) ? 404 : 200, took: r.int(8, 21), ...who };
    case 'archive': return { method: 'POST', path: `${base}/projects/${r.uuid()}/archive`, status: 200, took: r.int(9, 19), ...who };
    case 'bulk': return { method: 'POST', path: `${base}/invites/bulk`, status: r.chance(0.7) ? 404 : 202, took: r.int(6, 160), ...who };
    case 'export': return { method: 'GET', path: `${base}/export`, status: 200, took: Math.round(r.around(150 + org.projects / 9, 0.3)), ...who };
    case 'no-key': return { method: 'GET', path: `${base}/projects`, status: 401, took: r.int(1, 2), org: null, key: null, ua: c.ua, ip: who.ip };
    case 'bad-key': return { method: 'GET', path: `${base}/projects`, status: 404, took: r.int(2, 4), org: null, key: null, ua: c.ua, ip: who.ip };
    case 'empty-name': return { method: 'POST', path: `${base}/projects`, status: 422, took: r.int(2, 5), ...who };
    case 'bad-json': return { method: 'POST', path: `${base}/projects`, status: 500, took: r.int(1, 3), org: null, key: null, ua: c.ua, ip: who.ip, error: ERR.json };
    default: throw new Error(kind);
  }
}

/** The lines one finished request leaves: the error first when there is one, then the request line. */
function requestLines(at, a) {
  const end = at + a.took;
  const out = [];
  if (a.error) out.push(logLine('error', end - 1, 'request failed', { method: a.method, path: a.path, error: a.error }));
  out.push(requestLine(end, { method: a.method, path: a.path, status: a.status, took: a.took, org: a.org, key: a.key, ua: a.ua, ip: a.ip }));
  return out;
}

// ---------------------------------------------------------------- Thursday's failover (2026-10-22)

const FAILOVER = { down: T('2026-10-22T03:10:58.200Z'), back: T('2026-10-22T03:11:41.600Z') };

/**
 * RDS's maintenance window opens at 03:00 UTC on Thursdays. This one applied
 * an operating-system update to the Multi-AZ instance, which failed over at
 * 03:10:58 and answered again at 03:11:41. Requests failed while it was gone,
 * and both workers crashed: a failure inside a job's catch, or in a poll, is
 * thrown out of the worker's loop (src/worker.ts). ECS started new tasks, and
 * the first reclaimed the job that was running, so nine invites went twice.
 */
function failover() {
  const r = seeded('failover');
  const from = T('2026-10-22T02:55:00Z');
  const to = T('2026-10-22T03:40:00Z');
  const { down, back } = FAILOVER;
  const streams = Array.from({ length: 6 }, () => `api/api/${taskId(r)}`);
  const events = [];
  for (const org of FERROWELL.orgs) {
    for (let t = from + r.int(0, 10 * SEC); t < to; t += 10 * SEC + r.int(-250, 250)) events.push({ t, kind: 'list', org });
  }
  for (let t = from + r.int(0, 2000); t < to; t += Math.max(120, r.around(1.8 * SEC, 0.9))) events.push({ t, kind: pickKind(r), org: pickOrg(r) });
  events.sort((a, b) => a.t - b.t);
  const lines = [];
  const failed = { requests: 0, orgs: new Set(), ferrowell: 0, writes: 0, closed: { count: 0, at: [] }, unreachable: { count: 0, at: [] } };
  for (const e of events) {
    const stream = r.pick(streams);
    const a = answer(r, e.kind, e.org);
    if (a.org && e.t + a.took >= down && e.t < back) {
      // In flight when the connections were cut, or asking for one while there was nothing to connect to.
      const cut = e.t < down + 1500;
      a.status = 500;
      a.error = cut ? ERR.closed : ERR.unreachable;
      a.took = cut ? Math.max(1, Math.round(down - e.t) + r.int(1, 30)) : r.int(5004, 5190);
      failed.requests += 1;
      failed.orgs.add(e.org.id);
      if (CLIENTS.get(e.org.id).ua === FERROWELL.ua) failed.ferrowell += 1;
      if (a.method !== 'GET') failed.writes += 1;
      const kind = cut ? failed.closed : failed.unreachable;
      kind.count += 1;
      kind.at.push(e.t + a.took - 1);
    }
    if (a.method === 'GET' && a.status < 300) continue;
    for (const l of requestLines(e.t, a)) lines.push(tailed(stream)(l));
  }

  // The workers: a bulk invite at 03:04, and another at 03:10:49 that was running when the database went.
  const w = Array.from({ length: 4 }, () => `worker/worker/${taskId(r)}`);
  const wl = (i, level, at, msg, fields) => tailed(w[i])(logLine(level, at, msg, fields));
  const jobs = Array.from({ length: 4 }, () => r.uuid());
  const worker = [];
  const send = (i, job, at, count, attempts) => {
    let t = at;
    worker.push(wl(i, 'info', t, 'job claimed', { id: job, kind: 'send_invite_emails', attempts }));
    for (let k = 0; k < count; k += 1) t += r.int(90, 160);
    worker.push(wl(i, 'info', t, 'invites sent', { job, count }));
    worker.push(wl(i, 'info', t + r.int(3, 9), 'job done', { id: job, kind: 'send_invite_emails', ms: Math.round(t - at) + 6 }));
    return t + 10;
  };
  let t1 = T('2026-10-22T03:04:11.204Z');
  let t2 = t1 + 512;
  t1 = send(0, jobs[0], t1, 50, 1);
  t2 = send(1, jobs[1], t2, 50, 1);
  send(0, jobs[2], Math.max(t1, t2) + 1800, 20, 1);
  const lost = T('2026-10-22T03:10:50.118Z');
  worker.push(wl(0, 'info', lost, 'job claimed', { id: jobs[3], kind: 'send_invite_emails', attempts: 1 }));
  worker.push(wl(0, 'error', down + 214, 'worker crashed', { error: ERR.closed }));
  worker.push(wl(1, 'error', down + 1176, 'worker crashed', { error: ERR.closed }));
  const started3 = T('2026-10-22T03:11:44.902Z');
  const started4 = T('2026-10-22T03:12:09.377Z');
  worker.push(wl(2, 'info', started3, 'worker started', { worker: `ip-10-20-${r.int(1, 254)}-${r.int(1, 254)}.eu-west-1.compute.internal:1` }));
  worker.push(wl(3, 'info', started4, 'worker started', { worker: `ip-10-20-${r.int(1, 254)}-${r.int(1, 254)}.eu-west-1.compute.internal:1` }));
  // The claim of 03:10:50 counts as abandoned once it is a minute old.
  send(2, jobs[3], T('2026-10-22T03:11:52.430Z'), 50, 2);

  const ecs = {
    note: 'aws ecs describe-services --services tidewell-api tidewell-worker, events since 02:00, and the two stopped worker tasks',
    serviceEvents: [
      { createdAt: '2026-10-22T03:12:31.884Z', message: '(service tidewell-worker) has reached a steady state.' },
      { createdAt: '2026-10-22T03:11:58.016Z', message: `(service tidewell-worker) has started 1 tasks: (task ${w[3].split('/')[2]}).` },
      { createdAt: '2026-10-22T03:11:27.509Z', message: `(service tidewell-worker) has started 1 tasks: (task ${w[2].split('/')[2]}).` },
      { createdAt: '2026-10-22T03:11:05.733Z', message: `(service tidewell-worker) has stopped 1 running tasks: (task ${w[1].split('/')[2]}).` },
      { createdAt: '2026-10-22T03:11:04.120Z', message: `(service tidewell-worker) has stopped 1 running tasks: (task ${w[0].split('/')[2]}).` },
      { createdAt: '2026-10-22T02:21:40.297Z', message: '(service tidewell-api) has reached a steady state.' },
      { createdAt: '2026-10-21T20:21:38.902Z', message: '(service tidewell-api) has reached a steady state.' },
    ],
    stoppedTasks: [0, 1].map((i) => ({
      taskArn: `arn:aws:ecs:eu-west-1:210987654321:task/tidewell-prod/${w[i].split('/')[2]}`,
      lastStatus: 'STOPPED',
      stopCode: 'EssentialContainerExited',
      stoppedReason: 'Essential container in task exited',
      stoppingAt: iso(down + (i ? 1200 : 240) + 2100),
      containers: [{ name: 'worker', exitCode: 1, lastStatus: 'STOPPED' }],
    })),
  };
  const rds = {
    Events: [
      ['2026-10-22T03:00:14.512Z', 'Applying off-line patches to DB instance'],
      ['2026-10-22T03:00:15.031Z', 'Applying operating system update on the standby'],
      ['2026-10-22T03:10:41.928Z', 'Finished applying operating system update on the standby'],
      ['2026-10-22T03:10:58.196Z', 'Multi-AZ instance failover started.'],
      ['2026-10-22T03:11:30.402Z', 'DB instance restarted'],
      ['2026-10-22T03:11:41.553Z', 'Multi-AZ instance failover completed.'],
      ['2026-10-22T03:11:42.118Z', 'Applying operating system update on the old primary, now the standby'],
      ['2026-10-22T03:19:56.774Z', 'Finished applying off-line patches to DB instance'],
    ].map(([Date, Message]) => ({ SourceIdentifier: 'tidewell-prod', SourceType: 'db-instance', Message, EventCategories: [/failover/i.test(Message) ? 'failover' : 'maintenance'], Date, SourceArn: 'arn:aws:rds:eu-west-1:210987654321:db:tidewell-prod' })),
  };
  return {
    files: new Map([
      ...parts('prod-api-2026-10-22', sortLines(lines)),
      ['prod-worker-2026-10-22.log', `${sortLines(worker).join('\n')}\n`],
      ['rds-events.json', `${JSON.stringify(rds, null, 2)}\n`],
      ['ecs-events.json', `${JSON.stringify(ecs, null, 2)}\n`],
    ]),
    failed,
  };
}

// ---------------------------------------------------------------- Ferrowell's verifier (staging, 2026-10-22)

/** When each attempt after a failed one comes, as the developer set the schedule: 1, 5 and 15 minutes, 1, 3, 6 and 12 hours. */
const SCHEDULE_MIN = [1, 5, 15, 60, 180, 360, 720];

/**
 * Ferrowell's receiver checks a delivery's age against the event's created_at
 * in the body, not against t in the signature, so an attempt more than five
 * minutes after the event is refused as stale whatever t says. Their sandbox
 * was down for maintenance from 15:31 to 15:44 UTC: anything that waited out
 * that outage for more than five minutes is refused on every attempt after.
 */
function ferrowell() {
  const r = seeded('ferrowell');
  const secret = `whsec_${r.alnum(32)}`;
  const from = T('2026-10-22T14:45:00Z');
  const to = T('2026-10-22T18:45:00Z');
  const down = [T('2026-10-22T15:31:10Z'), T('2026-10-22T15:44:20Z')];
  const isDown = (t) => t >= down[0] && t < down[1];
  const projects = [];
  const lines = [];
  const say = (at, level, text) => lines.push({ ms: at, text: `${iso(at)} ${level.padEnd(5)} ${text}` });
  const stats = { events: 0, accepted: 0, stale: 0, staleEvents: new Set() };
  for (let t = from + r.int(20, 90) * SEC; t < to - 2 * MIN; t += r.int(150, 260) * SEC) {
    let type = 'project.created';
    let project;
    if (projects.length > 3 && r.chance(0.4)) {
      project = projects.splice(r.int(0, projects.length - 1), 1)[0];
      type = 'project.archived';
    } else {
      project = r.uuid();
      projects.push(project);
    }
    stats.events += 1;
    let at = t + r.int(900, 2900);
    for (let attempt = 1; attempt <= 8 && at < to; attempt += 1) {
      if (!isDown(at)) {
        const age = Math.round((at - t) / 1000);
        if (age > 300) {
          say(at + r.int(3, 12), 'WARN', `hooks: tidewell rejected type=${type} project=${project} t=${unix(at)} age=${age}s reason=stale_timestamp status=401`);
          stats.stale += 1;
          stats.staleEvents.add(project + type);
        } else {
          say(at + r.int(3, 12), 'INFO', `hooks: tidewell accepted type=${type} project=${project} t=${unix(at)} age=${age}s status=200`);
          stats.accepted += 1;
          break;
        }
      }
      at += SCHEDULE_MIN[attempt - 1] * MIN;
    }
  }
  // Their other providers, whose deliveries come straight away.
  for (let t = from + r.int(5, 40) * SEC; t < to; t += r.int(25, 110) * SEC) {
    if (isDown(t)) continue;
    if (r.chance(0.55)) say(t, 'INFO', `hooks: ledgerly accepted type=${r.pick(['invoice.paid', 'invoice.created', 'payout.sent', 'customer.updated'])} id=evt_${r.alnum(16)} age=${r.int(0, 3)}s status=200`);
    else say(t, 'INFO', `hooks: codeport accepted type=${r.pick(['push', 'pull_request.opened', 'pull_request.merged', 'release.published'])} repo=ferrowell/${r.pick(['sync', 'dashboard', 'api-clients', 'infra'])} age=${r.int(0, 2)}s status=200`);
  }
  say(down[0], 'INFO', 'server: shutting down for maintenance (build 4f1a9c2)');
  say(down[1], 'INFO', 'server: listening on :8080 (build 7be20d1)');
  const email = [
    'From: Ines Halvorsen <ines@ferrowell.example>',
    'To: you',
    'Date: Thu, 22 Oct 2026 18:52 +0100',
    'Subject: Re: Tidewell webhooks on your sandbox',
    '',
    'Hi,',
    '',
    'The new signatures verify, thanks. But since your deploy this afternoon some of your test deliveries fail our check as stale timestamps, and once one fails it never gets through: every retry fails the same way. Most go through fine, which makes me think something is off with the timestamps you send on retries.',
    '',
    "Our verifier is attached (verify.ts). It's the one middleware we use for every provider, so we'd rather not change it unless we have to. I've also attached our receiver's log from 14:45 UTC until just now. Our sandbox was down for maintenance for a few minutes at about half past three, in case that matters.",
    '',
    'Can you take a look?',
    '',
    'Ines',
    'Ferrowell',
  ].join('\n');
  const verify = [
    "import { createHmac, timingSafeEqual } from 'node:crypto';",
    "import type { Request, RequestHandler } from 'express';",
    '',
    '// One verifier for every provider that signs its webhooks with an HMAC.',
    '// Each provider gives us its header name, how it lays out the signed',
    '// string, and its secret.',
    '',
    'type Provider = {',
    '  name: string;',
    '  header: string;',
    '  signed: (t: string, raw: string) => string;',
    '  secret: string;',
    '};',
    '',
    'type RawRequest = Request & { rawBody: Buffer };',
    '',
    'const TOLERANCE_SECONDS = 300;',
    '',
    'function parseHeader(value: string): Record<string, string> {',
    '  const out: Record<string, string> = {};',
    "  for (const part of value.split(',')) {",
    "    const at = part.indexOf('=');",
    '    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();',
    '  }',
    '  return out;',
    '}',
    '',
    'function equal(a: string, b: string) {',
    "  const x = Buffer.from(a, 'hex');",
    "  const y = Buffer.from(b, 'hex');",
    '  return x.length === y.length && timingSafeEqual(x, y);',
    '}',
    '',
    'export function verifyWebhook(provider: Provider): RequestHandler {',
    '  return (req, res, next) => {',
    "    const header = parseHeader(req.header(provider.header) ?? '');",
    "    const raw = (req as RawRequest).rawBody.toString('utf8');",
    "    const expected = createHmac('sha256', provider.secret).update(provider.signed(header.t, raw)).digest('hex');",
    "    if (!header.v1 || !equal(expected, header.v1)) {",
    "      res.status(401).json({ error: 'bad_signature' });",
    '      return;',
    '    }',
    '    // Refuse anything old, so a captured request cannot be replayed later.',
    '    const event = JSON.parse(raw);',
    '    const sent = Date.parse(event.created_at ?? event.timestamp) / 1000;',
    '    const age = Math.round(Date.now() / 1000 - sent);',
    '    if (age > TOLERANCE_SECONDS) {',
    "      res.status(401).json({ error: 'stale_timestamp', age });",
    '      return;',
    '    }',
    '    res.locals.event = event;',
    '    next();',
    '  };',
    '}',
    '',
    'export const tidewell = verifyWebhook({',
    "  name: 'tidewell',",
    "  header: 'tidewell-signature',",
    '  signed: (t, raw) => `${t}.${raw}`,',
    '  secret: process.env.TIDEWELL_WEBHOOK_SECRET!,',
    '});',
    '',
    'export const ledgerly = verifyWebhook({',
    "  name: 'ledgerly',",
    "  header: 'ledgerly-signature',",
    '  signed: (t, raw) => `${t}.${raw}`,',
    '  secret: process.env.LEDGERLY_WEBHOOK_SECRET!,',
    '});',
    '',
  ].join('\n');
  return {
    files: new Map([
      ['ferrowell/email.txt', `${email}\n`],
      ['ferrowell/verify.ts', verify],
      ...parts('ferrowell', sortLines(lines), 46_000, { base: 'ferrowell/receiver' }),
    ]),
    stats,
    secret,
  };
}

// ---------------------------------------------------------------- the slow projects list

/** Prisma's SQL for the statements the week's numbers turn on. */
const SQL = {
  rateLimit: 'INSERT INTO "public"."rate_limit_windows" ("key","window_start","count") VALUES ($1,$2,$3) ON CONFLICT ("key","window_start") DO UPDATE SET "count" = ("public"."rate_limit_windows"."count" + $4) WHERE (("public"."rate_limit_windows"."key" = $5 AND "public"."rate_limit_windows"."window_start" = $6) AND 1=1) RETURNING "public"."rate_limit_windows"."count"',
  apiKey: 'SELECT "public"."api_keys"."id", "public"."api_keys"."organization_id", "public"."api_keys"."prefix" FROM "public"."api_keys" WHERE ("public"."api_keys"."hashed_key" = $1 AND 1=1) LIMIT $2 OFFSET $3',
  jobsPoll: 'SELECT "public"."jobs"."id", "public"."jobs"."kind", "public"."jobs"."payload", "public"."jobs"."run_at", "public"."jobs"."attempts", "public"."jobs"."locked_by", "public"."jobs"."locked_at", "public"."jobs"."done_at", "public"."jobs"."failed_at", "public"."jobs"."last_error", "public"."jobs"."dedupe_key", "public"."jobs"."created_at" FROM "public"."jobs" WHERE ("public"."jobs"."done_at" IS NULL AND "public"."jobs"."failed_at" IS NULL AND "public"."jobs"."run_at" <= $1 AND ("public"."jobs"."locked_at" IS NULL OR "public"."jobs"."locked_at" < $2)) ORDER BY "public"."jobs"."run_at" ASC, "public"."jobs"."id" ASC LIMIT $3 OFFSET $4',
  jobsDedupe: 'SELECT "public"."jobs"."id" FROM "public"."jobs" WHERE ("public"."jobs"."dedupe_key" = $1 AND 1=1) LIMIT $2 OFFSET $3',
  list: 'SELECT "public"."projects"."id", "public"."projects"."organization_id", "public"."projects"."name", "public"."projects"."description", "public"."projects"."status"::text, "public"."projects"."created_at", "public"."projects"."updated_at", "public"."projects"."archived_at" FROM "public"."projects" WHERE ("public"."projects"."organization_id" = $1 AND "public"."projects"."status" = CAST($2::text AS "public"."ProjectStatus")) ORDER BY "public"."projects"."created_at" DESC LIMIT $3 OFFSET $4',
  listAll: 'SELECT "public"."projects"."id", "public"."projects"."organization_id", "public"."projects"."name", "public"."projects"."description", "public"."projects"."status"::text, "public"."projects"."created_at", "public"."projects"."updated_at", "public"."projects"."archived_at" FROM "public"."projects" WHERE "public"."projects"."organization_id" = $1 ORDER BY "public"."projects"."created_at" DESC LIMIT $2 OFFSET $3',
  count: 'SELECT COUNT(*) AS "_count._all" FROM (SELECT "public"."projects"."id" FROM "public"."projects" WHERE ("public"."projects"."organization_id" = $1 AND "public"."projects"."status" = CAST($2::text AS "public"."ProjectStatus")) OFFSET $3) AS "sub"',
  countAll: 'SELECT COUNT(*) AS "_count._all" FROM (SELECT "public"."projects"."id" FROM "public"."projects" WHERE "public"."projects"."organization_id" = $1 OFFSET $2) AS "sub"',
  getProject: 'SELECT "public"."projects"."id", "public"."projects"."organization_id", "public"."projects"."name", "public"."projects"."description", "public"."projects"."status"::text, "public"."projects"."created_at", "public"."projects"."updated_at", "public"."projects"."archived_at" FROM "public"."projects" WHERE ("public"."projects"."id" = $1 AND "public"."projects"."organization_id" = $2) LIMIT $3 OFFSET $4',
  createProject: 'INSERT INTO "public"."projects" ("id","organization_id","name","description","status","created_at","updated_at") VALUES ($1,$2,$3,$4,CAST($5::text AS "public"."ProjectStatus"),$6,$7) RETURNING "public"."projects"."id", "public"."projects"."organization_id", "public"."projects"."name", "public"."projects"."description", "public"."projects"."status"::text, "public"."projects"."created_at", "public"."projects"."updated_at", "public"."projects"."archived_at"',
  updateMany: 'UPDATE "public"."projects" SET "name" = $1, "updated_at" = $2 WHERE ("public"."projects"."id" = $3 AND "public"."projects"."organization_id" = $4)',
  archive: 'UPDATE "public"."projects" SET "status" = CAST($1::text AS "public"."ProjectStatus"), "archived_at" = $2, "updated_at" = $3 WHERE ("public"."projects"."id" = $4 AND 1=1) RETURNING "public"."projects"."id", "public"."projects"."organization_id", "public"."projects"."name", "public"."projects"."description", "public"."projects"."status"::text, "public"."projects"."created_at", "public"."projects"."updated_at", "public"."projects"."archived_at"',
  exportPage: 'SELECT "public"."projects"."id", "public"."projects"."name", "public"."projects"."status"::text, "public"."projects"."created_at", COALESCE("aggr_selection_0_Task"."_aggr_count_tasks", 0) AS "_aggr_count_tasks" FROM "public"."projects" LEFT JOIN (SELECT "public"."tasks"."project_id", COUNT(*) AS "_aggr_count_tasks" FROM "public"."tasks" WHERE 1=1 GROUP BY "public"."tasks"."project_id") AS "aggr_selection_0_Task" ON ("public"."projects"."id" = "aggr_selection_0_Task"."project_id") WHERE ("public"."projects"."organization_id" = $1 AND "public"."projects"."id" > $2) ORDER BY "public"."projects"."id" ASC LIMIT $3 OFFSET $4',
  aggregate: 'SELECT MAX("public"."projects"."updated_at") FROM (SELECT "public"."projects"."updated_at" FROM "public"."projects" WHERE "public"."projects"."organization_id" = $1 OFFSET $2) AS "sub"',
  org: 'SELECT "public"."organizations"."id", "public"."organizations"."name", "public"."organizations"."created_at" FROM "public"."organizations" WHERE ("public"."organizations"."id" = $1 AND 1=1) LIMIT $2 OFFSET $3',
  invitesFind: 'SELECT "public"."invites"."email" FROM "public"."invites" WHERE ("public"."invites"."organization_id" = $1 AND "public"."invites"."email" IN ($2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51)) OFFSET $52',
  inviteCreate: 'INSERT INTO "public"."invites" ("id","organization_id","email","role","token_hash","expires_at","created_at") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "public"."invites"."id"',
  inviteSent: 'UPDATE "public"."invites" SET "sent_at" = $1 WHERE ("public"."invites"."id" = $2 AND 1=1) RETURNING "public"."invites"."id"',
  jobClaim: 'UPDATE "public"."jobs" SET "locked_at" = $1, "locked_by" = $2, "attempts" = ("attempts" + $3) WHERE ("public"."jobs"."id" = $4 AND "public"."jobs"."locked_at" IS NULL)',
  jobDone: 'UPDATE "public"."jobs" SET "done_at" = $1, "locked_at" = $2, "locked_by" = $3 WHERE ("public"."jobs"."id" = $4 AND 1=1) RETURNING "public"."jobs"."id"',
  jobCreate: 'INSERT INTO "public"."jobs" ("id","kind","payload","run_at","attempts","created_at") VALUES ($1,$2,$3,$4,$5,$6) RETURNING "public"."jobs"."id"',
  purge: 'DELETE FROM "public"."invites" WHERE ("public"."invites"."accepted_at" IS NULL AND "public"."invites"."expires_at" < $1)',
  vacuum: 'autovacuum: VACUUM ANALYZE public.rate_limit_windows',
};

function slowList() {
  const r = seeded('pg-statements');
  // Calls over the week, the mean in ms, and how widely it spreads.
  const rows = [
    ['rateLimit', 40_912_448, 0.19, 41.2], ['apiKey', 41_208_771, 0.04, 12.9], ['jobsPoll', 604_211, 318.6, 1_904.3],
    ['jobsDedupe', 604_198, 0.05, 6.1], ['list', 2_811_906, 41.8, 4_812.6], ['count', 2_811_906, 29.7, 2_949.8],
    ['listAll', 402_118, 66.4, 5_340.2], ['countAll', 402_118, 38.1, 3_207.5], ['getProject', 6_920_334, 0.07, 14.1],
    ['createProject', 1_398_212, 0.61, 1_204.9], ['updateMany', 1_231_877, 0.38, 11_802.3], ['archive', 402_904, 0.44, 9_877.0],
    ['exportPage', 118_421, 212.9, 6_118.0], ['aggregate', 41_902, 168.2, 2_204.4], ['org', 1_802_330, 0.03, 4.4],
    ['invitesFind', 1_288, 2.1, 14.9], ['inviteCreate', 31_904, 0.44, 7.3], ['inviteSent', 32_771, 0.31, 18.8],
    ['jobClaim', 41_331, 0.29, 8.2], ['jobDone', 40_906, 0.33, 6.6], ['jobCreate', 3_212, 0.41, 5.1], ['purge', 7, 812.4, 1_402.8],
  ];
  const head = 'queryid\tcalls\ttotal_exec_time_ms\tmean_exec_time_ms\tmax_exec_time_ms\trows\tshared_blks_hit\tshared_blks_read\tquery';
  const out = rows.map(([k, calls, mean, max]) => {
    const total = calls * mean * r.around(1, 0.02);
    const rowsOut = k === 'list' || k === 'listAll' ? Math.round(calls * 48.7) : k === 'count' || k === 'countAll' || k === 'getProject' ? calls : k === 'jobsPoll' ? Math.round(calls * 0.07) : calls;
    const hit = Math.round(total * r.around(310, 0.4));
    const read = Math.round(total * r.around(k === 'list' || k === 'count' || k === 'listAll' || k === 'countAll' ? 22 : 0.4, 0.5));
    return { total, text: [String(BigInt.asIntN(64, BigInt(`0x${r.hex(16)}`))), calls, total.toFixed(1), mean.toFixed(3), max.toFixed(1), rowsOut, hit, read, SQL[k]].join('\t') };
  });
  out.sort((a, b) => b.total - a.total);
  const meridian = BY_NAME['Meridian Logistics'].id;
  const tableSizes = [
    'Table sizes and live rows, from pg_stat_user_tables and pg_total_relation_size, 2026-10-22 09:40 UTC',
    '',
    ' table              | live rows   | dead rows | total size | indexes                                             | last autovacuum',
    '--------------------+-------------+-----------+------------+-----------------------------------------------------+------------------------',
    ' rate_limit_windows |  61,904,227 |   212,604 | 5,512 MB   | rate_limit_windows_pkey                             | 2026-10-22 06:12:44+00',
    ' projects           |   2,418,330 |    41,227 | 1,402 MB   | projects_pkey, projects_organization_id_id_idx      | 2026-10-21 22:40:03+00',
    ' tasks              |  11,804,512 |    88,301 | 1,977 MB   | tasks_pkey, tasks_project_id_idx                    | 2026-10-21 19:02:51+00',
    ' jobs               |   3,889,108 |    18,442 | 2,106 MB   | jobs_pkey, jobs_run_at_idx, jobs_dedupe_key_key     | 2026-10-22 01:15:37+00',
    ' invites            |     311,906 |     2,018 | 118 MB     | invites_pkey, invites_token_hash_key, invites_organization_id_email_key | 2026-10-22 02:31:09+00',
    ' api_keys           |       2,291 |         4 | 1,032 kB   | api_keys_pkey, api_keys_hashed_key_key              | 2026-09-30 11:20:44+00',
    ' organizations      |       1,804 |        11 | 664 kB     | organizations_pkey                                  | 2026-10-02 08:41:17+00',
    '',
    'jobs by state:',
    ' done      3,881,966',
    ' failed        7,129',
    ' waiting          13',
    '',
    `Meridian Logistics (${meridian}): 182,406 projects, 179,233 active.`,
    '',
  ].join('\n');
  const explainList = [
    `EXPLAIN (ANALYZE, BUFFERS) -- GET /v2/organizations/${meridian}/projects?page=100&page_size=50, run by hand on the read replica, 2026-10-22 09:31 UTC`,
    '',
    'Limit  (cost=48211.39..48211.52 rows=50 width=146) (actual time=1183.912..1183.931 rows=50 loops=1)',
    '  Buffers: shared hit=21877 read=19644',
    '  ->  Sort  (cost=47974.21..48429.97 rows=182302 width=146) (actual time=1183.401..1183.792 rows=5000 loops=1)',
    '        Sort Key: created_at DESC',
    '        Sort Method: top-N heapsort  Memory: 2214kB',
    '        Buffers: shared hit=21877 read=19644',
    '        ->  Bitmap Heap Scan on projects  (cost=3862.41..41093.56 rows=182302 width=146) (actual time=38.554..1102.648 rows=179233 loops=1)',
    `              Recheck Cond: (organization_id = '${meridian}'::text)`,
    "              Filter: (status = 'ACTIVE'::\"ProjectStatus\")",
    '              Rows Removed by Filter: 3173',
    '              Heap Blocks: exact=41019',
    '              Buffers: shared hit=21877 read=19644',
    '              ->  Bitmap Index Scan on projects_organization_id_id_idx  (cost=0.00..3816.93 rows=182406 width=0) (actual time=31.774..31.775 rows=182406 loops=1)',
    `                    Index Cond: (organization_id = '${meridian}'::text)`,
    '                    Buffers: shared hit=1123',
    'Planning:',
    '  Buffers: shared hit=4',
    'Planning Time: 0.214 ms',
    'Execution Time: 1184.402 ms',
    '',
    'The same with page=1: Execution Time: 1012.884 ms. With page=3000: Execution Time: 1966.031 ms (Sort Method: external merge  Disk: 25936kB).',
    '',
  ].join('\n');
  const explainCount = [
    `EXPLAIN (ANALYZE, BUFFERS) -- the count the same request runs, for ${meridian}`,
    '',
    'Aggregate  (cost=42915.31..42915.32 rows=1 width=8) (actual time=642.338..642.340 rows=1 loops=1)',
    '  Buffers: shared hit=40512 read=1630',
    '  ->  Bitmap Heap Scan on projects  (cost=3862.41..41093.56 rows=182302 width=0) (actual time=37.902..628.911 rows=179233 loops=1)',
    `        Recheck Cond: (organization_id = '${meridian}'::text)`,
    "        Filter: (status = 'ACTIVE'::\"ProjectStatus\")",
    '        Rows Removed by Filter: 3173',
    '        Heap Blocks: exact=41019',
    '        Buffers: shared hit=40512 read=1630',
    '        ->  Bitmap Index Scan on projects_organization_id_id_idx  (cost=0.00..3816.93 rows=182406 width=0) (actual time=30.661..30.662 rows=182406 loops=1)',
    `              Index Cond: (organization_id = '${meridian}'::text)`,
    '              Buffers: shared hit=1123',
    'Planning Time: 0.188 ms',
    'Execution Time: 642.471 ms',
    '',
  ].join('\n');
  const explainPoll = [
    "EXPLAIN (ANALYZE, BUFFERS) -- the worker's poll, with now = 2026-10-22 09:14:02.118",
    '',
    'Limit  (cost=12.69..13.18 rows=1 width=212) (actual time=341.208..341.209 rows=1 loops=1)',
    '  Buffers: shared hit=1281044',
    '  ->  Incremental Sort  (cost=12.69..1903226.42 rows=3889012 width=212) (actual time=341.206..341.206 rows=1 loops=1)',
    '        Sort Key: run_at, id',
    '        Presorted Key: run_at',
    '        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 25kB  Peak Memory: 25kB',
    '        Buffers: shared hit=1281044',
    '        ->  Index Scan using jobs_run_at_idx on jobs  (cost=0.43..1728221.88 rows=3889012 width=212) (actual time=341.161..341.180 rows=2 loops=1)',
    "              Index Cond: (run_at <= '2026-10-22 09:14:02.118'::timestamp without time zone)",
    "              Filter: ((done_at IS NULL) AND (failed_at IS NULL) AND ((locked_at IS NULL) OR (locked_at < '2026-10-22 09:13:02.118'::timestamp without time zone)))",
    '              Rows Removed by Filter: 3888917',
    '              Buffers: shared hit=1281044',
    'Planning Time: 0.311 ms',
    'Execution Time: 341.240 ms',
    '',
  ].join('\n');
  return new Map([
    ['pg/statements.tsv', `${[head, ...out.map((o) => o.text)].join('\n')}\n`],
    ['pg/table-sizes.txt', tableSizes],
    ['pg/explain-projects-list.txt', explainList],
    ['pg/explain-projects-count.txt', explainCount],
    ['pg/explain-jobs-poll.txt', explainPoll],
  ]);
}

// ---------------------------------------------------------------- the flag on staging

/**
 * The flag's staging strategies: one names the first sandbox organisation on
 * the context field organizationId, which tidewell-api sends; the other names
 * the second on orgId, the web app's field, which tidewell-api never sends.
 */
function unleash() {
  const r = seeded('unleash');
  const { first, second } = FERROWELL.sandbox;
  const stamp = (d) => `${d}T${pad(r.int(8, 17))}:${pad(r.int(0, 59))}:${pad(r.int(0, 59))}.${pad(r.int(0, 999), 3)}Z`;
  const strategy = (id, contextName, values, title) => ({
    id: r.uuid(), name: 'flexibleRollout', title, disabled: false, sortOrder: 0, segments: [],
    constraints: [{ values, inverted: false, operator: 'IN', contextName, caseInsensitive: false }],
    parameters: { groupId: id, rollout: '100', stickiness: 'default' }, variants: [],
  });
  const feature = {
    name: 'eng-447-project-webhooks', type: 'release', description: 'ENG-447: webhooks for project events', project: 'default',
    stale: false, impressionData: false, createdAt: '2026-10-22T07:58:12.481Z', lastSeenAt: '2026-10-22T18:44:51.002Z', archived: false,
    environments: [
      { name: 'development', enabled: true, type: 'development', lastSeenAt: '2026-10-22T16:20:11.512Z', strategies: [{ ...strategy('eng-447-project-webhooks', 'organizationId', [], 'everyone'), constraints: [] }] },
      {
        name: 'staging', enabled: true, type: 'test', lastSeenAt: '2026-10-22T18:44:51.002Z',
        strategies: [
          strategy('eng-447-project-webhooks', 'organizationId', [first], 'Ferrowell sandbox'),
          { ...strategy('eng-447-project-webhooks', 'orgId', [second], 'Ferrowell sandbox 2'), sortOrder: 1 },
        ],
      },
      { name: 'production', enabled: false, type: 'production', lastSeenAt: null, strategies: [] },
    ],
    tags: [{ type: 'simple', value: 'core-api' }],
  };
  const contextFields = [
    { name: 'organizationId', description: 'Tidewell organisation id, sent by tidewell-api', stickiness: true, sortOrder: 10, legalValues: [], createdAt: '2026-06-18T10:02:44.120Z', usedInFeatures: 9, usedInProjects: 1 },
    { name: 'orgId', description: 'Organisation id as the web app sends it (web-app only)', stickiness: false, sortOrder: 20, legalValues: [], createdAt: '2025-11-03T14:41:09.334Z', usedInFeatures: 14, usedInProjects: 2 },
    { name: 'userId', description: 'Allows you to constrain on userId', stickiness: true, sortOrder: 1, legalValues: [], createdAt: '2025-03-12T09:00:00.000Z', usedInFeatures: 21, usedInProjects: 3 },
    { name: 'environment', description: 'Allows you to constrain on application environment', stickiness: false, sortOrder: 0, legalValues: [], createdAt: '2025-03-12T09:00:00.000Z', usedInFeatures: 0, usedInProjects: 0 },
    { name: 'appName', description: 'Allows you to constrain on application name', stickiness: false, sortOrder: 2, legalValues: [], createdAt: '2025-03-12T09:00:00.000Z', usedInFeatures: 3, usedInProjects: 1 },
    { name: 'plan', description: 'Billing plan, web app only', stickiness: false, sortOrder: 30, legalValues: [{ value: 'free' }, { value: 'team' }, { value: 'business' }], createdAt: '2026-01-20T11:15:02.904Z', usedInFeatures: 4, usedInProjects: 1 },
  ];
  const playground = (orgId, enabled) => ({
    input: { environments: ['staging'], projects: '*', context: { appName: 'tidewell-api', properties: { organizationId: orgId } } },
    features: [{
      name: 'eng-447-project-webhooks', projectId: 'default', isEnabled: enabled, isEnabledInCurrentEnvironment: true,
      strategies: {
        result: enabled,
        data: feature.environments[1].strategies.map((s) => {
          const c = s.constraints[0];
          const value = c.contextName === 'organizationId' ? orgId : undefined;
          const met = value !== undefined && c.values.includes(value);
          return { name: s.name, id: s.id, title: s.title, disabled: false, parameters: s.parameters, result: { enabled: met, evaluationStatus: 'complete' }, constraints: [{ ...c, value, result: met }], segments: [] };
        }),
      },
      variant: { name: 'disabled', enabled: false, feature_enabled: enabled },
    }],
  });
  const flagNames = [
    ['eng-402-bulk-invite', 'release', '2026-09-16', 'ENG-402: bulk invites', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['eng-447-project-webhooks', 'release', '2026-10-22', 'ENG-447: webhooks for project events', [['staging', true, 'Ferrowell sandbox, Ferrowell sandbox 2'], ['production', false, '']]],
    ['eng-318-org-export', 'release', '2026-08-12', 'ENG-318: CSV export of projects', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['eng-301-trim-names', 'release', '2026-07-13', 'ENG-301: trim organisation and project names', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['tw-1182-rate-limit-headers', 'release', '2026-05-26', 'TW-1182: rate limit headers', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['api-v1-sunset-warnings', 'kill-switch', '2025-12-02', 'Deprecation header on /v1 responses', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['eng-356-activity-feed-index', 'release', '2026-08-26', 'ENG-356: read the feed through the new index', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
    ['eng-371-strict-event-guards', 'release', '2026-09-10', 'ENG-371: refuse unknown invoice events', [['production', false, ''], ['staging', true, 'everyone']]],
    ['ops-read-replica-for-exports', 'operational', '2026-04-08', 'Send exports to the read replica', [['production', true, 'everyone'], ['staging', false, '']]],
    ['ops-maintenance-mode', 'kill-switch', '2025-06-30', 'Answer 503 to every write', [['production', false, ''], ['staging', false, '']]],
    ['exp-project-templates', 'experiment', '2026-02-11', 'Project templates experiment (web app)', [['production', false, ''], ['staging', false, '']]],
    ['tw-1240-notifications-service', 'release', '2026-06-29', 'TW-1240: send notifications through the new service', [['production', true, 'everyone'], ['staging', true, 'everyone']]],
  ];
  const features = flagNames.map(([name, type, created, description, envs]) => ({
    name, type, description, project: 'default', createdAt: `${created}T${pad(r.int(8, 17))}:${pad(r.int(0, 59))}:00.000Z`,
    lastSeenAt: name === 'exp-project-templates' ? '2026-03-02T10:11:40.000Z' : stamp('2026-10-22'),
    stale: false,
    environments: envs.map(([env, enabled, who]) => ({ name: env, enabled, strategies: who ? who.split(', ').map((title) => ({ name: 'flexibleRollout', title, parameters: { rollout: '100' } })) : [] })),
  }));
  return new Map([
    ['unleash/eng-447-project-webhooks.json', `${JSON.stringify(feature, null, 2)}\n`],
    ['unleash/context-fields.json', `${JSON.stringify(contextFields, null, 2)}\n`],
    ['unleash/playground-first-sandbox.json', `${JSON.stringify(playground(first, true), null, 2)}\n`],
    ['unleash/playground-second-sandbox.json', `${JSON.stringify(playground(second, false), null, 2)}\n`],
    ['unleash/all-flags.json', `${JSON.stringify({ version: 1, features }, null, 2)}\n`],
  ]);
}

// ---------------------------------------------------------------- the worker's own task size, in Terraform

/**
 * `terraform plan` for production in tidewell-infra: the worker on its own
 * task size and on arm64. Three things in it would hurt: the service and its
 * log group are renamed, which replaces both, the service destroyed before
 * its replacement exists; a security group rule the API needs is no longer in
 * the code, so the plan deletes it; and the image is built for amd64 only.
 */
function terraformPlan() {
  const r = seeded('terraform');
  const image = '210987654321.dkr.ecr.eu-west-1.amazonaws.com/tidewell-api:2026-10-21.3';
  const env = [
    ['NODE_ENV', 'production'], ['PORT', '8080'], ['LOG_LEVEL', 'info'], ['AWS_REGION', 'eu-west-1'],
    ['UNLEASH_URL', 'https://unleash.internal.tidewell.example/api'], ['MAIL_FROM', 'Tidewell <no-reply@tidewell.example>'],
    ['INVITE_BASE_URL', 'https://app.tidewell.example/invites'], ['OTEL_SERVICE_NAME', 'tidewell-worker'],
  ];
  const secrets = ['DATABASE_URL', 'UNLEASH_API_TOKEN', 'ADMIN_TOKEN_HASHES'];
  const containerDefs = (arch, cpu, memory, name) => [
    '{',
    `                  + command                = [`,
    `                      + "node",`,
    `                      + "dist/worker.js",`,
    `                    ]`,
    `                  + cpu                    = ${cpu}`,
    `                  + environment            = [`,
    ...env.map(([k, v]) => `                      + {\n                          + name  = "${k}"\n                          + value = "${k === 'OTEL_SERVICE_NAME' ? name : v}"\n                        },`),
    `                    ]`,
    `                  + essential              = true`,
    `                  + image                  = "${image}"`,
    `                  + logConfiguration       = {`,
    `                      + logDriver = "awslogs"`,
    `                      + options   = {`,
    `                          + awslogs-group         = "/ecs/${name}"`,
    `                          + awslogs-region        = "eu-west-1"`,
    `                          + awslogs-stream-prefix = "worker"`,
    `                        }`,
    `                    }`,
    `                  + memory                 = ${memory}`,
    `                  + mountPoints            = []`,
    `                  + name                   = "worker"`,
    `                  + portMappings           = []`,
    `                  + readonlyRootFilesystem = true`,
    `                  + secrets                = [`,
    ...secrets.map((s) => `                      + {\n                          + name      = "${s}"\n                          + valueFrom = "arn:aws:secretsmanager:eu-west-1:210987654321:secret:prod/tidewell-api/${s.toLowerCase().replace(/_/g, '-')}-${r.alnum(6)}"\n                        },`),
    `                    ]`,
    `                  + stopTimeout            = 30`,
    `                  + systemControls         = []`,
    `                  + volumesFrom            = []`,
    `                }`,
  ].join('\n');
  const tags = (extra = {}) => [
    `      + tags                     = {`,
    `          + "Service"   = "tidewell-worker"`,
    `          + "Team"      = "core-api"`,
    ...Object.entries(extra).map(([k, v]) => `          + "${k}" = "${v}"`),
    `        }`,
    `      + tags_all                 = {`,
    `          + "Environment" = "production"`,
    `          + "ManagedBy"   = "terraform"`,
    `          + "Repo"        = "tidewell-infra"`,
    `          + "Service"     = "tidewell-worker"`,
    `          + "Team"        = "core-api"`,
    `        }`,
  ].join('\n');
  const sg = (id) => `sg-0${r.hex(16)}`;
  const apiSg = sg();
  const albSg = sg();
  const workerSg = sg();
  const alarm = (name, metric, threshold, desc) => [
    `  # module.worker.aws_cloudwatch_metric_alarm.${name} will be updated in-place`,
    `  ~ resource "aws_cloudwatch_metric_alarm" "${name}" {`,
    `      ~ dimensions                = {`,
    `          ~ "ServiceName" = "tidewell-worker" -> "tidewell-worker-arm64"`,
    `            # (1 unchanged element hidden)`,
    `        }`,
    `        id                        = "tidewell-worker-${name.replace(/_/g, '-')}"`,
    `        # (${r.int(14, 19)} unchanged attributes hidden)`,
    `    }`,
    '',
  ].join('\n');
  const refreshed = [];
  for (const svc of ['api', 'worker']) {
    refreshed.push(
      `  # module.${svc}.aws_ecs_service.this has changed`,
      `  ~ resource "aws_ecs_service" "this" {`,
      `      ~ desired_count                      = ${svc === 'api' ? '6 -> 8' : '2 -> 2'}`,
      `        id                                 = "arn:aws:ecs:eu-west-1:210987654321:service/tidewell-prod/tidewell-${svc}"`,
      `        name                               = "tidewell-${svc}"`,
      `        tags                               = {`,
      `            "Service" = "tidewell-${svc}"`,
      `            "Team"    = "core-api"`,
      `        }`,
      `        # (${r.int(16, 22)} unchanged attributes hidden)`,
      '',
      `        # (${r.int(4, 7)} unchanged blocks hidden)`,
      `    }`,
      '',
    );
  }
  refreshed.push(
    '  # aws_db_instance.main has changed',
    '  ~ resource "aws_db_instance" "main" {',
    '      ~ engine_version                        = "16.4" -> "16.8"',
    '        id                                    = "db-' + r.alnum(26).toUpperCase() + '"',
    '      ~ latest_restorable_time                = "2026-10-22T09:30:12Z" -> "2026-10-22T09:41:47Z"',
    '        # (61 unchanged attributes hidden)',
    '    }',
    '',
    '  # aws_security_group.api has changed',
    '  ~ resource "aws_security_group" "api" {',
    `        id                     = "${apiSg}"`,
    '      ~ ingress                = [',
    '          + {',
    `              + cidr_blocks      = []`,
    `              + description      = "from the load balancer"`,
    `              + from_port        = 8080`,
    `              + protocol         = "tcp"`,
    `              + security_groups  = ["${albSg}"]`,
    `              + self             = false`,
    `              + to_port          = 8080`,
    '            },',
    '        ]',
    '        name                   = "tidewell-api"',
    '        # (8 unchanged attributes hidden)',
    '    }',
    '',
  );
  const lines = [
    "module.network.data.aws_vpc.main: Reading...",
    "module.network.data.aws_subnets.private: Reading...",
    `module.network.data.aws_vpc.main: Read complete after 0s [id=vpc-0${r.hex(16)}]`,
    `module.network.data.aws_subnets.private: Read complete after 1s [id=eu-west-1]`,
    ...['aws_ecr_repository.api', 'aws_db_instance.main', 'aws_security_group.alb', 'aws_security_group.api', 'aws_security_group.worker', 'aws_lb.main', 'aws_lb_target_group.api', 'aws_lb_listener.https', 'module.api.aws_ecs_task_definition.this', 'module.api.aws_ecs_service.this', 'module.api.aws_cloudwatch_log_group.this', 'module.worker.aws_ecs_task_definition.this', 'module.worker.aws_ecs_service.this', 'module.worker.aws_cloudwatch_log_group.this', 'module.worker.aws_iam_role.task', 'module.worker.aws_iam_role.execution', 'aws_security_group_rule.api_from_alb', 'aws_security_group_rule.worker_egress_https', 'aws_security_group_rule.worker_egress_db', 'aws_appautoscaling_target.api', 'aws_appautoscaling_policy.api_cpu', 'aws_cloudwatch_log_metric_filter.worker_crashed', 'module.worker.aws_cloudwatch_metric_alarm.cpu_high', 'module.worker.aws_cloudwatch_metric_alarm.memory_high', 'module.worker.aws_cloudwatch_metric_alarm.no_running_tasks', 'aws_cloudwatch_metric_alarm.worker_crashed', 'aws_route53_record.api', 'aws_secretsmanager_secret.database_url', 'aws_kms_key.secrets'].map((a) => `${a}: Refreshing state... [id=${a.includes('security_group_rule') ? `sgrule-${r.int(100000000, 999999999)}` : a.includes('log_group') ? `/ecs/${a.includes('api') ? 'tidewell-api' : 'tidewell-worker'}` : r.alnum(12)}]`),
    '',
    'Note: Objects have changed outside of Terraform',
    '',
    'Terraform detected the following changes made outside of Terraform since the',
    'last "terraform apply" which may have affected this plan:',
    '',
    ...refreshed,
    '',
    'Unless you have made equivalent changes to your configuration, or ignored the',
    'relevant attributes using ignore_changes, the following plan may include',
    'actions to undo or respond to these changes.',
    '',
    '─────────────────────────────────────────────────────────────────────────────',
    '',
    'Terraform used the selected providers to generate the following execution',
    'plan. Resource actions are indicated with the following symbols:',
    '  ~ update in-place',
    '  - destroy',
    '-/+ destroy and then create replacement',
    '',
    'Terraform will perform the following actions:',
    '',
    '  # aws_cloudwatch_log_metric_filter.worker_crashed must be replaced',
    '-/+ resource "aws_cloudwatch_log_metric_filter" "worker_crashed" {',
    '      ~ id             = "worker-crashed" -> (known after apply)',
    '      ~ log_group_name = "/ecs/tidewell-worker" -> "/ecs/tidewell-worker-arm64" # forces replacement',
    '        name           = "worker-crashed"',
    '        pattern        = "{ $.msg = \\"worker crashed\\" }"',
    '',
    '        # (1 unchanged block hidden)',
    '    }',
    '',
    '  # aws_security_group_rule.api_from_alb will be destroyed',
    '  # (because aws_security_group_rule.api_from_alb is not in configuration)',
    '  - resource "aws_security_group_rule" "api_from_alb" {',
    '      - description              = "from the load balancer" -> null',
    '      - from_port                = 8080 -> null',
    `      - id                       = "sgrule-${r.int(100000000, 999999999)}" -> null`,
    '      - protocol                 = "tcp" -> null',
    `      - security_group_id        = "${apiSg}" -> null`,
    `      - security_group_rule_id   = "sgr-0${r.hex(16)}" -> null`,
    '      - self                     = false -> null',
    `      - source_security_group_id = "${albSg}" -> null`,
    '      - to_port                  = 8080 -> null',
    '      - type                     = "ingress" -> null',
    '    }',
    '',
    '  # aws_security_group_rule.worker_egress_db will be updated in-place',
    '  ~ resource "aws_security_group_rule" "worker_egress_db" {',
    `        id                       = "sgrule-${r.int(100000000, 999999999)}"`,
    '      ~ description              = "to postgres" -> "worker to postgres"',
    '        # (8 unchanged attributes hidden)',
    '    }',
    '',
    '  # module.worker.aws_cloudwatch_log_group.this must be replaced',
    '-/+ resource "aws_cloudwatch_log_group" "this" {',
    '      ~ arn               = "arn:aws:logs:eu-west-1:210987654321:log-group:/ecs/tidewell-worker" -> (known after apply)',
    '      ~ id                = "/ecs/tidewell-worker" -> (known after apply)',
    '      ~ name              = "/ecs/tidewell-worker" -> "/ecs/tidewell-worker-arm64" # forces replacement',
    '      + name_prefix       = (known after apply)',
    '        retention_in_days = 90',
    '        skip_destroy      = false',
    '      ~ tags              = {',
    '          ~ "Service" = "tidewell-worker" -> "tidewell-worker-arm64"',
    '            # (1 unchanged element hidden)',
    '        }',
    '      ~ tags_all          = {',
    '          ~ "Service"     = "tidewell-worker" -> "tidewell-worker-arm64"',
    '            # (4 unchanged elements hidden)',
    '        }',
    '        # (2 unchanged attributes hidden)',
    '    }',
    '',
    alarm('cpu_high', 'CPUUtilization', 85),
    alarm('memory_high', 'MemoryUtilization', 85),
    alarm('no_running_tasks', 'RunningTaskCount', 1),
    '  # module.worker.aws_ecs_service.this must be replaced',
    '-/+ resource "aws_ecs_service" "this" {',
    '      - availability_zone_rebalancing      = "DISABLED" -> null',
    '      ~ desired_count                      = 2 -> 1',
    '      ~ enable_ecs_managed_tags            = false -> true',
    '      - health_check_grace_period_seconds  = 0 -> null',
    '      ~ iam_role                           = "/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS" -> (known after apply)',
    '      ~ id                                 = "arn:aws:ecs:eu-west-1:210987654321:service/tidewell-prod/tidewell-worker" -> (known after apply)',
    '      ~ name                               = "tidewell-worker" -> "tidewell-worker-arm64" # forces replacement',
    '      + platform_version                   = "LATEST"',
    '      - propagate_tags                     = "NONE" -> null',
    '      ~ tags                               = {',
    '          ~ "Service" = "tidewell-worker" -> "tidewell-worker-arm64"',
    '            # (1 unchanged element hidden)',
    '        }',
    '      ~ tags_all                           = {',
    '          ~ "Service"     = "tidewell-worker" -> "tidewell-worker-arm64"',
    '            # (4 unchanged elements hidden)',
    '        }',
    '      ~ task_definition                    = "arn:aws:ecs:eu-west-1:210987654321:task-definition/tidewell-worker:118" -> (known after apply)',
    '      - triggers                           = {} -> null',
    '        # (9 unchanged attributes hidden)',
    '',
    '      ~ deployment_circuit_breaker {',
    '          ~ enable   = false -> true',
    '          ~ rollback = false -> true',
    '        }',
    '',
    '      ~ network_configuration {',
    '          ~ security_groups  = [',
    `              - "${workerSg}",`,
    '            ] -> (known after apply)',
    '          ~ subnets          = [',
    ...Array.from({ length: 3 }, () => `              - "subnet-0${r.hex(16)}",`),
    '            ] -> (known after apply)',
    '            # (1 unchanged attribute hidden)',
    '        }',
    '',
    '        # (2 unchanged blocks hidden)',
    '    }',
    '',
    '  # module.worker.aws_ecs_task_definition.this must be replaced',
    '-/+ resource "aws_ecs_task_definition" "this" {',
    '      ~ arn                      = "arn:aws:ecs:eu-west-1:210987654321:task-definition/tidewell-worker:118" -> (known after apply)',
    '      ~ arn_without_revision     = "arn:aws:ecs:eu-west-1:210987654321:task-definition/tidewell-worker" -> (known after apply)',
    '      ~ container_definitions    = jsonencode(',
    '          ~ [',
    '              ~ {',
    '                  ~ cpu                    = 256 -> 1024',
    '                  ~ environment            = [',
    '                      ~ {',
    '                            name  = "OTEL_SERVICE_NAME"',
    '                          ~ value = "tidewell-worker" -> "tidewell-worker-arm64"',
    '                        },',
    '                        # (7 unchanged elements hidden)',
    '                    ]',
    '                  ~ logConfiguration       = {',
    '                      ~ options   = {',
    '                          ~ awslogs-group         = "/ecs/tidewell-worker" -> "/ecs/tidewell-worker-arm64"',
    '                            # (2 unchanged attributes hidden)',
    '                        }',
    '                        # (1 unchanged attribute hidden)',
    '                    }',
    '                  ~ memory                 = 512 -> 2048',
    '                    name                   = "worker"',
    '                    # (10 unchanged attributes hidden)',
    '                },',
    '            ] # forces replacement',
    '        )',
    '      ~ cpu                      = "256" -> "1024" # forces replacement',
    '      ~ family                   = "tidewell-worker" -> "tidewell-worker-arm64" # forces replacement',
    '      ~ id                       = "tidewell-worker" -> (known after apply)',
    '      ~ memory                   = "512" -> "2048" # forces replacement',
    '      ~ revision                 = 118 -> (known after apply)',
    '      ~ tags_all                 = {',
    '          ~ "Service"     = "tidewell-worker" -> "tidewell-worker-arm64"',
    '            # (4 unchanged elements hidden)',
    '        }',
    '        # (8 unchanged attributes hidden)',
    '',
    '      + runtime_platform {',
    '          + cpu_architecture        = "ARM64"',
    '          + operating_system_family = "LINUX"',
    '        }',
    '    }',
    '',
    '  # module.worker_arm64_preview.aws_ecs_task_definition.this will be created',
    '  + resource "aws_ecs_task_definition" "this" {',
    '      + arn                      = (known after apply)',
    '      + arn_without_revision     = (known after apply)',
    `      + container_definitions    = jsonencode(\n            [\n              + ${containerDefs('ARM64', 1024, 2048, 'tidewell-worker-arm64').trimStart()},\n            ]\n        )`,
    '      + cpu                      = "1024"',
    `      + execution_role_arn       = "arn:aws:iam::210987654321:role/tidewell-worker-execution"`,
    '      + family                   = "tidewell-worker-arm64-preview"',
    '      + id                       = (known after apply)',
    '      + memory                   = "2048"',
    '      + network_mode             = "awsvpc"',
    '      + requires_compatibilities = [',
    '          + "FARGATE",',
    '        ]',
    '      + revision                 = (known after apply)',
    '      + skip_destroy             = false',
    tags({ Preview: 'true' }),
    `      + task_role_arn            = "arn:aws:iam::210987654321:role/tidewell-worker-task"`,
    '      + track_latest             = false',
    '',
    '      + runtime_platform {',
    '          + cpu_architecture        = "ARM64"',
    '          + operating_system_family = "LINUX"',
    '        }',
    '    }',
    '',
    '  # module.worker.aws_iam_role_policy.task will be updated in-place',
    '  ~ resource "aws_iam_role_policy" "task" {',
    '        id     = "tidewell-worker-task:worker"',
    '        name   = "worker"',
    '      ~ policy = jsonencode(',
    '          ~ {',
    '              ~ Statement = [',
    '                    {',
    '                        Action   = [',
    '                            "ses:SendEmail",',
    '                            "ses:SendRawEmail",',
    '                        ]',
    '                        Effect   = "Allow"',
    `                        Resource = "arn:aws:ses:eu-west-1:210987654321:identity/tidewell.example"`,
    '                    },',
    '                  ~ {',
    '                      ~ Action   = [',
    '                            "logs:CreateLogStream",',
    '                            "logs:PutLogEvents",',
    '                        ]',
    '                      ~ Resource = "arn:aws:logs:eu-west-1:210987654321:log-group:/ecs/tidewell-worker:*" -> "arn:aws:logs:eu-west-1:210987654321:log-group:/ecs/tidewell-worker-arm64:*"',
    '                        # (1 unchanged attribute hidden)',
    '                    },',
    '                ]',
    '                # (1 unchanged attribute hidden)',
    '            }',
    '        )',
    '        # (1 unchanged attribute hidden)',
    '    }',
    '',
    '  # aws_appautoscaling_target.worker will be created',
    '  + resource "aws_appautoscaling_target" "worker" {',
    '      + arn                = (known after apply)',
    '      + id                 = (known after apply)',
    '      + max_capacity       = 4',
    '      + min_capacity       = 1',
    '      + resource_id        = "service/tidewell-prod/tidewell-worker-arm64"',
    '      + role_arn           = (known after apply)',
    '      + scalable_dimension = "ecs:service:DesiredCount"',
    '      + service_namespace  = "ecs"',
    '      + tags_all           = (known after apply)',
    '    }',
    '',
    '  # aws_appautoscaling_policy.worker_cpu will be created',
    '  + resource "aws_appautoscaling_policy" "worker_cpu" {',
    '      + alarm_arns         = (known after apply)',
    '      + arn                = (known after apply)',
    '      + id                 = (known after apply)',
    '      + name               = "worker-cpu"',
    '      + policy_type        = "TargetTrackingScaling"',
    '      + resource_id        = "service/tidewell-prod/tidewell-worker-arm64"',
    '      + scalable_dimension = "ecs:service:DesiredCount"',
    '      + service_namespace  = "ecs"',
    '',
    '      + target_tracking_scaling_policy_configuration {',
    '          + disable_scale_in   = false',
    '          + scale_in_cooldown  = 300',
    '          + scale_out_cooldown = 60',
    '          + target_value       = 60',
    '',
    '          + predefined_metric_specification {',
    '              + predefined_metric_type = "ECSServiceAverageCPUUtilization"',
    '            }',
    '        }',
    '    }',
    '',
    'Plan: 6 to add, 6 to change, 5 to destroy.',
    '',
    'Changes to Outputs:',
    '  ~ worker_log_group    = "/ecs/tidewell-worker" -> "/ecs/tidewell-worker-arm64"',
    '  ~ worker_service_name = "tidewell-worker" -> "tidewell-worker-arm64"',
    '',
    '─────────────────────────────────────────────────────────────────────────────',
    '',
    'Saved the plan to: prod-worker-arm64.tfplan',
    '',
    'To perform exactly these actions, run the following command to apply:',
    '    terraform apply "prod-worker-arm64.tfplan"',
  ];
  return parts('terraform', lines.join('\n').split('\n'), 46_000, { base: 'terraform/plan', ext: 'txt' });
}

// ---------------------------------------------------------------- Wednesday's polling (2026-10-21)

/**
 * From 14:10 UTC Ferrowell's sync walked every page of every organisation it
 * works for, over and over, asking for 100 at a time with status=all, and it
 * answered a 429 by asking again at once. Our limiter is per key: Ferrowell
 * uses each customer's own key, so only the keys of its biggest customers ran
 * into it, and every refused request still cost the limiter's write.
 */
function pollingStorm() {
  const r = seeded('storm');
  const from = T('2026-10-21T14:24:00Z');
  const to = T('2026-10-21T14:27:00Z');
  const stream = `api/api/${taskId(r)}`;
  const lines = [];
  const counts = { ferrowell: 0, limited: 0, others: 0, keys: new Set(), limitedKeys: new Set() };
  // Other clients, a sixth of the API's usual afternoon.
  for (let t = from + r.int(0, 600); t < to; t += Math.max(60, r.around(1.05 * SEC, 0.8))) {
    const org = pickOrg(r);
    const a = answer(r, pickKind(r), org);
    for (const l of requestLines(t, a)) lines.push(l);
    counts.others += 1;
  }
  // Ferrowell, as this one task saw it: the big customers' keys run past 600 a minute across the six tasks.
  const ferro = FERROWELL.orgs.map((o, i) => ({ org: o, pages: Math.max(1, Math.ceil((i % 7 === 0 ? o.projects * 6 : o.projects) / 100)), page: 1 + (i % 5), busy: i % 7 === 0 }));
  for (let t = from + r.int(0, 200); t < to; t += Math.max(40, r.around(330, 0.55))) {
    const f = r.pick(ferro);
    const minute = Math.floor((t - from) / MIN);
    const limited = f.busy && minute >= 0 && (t % MIN) / MIN > 0.42;
    const base = answer(r, 'list', f.org, { page: f.page });
    const a = limited
      ? { ...base, status: 429, took: r.int(2, 6) }
      : { ...base, took: listMs(r, { projects: f.org.projects * (f.busy ? 6 : 1) }, f.page) };
    a.path = `/v2/organizations/${f.org.id}/projects`;
    for (const l of requestLines(t, a)) lines.push(l);
    counts.ferrowell += 1;
    counts.keys.add(a.key);
    if (limited) {
      counts.limited += 1;
      counts.limitedKeys.add(a.key);
      // Asked again straight away, ignoring Retry-After.
      const again = t + a.took + r.int(40, 160);
      if (again < to) for (const l of requestLines(again, { ...a, took: r.int(2, 5) })) lines.push(l);
      counts.ferrowell += 1;
      counts.limited += 1;
    } else f.page = f.page >= f.pages ? 1 : f.page + 1;
  }
  return { files: parts('prod-api-2026-10-21', sortLines(lines.map(tailed(stream)))), counts };
}

// ---------------------------------------------------------------- the support inbox

const SUPPORT = [
  ['01-invited-twice.txt', 'From: Oskar Lindqvist <it@harbourfinch.example>\nDate: Tue, 20 Oct 2026 11:48 +0100\nSubject: Everyone got two invitation emails\n\nHi,\n\nWe invited our whole staff this morning through the bulk invite, and about half of them got the invitation email twice, a minute or so apart. A few people have asked whether the first one is fake. Which link should they use? And will they get more?\n\nThanks,\nOskar\nIT, Harbour & Finch\n'],
  ['02-export-only-header.txt', 'From: Maya Brenner <maya@quarrystudio.example>\nDate: Mon, 19 Oct 2026 15:02 +0100\nSubject: Export is empty?\n\nHello, I set up a new organisation for a client last week and wanted to test the CSV export before we import anything. The file I get has only one line, the column names, and nothing else. Is the export broken?\n\nMaya\n'],
  ['03-rate-limit.txt', "From: Devon Achterberg <devon@lindenhealth.example>\nDate: Wed, 21 Oct 2026 07:44 +0100\nSubject: 429 Too Many Requests in our nightly sync\n\nOur nightly job reads every project and its tasks for our 30 teams and started failing with 429s around 2am. We're a paying customer. Can you raise our limit? It's a batch job, it just needs to go fast.\n\nDevon\n"],
  ['04-archived-missing.txt', 'From: Ruth Okonjo <ruth.okonjo@copperworks.example>\nDate: Wed, 21 Oct 2026 16:15 +0100\nSubject: Archived projects vanished from the API\n\nAfter we archive a project in the app it no longer shows up when our reporting script calls the projects list. We need archived projects for our yearly report. Did you delete them?\n\nRuth\n'],
  ['05-key-rotation.txt', "From: Felix Andersen <felix@alderlogistics.example>\nDate: Thu, 22 Oct 2026 08:20 +0100\nSubject: Rotating our API key\n\nOur security team wants us to rotate API keys every 90 days. How do we do that without our integration going down while we swap the key? I can't find anything about it in the docs.\n\nFelix\n"],
  ['06-webhooks-when.txt', "From: Grace Mbeki <grace@saltmarshmedia.example>\nDate: Thu, 22 Oct 2026 09:05 +0100\nSubject: Webhooks?\n\nHi there, our integration partner Ferrowell says you're adding webhooks for project changes, so they can stop polling. When will that be available, and will it cost extra? We'd like to plan around it.\n\nThanks!\nGrace\n"],
];

function support() {
  return new Map(SUPPORT.map(([name, text]) => [`support/${name}`, text]));
}

// ---------------------------------------------------------------- npm

function npmReports() {
  const outdated = [
    'Package                  Current   Wanted   Latest  Location                              Depended by',
    '@aws-sdk/client-sesv2    3.908.0  3.908.0  3.916.0  node_modules/@aws-sdk/client-sesv2    tidewell-api',
    '@prisma/client            6.17.1   6.17.1   6.18.2  node_modules/@prisma/client            tidewell-api',
    '@types/express             5.0.3    5.0.3    5.0.5  node_modules/@types/express             tidewell-api',
    '@types/node               24.7.2   24.7.2   24.9.1  node_modules/@types/node               tidewell-api',
    'eslint                    9.37.0   9.37.0   9.39.0  node_modules/eslint                    tidewell-api',
    'express                    5.1.0    5.1.0    5.1.2  node_modules/express                   tidewell-api',
    'jest                      30.2.0   30.2.0   30.3.1  node_modules/jest                      tidewell-api',
    'prettier                   3.6.2    3.6.2    3.7.3  node_modules/prettier                  tidewell-api',
    'prisma                    6.17.1   6.17.1   6.18.2  node_modules/prisma                    tidewell-api',
    'supertest                  7.1.4    7.1.4    7.2.0  node_modules/supertest                 tidewell-api',
    'ts-jest                   29.4.5   29.4.5   29.4.6  node_modules/ts-jest                   tidewell-api',
    'tsx                       4.20.6   4.20.6   4.21.1  node_modules/tsx                       tidewell-api',
    'typescript                 5.9.3    5.9.3    6.0.2  node_modules/typescript                tidewell-api',
    'unleash-client             6.7.0    6.7.0    6.9.1  node_modules/unleash-client            tidewell-api',
    '',
  ].join('\n');
  const adv = (id, name, title, severity, range, cwe, score, via, effects, fix, dev) => ({
    name, severity, isDirect: !via, via: via ? [via] : [{ source: id, name, dependency: name, title, url: `https://github.com/advisories/GHSA-${id}`, severity, cwe: [cwe], cvss: { score, vectorString: score >= 7 ? 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' : 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:L' }, range }],
    effects, range, nodes: [`node_modules/${name}`], fixAvailable: fix, ...(dev ? { dev: true } : {}),
  });
  const vulnerabilities = {
    'path-to-regexp': adv('9wv6-86v2-598j', 'path-to-regexp', 'path-to-regexp backtracks badly on a path with two parameters in one segment', 'moderate', '>=8.0.0 <8.2.1', 'CWE-1333', 5.3, null, ['router'], { name: 'express', version: '5.1.2', isSemVerMajor: false }),
    router: adv('', 'router', '', 'moderate', '2.2.0', '', 0, 'path-to-regexp', ['express'], { name: 'express', version: '5.1.2', isSemVerMajor: false }),
    express: adv('', 'express', '', 'moderate', '5.0.0 - 5.1.1', '', 0, 'router', [], { name: 'express', version: '5.1.2', isSemVerMajor: false }),
    '@smithy/node-http-handler': adv('4c4p-7mq3-82xw', '@smithy/node-http-handler', 'Proxy credentials can be written to debug logs', 'low', '<4.3.1', 'CWE-532', 3.1, null, ['@aws-sdk/client-sesv2'], { name: '@aws-sdk/client-sesv2', version: '3.916.0', isSemVerMajor: false }),
    'brace-expansion': adv('v6h2-p8h4-qcjw', 'brace-expansion', 'brace-expansion Regular Expression Denial of Service', 'low', '>=2.0.0 <2.0.2', 'CWE-400', 3.1, null, ['minimatch'], true, true),
    minimatch: adv('', 'minimatch', '', 'low', '9.0.0 - 9.0.5', '', 0, 'brace-expansion', ['glob', 'jest-config'], true, true),
    'form-data': adv('fjxv-7rqg-78g4', 'form-data', 'form-data uses an unsafe random function to choose its boundary', 'critical', '>=4.0.0 <4.0.4', 'CWE-330', 9.4, null, ['superagent'], { name: 'supertest', version: '7.2.0', isSemVerMajor: false }, true),
    superagent: adv('', 'superagent', '', 'critical', '10.0.0 - 10.2.2', '', 0, 'form-data', ['supertest'], { name: 'supertest', version: '7.2.0', isSemVerMajor: false }, true),
    supertest: adv('', 'supertest', '', 'critical', '7.0.0 - 7.1.4', '', 0, 'superagent', [], { name: 'supertest', version: '7.2.0', isSemVerMajor: false }, true),
    'tar-fs': adv('8cj5-5rvv-wf4v', 'tar-fs', 'tar-fs can write outside its folder when it extracts a crafted archive', 'high', '>=3.0.0 <3.0.9', 'CWE-22', 7.5, null, ['@prisma/engines'], { name: 'prisma', version: '6.18.2', isSemVerMajor: false }, true),
    '@prisma/engines': adv('', '@prisma/engines', '', 'high', '6.16.0 - 6.17.1', '', 0, 'tar-fs', ['prisma'], { name: 'prisma', version: '6.18.2', isSemVerMajor: false }, true),
    prisma: adv('', 'prisma', '', 'high', '6.16.0 - 6.17.1', '', 0, '@prisma/engines', [], { name: 'prisma', version: '6.18.2', isSemVerMajor: false }, true),
  };
  for (const v of Object.values(vulnerabilities)) if (!v.via[0]?.source) v.via = [v.via[0]?.name ?? v.via[0]].filter(Boolean);
  const audit = {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: { info: 0, low: 3, moderate: 3, high: 3, critical: 3, total: 12 },
      dependencies: { prod: 214, dev: 512, optional: 41, peer: 6, peerOptional: 0, total: 726 },
    },
  };
  return new Map([
    ['npm/outdated.txt', outdated],
    ['npm/audit.json', `${JSON.stringify(audit, null, 2)}\n`],
  ]);
}

// ---------------------------------------------------------------- the Core API backlog

const BACKLOG = [
  ['Projects list is slow for organisations with many projects', 'Meridian reports multi-second list responses. OFFSET paging plus a count on every page.', ['performance', 'customer'], 2],
  ['Paging the projects list gets slower the deeper you go', 'Deep pages take seconds. Probably the same as the slow list for big orgs.', ['performance'], 3],
  ['Clean up done rows in the jobs table', 'jobs keeps every finished row. The worker poll scans past millions of them.', ['worker', 'tech-debt'], 2],
  ['rate_limit_windows grows forever', 'One row per key per minute, never deleted. Over 60M rows.', ['database', 'tech-debt'], 2],
  ['Worker exits when the database connection drops', 'A failed poll throws out of the loop and kills the process; ECS restarts it.', ['worker', 'reliability'], 1],
  ['Bulk invite sends duplicate emails when SES is slow', 'A job running over a minute is claimed again by the other worker.', ['worker', 'customer', 'bug'], 1],
  ['Malformed JSON returns 500 instead of 400', 'onError ignores the status body-parser sets.', ['bug', 'api'], 3],
  ['Concurrent bulk invites for the same address fail with P2002', 'Two requests race between findMany and create.', ['bug', 'invites'], 3],
  ['Per-partner rate limits', 'Partners like Ferrowell use many customer keys; per-key limits do not cap them.', ['api', 'partners'], 2],
  ['Retry-After is ignored by some clients', 'Document it, and consider a longer penalty for clients that keep going.', ['api', 'docs'], 4],
  ['Graceful shutdown for the API', 'SIGTERM kills in-flight requests during deploys; the load balancer logs 502s.', ['reliability', 'api'], 2],
  ['keepAliveTimeout below the load balancer idle timeout', "Node's default keep-alive is shorter than the ALB's 60 s, which causes sporadic 502s.", ['reliability'], 2],
  ['Remove the stale export_ready_email job kind', 'Rows of a removed feature still sit in jobs and fail with no handler.', ['worker', 'tech-debt'], 4],
  ['CSV export: escape formulas', 'A project name starting with = runs as a formula in Excel.', ['security', 'export'], 2],
  ['Stop storing raw invite tokens in jobs.payload', 'The send job carries the raw token. Generate it at send time instead.', ['security', 'invites'], 2],
  ['Disable X-Powered-By', 'Express advertises itself.', ['security'], 4],
  ['Rotate API keys without downtime', 'Allow two active keys per organisation from the API, not only from support.', ['api', 'customer'], 3],
  ['Webhooks for project events', 'Partners want events instead of polling.', ['api', 'partners'], 1],
  ['Document status=all on the projects list', 'Customers think archived projects were deleted.', ['docs'], 4],
  ['API memory grows between deploys', 'API tasks climb from about 38% to 60% memory over five days.', ['reliability'], 3],
  ['Move the worker to arm64', 'Cheaper per vCPU; needs a multi-arch image.', ['infra', 'cost'], 3],
  ['Build the image for arm64 and amd64', 'CI builds linux/amd64 only.', ['infra'], 3],
  ['Container Insights enhanced observability is expensive', 'CloudWatch metrics cost jumped in October.', ['infra', 'cost'], 2],
  ['Upgrade Prisma to 6.18', 'Patch release; check the migration engine changes.', ['dependencies'], 4],
  ['Upgrade express to 5.1.2', 'path-to-regexp advisory.', ['dependencies', 'security'], 3],
  ['TypeScript 6', 'Major upgrade; check the strictness changes.', ['dependencies'], 4],
  ['Add request ids to the log', 'Hard to tie an error line to its request line.', ['observability'], 3],
  ['Log the query string of list requests', 'We cannot see which page a client asked for.', ['observability'], 4],
  ['Alarm on worker restarts', 'We only found out about Thursday from the 5xx alarm.', ['observability', 'worker'], 2],
  ['Statement timeout for API connections', 'A blocked query holds a pool connection forever.', ['database', 'reliability'], 2],
  ['lock_timeout for migrations', 'A migration that waits for a lock should fail fast instead of queueing everything behind it.', ['database', 'migrations'], 2],
  ['Split data backfills out of schema migrations', 'Backfills inside the migration transaction hold locks for minutes.', ['database', 'migrations'], 2],
  ['Project transfer between organisations', 'Customers merging accounts want to move projects.', ['api', 'customer'], 3],
  ['Activity feed pagination', 'The feed endpoint has no cursor.', ['api'], 4],
  ['Tasks endpoint: filter by done', 'Customers fetch all tasks to count open ones.', ['api'], 4],
  ['Organisation-level usage endpoint', 'Let customers see their own request counts.', ['api'], 4],
  ['Health check that touches the database', 'GET /health never fails when Postgres is down; consider a separate readiness check.', ['reliability'], 3],
  ['Retry Prisma P1017 once for idempotent reads', 'A failover makes every in-flight GET fail.', ['reliability', 'database'], 3],
  ['Admin console: list failed jobs', 'Support asks engineering to look at failed jobs.', ['admin', 'worker'], 3],
  ['Invite emails: plain-text only', 'Some clients flag them as spam; add an HTML part?', ['invites'], 4],
  ['SES sending quota alarm', 'Throttling on Tuesday went unnoticed until customers wrote in.', ['observability', 'invites'], 2],
  ['Unleash: clean up released flags', 'Several flags are on everywhere and can be removed from code.', ['tech-debt'], 4],
  ['Unleash context: organizationId vs orgId', 'The web app and the API use different context field names.', ['flags'], 3],
  ['OpenAPI spec is out of date', 'Invites and export are missing from the spec.', ['docs'], 3],
  ['Return 404 for an archived project on PATCH?', 'Unclear behaviour when renaming an archived project.', ['api'], 4],
  ['Export: include archived_at', 'Customers want the archive date in the CSV.', ['export', 'customer'], 4],
  ['Rate limit unauthenticated requests by IP', 'Bad-key requests are not limited at all.', ['security', 'api'], 3],
  ['Reduce log volume of the request logger', 'Successful GETs are most of the CloudWatch ingestion.', ['cost', 'observability'], 3],
  ['jobs: index for the poll', 'The poll needs an index on due, unfinished rows.', ['worker', 'database'], 2],
  ['Test helpers for Prisma mocks', 'Every test hand-rolls its mocks.', ['tests', 'tech-debt'], 4],
  ['Flaky test: organizationsExport on CI', 'Fails about once a week with a timeout.', ['tests'], 3],
  ['Bulk invite: show which addresses were skipped', 'The response only gives a count.', ['invites', 'api'], 4],
  ['Remove /v1 after the sunset date', 'Deprecation headers have been on since December.', ['api'], 3],
  ['Postgres 17 upgrade plan', 'RDS minor versions keep being applied in the maintenance window; plan the major.', ['database', 'infra'], 4],
  ['Read replica for heavy list queries', 'Send big organisations\' lists to the replica.', ['database', 'performance'], 3],
];

function backlog() {
  const r = seeded('linear');
  const taken = new Set([301, 318, 342, 356, 371, 402, 415, 431, 433, 438, 447]);
  const people = ['Lena Vogt', 'Tomás Reis', 'Bea Kowalski', 'Ivo Marques', 'Carla Nunes', 'Jonas Berg', null, null];
  const tickets = [];
  let n = 212;
  const add = ([title, description, labels, priority], again = false) => {
    do n += r.int(1, 4);
    while (taken.has(n));
    const created = T('2026-05-04T09:00:00Z') + r.next() * (T('2026-10-21T17:00:00Z') - T('2026-05-04T09:00:00Z'));
    tickets.push({
      identifier: `ENG-${n}`,
      title: again ? title.replace(/^(\w)/, (c) => c.toLowerCase()).replace(/^/, r.pick(['Investigate: ', 'Customer report: ', 'Follow-up: '])) : title,
      state: r.pick(['Backlog', 'Backlog', 'Backlog', 'Todo', 'Triage']),
      priority: again ? Math.min(4, priority + 1) : priority,
      estimate: r.pick([1, 2, 3, 5, 8, null]),
      labels,
      assignee: r.pick(people),
      createdAt: iso(created),
      updatedAt: iso(created + r.int(0, 30) * DAY > T('2026-10-22T08:00:00Z') ? created : created + r.int(0, 30) * DAY),
      description: again ? `${description} Raised again by a different customer.` : description,
      comments: r.int(0, 6),
      project: r.pick(['Core API', 'Core API', 'Reliability', 'Partners']),
    });
  };
  for (const item of BACKLOG) add(item);
  for (const i of [0, 4, 5, 8, 13, 21, 33, 40]) add(BACKLOG[i], true);
  for (const item of BACKLOG.slice(0, 20)) if (r.chance(0.6)) add([`${item[0]} (spike)`, `Time-boxed investigation before we commit to: ${item[1]}`, [...item[2], 'spike'], Math.min(4, item[3] + 1)]);
  tickets.sort((a, b) => a.identifier.localeCompare(b.identifier, 'en', { numeric: true }));
  const text = JSON.stringify({ team: 'ENG', project: 'all', state: 'open', exportedAt: '2026-10-22T08:12:40.000Z', count: tickets.length, issues: tickets }, null, 2);
  return parts('linear', text.split('\n'), 46_000, { base: 'linear/core-api-backlog', ext: 'json' });
}

// ---------------------------------------------------------------- a teammate's pull request, ENG-438

function reviewDiff() {
  const diff = [
    'diff --git a/prisma/migrations/20261019143000_project_transfers/migration.sql b/prisma/migrations/20261019143000_project_transfers/migration.sql',
    'new file mode 100644',
    'index 0000000..b41c2e9',
    '--- /dev/null',
    '+++ b/prisma/migrations/20261019143000_project_transfers/migration.sql',
    '@@ -0,0 +1,18 @@',
    '+-- ENG-438: move a project to another organisation.',
    '+',
    '+-- AlterTable',
    '+ALTER TABLE "projects" ADD COLUMN "transferred_at" TIMESTAMP(3);',
    '+',
    '+-- CreateTable',
    '+CREATE TABLE "project_transfers" (',
    '+    "id" TEXT NOT NULL,',
    '+    "project_id" TEXT NOT NULL,',
    '+    "from_organization_id" TEXT NOT NULL,',
    '+    "to_organization_id" TEXT NOT NULL,',
    '+    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '+',
    '+    CONSTRAINT "project_transfers_pkey" PRIMARY KEY ("id")',
    '+);',
    '+',
    '+CREATE INDEX "project_transfers_project_id_idx" ON "project_transfers"("project_id");',
    'diff --git a/prisma/schema.prisma b/prisma/schema.prisma',
    'index 7a1e0c4..e9b3f21 100644',
    '--- a/prisma/schema.prisma',
    '+++ b/prisma/schema.prisma',
    '@@ -27,6 +27,7 @@ model Project {',
    '   createdAt      DateTime      @default(now()) @map("created_at")',
    '   updatedAt      DateTime      @updatedAt @map("updated_at")',
    '   archivedAt     DateTime?     @map("archived_at")',
    '+  transferredAt  DateTime?     @map("transferred_at")',
    '   organization   Organization  @relation(fields: [organizationId], references: [id])',
    '   tasks          Task[]',
    ' ',
    '@@ -95,6 +96,17 @@ model Job {',
    '   @@map("jobs")',
    ' }',
    ' ',
    '+model ProjectTransfer {',
    '+  id                 String   @id @default(uuid())',
    '+  projectId          String   @map("project_id")',
    '+  fromOrganizationId String   @map("from_organization_id")',
    '+  toOrganizationId   String   @map("to_organization_id")',
    '+  createdAt          DateTime @default(now()) @map("created_at")',
    '+',
    '+  @@index([projectId])',
    '+  @@map("project_transfers")',
    '+}',
    '+',
    ' enum ProjectStatus {',
    '   ACTIVE',
    '   ARCHIVED',
    'diff --git a/src/routes/v2/projects.ts b/src/routes/v2/projects.ts',
    'index 3c9d0a2..58f17be 100644',
    '--- a/src/routes/v2/projects.ts',
    '+++ b/src/routes/v2/projects.ts',
    '@@ -1,7 +1,15 @@',
    " import { Router } from 'express';",
    " import { requireOrgAccess } from '../../middleware/auth';",
    " import { rateLimit } from '../../middleware/rateLimit';",
    "-import { archiveProject, createProject, getProject, listProjects, updateProject } from '../../services/projects';",
    '+import {',
    '+  archiveProject,',
    '+  createProject,',
    '+  getProject,',
    '+  listProjects,',
    '+  updateProject,',
    "+} from '../../services/projects';",
    "+import { transferProject } from '../../services/transfers';",
    ' ',
    ' export const projects = Router({ mergeParams: true });',
    ' ',
    '@@ -64,3 +72,22 @@ projects.post(\'/:projectId/archive\', async (req, res) => {',
    '   }',
    '   res.json(project);',
    ' });',
    '+',
    '+// ENG-438: move a project, with its tasks, to another organisation.',
    "+projects.post('/:projectId/transfer', async (req, res) => {",
    '+  const target = req.body?.target_organization_id;',
    "+  if (typeof target !== 'string' || !target) {",
    "+    res.status(422).json({ error: 'target_required' });",
    '+    return;',
    '+  }',
    '+  if (target === res.locals.organizationId) {',
    "+    res.status(422).json({ error: 'same_organization' });",
    '+    return;',
    '+  }',
    '+  const project = await transferProject(res.locals.organizationId, req.params.projectId, target);',
    '+  if (!project) {',
    "+    res.status(404).json({ error: 'not_found' });",
    '+    return;',
    '+  }',
    '+  res.json(project);',
    '+});',
    'diff --git a/src/services/transfers.ts b/src/services/transfers.ts',
    'new file mode 100644',
    'index 0000000..9d2a7c1',
    '--- /dev/null',
    '+++ b/src/services/transfers.ts',
    '@@ -0,0 +1,41 @@',
    "+import { Prisma } from '@prisma/client';",
    "+import { prisma } from '../db/client';",
    "+import { log } from '../log';",
    "+import { getProject } from './projects';",
    '+',
    '+/**',
    '+ * Move a project to another organisation. Its tasks go with it; tasks have',
    "+ * no organisation of their own, but the activity feed's rows do, so those",
    '+ * move too.',
    '+ */',
    '+export async function transferProject(from: string, projectId: string, to: string) {',
    '+  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: from } });',
    '+  if (!project) return null;',
    '+',
    '+  await prisma.project.update({',
    '+    where: { id: projectId },',
    '+    data: { organizationId: to, transferredAt: new Date() },',
    '+  });',
    '+',
    '+  // Prisma has no UPDATE ... FROM, and updateMany would need the ids first.',
    '+  await prisma.$executeRaw(',
    '+    Prisma.sql`UPDATE "activity_events" SET "organization_id" = ${to} WHERE "project_id" = ${projectId}`,',
    '+  );',
    '+',
    '+  await prisma.projectTransfer.create({',
    '+    data: { projectId, fromOrganizationId: from, toOrganizationId: to },',
    '+  });',
    '+',
    "+  log.info('project transferred', { projectId, from, to });",
    '+  return getProject(to, projectId);',
    '+}',
    'diff --git a/src/__tests__/transfers.test.ts b/src/__tests__/transfers.test.ts',
    'new file mode 100644',
    'index 0000000..4e8b0f3',
    '--- /dev/null',
    '+++ b/src/__tests__/transfers.test.ts',
    '@@ -0,0 +1,52 @@',
    "+import request from 'supertest';",
    "+import { createApp } from '../app';",
    "+import { prisma } from '../db/client';",
    '+',
    "+jest.mock('../db/client', () => ({",
    '+  prisma: {',
    '+    project: { findFirst: jest.fn(), update: jest.fn() },',
    '+    projectTransfer: { create: jest.fn() },',
    '+    $executeRaw: jest.fn(),',
    '+  },',
    '+}));',
    "+jest.mock('../middleware/auth', () => ({",
    '+  requireOrgAccess: (req: { params: { id: string } }, res: { locals: Record<string, unknown> }, next: () => void) => {',
    '+    res.locals.organizationId = req.params.id;',
    '+    next();',
    '+  },',
    '+}));',
    "+jest.mock('../middleware/rateLimit', () => ({",
    '+  rateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),',
    '+}));',
    '+',
    '+const project = prisma.project as unknown as { findFirst: jest.Mock; update: jest.Mock };',
    '+',
    '+const row = {',
    "+  id: 'p1',",
    "+  organizationId: 'org-1',",
    "+  name: 'Website',",
    '+  description: null,',
    "+  status: 'ACTIVE',",
    "+  createdAt: new Date('2026-10-01T09:00:00Z'),",
    "+  updatedAt: new Date('2026-10-01T09:00:00Z'),",
    '+  archivedAt: null,',
    '+};',
    '+',
    "+it('moves a project to another organisation', async () => {",
    '+  project.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, organizationId: \'org-2\' });',
    '+  project.update.mockResolvedValueOnce({ ...row, organizationId: \'org-2\' });',
    '+',
    '+  const res = await request(createApp())',
    "+    .post('/v2/organizations/org-1/projects/p1/transfer')",
    "+    .send({ target_organization_id: 'org-2' });",
    '+',
    '+  expect(res.status).toBe(200);',
    "+  expect(res.body.organization_id).toBe('org-2');",
    '+  expect(prisma.$executeRaw).toHaveBeenCalled();',
    '+});',
    '+',
    "+it('refuses the same organisation', async () => {",
    '+  const res = await request(createApp())',
    "+    .post('/v2/organizations/org-1/projects/p1/transfer')",
    "+    .send({ target_organization_id: 'org-1' });",
    '+',
    '+  expect(res.status).toBe(422);',
    '+});',
    '',
  ].join('\n');
  const description = [
    'ENG-438: Transfer a project to another organisation',
    '',
    'Customers merging two accounts want to move projects across. This adds',
    'POST /v2/organizations/:id/projects/:projectId/transfer with',
    '{ "target_organization_id": "..." }, which moves the project and its tasks,',
    'records the transfer, and returns the project as the target sees it.',
    '',
    'Tested with the new Jest tests. Migration adds one column and one table.',
    '',
  ].join('\n');
  return new Map([
    ['review/ENG-438.diff', diff],
    ['review/ENG-438-description.txt', description],
  ]);
}

// ---------------------------------------------------------------- Tuesday's duplicate invites (2026-10-20)

const FIRST = 'oskar lena tomas bea ivo carla jonas maya ruth felix grace devon nadia pavel sofia arjun mei kofi hana luca elif david noor yusuf ingrid marta theo zara amir clara jun leila mateo freya omar petra raj selma tariq una viktor wen xavier yara'.split(' ');
const LAST = 'lindqvist almeida brenner okonjo andersen mbeki achterberg novak haddad petrov santos dubois keller moreau rossi silva nakamura osei kim larsen weber costa fischer horvath varga oliveira berg rahman ito sato mendes'.split(' ');

/**
 * Harbour & Finch invited 480 people at 09:12. SES was throttling sends that
 * morning, so a batch of 50 took well over a minute, and the other worker
 * counted the running job as abandoned (src/jobs/queue.ts, LOCK_MS) and sent
 * the whole batch again. The handler sends to every invite in its batch,
 * whether it has been sent or not.
 */
function duplicateInvites() {
  const r = seeded('invites-2026-10-20');
  const from = T('2026-10-20T09:00:00Z');
  const to = T('2026-10-20T10:00:00Z');
  const throttled = [T('2026-10-20T09:12:00Z'), T('2026-10-20T09:18:40Z')];
  const hf = BY_NAME['Harbour & Finch'];
  const names = new Set();
  while (names.size < 480) names.add(`${r.pick(FIRST)}.${r.pick(LAST)}`);
  const asked = T('2026-10-20T09:12:04.318Z');
  const invites = [...names].map((n, i) => ({ id: r.uuid(), email: `${n}@harbourfinch.example`, created: asked + 40 + i * 6 }));
  const jobs = [];
  for (let i = 0; i < invites.length; i += 50) jobs.push({ id: r.uuid(), runAt: invites[Math.min(i + 49, invites.length - 1)].created + 30 + i, invites: invites.slice(i, i + 50), hf: true });
  // Everyone else's invites that hour: one to four at a time.
  for (let t = from + r.int(20, 90) * SEC; t < to; t += r.int(70, 240) * SEC) {
    const org = pickOrg(r);
    jobs.push({ id: r.uuid(), runAt: t, invites: Array.from({ length: r.int(1, 4) }, () => ({ id: r.uuid(), email: `${r.pick(FIRST)}@${org.name.toLowerCase().replace(/[^a-z]+/g, '')}.example` })), hf: false });
  }
  jobs.sort((a, b) => a.runAt - b.runAt || a.id.localeCompare(b.id));
  for (const j of jobs) Object.assign(j, { attempts: 0, lockedAt: null, doneAt: Number.POSITIVE_INFINITY });
  const workers = [{ stream: `worker/worker/${taskId(r)}`, free: from + 700 }, { stream: `worker/worker/${taskId(r)}`, free: from + 1900 }];
  const lines = [];
  const sends = [];
  const lastSent = new Map();
  const sendMs = (t) => (t >= throttled[0] && t < throttled[1] ? r.int(1150, 1850) : r.int(70, 140));
  while (true) {
    const w = workers[0].free <= workers[1].free ? workers[0] : workers[1];
    const t = w.free;
    if (t >= to) break;
    const due = jobs.find((j) => j.runAt <= t && !(j.doneAt <= t) && (j.lockedAt === null || j.lockedAt < t - MIN));
    if (!due) {
      w.free = t + 2 * SEC + r.int(5, 40);
      continue;
    }
    due.attempts += 1;
    due.lockedAt = t;
    lines.push(tailed(w.stream)(logLine('info', t, 'job claimed', { id: due.id, kind: 'send_invite_emails', attempts: due.attempts })));
    let at = t + r.int(6, 14);
    for (const inv of due.invites) {
      at += sendMs(at);
      if (due.hf) {
        sends.push({ at, to: inv.email, id: `0102019a${r.hex(8)}-${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}-000000` });
        lastSent.set(inv.id, at + r.int(2, 6));
      }
    }
    lines.push(tailed(w.stream)(logLine('info', at + 3, 'invites sent', { job: due.id, count: due.invites.length })));
    lines.push(tailed(w.stream)(logLine('info', at + 7, 'job done', { id: due.id, kind: 'send_invite_emails', ms: at + 7 - t })));
    // complete() clears the claim as it sets done_at, and a done job is never claimed again.
    due.doneAt = Math.min(due.doneAt, at + 7);
    w.free = at + 9;
  }
  const accepted = new Set(invites.filter(() => r.chance(0.38)).map((i) => i.id));
  const rows = invites.map((i) => [i.id, i.email, 'member', iso(i.created), lastSent.has(i.id) ? iso(lastSent.get(i.id)) : '', accepted.has(i.id) && lastSent.has(i.id) ? iso(lastSent.get(i.id) + r.int(4, 300) * MIN) : ''].join('\t'));
  const twice = invites.filter((i) => sends.filter((s) => s.to === i.email).length > 1).length;
  return {
    files: new Map([
      ['prod-worker-2026-10-20.log', `${sortLines(lines).join('\n')}\n`],
      ...parts('invites-harbour-finch', rows, 46_000, { base: 'invites-harbour-finch', ext: 'tsv', head: 'id\temail\trole\tcreated_at\tsent_at\taccepted_at' }),
      ...parts('ses-sends', sends.sort((a, b) => a.at - b.at).map((s) => `${iso(s.at)}\t${s.id}\tSend\t${s.to}\tHarbour & Finch invite`), 46_000, { head: 'timestamp\tmessage_id\tevent\tdestination\tsubject_tag', ext: 'tsv' }),
    ]),
    twice,
    org: hf,
  };
}

// ---------------------------------------------------------------- the week's metrics

function metrics() {
  const r = seeded('metrics');
  const from = T('2026-10-15T00:00:00Z');
  const to = T('2026-10-22T06:00:00Z');
  const rds = ['timestamp,cpu_pct,connections,read_iops,write_iops,write_latency_ms,freeable_memory_mb'];
  for (let t = from; t < to; t += 15 * MIN) {
    const d = new Date(t);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    const busy = weekday && hour >= 7 && hour < 18 ? Math.sin(((hour - 7) / 11) * Math.PI) : 0;
    let cpu = 7 + 21 * busy + r.around(1, 0.15) * 2;
    let conns = 44 + Math.round(10 * busy) + r.int(0, 4);
    let readIops = Math.round(180 + 1900 * busy + r.int(0, 90));
    let writeIops = Math.round(120 + 640 * busy + r.int(0, 60));
    let latency = 0.9 + 0.6 * busy + r.next() * 0.3;
    const fromFerrowell = t >= T('2026-10-14T00:00:00Z') ? 1.25 : 1;
    readIops = Math.round(readIops * fromFerrowell);
    if (t >= T('2026-10-21T14:00:00Z') && t < T('2026-10-21T15:15:00Z')) {
      cpu = 74 + r.next() * 7;
      conns = 79 + r.int(0, 3);
      readIops = 9800 + r.int(0, 900);
      writeIops = 2900 + r.int(0, 300);
      latency = 2.9 + r.next();
    }
    if (t >= T('2026-10-20T13:00:00Z') && t < T('2026-10-20T13:15:00Z')) {
      conns = 81;
      cpu = 31 + r.next() * 3;
      writeIops = 4100 + r.int(0, 200);
      latency = 6.4 + r.next();
    }
    if (t === T('2026-10-22T03:00:00Z')) {
      conns = 29;
      cpu = 4.1;
    }
    if (t === T('2026-10-22T03:15:00Z')) conns = 46;
    const mem = Math.round(11800 - 900 * busy - (t - from) / DAY * 35 + r.int(-60, 60));
    rds.push([iso(t).replace('.000Z', 'Z'), cpu.toFixed(1), conns, readIops, writeIops, latency.toFixed(2), mem].join(','));
  }
  const ecs = ['timestamp,service,running_tasks,cpu_pct,memory_pct'];
  const deploys = [T('2026-10-14T16:20:00Z'), T('2026-10-19T16:20:00Z'), T('2026-10-21T11:05:00Z')];
  for (let t = from; t < to; t += HOUR) {
    const d = new Date(t);
    const hour = d.getUTCHours();
    const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    const busy = weekday && hour >= 7 && hour < 18 ? Math.sin(((hour - 7) / 11) * Math.PI) : 0;
    const sinceDeploy = (t - Math.max(...deploys.filter((x) => x <= t))) / HOUR;
    const storm = t >= T('2026-10-21T14:00:00Z') && t < T('2026-10-21T16:00:00Z');
    ecs.push([iso(t).replace('.000Z', 'Z'), 'tidewell-api', storm ? 8 : 6, (storm ? 71 : 9 + 24 * busy + r.next() * 3).toFixed(1), (38 + sinceDeploy * 0.19 + r.next()).toFixed(1)].join(','));
    const crash = t === T('2026-10-22T03:00:00Z');
    ecs.push([iso(t).replace('.000Z', 'Z'), 'tidewell-worker', crash ? 1.7 : 2, (1.2 + (t >= T('2026-10-20T09:00:00Z') && t < T('2026-10-20T10:00:00Z') ? 6.5 : 0) + r.next()).toFixed(1), (21 + r.next() * 2).toFixed(1)].join(','));
  }
  return new Map([
    ['metrics/rds.csv', `${rds.join('\n')}\n`],
    ['metrics/ecs.csv', `${ecs.join('\n')}\n`],
  ]);
}

// ---------------------------------------------------------------- the bill

function costs() {
  const r = seeded('costs');
  const rows = [];
  const lines = [
    ['Amazon Elastic Container Service', 'EU-Fargate-vCPU-Hours:perCPU', (d) => 11.85 + (d >= '2026-10-21' && d < '2026-10-22' ? 0.9 : 0)],
    ['Amazon Elastic Container Service', 'EU-Fargate-GB-Hours', () => 2.6],
    ['Amazon Relational Database Service', 'EU-Multi-AZUsage:db.r6g.xlarge', () => 21.5],
    ['Amazon Relational Database Service', 'EU-RDS:Multi-AZ-GP3-Storage', (d, i) => 2.9 + i * 0.021],
    ['Amazon Relational Database Service', 'EU-RDS:ChargedBackupUsage', (d, i) => 0.62 + i * 0.012],
    ['Elastic Load Balancing', 'EU-LoadBalancerUsage', () => 0.6],
    ['Elastic Load Balancing', 'EU-LCUUsage', (d) => (d >= '2026-10-14' ? 3.7 : 1.4) + (d === '2026-10-21' ? 4.1 : 0)],
    ['EC2 - Other', 'EU-NatGateway-Hours', () => 3.46],
    ['EC2 - Other', 'EU-NatGateway-Bytes', (d) => 0.74 + (['2026-10-19', '2026-10-21'].includes(d) ? 0.31 : 0)],
    ['AmazonCloudWatch', 'EU-DataProcessing-Bytes', (d) => 2.05 + (d >= '2026-10-14' ? 0.9 : 0) + (d === '2026-10-21' ? 1.6 : 0)],
    ['AmazonCloudWatch', 'EU-CW:MetricMonitorUsage', (d) => (d >= '2026-10-08' ? 28.3 : 0.41)],
    ['AmazonCloudWatch', 'EU-TimedStorage-ByteHrs', (d, i) => 0.21 + i * 0.004],
    ['Amazon Simple Email Service', 'EU-Recipients', (d) => 0.38 + (d === '2026-10-20' ? 0.07 : 0)],
    ['Amazon EC2 Container Registry (ECR)', 'EU-TimedStorage-ByteHrs', () => 0.24],
    ['AWS Secrets Manager', 'EU-AWSSecretsManager-Secrets', () => 0.13],
    ['AWS Key Management Service', 'EU-KMS-Keys', () => 0.1],
    ['Amazon Route 53', 'HostedZone', (d) => (d.endsWith('-01') ? 1.5 : 0.04)],
    ['AWS Data Transfer', 'EU-DataTransfer-Out-Bytes', (d) => (d >= '2026-10-14' ? 9.4 : 1.6) + (d === '2026-10-21' ? 6.2 : 0)],
  ];
  let i = 0;
  for (let t = T('2026-09-01T00:00:00Z'); t <= T('2026-10-21T00:00:00Z'); t += DAY, i += 1) {
    const d = iso(t).slice(0, 10);
    for (const [service, usage, f] of lines) rows.push([d, csvCell(service), usage, (f(d, i) * r.around(1, 0.03)).toFixed(2)].join(','));
  }
  return parts('costs', rows, 46_000, { head: 'date,service,usage_type,cost_usd', ext: 'csv' });
}

// ---------------------------------------------------------------- the security scan

function securityScan() {
  const r = seeded('security');
  const f = (severity, tool, title, location, description, evidence, recommendation) => ({ id: `TW-SEC-${r.int(1000, 9999)}`, tool, severity, title, location, description, evidence, recommendation, firstFound: '2026-10-19', status: 'open' });
  const findings = [
    f('high', 'sast', 'Secret material stored in a queue payload', 'src/services/invites.ts:31, src/routes/v2/admin/organizations.ts:47', 'Raw invite tokens are written into jobs.payload, a JSONB column kept indefinitely, while invites stores only a hash of each token.', '{ "invites": [{ "id": "...", "token": "q3V..." }] }', 'Keep only references in job payloads, and create or fetch the secret when the job runs.'),
    f('high', 'dast', 'Possible insecure direct object reference on project routes', 'GET /v2/organizations/{id}/projects/{projectId}', 'Changing projectId in the URL returned 404 rather than 403 for a project of another organisation.', 'GET /v2/organizations/2f.../projects/9a... -> 404 {"error":"not_found"}', 'Verify that object-level authorisation is enforced.'),
    f('high', 'dast', 'Administrative interface reachable from the internet', 'POST /v2/admin/organizations/{id}/invites/reissue', 'The admin routes are served by the public API. Without the right header they answer 404.', 'GET /v2/admin/organizations/x -> 404', 'Restrict administrative routes to the internal network or a VPN, in addition to the token.'),
    f('medium', 'dast', 'Formula injection in CSV export', 'GET /v2/organizations/{id}/export', 'Project names beginning with =, +, - or @ are written to the CSV as they are, and run as formulas when the file is opened in a spreadsheet.', 'p0042,=HYPERLINK("http://x.example","click"),ACTIVE,...', "Prefix such cells with a single quote, or escape them."),
    f('medium', 'sast', 'Weak hash used for credentials', 'src/middleware/auth.ts:15', 'API keys are hashed with unsalted SHA-256 rather than a password hashing function.', "createHash('sha256').update(key)", 'Use bcrypt, scrypt or Argon2 for credentials.'),
    f('medium', 'sast', 'Possible timing attack on token comparison', 'src/middleware/admin.ts:7', 'A token is compared to stored values.', 'config.adminTokenHashes.some(...)', 'Use a constant-time comparison.'),
    f('medium', 'dast', 'Unauthenticated requests are not rate limited', 'GET /v2/organizations/{id}/projects without a valid key', 'Requests with a missing or unknown key are answered without counting against any limit; each one is a database lookup.', '2,000 requests in 60 s with random keys: all 404, none 429', 'Limit unauthenticated requests by client address.'),
    f('medium', 'deps', 'path-to-regexp: inefficient regular expression', 'express 5.1.0 -> router -> path-to-regexp', 'Routes with two parameters in one path segment can be made to backtrack.', 'npm audit', 'Upgrade express to 5.1.2.'),
    f('medium', 'sast', 'Unvalidated redirect', 'src/app.ts', 'Response may redirect to a user-controlled location.', 'res.redirect(req.query.next)', 'Validate redirect targets.'),
    f('medium', 'sast', 'Bulk endpoint reveals existing invitations', 'POST /v2/organizations/{id}/invites/bulk', 'The skipped count tells the caller how many of the addresses were already invited, within its own organisation.', '{"invited":3,"skipped":2}', 'Consider whether this is acceptable.'),
    f('low', 'dast', 'Technology disclosed in X-Powered-By', 'all responses', 'Responses carry X-Powered-By: Express.', 'X-Powered-By: Express', "app.disable('x-powered-by')."),
    f('low', 'dast', 'Missing X-Content-Type-Options', 'all responses', 'Responses do not set X-Content-Type-Options: nosniff.', 'no header', 'Set nosniff on all responses.'),
    f('low', 'dast', 'Missing Strict-Transport-Security', 'all responses', 'HSTS is not set.', 'no header', 'Set Strict-Transport-Security at the load balancer or in the app.'),
    f('low', 'dast', 'TLS configuration allows CBC cipher suites', 'api.tidewell.example:443', 'The listener uses ELBSecurityPolicy-TLS13-1-2-2021-06, which still offers some TLS 1.2 CBC suites.', 'ECDHE-RSA-AES128-SHA256', 'Use a policy without CBC suites if no client needs them.'),
    f('low', 'sast', 'Stack traces may be returned to clients', 'src/app.ts:5', 'An error handler is present; check that it never returns error details.', 'onError', 'Return generic messages.'),
    f('low', 'sast', 'Personal data in logs', 'src/middleware/requestLog.ts', "Every request line logs the client's IP address; the log groups keep 90 days.", 'ip: req.ip', 'Check the retention against the privacy policy.'),
    f('low', 'dast', 'Large request bodies accepted', 'POST /v2/organizations/{id}/invites/bulk', 'Bodies up to 1 MB are accepted.', '1,048,576 bytes -> 422', 'Lower the limit where possible.'),
    f('low', 'dast', 'CORS not configured', 'all responses', 'No Access-Control-Allow-Origin header is returned.', 'no header', 'Configure CORS if browsers call the API.'),
    f('info', 'sast', 'Random tokens generated with randomBytes', 'src/services/invites.ts:27', 'Invite tokens are 24 random bytes, base64url.', 'randomBytes(24)', 'None.'),
    f('info', 'deps', 'form-data: unsafe random boundary (development dependency)', 'supertest -> superagent -> form-data', 'Used by tests only.', 'npm audit', 'Upgrade supertest when convenient.'),
    f('info', 'deps', 'tar-fs path traversal (development dependency)', 'prisma -> @prisma/engines -> tar-fs', 'Used by the Prisma CLI when it downloads engines.', 'npm audit', 'Upgrade prisma.'),
    f('info', 'dast', 'Health endpoint does not check dependencies', 'GET /health', 'The endpoint answers 200 without touching the database.', '{"ok":true}', 'Consider a readiness check.'),
  ];
  return new Map([['security-scan.json', `${JSON.stringify({ scan: 'quarterly', target: 'https://api.tidewell.example', scannedAt: '2026-10-19T22:10:00Z', findings }, null, 2)}\n`]]);
}

// ---------------------------------------------------------------- October's usage, by organisation

function usage({ ferrowellLimited }) {
  const r = seeded('usage');
  const days = 21;
  const rows = ['organization_id,name,api_keys,requests,errors_4xx,errors_5xx,rate_limited,p50_ms,p95_ms,busiest_endpoint,user_agent'];
  const daily = ['date,requests,errors_5xx,rate_limited,p95_ms'];
  for (const o of ORGS) {
    const c = CLIENTS.get(o.id);
    const ferro = c.ua === FERROWELL.ua;
    const requests = ferro ? Math.round(8640 * 14 * 1.0 + 8640 * 7 * 1.6 * r.around(1, 0.05) + (ferrowellLimited.has(o.keys[0]) ? 410_000 : 0)) : Math.round(c.weight * 61_000 * r.around(1, 0.35));
    const p50 = o.projects > 20_000 ? 640 + r.int(0, 300) : Math.round(6 + o.projects / 200 + r.int(0, 4));
    const p95 = o.projects > 20_000 ? 2_400 + r.int(0, 1800) : Math.round(p50 * r.around(4, 0.3));
    const limited = ferro ? (ferrowellLimited.has(o.keys[0]) ? r.int(160_000, 240_000) : 0) : r.chance(0.04) ? r.int(200, 9000) : 0;
    rows.push([o.id, csvCell(o.name), o.keys.length, requests, Math.round(requests * r.around(0.012, 0.6)), Math.round(requests * r.around(0.0004, 0.5)) + (o.name === 'Harbour & Finch' ? 0 : 0), limited, p50, p95, ferro || r.chance(0.6) ? 'GET /v2/organizations/:id/projects' : r.pick(['GET /v2/organizations/:id/projects/:projectId', 'POST /v2/organizations/:id/projects', 'GET /v2/organizations/:id/export']), csvCell(c.ua)].join(','));
  }
  for (let d = 1; d <= days; d += 1) {
    const date = `2026-10-${pad(d)}`;
    const weekday = ![3, 4, 10, 11, 17, 18].includes(d);
    const base = (weekday ? 512_000 : 341_000) * r.around(1, 0.04) + (d >= 14 ? 233_000 : 0) + (d === 21 ? 1_140_000 : 0);
    daily.push([date, Math.round(base), d === 20 ? 4_388 : d === 21 ? 1_902 : r.int(40, 160), d === 21 ? 431_118 : r.int(300, 2400) + (d >= 14 ? 4_000 : 0), d === 20 ? 9_812 : r.int(180, 260) + (d >= 14 ? 40 : 0)].join(','));
  }
  return new Map([
    ['usage/by-organization.csv', `${rows.join('\n')}\n`],
    ['usage/daily.csv', `${daily.join('\n')}\n`],
  ]);
}

// ---------------------------------------------------------------- Tuesday's migration (2026-10-20)

/**
 * ENG-433's migration ran in Prisma's one transaction: an ADD COLUMN, which
 * takes an ACCESS EXCLUSIVE lock on projects that is held until COMMIT, then a
 * backfill of 2.1 million rows, then a plain CREATE INDEX. Everything that
 * touched projects waited from 13:04:58 to the commit at 13:11:22, and each
 * API task's ten connections filled with waiting queries.
 */
function migrationLocks() {
  const r = seeded('locks-2026-10-20');
  const start = T('2026-10-20T13:04:58.402Z');
  const commit = T('2026-10-20T13:11:22.118Z');
  const migrationPid = 28411;
  const shots = [T('2026-10-20T13:05:31Z'), T('2026-10-20T13:07:02Z'), T('2026-10-20T13:09:33Z'), T('2026-10-20T13:11:12Z')];
  const files = new Map();
  const apiHosts = Array.from({ length: 6 }, () => `10.20.${r.int(1, 3) * 16 + r.int(0, 15)}.${r.int(2, 250)}`);
  for (const at of shots) {
    const phase = at < T('2026-10-20T13:09:12Z') ? 'UPDATE "projects" p SET "visibility" = \'public\' FROM "organizations" o WHERE o."id" = p."organization_id" AND o."public_by_default"' : 'CREATE INDEX "projects_organization_id_visibility_idx" ON "projects"("organization_id", "visibility")';
    const rows = [['pid', 'client_addr', 'application_name', 'state', 'wait_event_type', 'wait_event', 'xact_start', 'query_start', 'blocked_by', 'query'].join(' | ')];
    rows.push([migrationPid, '10.20.33.18', 'prisma-migrate', 'active', phase.startsWith('UPDATE') ? 'IO' : '', phase.startsWith('UPDATE') ? 'DataFileRead' : '', iso(start), iso(phase.startsWith('UPDATE') ? start + 412 : T('2026-10-20T13:09:12.506Z')), '', phase].join(' | '));
    let pid = 30100;
    const waited = Math.min(60, Math.round((at - start) / 4500));
    for (let i = 0; i < waited; i += 1) {
      pid += r.int(1, 40);
      const q = r.pick([
        `SELECT "public"."projects"."id", ... FROM "public"."projects" WHERE ("public"."projects"."organization_id" = $1 AND "public"."projects"."status" = CAST($2::text AS "public"."ProjectStatus")) ORDER BY "public"."projects"."created_at" DESC LIMIT $3 OFFSET $4`,
        'INSERT INTO "public"."projects" ("id","organization_id","name","description","status","created_at","updated_at") VALUES ($1,$2,$3,$4,CAST($5::text AS "public"."ProjectStatus"),$6,$7) RETURNING ...',
        'UPDATE "public"."projects" SET "name" = $1, "updated_at" = $2 WHERE ("public"."projects"."id" = $3 AND "public"."projects"."organization_id" = $4)',
        'SELECT COUNT(*) AS "_count._all" FROM (SELECT "public"."projects"."id" FROM "public"."projects" WHERE ("public"."projects"."organization_id" = $1 ...) OFFSET $3) AS "sub"',
        'SELECT "public"."projects"."id", ... FROM "public"."projects" WHERE ("public"."projects"."id" = $1 AND "public"."projects"."organization_id" = $2) LIMIT $3 OFFSET $4',
      ]);
      const began = start + 400 + (i / Math.max(1, waited)) * (at - start - 900) + r.int(0, 400);
      rows.push([pid, r.pick(apiHosts), '', 'active', 'Lock', 'relation', iso(began), iso(began), `{${migrationPid}}`, q].join(' | '));
    }
    for (let i = 0; i < 4; i += 1) rows.push([pid + 200 + i, r.pick(apiHosts), '', 'idle', 'Client', 'ClientRead', '', iso(at - r.int(2, 40) * SEC), '', 'SELECT "public"."api_keys"."id", "public"."api_keys"."organization_id", "public"."api_keys"."prefix" FROM "public"."api_keys" WHERE ...'].join(' | '));
    rows.push(['', '', '', '', '', '', '', '', '', ''].join(' | '));
    rows.push(`locks held by ${migrationPid}: AccessExclusiveLock on projects (granted ${iso(start + 41)})${at >= T('2026-10-20T13:09:12Z') ? ', ShareLock on projects (granted)' : ''}, RowExclusiveLock on projects, AccessShareLock on organizations`);
    files.set(`pg/locks/${iso(at).slice(11, 19).replace(/:/g, '-')}.txt`, `-- pg_stat_activity at ${iso(at)}, with pg_blocking_pids(pid) as blocked_by\n${rows.join('\n')}\n`);
  }
  const stream = `api/api/${taskId(r)}`;
  const lines = [];
  const from = T('2026-10-20T13:03:30Z');
  const to = T('2026-10-20T13:08:00Z');
  let busy = 0;
  let firstPool = Number.POSITIVE_INFINITY;
  for (let t = from + r.int(0, 900); t < to; t += Math.max(80, r.around(1.05 * SEC, 0.8))) {
    const a = answer(r, pickKind(r), pickOrg(r));
    if (!a.org || t < start) {
      if (a.method !== 'GET' || a.status >= 300) for (const l of requestLines(t, a)) lines.push(l);
      continue;
    }
    if (busy < 10) {
      // Holds a connection and waits for the lock, until the client gives up at 30 s.
      busy += 1;
      lines.push(logLine('info', t + 30_000 + r.int(1, 40), 'request', { method: a.method, path: a.path, status: 504, ms: 30_000 + r.int(1, 40), org: a.org, key: a.key, ua: a.ua, ip: a.ip }));
      continue;
    }
    const took = 10_000 + r.int(2, 30);
    for (const l of requestLines(t, { ...a, status: 500, took, error: ERR.pool })) lines.push(l);
    firstPool = Math.min(firstPool, t + took - 1);
  }
  return { files: new Map([...files, ...parts('prod-api-2026-10-20', sortLines(lines.map(tailed(stream))))]), firstPool };
}

// ---------------------------------------------------------------- the error tracker

/** The error tracker's groups, with the counts and times of the moments other files show: the failover, Tuesday's migration and Wednesday's polling. */
function errorGroups({ failover: f, firstPool, lastPool }) {
  const r = seeded('errors');
  const g = (title, culprit, count, orgs, first, last, isNew, sample) => ({ id: `${r.int(4100000000, 4199999999)}`, title, culprit, level: 'error', count, orgs, firstSeen: first, lastSeen: last, isNew, sample });
  const req = (method, path, error, release = '2026-10-19.2') => ({ method, path, error, release });
  const seen = (at) => [iso(Math.min(...at)), iso(Math.max(...at))];
  const groups = [
    g('PrismaClientKnownRequestError: Timed out fetching a new connection from the connection pool', 'GET /v2/organizations/:id/projects', 3_912, 141, iso(firstPool), iso(lastPool), true, req('GET', '/v2/organizations/:id/projects', ERR.pool)),
    g('PrismaClientKnownRequestError: Server has closed the connection.', 'GET /v2/organizations/:id/projects', f.closed.count, f.orgs.size, ...seen(f.closed.at), true, req('GET', '/v2/organizations/:id/projects', ERR.closed)),
    g("PrismaClientInitializationError: Can't reach database server", 'GET /v2/organizations/:id/projects', f.unreachable.count, f.orgs.size, ...seen(f.unreachable.at), true, req('GET', '/v2/organizations/:id/projects', ERR.unreachable)),
    g('PrismaClientKnownRequestError: Server has closed the connection.', 'worker: main', 2, 0, '2026-10-22T03:10:58Z', '2026-10-22T03:10:59Z', true, { process: 'worker', msg: 'worker crashed', error: ERR.closed }),
    g('ThrottlingException: Maximum sending rate exceeded.', 'worker: sendInviteEmails', 412, 1, '2026-10-20T09:12:11Z', '2026-10-20T09:18:37Z', true, { process: 'worker', msg: 'retried by the AWS SDK', error: { name: 'ThrottlingException', message: 'Maximum sending rate exceeded.', $metadata: { httpStatusCode: 400, attempts: 3, totalRetryDelay: 1041 } } }),
    g('SyntaxError: Unexpected token in JSON body', 'POST /v2/organizations/:id/projects', 612, 17, '2026-09-02T10:14:51Z', '2026-10-22T07:58:03Z', false, req('POST', '/v2/organizations/:id/projects', { ...ERR.json, status: 400, type: 'entity.parse.failed' })),
    g('BadRequestError: request aborted', 'POST /v2/organizations/:id/invites/bulk', 47, 9, '2026-09-18T12:00:40Z', '2026-10-21T16:44:12Z', false, req('POST', '/v2/organizations/:id/invites/bulk', { name: 'BadRequestError', message: 'request aborted', status: 400, type: 'request.aborted' })),
    g('PayloadTooLargeError: request entity too large', 'POST /v2/organizations/:id/invites/bulk', 3, 2, '2026-10-06T08:31:09Z', '2026-10-19T11:02:44Z', false, req('POST', '/v2/organizations/:id/invites/bulk', { name: 'PayloadTooLargeError', message: 'request entity too large', status: 413, type: 'entity.too.large' })),
    g("URIError: Failed to decode param '%E0%A4%A'", 'GET /v2/organizations/:id/projects/:projectId', 19, 3, '2026-08-21T19:20:00Z', '2026-10-20T22:14:31Z', false, req('GET', '/v2/organizations/:id/projects/%E0%A4%A', { name: 'URIError', message: "Failed to decode param '%E0%A4%A'", status: 400 })),
    g('PrismaClientKnownRequestError: Unique constraint failed on the fields: (`organization_id`,`email`)', 'POST /v2/organizations/:id/invites/bulk', 9, 3, '2026-09-24T15:40:12Z', '2026-10-21T10:02:58Z', false, req('POST', '/v2/organizations/:id/invites/bulk', ERR.unique)),
    g('Error: no handler for export_ready_email', 'worker: main', 14, 0, '2026-10-19T02:30:44Z', '2026-10-19T02:41:13Z', true, { process: 'worker', msg: 'job failed', error: { name: 'Error', message: 'no handler for export_ready_email' } }),
    g('UnleashError: Unleash Repository error: Response was not OK (status code: 502)', 'unleash-client: repository', 88, 0, '2026-10-21T02:00:14Z', '2026-10-21T02:21:58Z', true, { process: 'api', msg: 'unleash error', error: { name: 'UnleashError', message: 'Unleash Repository error: https://unleash.internal.tidewell.example/api/client/features responded 502 Bad Gateway' } }),
    g('Error: read ECONNRESET', 'worker: sendInviteEmails', 4, 2, '2026-10-12T06:20:31Z', '2026-10-20T09:30:02Z', false, { process: 'worker', msg: 'job failed', error: { name: 'Error', code: 'ECONNRESET', message: 'read ECONNRESET' } }),
    g("TypeError: Cannot read properties of null (reading 'toUTCString')", 'GET /v2/organizations/:id/export', 0, 0, '2026-08-14T09:12:00Z', '2026-09-29T17:40:21Z', false, req('GET', '/v2/organizations/:id/export', { name: 'TypeError', message: "Cannot read properties of null (reading 'toUTCString')" }, '2026-09-29.1')),
  ];
  const withEvents = groups.map((group) => ({ ...group, events: Array.from({ length: Math.min(group.count, 6) }, () => ({ at: iso(T(group.firstSeen) + r.next() * Math.max(1, T(group.lastSeen) - T(group.firstSeen))), org: group.orgs ? r.pick(ORGS).id : null, release: group.sample.release ?? '2026-10-19.2' })).sort((a, b) => a.at.localeCompare(b.at)) }));
  return new Map([['errors.json', `${JSON.stringify({ project: 'tidewell-api', environment: 'production', from: '2026-10-19T00:00:00Z', to: '2026-10-22T08:00:00Z', groups: withEvents }, null, 2)}\n`]]);
}

// ---------------------------------------------------------------- the load balancer's 5xx (2026-10-21)

/**
 * Wednesday's 5xx at the load balancer: a few 502s all day from connections
 * the API closed while the load balancer was reusing them (Node's keep-alive
 * timeout is shorter than its idle timeout), a burst of 502s at the 11:05
 * deploy, where stopping tasks cut requests in flight, and the API's own 500s
 * during the afternoon's polling, when its connection pools ran dry.
 */
function alb5xx() {
  const r = seeded('alb-2026-10-21');
  const lines = [];
  const albName = 'app/tidewell-prod/50dc6c495c0c9188';
  const tg = 'arn:aws:elasticloadbalancing:eu-west-1:210987654321:targetgroup/tidewell-api/73e2d6bc24d8a067';
  const targets = Array.from({ length: 8 }, () => `10.20.${r.int(16, 63)}.${r.int(2, 250)}:8080`);
  const line = (at, { status, target = r.pick(targets), tStatus = '-', tTime = -1, method = 'GET', path, ua, reason = '-', ip }) => ({
    ms: at,
    text: [
      'https', iso(at).replace('Z', '').concat('000Z').replace(/\.(\d{3})000Z$/, (m, ms) => `.${ms}${pad(r.int(0, 999), 3)}Z`), albName,
      `${ip}:${r.int(30000, 65000)}`, target, '0.000', tTime === -1 ? '-1' : (tTime / 1000).toFixed(3), tTime === -1 ? '-1' : '0.000',
      status, tStatus, r.int(180, 720), tStatus === '-' ? r.int(150, 300) : r.int(240, 420),
      `"${method} https://api.tidewell.example:443${path} HTTP/1.1"`, `"${ua}"`, 'ECDHE-RSA-AES128-GCM-SHA256', 'TLSv1.2', tg,
      `"Root=1-${unix(at).toString(16)}-${r.hex(24)}"`, '"api.tidewell.example"', '"arn:aws:acm:eu-west-1:210987654321:certificate/6f1d3b2e-9a47-4c8b-b1e0-24d7f9a3c5e8"',
      1, iso(at - 2).replace(/\.\d{3}Z$/, `.${pad(r.int(0, 999), 3)}000Z`), '"forward"', '"-"', `"${reason}"`, `"${target}"`, `"${tStatus}"`, '"-"', '"-"', 'TID_' + r.hex(32),
    ].join(' '),
  });
  const someone = () => {
    const o = r.chance(0.5) ? r.pick(FERROWELL.orgs) : pickOrg(r);
    const c = CLIENTS.get(o.id);
    return { path: `/v2/organizations/${o.id}/projects${r.chance(0.3) ? `/${r.uuid()}` : ''}`, ua: c.ua, ip: r.pick(c.ips) };
  };
  for (let t = T('2026-10-21T00:00:00Z') + r.int(20, 60) * MIN; t < T('2026-10-22T00:00:00Z'); t += r.int(25, 70) * MIN) {
    lines.push(line(t, { status: 502, reason: 'TargetConnectionError', ...someone() }));
  }
  const old = targets.slice(0, 6);
  for (let t = T('2026-10-21T11:05:41Z'); t < T('2026-10-21T11:06:33Z'); t += r.int(600, 3100)) {
    lines.push(line(t, { status: 502, target: r.pick(old), tTime: -1, reason: 'TargetResponseError', ...someone() }));
  }
  let lastPool = 0;
  for (let t = T('2026-10-21T14:11:20Z'); t < T('2026-10-21T15:02:00Z'); t += r.int(20, 95) * SEC) {
    const s = someone();
    const took = 10_000 + r.int(2, 40);
    lines.push(line(t, { status: 500, tStatus: '500', tTime: took, ...s }));
    lastPool = t;
  }
  lines.push(line(T('2026-10-21T16:40:12Z'), { status: 503, target: '-', reason: '-', path: '/v2/organizations', ua: 'curl/8.7.1', ip: '198.51.100.77' }));
  return { files: parts('alb-5xx-2026-10-21', sortLines(lines)), lastPool };
}

// ---------------------------------------------------------------- the more steps

function more(m, facts) {
  return [
    { say: `On call: production's 5xx alarm fired at 03:11 UTC last night. The API's log from 02:55 to 03:40, all six tasks, without the successful GETs, is in tmp/prod-api-2026-10-22/, in ${Object.keys(facts.failoverApi).length} parts; the worker's log for the same time is in tmp/prod-worker-2026-10-22.log, and RDS's and ECS's events are in tmp/rds-events.json and tmp/ecs-events.json. Read all of it and give me the timeline, how many requests failed and for whom, and why the workers died when the API tasks didn't. Don't change anything yet.`, files: { ...facts.failoverApi, ...fileAt('prod-worker-2026-10-22.log', 'rds-events.json', 'ecs-events.json') } },
    "Fix the worker so a lost database connection doesn't kill it. A poll that fails is logged and tried again after a pause that grows, up to 30 seconds, and the loop carries on. A job whose handler failed because the database was gone is left for a worker to claim again, not counted as a failed attempt. Tests for it.",
    { say: "Back to ENG-447 for a moment. Ferrowell's developer wrote again: since our last deploy, some of our test deliveries fail their check as stale, and those never get through. Her email, their verifier and their receiver's log from 14:45 UTC are in tmp/ferrowell/. Read them and tell me whose bug it is, and exactly why it hits some deliveries and not others.", files: filesUnder(m, 'ferrowell') },
    "Draft my reply to her: what they should change, with the corrected check in their own code, and nothing that sounds like blame. Plain and short.",
    { say: 'Meridian Logistics says their projects list takes seconds, and longer the further they page. pg_stat_statements for the past week is in tmp/pg/statements.tsv, the tables\' sizes in tmp/pg/table-sizes.txt, and EXPLAIN ANALYZE of three statements in tmp/pg/explain-*.txt. Why are they slow, and what would you change? Explain before touching anything.', files: Object.fromEntries(Object.entries(filesUnder(m, 'pg')).filter(([to]) => !to.includes('/locks/'))) },
    "Do it for the projects list: the index as a migration, and a cursor on the list like the export's, with page and page_size still working for the clients that use them. Leave the jobs table alone for now; it gets a ticket of its own.",
    { say: "ENG-447 again. On staging, Ferrowell's first sandbox organisation gets events and their second one never does. The flag's export from Unleash, the context fields Unleash knows, the playground's answer for each organisation, and all our flags, are in tmp/unleash/. Why does the second get nothing? And while you're in there, which of our flags look ready to delete?", files: filesUnder(m, 'unleash') },
    { say: `Infra question. The worker is moving to a task of its own size, 1 vCPU and 2 GB, on arm64. tidewell-infra's plan for production is in tmp/terraform/, in ${Object.keys(filesUnder(m, 'terraform')).length} parts. CI builds our image for linux/amd64. Read the whole plan before I apply it: what worries you, and what should change first?`, files: filesUnder(m, 'terraform') },
    { say: `Yesterday from 14:10 UTC one client tripled the API's request rate for most of an hour. Everything one of the six API tasks logged from 14:24 to 14:27 is in tmp/prod-api-2026-10-21/, in ${Object.keys(facts.storm).length} parts. Who was it, what exactly were they doing, and did our rate limiter do its job?`, files: facts.storm },
    { say: "Support inbox. Six emails from this week are in tmp/support/, one file each. For each: what it's about, whether it's a bug on our side, and a two-line reply in my voice.", files: filesUnder(m, 'support') },
    { say: "Housekeeping: npm outdated and npm audit for tidewell-api are in tmp/npm/. What should we update now, what can wait, and why? Don't touch package.json.", files: filesUnder(m, 'npm') },
    { say: `Rui wants the Core API backlog triaged before Monday's planning. The open tickets are in tmp/linear/, in ${Object.keys(filesUnder(m, 'linear')).length} parts. Group them, point out the duplicates and anything this week has made more urgent, and pick the five you'd do next, a line each.`, files: filesUnder(m, 'linear') },
    { say: 'A teammate asked me to review ENG-438 before I approve it. The diff is in tmp/review/ENG-438.diff and their description in tmp/review/ENG-438-description.txt. Review it the way I would: what is wrong, what is risky, and what is fine, with file and line.', files: filesUnder(m, 'review') },
    { say: `Harbour & Finch says about half their people got two invite emails on Tuesday morning. The worker's log from 09:00 to 10:00 UTC, both tasks, is in tmp/prod-worker-2026-10-20.log; their invites are in tmp/invites-harbour-finch-*.tsv, and SES's sending events for their addresses are in tmp/ses-sends/, in ${Object.keys(filesUnder(m, 'ses-sends')).length} parts. Why did it happen, and to how many people? Don't change anything yet.`, files: { ...fileAt('prod-worker-2026-10-20.log'), ...Object.fromEntries([...m.keys()].filter((p) => p.startsWith('invites-harbour-finch')).sort().map((p) => [`tmp/${p}`, p])), ...filesUnder(m, 'ses-sends') } },
    'Fix it in both places. Sending a batch of invites is safe to repeat: an invite already sent is skipped. And a job keeps its claim while it is running, however long it takes; only a job whose worker has stopped is claimed again. Tests for both.',
    { say: "RDS's and ECS's numbers for the past week are in tmp/metrics/: RDS every 15 minutes, ECS every hour. Read both, and tell me what you see, especially anything this week's other files haven't explained yet.", files: filesUnder(m, 'metrics') },
    { say: `Finance asked why October's AWS bill is up. Daily costs by service and usage type since 1 September are in tmp/costs/, in ${Object.keys(filesUnder(m, 'costs')).length} parts. What went up, from when, why, and what would you cut?`, files: filesUnder(m, 'costs') },
    { say: "Security sent their quarterly scan of the API: tmp/security-scan.json. Which findings are real for us, which are noise, and in what order would you fix the real ones?", files: fileAt('security-scan.json') },
    { say: 'Rui wants numbers for the quarterly review: October so far, by organisation and by day, in tmp/usage/. Write the short summary he asked for: who uses the API most, how it is growing, error rates, and anything odd.', files: filesUnder(m, 'usage') },
    { say: `Tuesday at 13:05 UTC, while a teammate's migration ran, most of the API's requests failed for about six minutes. Snapshots of pg_stat_activity, with who was blocking whom, are in tmp/pg/locks/, and one API task's log from 13:03:30 to 13:08 is in tmp/prod-api-2026-10-20/, in ${Object.keys(filesUnder(m, 'prod-api-2026-10-20')).length} parts. What blocked what, and what would have avoided it?`, files: { ...Object.fromEntries(Object.entries(filesUnder(m, 'pg')).filter(([to]) => to.includes('/locks/'))), ...filesUnder(m, 'prod-api-2026-10-20') } },
    "Write the incident summary for Tuesday's migration, for the incident doc: what happened, the impact, the cause, and what we change. Plain, with times in UTC.",
    { say: "Our error tracker's export from Monday until this morning, grouped, is in tmp/errors.json. Which groups are new this week, which are bugs in our code rather than the world, and which can we ignore?", files: fileAt('errors.json') },
    'Fix the two bugs in our code from that list: a malformed JSON body answered 500 instead of 400, and two bulk invites at once for the same address failing with P2002 instead of skipping it. Tests for both.',
    { say: `Last one of these. The load balancer's log of every 5xx yesterday is in tmp/alb-5xx-2026-10-21/, in ${Object.keys(filesUnder(m, 'alb-5xx-2026-10-21')).length} parts. Group them by cause with counts, and tell me which ones our own code could have avoided.`, files: filesUnder(m, 'alb-5xx-2026-10-21') },
    "Write my on-call handover for next week's person: what happened this week, what's still open and who it's waiting on, and what to watch. Everything you need is in this session.",
  ];
}

// ---------------------------------------------------------------- everything

/** The steps file and every file of material, as `{ steps, material }`: a Map of path under long-2/ to text. */
export function build() {
  const fail = failover();
  const ferro = ferrowell();
  const storm = pollingStorm();
  const invites = duplicateInvites();
  const locks = migrationLocks();
  const alb = alb5xx();
  const material = new Map([
    ...fail.files,
    ...ferro.files,
    ...slowList(),
    ...unleash(),
    ...terraformPlan(),
    ...storm.files,
    ...support(),
    ...npmReports(),
    ...backlog(),
    ...reviewDiff(),
    ...invites.files,
    ...metrics(),
    ...costs(),
    ...securityScan(),
    ...usage({ ferrowellLimited: storm.counts.limitedKeys }),
    ...locks.files,
    ...errorGroups({ failover: fail.failed, firstPool: locks.firstPool, lastPool: alb.lastPool }),
    ...alb.files,
  ]);
  const facts = {
    failoverApi: filesUnder(material, 'prod-api-2026-10-22'),
    storm: filesUnder(material, 'prod-api-2026-10-21'),
  };
  const steps = {
    note: 'Written by tasks/long/long-2.mjs: change that file and run it, never this one. The fields are explained in docs/build-plan.md, part 8.',
    fork_at: 500_000,
    resume_note: RESUME_NOTE,
    core: core(),
    more: more(material, facts),
    after: AFTER,
    checks: CHECKS,
    examples: EXAMPLES,
  };
  return { steps, material, facts: { failover: fail.failed, ferrowell: ferro.stats, storm: storm.counts, invites: invites.twice } };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { steps, material, facts } = build();
  rmSync(MATERIAL_DIR, { recursive: true, force: true });
  for (const [path, text] of material) {
    mkdirSync(dirname(join(MATERIAL_DIR, path)), { recursive: true });
    writeFileSync(join(MATERIAL_DIR, path), text);
  }
  writeFileSync(STEPS_FILE, `${JSON.stringify(steps, null, 2)}\n`);
  const size = [...material.values()].reduce((n, t) => n + t.length, 0);
  console.log(`long-2: ${steps.core.length} core, ${steps.more.length} more and ${steps.after.length} after steps; ${material.size} files of material, ${size.toLocaleString('en-US')} characters.`);
  if (process.argv.includes('--facts')) {
    const f = facts.failover;
    console.log(JSON.stringify({
      failover: { requests: f.requests, orgs: f.orgs.size, ferrowell: f.ferrowell, writes: f.writes, closed: f.closed.count, unreachable: f.unreachable.count },
      ferrowell: { ...facts.ferrowell, staleEvents: facts.ferrowell.staleEvents.size },
      storm: { ...facts.storm, keys: facts.storm.keys.size, limitedKeys: facts.storm.limitedKeys.size },
      invitesTwice: facts.invites,
    }, null, 2));
  }
}
