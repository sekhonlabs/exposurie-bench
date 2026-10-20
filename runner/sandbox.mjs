// The run sandbox: where it lives, the environment every run gets, and the
// commands that set it up and check it. Windows, for now.
//
//   node runner/sandbox.mjs setup          install the pinned Git, Claude Code and exposurie
//   node runner/sandbox.mjs login          log in once, by hand, with a Claude plan
//   node runner/sandbox.mjs check          one tiny run, then check its start-up line
//   node runner/sandbox.mjs recheck <dir>  check a saved run again, without running anything
//   node runner/sandbox.mjs env            print the environment every run gets
//   node runner/sandbox.mjs claude <args>  the sandbox's Claude Code, in that environment
//
// Run it with the sandbox's own Node, which runner/bootstrap.ps1 puts in place.
// Every path is worked out from this file's location: the sandbox and the raw
// run output sit beside the repository, never inside it.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = dirname(REPO);

export const SANDBOX = join(BENCH, 'sandbox');
export const RUNS = join(BENCH, 'runs');
export const PINS = JSON.parse(readFileSync(join(REPO, 'runner', 'pins.json'), 'utf8'));

const HOME = join(SANDBOX, 'home');
const CONFIG = join(HOME, '.claude');
const NODE = join(SANDBOX, 'node');
const GIT = join(SANDBOX, 'git');
const PREFIX = join(SANDBOX, 'npm');
const TMP = join(SANDBOX, 'tmp');
const DOWNLOADS = join(SANDBOX, 'downloads');

