// Part 12, "It's yours": six checks that a brain stays its person's, run
// against exposurie 1.3.1 from npm's tarball.
//
//   node runner/its-yours.mjs          run the checks, into ../runs/part12-<time>/
//   node runner/its-yours.mjs --save   run them, then publish them into results/its-yours/
//
// Run it with the sandbox's own Node. It starts no agent session.
//
// WHAT IT CHECKS, AND WHAT IT DOES NOT. exposurie is a layer for the user's
// agent. The agent reads the pointer, runs the commands and writes the pages,
// and it runs on the user's own plan with its lab. These checks run
// exposurie's commands directly, without an agent, so they check exposurie's
// own layer: the files it writes, what it reaches for, what it collects and
// what it leaves behind. They do not stand in for the agent, which areas 1-9
// and part 13 measured, on the plan.
//
// Each user's checks run in a throwaway home holding a copy of that user's
// kept brain, with exposurie installed afresh from the pinned tarball into the
// home's own npm folder, since uninstall removes the package too. The kept
// brains, the sandbox's own installs and its login are never touched.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, POINTER_FOR_WORK, RUNS, SANDBOX, lockSandbox, ownNodeOnly, sandboxEnv } from './sandbox.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NPM_CLI = join(SANDBOX, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const TARBALL = join(SANDBOX, 'downloads', PINS.exposurie131.file);
const TRAP = join(REPO, 'runner', 'no-net.cjs');
export const OUT = join(REPO, 'results', 'its-yours');
const PKG = join('node_modules', '@sekhon', 'exposurie');
const START = '<!-- exposurie:start -->';
const END = '<!-- exposurie:end -->';
/** The same test check/results.mjs applies to everything in results/. */
const WINDOWS_PATH = /(?<![A-Za-z])[A-Za-z]:[\\/]/;

export const VERSION = PINS.exposurie131.version;

export const SCOPE =
  "exposurie is a layer for the user's agent: the agent reads its pointer, runs its commands and writes the brain's " +
  "pages, and it runs on the user's own plan with its lab. These lines run exposurie's commands directly, without an " +
  "agent session, so they check exposurie's own layer: what it writes, what it reaches for, what it collects and what " +
  'it leaves behind. They do not stand in for the agent, which areas 1-9 and part 13 measured on the plan.';

/** The two kept brains, each with one search it can answer, so `read` runs as an agent would run it. */
export const USERS = { developer: 'satchel', delegator: 'book club' };

/**
 * The agents exposurie 1.3.1 writes its pointer for (its src/reach.js), each
 * with the instructions file it reads. OpenCode has two, one for each
 * platform's convention, and the home holds both. Cursor reads a rules
 * folder, so exposurie writes a file of its own there; every other agent gets
 * a block in a file of the user's.
 */
export const AGENTS = [
  { agent: 'Claude Code', root: '.claude', file: '.claude/CLAUDE.md', users: true },
  { agent: 'Codex', root: '.codex', file: '.codex/AGENTS.md', users: true },
  { agent: 'OpenCode', root: '.config/opencode', file: '.config/opencode/AGENTS.md', users: true },
  { agent: 'OpenCode', root: 'AppData/Roaming/opencode', file: 'AppData/Roaming/opencode/AGENTS.md', users: true },
  { agent: 'Cursor', root: '.cursor', file: '.cursor/rules/exposurie.mdc', users: false },
];
/** A rule of the user's own in Cursor's rules folder. */
export const CURSOR_RULE = '.cursor/rules/mine.mdc';
/** The user's own words in each file they own, ending in one newline, as an editor writes it. */
export const OWN = '# My own rules\n\nReply in short paragraphs, and ask before deleting anything.\n';

/** One made-up chat for each lab whose history exposurie reads, each with a code that appears nowhere else. */
export const CHATS = {
  'Claude Code': { code: 'P12-CC-4417', text: 'Code P12-CC-4417: from now on the reading list goes out on Fridays, not Mondays.' },
  Codex: { code: 'P12-CX-2093', text: 'Code P12-CX-2093: keep the import script in scripts/, never in src/.' },
  Cursor: { code: 'P12-CU-7781', text: 'Code P12-CU-7781: name the new table reading_queue.' },
  'claude.ai': { code: 'P12-AI-5126', text: 'Code P12-AI-5126: the newsletter footer says "see you next week", in lowercase.' },
  ChatGPT: { code: 'P12-GP-3358', text: 'Code P12-GP-3358: the logo stays the green one, and the orange draft goes.' },
};

