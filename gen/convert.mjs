// Part 2: the converter. Turns a user's sessions (users/<user>/sessions/*.md)
// into what exposurie reads on a real machine:
//
//   <out>/.claude/projects/<folder>/<session id>.jsonl   one Claude Code transcript per session
//   <out>/Downloads/data-<id>-batch-0000.zip             the claude.ai export, when the user has chats
//
//   node gen/convert.mjs <developer|delegator> <out-dir>
//   node gen/convert.mjs --self-test
//
// Run it with the sandbox's own Node. The output is a home folder: part 6
// converts straight into the sandbox's home, after its transcript retention is
// set. Nothing here is committed, because git does not keep file dates and
// exposurie orders history by them, newest first. The same sessions always
// convert to the same bytes and the same dates.
//
// A transcript line has the fields Claude Code 2.1.302 writes (read from its
// binary): parentUuid, isSidechain, promptId, type, message, uuid, timestamp,
// userType, entrypoint, cwd, sessionId, version, gitBranch. Lines carry only
// what was said. There are no tool calls: exposurie keeps only the text blocks
// of user and assistant lines, so tool calls would change nothing it reads.
// The export holds conversations.json and a users.json with no name in it.
// A real export can also carry claude.ai's own memory and project
// instructions; they are left out on purpose (see docs/decisions.md).

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { EXPOSURIE, PINS, RUNS, ownNodeOnly } from '../runner/sandbox.mjs';
import { USERS, loadUser, parseSession, sessionFile, words } from '../check/history.mjs';

const ENTRYPOINT = { terminal: 'cli', vscode: 'claude-vscode', desktop: 'claude-desktop' };

const sha = (seed) => createHash('sha256').update(seed).digest();