const NPM_CLI = join(NODE, 'node_modules', 'npm', 'bin', 'npm-cli.js');
export const CLAUDE = join(PREFIX, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
export const EXPOSURIE = join(PREFIX, 'node_modules', '@sekhon', 'exposurie', 'bin', 'exposurie.js');

/** The tools every condition gets. Each run's start-up line is checked against this. */
export const TOOLS = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'];

/**
 * Windows' own variables, the only ones a run takes from the process that
 * starts it. The environment is built rather than inherited, so nothing of the
 * machine owner's setup, and nothing of the session that launches a run (its
 * effort setting, its session ID), can reach the run.
 */
const FROM_WINDOWS = [
  'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'PATHEXT', 'OS',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
  'CommonProgramFiles', 'CommonProgramFiles(x86)', 'CommonProgramW6432', 'ALLUSERSPROFILE',
];

export function sandboxEnv() {
  const env = {};
  for (const k of FROM_WINDOWS) if (process.env[k] !== undefined) env[k] = process.env[k];
  const win = env.SystemRoot ?? 'C:\\Windows';
  const drive = parse(HOME).root.replace(/\\$/, '');
  return {
    ...env,
    HOME,
    USERPROFILE: HOME,
    HOMEDRIVE: drive,
    HOMEPATH: HOME.slice(drive.length),
    APPDATA: join(HOME, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(HOME, 'AppData', 'Local'),
    TEMP: TMP,
    TMP,
    PATH: [
      PREFIX, NODE, join(GIT, 'cmd'),
      join(win, 'System32'), win, join(win, 'System32', 'Wbem'), join(win, 'System32', 'WindowsPowerShell', 'v1.0'),
    ].join(';'),
    CLAUDE_CONFIG_DIR: CONFIG,
    CLAUDE_CODE_GIT_BASH_PATH: join(GIT, 'bin', 'bash.exe'),
    DISABLE_AUTOUPDATER: '1',
    // No remote feature flags. On Windows one of them (tengu_windows_credman)
    // moves the login out of the sandbox's credentials file into the Windows
    // user's Credential Manager, and any of them could change behaviour midway
    // through the run. Every run gets the pinned binary's own defaults.
    DISABLE_GROWTHBOOK: '1',
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    npm_config_prefix: PREFIX,
    npm_config_cache: join(SANDBOX, 'npm-cache'),
    npm_config_userconfig: join(HOME, '.npmrc'),
    npm_config_globalconfig: join(PREFIX, 'etc', 'npmrc'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  };
}

function fail(msg) {
  console.error(`sandbox: ${msg}`);
  process.exit(1);
}

/** Refuse any Node but the sandbox's own, and Node options set from outside. */
export function ownNodeOnly() {
  if (resolve(process.execPath).toLowerCase() !== join(NODE, 'node.exe').toLowerCase()) {
    fail(`run this with the sandbox's own Node: ${join(NODE, 'node.exe')}`);
  }
  for (const k of Object.keys(process.env)) {
    if (/^NODE_(OPTIONS|PATH)$/i.test(k)) fail(`${k} is set, and it would load into the sandbox's Node`);
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    env: sandboxEnv(), cwd: SANDBOX, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts,
  });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  return r;
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function fetchPinned(pin) {
  const file = join(DOWNLOADS, pin.file);
  if (!existsSync(file)) {
    const res = await fetch(pin.url);
    if (!res.ok) fail(`download failed (${res.status}): ${pin.url}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if (sha256(file) !== pin.sha256) fail(`checksum mismatch: ${file}`);
  return file;
}

async function waitFor(done, ms, what) {
  for (const end = Date.now() + ms; !done(); ) {
    if (Date.now() > end) fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function versions() {
  const out = (r) => (r.stdout || r.stderr).trim();
  return {
    node: process.version.slice(1),
    git: out(run(join(GIT, 'cmd', 'git.exe'), ['--version'])),
    claude: out(run(CLAUDE, ['--version'])),
    exposurie: out(run(process.execPath, [EXPOSURIE, '--version'])),
  };
}

async function setup() {
  ownNodeOnly();
  if (process.version !== `v${PINS.node.version}`) fail(`Node is ${process.version}, pinned ${PINS.node.version}`);
  for (const d of [CONFIG, join(HOME, 'AppData', 'Roaming'), join(HOME, 'AppData', 'Local'), TMP, PREFIX, DOWNLOADS, RUNS]) {
    mkdirSync(d, { recursive: true });
  }

  // Git: Claude Code's shell tool runs in Git's bash, and exposurie runs git.
  // The archive extracts itself and then runs Git's post-install step, which
  // deletes post-install.bat when it finishes. Started from here, both happen
  // inside the sandbox's environment.
  if (!existsSync(join(GIT, 'cmd', 'git.exe')) || existsSync(join(GIT, 'post-install.bat'))) {
    const sfx = await fetchPinned(PINS.git);
    run(sfx, [`-o${GIT}`, '-y'], { stdio: 'inherit' });
    await waitFor(
      () => existsSync(join(GIT, 'cmd', 'git.exe')) && !existsSync(join(GIT, 'post-install.bat')),
      300_000, "Git's post-install step",
    );
  }

  // Claude Code and exposurie, by the sandbox's own npm, into its own prefix and cache.
  const npm = run(process.execPath, [
    NPM_CLI, 'install', '--global',
    `@anthropic-ai/claude-code@${PINS.claudeCode}`, `@sekhon/exposurie@${PINS.exposurie}`,
  ], { stdio: 'inherit' });
  if (npm.status !== 0) fail('npm install failed');

  writeFileSync(join(CONFIG, 'settings.json'), readFileSync(join(REPO, 'runner', 'sandbox-settings.json')));

  const v = versions();
  console.log(JSON.stringify(v, null, 2));
  if (!v.claude.startsWith(PINS.claudeCode)) fail(`Claude Code is ${v.claude}, pinned ${PINS.claudeCode}`);
  if (!v.exposurie.includes(PINS.exposurie)) fail(`exposurie is ${v.exposurie}, pinned ${PINS.exposurie}`);
}

function claude(args) {
  ownNodeOnly();
  const r = spawnSync(CLAUDE, args, { env: sandboxEnv(), cwd: HOME, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function login() {
  console.log([
    "The sandbox's own Claude Code is starting.",
    '- Choose "Claude account with subscription", never the Console/API option.',
    '- A browser window may open by itself. Close it without signing in: a browser started from the',
    '  sandbox makes a new profile inside it, and Edge signs that profile in and syncs into it.',
    '- Copy the sign-in URL from this window into your own browser, approve, and paste the code back here.',
    '- Then type /exit.',
  ].join('\n'));
  claude([]);
}

/** What the sandbox home may hold. Anything else came from a program that should not run here. */
const HOME_ALLOWED = new Set(['.claude', 'AppData', join('AppData', 'Local'), join('AppData', 'Roaming')]);

function strays() {
  const found = [];
  for (const top of readdirSync(HOME)) {
    if (top !== 'AppData') {
      if (!HOME_ALLOWED.has(top)) found.push(top);
      continue;
    }
    for (const sub of readdirSync(join(HOME, 'AppData'))) {
      const rel = join('AppData', sub);
      if (!HOME_ALLOWED.has(rel)) found.push(rel);
      else for (const leaf of readdirSync(join(HOME, rel))) found.push(join(rel, leaf));
    }
  }
  return found;
}

function check() {
  ownNodeOnly();
  const dir = join(RUNS, `part0-check-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const work = join(dir, 'work');
  mkdirSync(work, { recursive: true });
  // stdin closed: an earlier exposurie test overstated its result because each
  // headless session read the remaining questions from stdin.
  const r = run(CLAUDE, [
    '-p', 'Reply with exactly one word: ready',
    '--model', PINS.model,
    '--output-format', 'stream-json', '--verbose',
    '--strict-mcp-config',
    '--tools', TOOLS.join(','),
    '--allowedTools', 'Bash(exposurie:*)',
    '--no-session-persistence',
  ], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(dir, 'stream.jsonl'), r.stdout);
  writeFileSync(join(dir, 'stderr.txt'), r.stderr);
  report(dir);
}

/** Checks a saved run against the pins, and the sandbox as it is now. */
function report(dir) {
  const work = join(dir, 'work');
  const msgs = readFileSync(join(dir, 'stream.jsonl'), 'utf8').split('\n')
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  const init = msgs.find((m) => m.type === 'system' && m.subtype === 'init');
  const result = msgs.find((m) => m.type === 'result');
  if (!init) fail(`no start-up line; see ${dir}`);

  const plugins = init.plugins ?? [];
  const own = ['skills', 'agents', 'commands'].filter((d) => existsSync(join(CONFIG, d)));
  const checks = [
    ['Claude Code version', init.claude_code_version === PINS.claudeCode, init.claude_code_version],
    ['model', String(init.model).startsWith(PINS.model), init.model],
    ['plan login, no API key', init.apiKeySource === 'none', init.apiKeySource],
    ['no MCP servers', (init.mcp_servers ?? []).length === 0, JSON.stringify(init.mcp_servers)],
    ['only the listed tools', JSON.stringify([...(init.tools ?? [])].sort()) === JSON.stringify(TOOLS), (init.tools ?? []).join(', ')],
    // The binary ships a few plugins of its own. They come with the pinned
    // version and are the same in every condition.
    ['no plugins but the built-in ones', plugins.every((p) => p.path === 'builtin'), plugins.map((p) => p.name).join(', ') || 'none'],
    ['no skills, agents or commands of its own', own.length === 0, own.join(', ') || 'none'],
    ['ran in its own folder', resolve(String(init.cwd)).toLowerCase() === work.toLowerCase(), init.cwd],
    ['answered', result?.is_error === false, JSON.stringify(result?.result)],
    ['nothing stray in the sandbox home', strays().length === 0, strays().join(', ') || 'none'],
  ];
  for (const [what, ok, seen] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}: ${seen}`);
  console.log(`skills: ${JSON.stringify(init.skills ?? [])}`);
  console.log(`agents: ${JSON.stringify(init.agents ?? [])}`);
  console.log(`slash commands: ${JSON.stringify(init.slash_commands ?? [])}`);
  if (result) console.log(`usage: ${JSON.stringify(result.usage)}`);
  const projects = join(CONFIG, 'projects');
  console.log(`history in the sandbox: ${existsSync(projects) ? readdirSync(projects).join(', ') || 'none' : 'none'}`);
  console.log(`saved: ${dir}`);
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

function printEnv() {
  const env = sandboxEnv();
  for (const k of Object.keys(env).sort((a, b) => a.localeCompare(b))) console.log(`${k}=${env[k]}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = {
    setup, login, check, env: printEnv, claude: () => claude(rest),
    recheck: () => report(resolve(rest[0] ?? fail('usage: node runner/sandbox.mjs recheck <run folder>'))),
  };
  if (!commands[cmd]) fail(`usage: node runner/sandbox.mjs ${Object.keys(commands).join(' | ')}`);
  await commands[cmd]();
}