export const LINES = [
  {
    id: 1,
    name: 'The brain is plain Markdown',
    claim: "Every file in the brain outside git's own folder is UTF-8 text, and every [[link]] in a page leads to a file " +
      'in the same brain. Checked with exposurie uninstalled.',
  },
  {
    id: 2,
    name: 'It outlives the tool',
    claim: 'After `exposurie uninstall`, every file in the brain is byte-identical, every file exposurie wrote outside ' +
      "the brain is gone, the user's own files are back byte for byte, and npm's copy of the package is removed. No " +
      'page changed from install to uninstall.',
  },
  {
    id: 3,
    name: 'No network of its own',
    claim: "exposurie's commands open no network connection, and its code loads no network module. The agent it serves " +
      'talks to its lab as it always does. `update`, which downloads a new release from npm, is the one command left ' +
      'out, by what it is for.',
  },
  {
    id: 4,
    name: 'No account of its own',
    claim: 'No command asks for a login, a key or a sign-up, and every one runs with stdin closed and no credentials in ' +
      "reach. The agent it serves runs on the user's own plan, which is their account with their lab.",
  },
  {
    id: 5,
    name: 'A pointer for every agent it supports',
    claim: "In a home holding Claude Code's, Codex's, Cursor's and OpenCode's folders, setup writes the same pointer, " +
      "with 1.3.1's line for work, into each one's instructions, beside the user's own lines.",
  },
  {
    id: 6,
    name: 'History from every lab',
    claim: "Made-up chats in Claude Code's, Codex's, Cursor's, claude.ai's and ChatGPT's formats all reach one sync's " +
      "batch. Only the collecting step runs: folding the batch into pages is the agent's work, on the user's plan.",
  },
];

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const integrity = (file) => `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
const posix = (p) => p.split(sep).join('/');
const readOrNull = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
const count = (text, part) => (text ?? '').split(part).length - 1;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

function fail(msg) {
  console.error(`its-yours: ${msg}`);
  process.exit(1);
}

function write(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** Every file under a folder, keyed by its path inside it, with its hash. Folders are keyed with a trailing slash. */
export function snapshot(dir, skip = []) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      const rel = posix(relative(dir, p));
      if (skip.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
      if (e.isDirectory()) {
        out[`${rel}/`] = 'folder';
        walk(p);
      } else out[rel] = sha(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Paths whose content differs between two snapshots, or that only one of them has. */
export function changed(a, b, { folders = false } = {}) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k.endsWith('/') === folders);
  return keys.filter((k) => a[k] !== b[k]).sort();
}

/** The targets of a page's [[links]], without their |label, #section or ^block. Code is left out. */
export function linksOf(text) {
  const body = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...body.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)]
    .map((m) => m[1].split(/\\?\|/)[0].split('#')[0].split('^')[0].trim())
    .filter(Boolean);
}

/** Does a link lead to a file in the brain, by name or by path, as Obsidian resolves it? */
export function resolves(target, names) {
  const t = target.replace(/\\/g, '/').toLowerCase();
  return names.some((n) => {
    const l = n.toLowerCase();
    const base = l.split('/').pop();
    return l === t || l === `${t}.md` || base === t || base === `${t}.md` || l.endsWith(`/${t}`) || l.endsWith(`/${t}.md`);
  });
}

/** The pointer block in an instructions file, or null. */
export function blockOf(text) {
  if (!text) return null;
  const s = text.indexOf(START);
  const e = text.indexOf(END);
  return s !== -1 && e > s ? text.slice(s, e + END.length) : null;
}

/**
 * Made-up history in each lab's format, as exposurie 1.3.1's own readers
 * parse it: src/extract/transcript.js (Claude Code), codex.js, cursor.js
 * (Cursor's SQLite store), webchat.js (claude.ai's export) and chatgpt.js.
 * Everything is dated an hour back, past the five minutes in which sync
 * treats a conversation as still being written.
 */
export function plantHistory(home, when) {
  const iso = (ms) => new Date(ms).toISOString();
  const t0 = when;
  const t1 = when + 60_000;
  const reply = 'Noted.';
  const files = [];
  const put = (rel, text) => {
    write(join(home, rel), text);
    files.push(rel);
  };
  const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

  const cc = '4f7c2a10-1c2b-4d3e-9f40-0a1b2c3d4e51';
  put(`.claude/projects/-home-user-notes/${cc}.jsonl`, jsonl([
    { type: 'user', sessionId: cc, cwd: '/home/user/notes', entrypoint: 'cli', timestamp: iso(t0), message: { role: 'user', content: [{ type: 'text', text: CHATS['Claude Code'].text }] } },
    { type: 'assistant', sessionId: cc, cwd: '/home/user/notes', entrypoint: 'cli', timestamp: iso(t1), message: { role: 'assistant', content: [{ type: 'text', text: reply }] } },
  ]));

  const cx = '7d1e9b20-5a3c-4e2f-8b10-1c2d3e4f5a62';
  const day = iso(t0).slice(0, 10).split('-');
  const at = iso(t0).slice(0, 19).replace(/:/g, '-');
  put(`.codex/sessions/${day.join('/')}/rollout-${at}-${cx}.jsonl`, jsonl([
    { timestamp: iso(t0), type: 'session_meta', payload: { id: cx, cwd: '/home/user/notes', originator: 'codex_cli_rs', source: 'cli', cli_version: '0.50.0' } },
    { timestamp: iso(t0), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: CHATS.Codex.text }] } },
    { timestamp: iso(t1), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: reply }] } },
  ]));

  const db = join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  mkdirSync(dirname(db), { recursive: true });
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const store = new DatabaseSync(db);
  store.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);');
  store.exec('CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);');
  const kv = store.prepare('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)');
  const blob = (v) => Buffer.from(JSON.stringify(v), 'utf8');
  const cu = '9a2b3c4d-6e7f-4a81-9b02-2c3d4e5f6a73';
  kv.run(`composerData:${cu}`, blob({
    composerId: cu, name: 'notes', createdAt: t0, lastUpdatedAt: t1,
    fullConversationHeadersOnly: [{ bubbleId: 'b1', type: 1 }, { bubbleId: 'b2', type: 2 }],
  }));
  kv.run(`bubbleId:${cu}:b1`, blob({ type: 1, text: CHATS.Cursor.text }));
  kv.run(`bubbleId:${cu}:b2`, blob({ type: 2, text: reply }));
  store.close();
  files.push(posix(relative(home, db)));

  const ai = 'c0ffee00-1d2e-4f30-a1b2-3c4d5e6f7a84';
  const msg = (uuid, sender, text, ms) => ({ uuid, text, content: [{ type: 'text', text }], sender, created_at: iso(ms), updated_at: iso(ms), attachments: [], files: [] });
  put('Downloads/data-2026-11-07-batch-0000/conversations.json', `${JSON.stringify([{
    uuid: ai, name: 'Newsletter', summary: '', created_at: iso(t0), updated_at: iso(t1), account: { uuid: 'a1' },
    chat_messages: [msg('m1', 'human', CHATS['claude.ai'].text, t0), msg('m2', 'assistant', reply, t1)],
  }], null, 2)}\n`);
  put('Downloads/data-2026-11-07-batch-0000/users.json', `${JSON.stringify([{ uuid: 'a1', full_name: 'Sample User', email_address: 'user@example.com' }], null, 2)}\n`);

  const node = (id, parent, children, role, text, ms) => ({
    id, parent, children,
    message: role ? { id, author: { role }, create_time: ms / 1000, content: { content_type: 'text', parts: [text] } } : null,
  });
  put('Downloads/chatgpt-export/conversations.json', `${JSON.stringify([{
    title: 'Logo', create_time: t0 / 1000, update_time: t1 / 1000, conversation_id: 'conv-p12', current_node: 'n3',
    mapping: {
      n1: node('n1', null, ['n2']),
      n2: node('n2', 'n1', ['n3'], 'user', CHATS.ChatGPT.text, t0),
      n3: node('n3', 'n2', [], 'assistant', reply, t1),
    },
  }], null, 2)}\n`);
  put('Downloads/chatgpt-export/chat.html', '<!doctype html><html><body>Exported chats</body></html>\n');

  const stamp = new Date(t1 + 60_000);
  for (const rel of files) utimesSync(join(home, rel), stamp, stamp);
  return files;
}

/**
 * Read exposurie's installed code for what would reach a network, ask for a
 * credential, or wait on a person. Comment lines are skipped, since the code
 * explains itself at length.
 */
export function scanPackage(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(p);
      } else if (/\.(m?js|cjs)$/.test(e.name)) files.push(p);
    }
  };
  walk(dir);
  const NET_MODULE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|dns\/promises|undici|ws)['"]/;
  const NET_GLOBAL = /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(/;
  const NPM_RUN = /\[\s*['"](?:install|uninstall)['"]\s*,\s*['"]-g['"]/;
  const PROMPT = /\breadline\b|process\.stdin\b|\bprompt\s*\(/;
  const out = { files: files.length, networkCode: [], npmRuns: [], envReads: [], prompts: [] };
  const env = new Set();
  for (const file of files.sort()) {
    const rel = posix(relative(dir, file));
    readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) return;
      const where = { file: rel, line: i + 1, text: line.slice(0, 160) };
      if (NET_MODULE.test(line) || NET_GLOBAL.test(line)) out.networkCode.push(where);
      if (NPM_RUN.test(line)) out.npmRuns.push(where);
      if (PROMPT.test(line)) out.prompts.push(where);
      for (const m of line.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*['"]([^'"]+)['"]\s*\]/g)) env.add(m[1] ?? m[2]);
    });
  }
  out.envReads = [...env].sort();
  return out;
}

/** The ways out the control tries, each with the name the trap logs it under. */
const CONTROL = {
  cjs: {
    expect: [
      'fetch', 'http.get', 'https.request', 'net.Socket.connect', 'tls.connect', 'dns.lookup', 'dns.promises.lookup',
      'dns.promises.Resolver.resolve4', 'dgram.createSocket',
    ],
    // A resolver of its own, asking 127.0.0.1. Setting the default resolver's
    // servers instead would re-bind dns.promises' functions, which the trap
    // still blocks, through Resolver's prototype, but under another name.
    code: [
      "const resolver = new (require('node:dns').promises.Resolver)();",
      "resolver.setServers(['127.0.0.1']);",
      'const tries = [',
      "  () => fetch('http://127.0.0.1:9/'),",
      "  () => require('node:http').get('http://127.0.0.1:9/'),",
      "  () => require('node:https').request('https://127.0.0.1:9/'),",
      "  () => require('node:net').connect(9, '127.0.0.1'),",
      "  () => require('node:tls').connect(9, '127.0.0.1'),",
      "  () => require('node:dns').lookup('localhost', () => {}),",
      "  () => require('node:dns').promises.lookup('localhost'),",
      "  () => resolver.resolve4('localhost'),",
      "  () => require('node:dgram').createSocket('udp4'),",
      '];',
      'for (const f of tries) {',
      "  try { const r = f(); if (r && typeof r.catch === 'function') r.catch(() => {}); if (r && typeof r.on === 'function') r.on('error', () => {}); } catch {}",
      '}',
      'setTimeout(() => process.exit(0), 300);',
    ].join('\n'),
  },
  esm: {
    expect: ['https.get', 'net.Socket.connect', 'dns.lookup'],
    code: [
      "import { get } from 'node:https';",
      "import { connect } from 'node:net';",
      "import { lookup } from 'node:dns';",
      "for (const f of [() => get('https://127.0.0.1:9/'), () => connect(9, '127.0.0.1'), () => lookup('localhost', () => {})]) {",
      "  try { const r = f(); if (r && typeof r.on === 'function') r.on('error', () => {}); } catch {}",
      '}',
      'setTimeout(() => process.exit(0), 300);',
    ].join('\n'),
  },
};

/**
 * Show that the trap catches what it is there to catch, before trusting an
 * empty log. A control process, with the trap loaded the way every check
 * loads it, tries each way out, from CommonJS and from an ES module. Every
 * target is the local machine (its discard port, the system's own lookup of
 * localhost, and a resolver asking 127.0.0.1), so even a broken trap sends
 * nothing off the machine. `trap: false` runs the same control without it,
 * which the fault test uses.
 */
export function runControl(work, { trap = true } = {}) {
  const dir = join(work, `control${trap ? '' : '-no-trap'}`);
  mkdirSync(join(dir, 'home'), { recursive: true });
  const log = join(dir, 'net.jsonl');
  rmSync(log, { force: true });
  const env = { ...sandboxEnv({ home: join(dir, 'home'), exposurie: false }), BENCH_NET_LOG: log };
  if (trap) env.NODE_OPTIONS = `--require ${TRAP.replace(/\\/g, '/')}`;
  const result = {};
  for (const [kind, c] of Object.entries(CONTROL)) {
    rmSync(log, { force: true });
    const args = kind === 'esm' ? ['--input-type=module', '-e', c.code] : ['-e', c.code];
    spawnSync(process.execPath, args, { env: { ...env, BENCH_NET_LABEL: `control ${kind}` }, cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 60000 });
    const caught = readLog(log).map((e) => e.what);
    result[kind] = { tried: c.expect, caught, missed: c.expect.filter((w) => !caught.includes(w)) };
  }
  result.all = Object.values(result).every((r) => r.missed.length === 0);
  return result;
}

function readLog(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

/** A throwaway home for one user, its own npm folder, and the environment every command gets, with the trap loaded. */
function prepare(work, user) {
  const base = join(work, user);
  const home = join(base, 'home');
  const prefix = join(base, 'npm');
  const cache = join(base, 'npm-cache');
  for (const d of [home, prefix, cache]) mkdirSync(d, { recursive: true });
  const plain = sandboxEnv({ home, exposurie: false });
  Object.assign(plain, {
    PATH: `${prefix};${plain.PATH}`,
    npm_config_prefix: prefix,
    npm_config_cache: cache,
    npm_config_globalconfig: join(prefix, 'etc', 'npmrc'),
  });
  const netLog = join(base, 'net.jsonl');
  const env = { ...plain, NODE_OPTIONS: `--require ${TRAP.replace(/\\/g, '/')}`, BENCH_NET_LOG: netLog };
  return { user, base, home, prefix, cache, netLog, plain, env, bin: join(prefix, PKG, 'bin', 'exposurie.js') };
}

/** exposurie 1.3.1 from the pinned tarball, by the sandbox's npm, offline, into the home's own npm folder. */
function install(ctx) {
  const r = spawnSync(process.execPath, [NPM_CLI, 'install', '--global', '--offline', '--prefix', ctx.prefix, TARBALL], {
    env: ctx.plain, cwd: ctx.base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 300000,
  });
  if (r.status !== 0) fail(`npm could not install exposurie ${VERSION} for ${ctx.user}:\n${r.stderr}`);
  const pkg = JSON.parse(readFileSync(join(ctx.prefix, PKG, 'package.json'), 'utf8'));
  if (pkg.version !== VERSION) fail(`the installed exposurie says it is ${pkg.version}, not ${VERSION}`);
}

/** Machine paths out of a command's output, so it can be published. */
function scrub(text, ctx) {
  let t = String(text).replace(/\r\n/g, '\n');
  const swaps = [[ctx.home, '~'], [ctx.prefix, '<npm>'], [ctx.base, '<work>'], [SANDBOX, '<sandbox>'], [REPO, '<repo>']];
  for (const [from, to] of swaps) {
    for (const f of [from, from.replace(/\\/g, '/')]) {
      t = t.replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to);
    }
  }
  return t;
}

/** One exposurie command, as a person or an agent types it: stdin closed, the trap loaded, in the home. */
function command(ctx, o, label, args) {
  const r = spawnSync(process.execPath, [ctx.bin, ...args], {
    env: { ...ctx.env, BENCH_NET_LABEL: label }, cwd: ctx.home, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 180000, maxBuffer: 64 * 1024 * 1024,
  });
  const out = scrub(`${r.stdout ?? ''}${r.stderr ? `\n--- stderr\n${r.stderr}` : ''}`, ctx);
  o.commands.push({ label, args, code: r.status, error: r.error ? r.error.code || r.error.message : null, stdin: 'closed', out });
}

/** Which chats' codes reached a staged batch. */
function stagedFinds(brain) {
  const dir = join(brain, '.exposurie', 'staged');
  const batches = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'conversations.md'))) : [];
  const text = batches.map((d) => readFileSync(join(dir, d, 'conversations.md'), 'utf8')).join('\n');
  return { batches: batches.length, found: Object.fromEntries(Object.entries(CHATS).map(([lab, c]) => [lab, text.includes(c.code)])) };
}

/** The brain as files: is each one UTF-8 text, and where does each page link? */
function readBrain(brain) {
  const names = Object.keys(snapshot(brain)).filter((r) => !r.endsWith('/') && !r.startsWith('.git/'));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files = names.map((rel) => {
    try {
      decoder.decode(readFileSync(join(brain, rel)));
      return { rel, utf8: true };
    } catch {
      return { rel, utf8: false };
    }
  });
  const pages = names.filter(isPage).map((rel) => ({ rel, links: linksOf(readFileSync(join(brain, rel), 'utf8')) }));
  return { files, pages, names };
}

/** Everything one user's run observes. The verdicts come from judge(), which reads only this. */
function observe(work, user, when) {
  const ctx = prepare(work, user);
  install(ctx);
  const brain = join(ctx.home, 'brain');
  cpSync(join(SANDBOX, 'brains', user, 'home', 'brain'), brain, { recursive: true });
  const brainAtStart = snapshot(brain);
  for (const a of AGENTS) {
    mkdirSync(join(ctx.home, a.root), { recursive: true });
    if (a.users) write(join(ctx.home, a.file), OWN);
  }
  write(join(ctx.home, CURSOR_RULE), OWN);
  const o = { user, env: Object.keys(ctx.env).sort(), commands: [], planted: plantHistory(ctx.home, when), brainAtStart };
  o.static = scanPackage(join(ctx.prefix, PKG));
  o.homeBefore = snapshot(ctx.home, ['brain']);
  o.package = { installed: existsSync(join(ctx.prefix, PKG, 'package.json')) };

  command(ctx, o, 'version', ['--version']);
  command(ctx, o, 'init', ['init']);
  command(ctx, o, 'scaffold', ['scaffold']);
  o.agentsAfterSetup = Object.fromEntries([...AGENTS.map((a) => a.file), CURSOR_RULE].map((f) => [f, readOrNull(join(ctx.home, f))]));
  o.homeAfterSetup = snapshot(ctx.home, ['brain']);
  command(ctx, o, 'sync', ['sync']);
  o.staged = stagedFinds(brain);
  command(ctx, o, 'read', ['read', '--search', USERS[user]]);
  command(ctx, o, 'sync --abort', ['sync', '--abort']);
  o.brainBefore = snapshot(brain);
  command(ctx, o, 'uninstall', ['uninstall']);
  o.brainAfter = snapshot(brain);
  o.homeAfter = snapshot(ctx.home, ['brain']);
  o.package.after = existsSync(join(ctx.prefix, PKG, 'package.json')) ||
    ['exposurie', 'exposurie.cmd', 'exposurie.ps1'].some((n) => existsSync(join(ctx.prefix, n)));
  Object.assign(o, readBrain(brain));
  o.net = readLog(ctx.netLog);
  for (const k of ['agentsAfterSetup']) {
    for (const [f, t] of Object.entries(o[k])) if (t !== null) o[k][f] = scrub(t, ctx);
  }
  return o;
}

/**
 * A line that asks the person for a login, a key or a sign-up. Asking is a
 * request, so the words alone are not enough: init's Obsidian step says to
 * STOP if the installer "asks for a password", which is the opposite of
 * asking for one. Every line with the words is still listed, as MENTIONS, for
 * a person to read.
 */
const ASKS = new RegExp([
  String.raw`\b(?:enter|type|paste|provide|supply|input|give us|send us)\b[^.\n]{0,40}\b(?:password|passphrase|api[ _-]?key|token|credentials?|login)\b`,
  String.raw`\b(?:log ?in|sign ?in|sign ?up|register|create an account|authenticate)\b[^.\n]{0,30}\b(?:to|with|at|on|first|now|before)\b`,
  String.raw`\b(?:requires?|needs?)\b[^.\n]{0,30}\b(?:account|login|api[ _-]?key|subscription|token)\b`,
].join('|'), 'i');
const MENTIONS = /\b(?:log ?in|sign ?in|sign ?up|api[ _-]?key|password|passphrase|access token|auth(?:entication)? token|account|subscription)\b/i;
const CREDENTIAL = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE/i;
const isPage = (r) => r.endsWith('.md') && (r.startsWith('wiki/') || r === 'index.md' || r === 'log.md');
const pagesOf = (snap) => Object.fromEntries(Object.entries(snap).filter(([k]) => isPage(k)));

/** The six verdicts, each with its evidence, from what the runs observed and nothing else. */
export function judge(obs) {
  const per = (fn) => Object.fromEntries(obs.users.map((u) => [u.user, fn(u)]));
  const verdict = (id, users, shared = null, sharedPass = true) => ({
    ...LINES.find((l) => l.id === id),
    pass: sharedPass && Object.values(users).every((u) => u.pass),
    evidence: { ...users, ...(shared ? { shared } : {}) },
  });
  const S = obs.shared.static;

  const one = per((u) => {
    const notUtf8 = u.files.filter((f) => !f.utf8).map((f) => f.rel);
    const dead = u.pages.flatMap((p) => p.links.filter((t) => !resolves(t, u.names)).map((t) => `${p.rel} -> [[${t}]]`));
    return {
      pass: u.pages.length > 0 && notUtf8.length === 0 && dead.length === 0,
      files: u.files.length, pages: u.pages.length, links: u.pages.reduce((n, p) => n + p.links.length, 0), notUtf8, dead,
    };
  });

  const two = per((u) => {
    const brainChanged = changed(u.brainBefore, u.brainAfter);
    const pagesChanged = changed(pagesOf(u.brainAtStart), pagesOf(u.brainAfter));
    const setupWrote = changed(u.homeBefore, u.homeAfterSetup);
    const left = changed(u.homeBefore, u.homeAfter);
    const foldersLeft = changed(u.homeBefore, u.homeAfter, { folders: true });
    const removed = u.package.installed && !u.package.after;
    return {
      pass: brainChanged.length === 0 && pagesChanged.length === 0 && setupWrote.length > 0 && left.length === 0 && removed,
      brainFiles: Object.keys(u.brainAfter).filter((k) => !k.endsWith('/')).length,
      brainChangedByUninstall: brainChanged,
      pages: Object.keys(pagesOf(u.brainAfter)).length,
      pagesChangedFromInstallToUninstall: pagesChanged,
      otherBrainFilesChangedFromInstallToUninstall: changed(u.brainAtStart, u.brainAfter).filter((k) => !isPage(k) && !k.startsWith('.git/')),
      setupWrote, leftAfterUninstall: left, emptyFoldersLeft: foldersLeft, packageRemoved: removed,
    };
  });

  const three = per((u) => ({ pass: u.net.length === 0, commands: u.commands.map((c) => c.label), attempts: u.net }));
  const threeShared = { control: obs.shared.control, networkCode: S.networkCode, npmRunsInCode: S.npmRuns, filesRead: S.files };

  const four = per((u) => {
    const credentialsInReach = u.env.filter((n) => CREDENTIAL.test(n));
    const badExits = u.commands.filter((c) => (c.code !== 0 && c.code !== 10) || c.error).map((c) => `${c.label}: exit ${c.code}${c.error ? `, ${c.error}` : ''}`);
    const lines = (re, cs) => cs.flatMap((c) => c.out.split('\n').filter((l) => re.test(l)).map((l) => `${c.label}: ${l.trim()}`));
    const asks = lines(ASKS, u.commands);
    return {
      pass: credentialsInReach.length === 0 && badExits.length === 0 && asks.length === 0 && u.commands.every((c) => c.stdin === 'closed'),
      exits: Object.fromEntries(u.commands.map((c) => [c.label, c.code])), credentialsInReach, badExits, asks,
      // `read` prints the user's own pages, and their words are theirs, so its lines are left out of the mentions.
      mentions: lines(MENTIONS, u.commands.filter((c) => c.label !== 'read')),
    };
  });
  const fourShared = { envRead: S.envReads, credentialEnvRead: S.envReads.filter((n) => CREDENTIAL.test(n)), prompts: S.prompts };

  const five = per((u) => {
    const pointer = blockOf(u.agentsAfterSetup[AGENTS[0].file]);
    const agents = AGENTS.map((a) => {
      const text = u.agentsAfterSetup[a.file];
      const block = blockOf(text);
      return {
        agent: a.agent, file: `~/${a.file}`, pointer: Boolean(block), once: count(text, START) === 1 && count(text, END) === 1,
        same: block !== null && block === pointer, forWork: Boolean(block?.includes(POINTER_FOR_WORK)),
        usersLinesKept: !a.users || Boolean(text?.startsWith(OWN.trimEnd())),
      };
    });
    const ownRuleKept = u.agentsAfterSetup[CURSOR_RULE] === OWN;
    return {
      pass: Boolean(pointer) && ownRuleKept && agents.every((a) => a.pointer && a.once && a.same && a.forWork && a.usersLinesKept),
      agents, cursorRuleOfTheirsUntouched: ownRuleKept, pointer,
    };
  });

  const six = per((u) => ({
    pass: u.staged.batches > 0 && Object.values(u.staged.found).every(Boolean),
    batches: u.staged.batches, reachedTheBatch: u.staged.found,
  }));

  return [
    verdict(1, one),
    verdict(2, two),
    verdict(3, three, threeShared, obs.shared.control.all && S.networkCode.length === 0),
    verdict(4, four, fourShared, fourShared.credentialEnvRead.length === 0 && S.prompts.length === 0),
    verdict(5, five),
    verdict(6, six),
  ];
}

export function results(obs) {
  return {
    part: 12,
    name: "It's yours",
    exposurie: VERSION,
    tarball: { file: PINS.exposurie131.file, integrity: PINS.exposurie131.integrity },
    node: obs.node,
    date: obs.date,
    scope: SCOPE,
    users: obs.users.map((u) => u.user),
    lines: judge(obs),
  };
}

/** What the published files are: its-yours.json, and each command's output for each user. */
export function published(res, obs) {
  const files = { 'its-yours.json': `${JSON.stringify(res, null, 2)}\n` };
  for (const u of obs.users) {
    u.commands.forEach((c, i) => {
      files[`${u.user}/${i + 1}-${slug(c.label)}.txt`] = c.out.endsWith('\n') ? c.out : `${c.out}\n`;
    });
  }
  return files;
}

function publish(files) {
  const bad = Object.entries(files).filter(([, text]) => WINDOWS_PATH.test(text)).map(([rel]) => rel);
  if (bad.length) fail(`not published: these still hold a machine path: ${bad.join(', ')}`);
  const stale = existsSync(OUT) ? Object.keys(snapshot(OUT)).filter((k) => !k.endsWith('/') && !(k in files)) : [];
  for (const rel of stale) rmSync(join(OUT, rel));
  for (const [rel, text] of Object.entries(files)) write(join(OUT, rel), text);
}

async function main() {
  ownNodeOnly();
  if (process.version !== `v${PINS.node.version}`) fail(`Node is ${process.version}, pinned ${PINS.node.version}`);
  if (!existsSync(TARBALL) || integrity(TARBALL) !== PINS.exposurie131.integrity) {
    fail(`${TARBALL} is missing or does not match the registry's sha512 in runner/pins.json`);
  }
  lockSandbox();
  const work = join(RUNS, `part12-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(work, { recursive: true });
  const when = Date.now() - 60 * 60 * 1000;
  const users = Object.keys(USERS).map((user) => {
    console.log(`${user}: a throwaway home with the kept brain, exposurie ${VERSION} from the tarball, then setup, sync, read and uninstall`);
    return observe(work, user, when);
  });
  const obs = { node: process.version, date: new Date().toISOString().slice(0, 10), users, shared: { static: users[0].static, control: runControl(work) } };
  write(join(work, 'observed.json'), `${JSON.stringify(obs, null, 2)}\n`);
  const res = results(obs);
  const files = published(res, obs);
  for (const [rel, text] of Object.entries(files)) write(join(work, 'out', rel), text);

  console.log(`\nPart 12, It's yours, on exposurie ${VERSION}, for ${res.users.join(' and ')}:`);
  for (const l of res.lines) console.log(`  ${l.id}  ${l.pass ? 'pass' : 'FAIL'}  ${l.name}`);
  console.log(`\nsaved: ${work}`);
  if (process.argv.includes('--save')) {
    publish(files);
    console.log(`published: ${posix(relative(REPO, OUT))}/`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
