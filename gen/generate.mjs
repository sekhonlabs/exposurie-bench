// Part 2: Sonnet writes each session from its brief, inside the sandbox.
//
//   node gen/generate.mjs <developer|delegator> [session ids...] [--dry-run] [--attempts N]
//
// Each attempt is one headless run of the sandbox's own Claude Code, in the
// sandbox's environment: the pinned model, its own system prompt (the session's
// brief, from gen/prompt.mjs), no tools, no skills, no MCP servers, stdin closed
// and session persistence off, so generation never becomes part of anyone's
// history. What comes back is held to check/history.mjs before it is kept; a
// session that fails goes back with the checker's findings, up to N attempts.
//
// Each history is about TARGET_TOKENS long, and sessions come in longer or
// shorter than their briefs, so each new session is asked for its share of the
// budget still left (lengthScale below).
//
// Sessions already in users/<user>/sessions/ are skipped, so a run stopped by
// a usage limit resumes by running the same command again. Every attempt's
// prompt, output and usage are saved under ../runs; users/<user>/sessions/
// generation.json keeps the usage and findings of each attempt.
//
// --dry-run writes every prompt to ../runs and runs nothing.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAUDE, PINS, RUNS, SANDBOX, ownNodeOnly, sandboxEnv } from '../runner/sandbox.mjs';
import {
  CHARS_PER_TOKEN, TARGET_TOKENS, USERS, checkSession, headerFor, loadUser, parseSession, parseTurns, sessionFile, textOf,
} from '../check/history.mjs';
import { promptFor } from './prompt.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function fail(msg) {
  console.error(`generate: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const user = args[0];
if (!USERS.includes(user)) fail(`usage: node gen/generate.mjs <${USERS.join('|')}> [session ids...] [--dry-run] [--attempts N]`);
const dryRun = args.includes('--dry-run');
const at = args.indexOf('--attempts');
const attempts = at >= 0 ? Number(args[at + 1]) : 3;
const named = args.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--attempts');

ownNodeOnly();
const u = loadUser(user);
for (const id of named) if (!u.sessions.has(id)) fail(`${user} has no session ${id}`);
const todo = [...u.sessions.values()].filter((s) => (named.length ? named.includes(s.id) : true));
const runDir = join(RUNS, `gen-${user}-${dryRun ? 'dry-run-' : ''}${stamp()}`);
mkdirSync(runDir, { recursive: true });

/**
 * The share of its brief's length the next session is asked for: the tokens
 * the written sessions have left of TARGET_TOKENS, counted as check/history.mjs
 * counts them, spread over the briefs not yet written. It stays inside SCALE,
 * well within the checker's band for a single session.
 */
const SCALE = [0.7, 1.6];
function lengthScale() {
  let written = 0;
  let left = 0;
  for (const s of u.sessions.values()) {
    const f = sessionFile(user, s.id);
    if (existsSync(f)) written += textOf(parseSession(readFileSync(f, 'utf8')).turns).length / CHARS_PER_TOKEN;
    else left += s.brief.tokens;
  }
  return left ? Math.min(SCALE[1], Math.max(SCALE[0], (TARGET_TOKENS - written) / left)) : 1;
}

if (dryRun) {
  const scale = lengthScale();
  for (const s of todo) writeFileSync(join(runDir, `${s.id}.md`), promptFor(u, s.id, [], scale));
  console.log(`${todo.length} prompts written to ${runDir}, at ${scale.toFixed(2)} of their briefs' length`);
  process.exit(0);
}

const version = spawnSync(CLAUDE, ['--version'], { env: sandboxEnv(), cwd: SANDBOX, encoding: 'utf8' }).stdout.trim();
if (!version.startsWith(PINS.claudeCode)) fail(`the sandbox's Claude Code is ${version}, pinned ${PINS.claudeCode}`);

const logPath = join(REPO, 'users', user, 'sessions', 'generation.json');
mkdirSync(dirname(logPath), { recursive: true });
const log = existsSync(logPath)
  ? JSON.parse(readFileSync(logPath, 'utf8'))
  : { note: 'One entry per session: every attempt, with the API usage Claude Code reported and the checker\'s findings. Prompts and raw output are in ../runs.', model: PINS.model, sessions: {} };
const saveLog = () => writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n');