/** A version-4-shaped UUID that is the same every time for the same seed. */
export function uuidFrom(seed) {
  const h = sha(seed);
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const idFrom = (seed, n) => [...sha(seed)].slice(0, n).map((b) => B62[b % 62]).join('');
const rand = (seed) => sha(seed).readUIntBE(0, 6) / 2 ** 48;

/** Claude Code's folder name for a working directory: every other character becomes a hyphen. */
export const projectFolder = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

/**
 * When each turn was sent. The first message is at the session's planned time;
 * after that, a reply takes longer the more it says (and longer in Claude Code,
 * which works before it answers), and a person reads and types before the next.
 */
export function turnTimes(seed, at, surface, turns) {
  let t = Date.parse(at);
  return turns.map((turn, i) => {
    if (i > 0) {
      const w = words(turn.text);
      const r = rand(`${seed}/${i}`);
      t += 1000 * (turn.role === 'user'
        ? 20 + w * 2.5 + r * 120
        : surface === 'claude.ai' ? 4 + w * 0.05 + r * 8 : 15 + w * 0.4 + r * 90);
    }
    return Math.round(t);
  });
}

const iso = (ms) => new Date(ms).toISOString();

function transcript(user, s, turns, cwd) {
  const seed = `${user}/${s.id}`;
  const sessionId = uuidFrom(`${seed}/session`);
  const times = turnTimes(seed, s.at, s.surface, turns);
  const where = {
    userType: 'external',
    entrypoint: ENTRYPOINT[s.surface],
    cwd,
    sessionId,
    version: PINS.claudeCode,
    gitBranch: s.brief?.branch ?? 'main',
  };
  let parent = null;
  const lines = turns.map((turn, i) => {
    const uuid = uuidFrom(`${seed}/${i}`);
    const line = turn.role === 'user'
      ? {
          parentUuid: parent, isSidechain: false, promptId: uuidFrom(`${seed}/${i}/prompt`),
          type: 'user', message: { role: 'user', content: turn.text },
          uuid, timestamp: iso(times[i]), ...where,
        }
      : {
          parentUuid: parent, isSidechain: false,
          message: {
            id: `msg_01${idFrom(`${seed}/${i}/msg`, 22)}`, type: 'message', role: 'assistant', model: PINS.model,
            content: [{ type: 'text', text: turn.text }], stop_reason: 'end_turn', stop_sequence: null,
          },
          requestId: `req_011C${idFrom(`${seed}/${i}/req`, 20)}`, type: 'assistant',
          uuid, timestamp: iso(times[i]), ...where,
        };
    parent = uuid;
    return JSON.stringify(line);
  });
  return { sessionId, text: lines.join('\n') + '\n', end: times[times.length - 1] };
}

function conversation(user, s, turns, account) {
  const seed = `${user}/${s.id}`;
  const times = turnTimes(seed, s.at, s.surface, turns);
  return {
    uuid: uuidFrom(`${seed}/conversation`),
    name: s.title,
    summary: '',
    created_at: iso(times[0]),
    updated_at: iso(times[times.length - 1]),
    account: { uuid: account },
    chat_messages: turns.map((turn, i) => ({
      uuid: uuidFrom(`${seed}/${i}`),
      text: turn.text,
      content: [{ start_timestamp: iso(times[i]), stop_timestamp: iso(times[i]), flags: null, type: 'text', text: turn.text, citations: [] }],
      sender: turn.role === 'user' ? 'human' : 'assistant',
      created_at: iso(times[i]),
      updated_at: iso(times[i]),
      attachments: [],
      files: [],
    })),
  };
}

/** A zip of deflated entries, dated `at` (local time, as the plan writes it). */
export function zip(entries, at) {
  const [y, mo, d, h, mi, sec] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(at).slice(1).map(Number);
  const time = (h << 11) | (mi << 5) | (sec >> 1);
  const date = ((y - 1980) << 9) | (mo << 5) | d;
  const parts = [];
  const index = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    index.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(index);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const setDate = (path, ms) => utimesSync(path, ms / 1000, ms / 1000);

/**
 * Write one user's history into `out`, a home folder.
 * `plan` is the user's plan.json; `sessions` maps a session id to its turns.
 */
export function convert(user, plan, sessions, out) {
  const written = { transcripts: [], export: null };
  const chats = [];
  for (const s of plan.sessions) {
    const turns = sessions.get(s.id);
    if (!turns) throw new Error(`${user}/${s.id} has no session to convert`);
    if (s.surface === 'claude.ai') {
      chats.push([s, turns]);
      continue;
    }
    const cwd = plan.machine.folders[s.project];
    const t = transcript(user, s, turns, cwd);
    const path = join(out, '.claude', 'projects', projectFolder(cwd), `${t.sessionId}.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, t.text);
    setDate(path, t.end);
    written.transcripts.push({ session: s.id, path, mtime: t.end });
  }
  if (chats.length) {
    const account = uuidFrom(`${user}/account`);
    const conversations = chats.map(([s, turns]) => conversation(user, s, turns, account));
    const users = [{ uuid: account, full_name: '', email_address: '', verified_phone_number: null }];
    const at = plan.machine.export.at;
    const path = join(out, 'Downloads', `data-${uuidFrom(`${user}/export`)}-batch-0000.zip`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, zip([
      { name: 'conversations.json', data: Buffer.from(JSON.stringify(conversations)) },
      { name: 'users.json', data: Buffer.from(JSON.stringify(users)) },
    ], at));
    setDate(path, Date.parse(at));
    written.export = { path, mtime: Date.parse(at) };
  }
  return written;
}

/** Convert one user's committed sessions into `out`. */
export function convertUser(user, out) {
  const u = loadUser(user);
  const sessions = new Map();
  for (const s of u.sessions.values()) {
    const p = parseSession(readFileSync(sessionFile(user, s.id), 'utf8'));
    if (p.problems.length) throw new Error(`${user}/${s.id}: ${p.problems[0]}`);
    sessions.set(s.id, p.turns);
  }
  return convert(user, u.plan, sessions, out);
}

/**
 * Convert a tiny made-up history and read it back with exposurie 1.2.0's own
 * readers, the way `exposurie sync` finds and reads history on a machine.
 */
async function selfTest() {
  const out = join(RUNS, `convert-self-test-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const plan = {
    machine: { folders: { alpha: '/Users/test/code/alpha' }, export: { at: '2026-07-03T09:00:00+01:00' } },
    sessions: [
      { id: 't-1', at: '2026-07-01T20:00:00+01:00', project: 'alpha', surface: 'terminal', brief: {} },
      { id: 't-2', at: '2026-07-02T10:00:00+01:00', title: 'A chat — with “quotes” and ünïcode', surface: 'claude.ai' },
      { id: 't-3', at: '2026-07-02T21:00:00+01:00', project: 'alpha', surface: 'desktop', brief: { branch: 'feature-x' } },
    ],
  };
  const turns = (id) => [
    { role: 'user', text: `First message of ${id}, with a line break.\nSecond line — and an em dash.` },
    { role: 'assistant', text: `A reply in ${id}.\n\n\`\`\`js\nconst x = 1;\n\`\`\`` },
    { role: 'user', text: 'ok do that' },
    { role: 'assistant', text: `Done in ${id}.` },
  ];
  const sessions = new Map(plan.sessions.map((s) => [s.id, turns(s.id)]));
  const written = convert('self-test', plan, sessions, out);

  // exposurie takes every path from the home folder, Cursor's and Obsidian's
  // included, so point it at ours before loading it, and refuse to load it if
  // that did not take: it would read the machine owner's own history instead.
  process.env.USERPROFILE = out;
  process.env.HOME = out;
  if (resolve(homedir()).toLowerCase() !== resolve(out).toLowerCase()) {
    console.error(`convert: the home folder is still ${homedir()}, so exposurie is not loaded`);
    process.exit(1);
  }
  const src = join(dirname(dirname(EXPOSURIE)), 'src');
  const load = (p) => import(pathToFileURL(join(src, p)).href);
  const { detect } = await load('context.js');
  const { readTranscript, describe } = await load('extract/transcript.js');
  const { readExports } = await load('extract/webchat.js');

  const problems = [];
  const expect = (ok, what) => (ok ? null : problems.push(what));
  const same = (a, b) => a.length === b.length && a.every((t, i) => t.role === b[i].role && t.text === b[i].text);
  const d = detect();
  const cc = d.clients.find((c) => c.id === 'claude-code');
  expect(cc.present && cc.count === 2, `exposurie finds ${cc.count} Claude Code transcripts, expected 2`);
  expect(d.exports.length === 1, `exposurie finds ${d.exports.length} claude.ai exports, expected 1`);
  for (const w of written.transcripts) {
    const r = readTranscript(w.path);
    const s = plan.sessions.find((x) => x.id === w.session);
    expect(r && same(r.turns, sessions.get(s.id)), `${s.id}: the turns read back differ`);
    expect(r?.surface === s.surface, `${s.id}: surface ${r?.surface}, expected ${s.surface}`);
    expect(describe(r).project === 'alpha', `${s.id}: project ${describe(r).project}, expected alpha`);
  }
  const web = readExports(d.exports.map((e) => e.path));
  expect(web.failed.length === 0, `the export failed to read: ${JSON.stringify(web.failed)}`);
  expect(web.sessions.length === 1 && web.sessions[0].project === plan.sessions[1].title, 'the chat title did not survive');
  expect(web.sessions.length === 1 && same(web.sessions[0].turns, sessions.get('t-2')), 'the chat turns read back differ');
  expect(!web.standing || (!web.standing.memory && web.standing.projects.length === 0), 'the export carries standing context');
  const dates = [...written.transcripts.map((w) => [w.session, w.mtime]), ['t-2', Date.parse(web.sessions[0]?.updatedAt)]];
  expect(dates.sort((a, b) => a[1] - b[1]).map(([id]) => id).join() === 't-1,t-2,t-3', 'the dates are out of order');
  expect(convert('self-test', plan, sessions, `${out}-again`).transcripts.every((w, i) =>
    readFileSync(w.path, 'utf8') === readFileSync(written.transcripts[i].path, 'utf8')), 'converting twice gave different bytes');

  console.log(`converted into ${out}`);
  if (problems.length) {
    for (const p of problems) console.log(`FAIL  ${p}`);
    process.exit(1);
  }
  console.log('ok    exposurie 1.2.0 finds the transcripts and the export, and reads back every turn, surface, project and title');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  ownNodeOnly();
  const [a, b] = process.argv.slice(2);
  if (a === '--self-test') await selfTest();
  else if (USERS.includes(a) && b) {
    const w = convertUser(a, resolve(b));
    console.log(`${w.transcripts.length} transcripts${w.export ? ' and 1 claude.ai export' : ''} written under ${resolve(b)}`);
  } else {
    console.error(`usage: node gen/convert.mjs <${USERS.join('|')}> <out-dir> | --self-test`);
    process.exit(1);
  }
}