/** One headless run. Returns the parsed result, or stops the whole run on an error. */
function write(s, n, prompt) {
  const dir = join(runDir, `${s.id}-${n}`);
  const work = join(dir, 'work');
  mkdirSync(work, { recursive: true });
  const promptFile = join(dir, 'prompt.md');
  writeFileSync(promptFile, prompt);
  const r = spawnSync(CLAUDE, [
    '-p', `Write session ${s.id} now, following the brief.`,
    '--model', PINS.model,
    '--system-prompt-file', promptFile,
    '--tools', '',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format', 'json',
  ], { env: sandboxEnv(), cwd: work, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  writeFileSync(join(dir, 'result.json'), r.stdout || '');
  writeFileSync(join(dir, 'stderr.txt'), r.stderr || '');
  let out;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = null;
  }
  if (!out || out.is_error || r.status !== 0) {
    const why = out?.result || r.stderr || r.error?.message || `exit ${r.status}`;
    saveLog();
    fail(
      `${s.id} attempt ${n} stopped: ${String(why).trim().slice(0, 300)}\n` +
        `Nothing was kept for ${s.id}. ${/limit/i.test(String(why)) ? 'This is a usage limit: run the same command again after it resets, and it carries on from here.' : `See ${dir}.`}`,
    );
  }
  return { text: String(out.result || '').trim(), usage: out.usage, cost: out.total_cost_usd, ms: out.duration_ms, dir };
}

const failed = [];
let used = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
for (const s of todo) {
  if (existsSync(sessionFile(user, s.id))) continue;
  const entry = (log.sessions[s.id] ??= { attempts: [] });
  const scale = lengthScale();
  let feedback = [];
  let kept = false;
  for (let n = 1; n <= attempts && !kept; n += 1) {
    const prompt = promptFor(u, s.id, feedback, scale);
    process.stdout.write(`${s.id} attempt ${n} (length ${scale.toFixed(2)}): `);
    const res = write(s, n, prompt);
    const header = ['---', ...headerFor(user, s).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n');
    const md = `${header}\n${res.text}\n`;
    const shape = parseTurns(res.text);
    const problems = shape.problems.length ? shape.problems : checkSession(u, s.id, md).problems;
    const usage = res.usage || {};
    used = {
      input: used.input + (usage.input_tokens || 0),
      cacheWrite: used.cacheWrite + (usage.cache_creation_input_tokens || 0),
      cacheRead: used.cacheRead + (usage.cache_read_input_tokens || 0),
      output: used.output + (usage.output_tokens || 0),
    };
    entry.attempts.push({
      at: new Date().toISOString(), claude_code: version, length_scale: Number(scale.toFixed(3)), ok: problems.length === 0, problems,
      usage: { input_tokens: usage.input_tokens, cache_creation_input_tokens: usage.cache_creation_input_tokens, cache_read_input_tokens: usage.cache_read_input_tokens, output_tokens: usage.output_tokens },
      total_cost_usd_estimate: res.cost, duration_ms: res.ms,
    });
    if (problems.length === 0) {
      writeFileSync(sessionFile(user, s.id), md.replace(/\r\n/g, '\n'));
      kept = true;
      console.log(`kept (${usage.output_tokens ?? '?'} output tokens)`);
    } else {
      feedback = problems;
      console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}: ${problems[0].slice(0, 120)}`);
    }
    saveLog();
  }
  if (!kept) failed.push(s.id);
}

const projects = join(SANDBOX, 'home', '.claude', 'projects');
if (existsSync(projects) && readdirSync(projects).length) {
  console.log(`\nWARNING: ${projects} is not empty. Generation runs without session persistence, so nothing should be there.`);
}
const total = used.input + used.cacheWrite + used.cacheRead;
console.log(
  `\nThis run: ${total.toLocaleString('en-US')} input tokens (${used.cacheRead.toLocaleString('en-US')} read from cache, ` +
    `${used.cacheWrite.toLocaleString('en-US')} written to it) and ${used.output.toLocaleString('en-US')} output tokens. Raw output: ${runDir}`,
);
if (failed.length) {
  console.log(`Not kept after ${attempts} attempts: ${failed.join(', ')}. Their findings are in ${logPath}.`);
  process.exit(1);
}
