// A fake `claude` (parts 5 and 6), so the runner, the scorer and the brain
// build can be tested end to end without spending anything. check/runner.mjs
// and check/build.mjs run it with the sandbox's Node where the sandbox's Claude
// Code would be. It reads its arguments and the sandbox home as the real one
// would, prints its output in the real format (stream-json for a run or a
// build, json for the judge), and writes files into its folder as an agent
// would.
//
// Its answers come from tasks/examples.json: a wrong one in condition A, and a
// right one in B, C and D. A task scored by the judge gets a made-up answer
// carrying [[judge:right]] or [[judge:wrong]], and the fake judge returns what
// that says. EXPOSURIE_BENCH_FAKE names a scenario file that can give a run
// other behaviour, such as a usage limit or a read outside its folder.
//
// Each run also checks what the runner handed it: its arguments, its
// environment, its folder, the condition in the home, and whether `exposurie`
// resolves through Git Bash, as an agent's shell would find it. Anything wrong
// goes into the answer as FAKE-PROBLEM, which check/runner.mjs looks for.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, TOOLS, sandboxEnv } from './sandbox.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const print = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const scenario = process.env.EXPOSURIE_BENCH_FAKE ? JSON.parse(readFileSync(process.env.EXPOSURIE_BENCH_FAKE, 'utf8')) : {};

const HOME = process.env.HOME ?? '';
const CONFIG = process.env.CLAUDE_CONFIG_DIR ?? '';
const BUILT_IN_SKILLS = ['design', 'design-sync', 'dataviz', 'update-config', 'verify', 'debug', 'code-review', 'simplify'];

function usage(input, output) {
  return {
    usage: { input_tokens: 2, cache_creation_input_tokens: input, cache_read_input_tokens: 0, output_tokens: output },
    modelUsage: { [PINS.model]: { inputTokens: 2, outputTokens: output, cacheReadInputTokens: 0, cacheCreationInputTokens: input, costUSD: 0 } },
    total_cost_usd: 0,
  };
}

if (args[0] === '--version') {
  console.log(`${PINS.claudeCode} (Claude Code)`);
  process.exit(0);
}

// ---------------------------------------------------------------- the judge

if (arg('--system-prompt-file') !== undefined) {
  const material = readFileSync(arg('--system-prompt-file'), 'utf8');
  const problems = [];
  if (existsSync(join(CONFIG, 'CLAUDE.md'))) problems.push('the judge ran with an instructions file in the home');
  if (arg('--tools') !== '') problems.push(`the judge had tools: ${arg('--tools')}`);
  if (arg('--output-format') !== 'json') problems.push('the judge was not asked for json');
  if (arg('--model') !== PINS.model) problems.push(`the judge's model is ${arg('--model')}`);
  const flag = join(dirname(process.env.EXPOSURIE_BENCH_FAKE ?? '.'), 'judge-limit-used');
  if (scenario.judge_limit && material.includes(scenario.judge_limit) && !existsSync(flag)) {
    writeFileSync(flag, '');
    print({ type: 'result', subtype: 'success', is_error: true, terminal_reason: 'api_error', api_error_status: 429, api_error: 'usage_limit_reached', result: "You've hit your session limit · resets 5pm", ...usage(0, 0) });
    process.exit(1);
  }
  const said = /\[\[judge:(right|wrong)\]\]/.exec(material)?.[1];
  const verdict = problems.length ? 'wrong' : said ?? 'wrong';
  const reason = problems.length ? `FAKE-PROBLEM: ${problems.join('; ')}` : said ? `the answer was marked ${said}` : 'no marker';
  print({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, duration_ms: 5, result: `VERDICT: ${verdict}\nREASON: ${reason}`, ...usage(Math.ceil(material.length / 4), 40) });
  process.exit(0);
}

// ---------------------------------------------------------------- a brain build

// A build types /exposurie-sync in the brain's folder. The fake does what the
// command asks, with exposurie 1.2.0's real sync through Git Bash: stage a
// batch, read it, write a page, file it, and again until nothing is waiting.
// The scenario's `build` names the user, and what a numbered session does
// instead: hit a usage limit before filing ('limit'), stop after one batch
// ('stop-early'), never sync ('idle'), read the answer key ('outside'), read
// the raw history ('read-history'), or write a transcript ('persist').
if (arg('-p') === '/exposurie-sync') {
  const brain = process.cwd();
  const problems = [];
  const want = {
    '--model': PINS.model, '--output-format': 'stream-json', '--tools': TOOLS.join(','),
    '--allowedTools': 'Bash(exposurie:*)', '--permission-mode': 'acceptEdits',
  };
  for (const [k, v] of Object.entries(want)) if (arg(k) !== v) problems.push(`${k} is ${arg(k)}, not ${v}`);
  for (const f of ['--verbose', '--strict-mcp-config', '--no-session-persistence']) if (!args.includes(f)) problems.push(`no ${f}`);
  const own = new Set([...Object.keys(sandboxEnv()), 'EXPOSURIE_BENCH_FAKE'].map((k) => k.toUpperCase()));
  const inherited = Object.keys(process.env).filter((k) => !own.has(k.toUpperCase()));
  if (inherited.length) problems.push(`inherited ${inherited.join(', ')}`);
  if (resolve(brain).toLowerCase() !== resolve(HOME, 'brain').toLowerCase()) problems.push(`syncs in ${brain}, not the brain`);
  if (!existsSync(join(CONFIG, 'commands', 'exposurie-sync.md'))) problems.push('no /exposurie-sync in the home');
  if (!existsSync(join(CONFIG, 'projects'))) problems.push('no history in the home');

  const user = scenario.build?.user ?? '?';
  const counter = join(dirname(process.env.EXPOSURIE_BENCH_FAKE ?? '.'), `build-sessions-${user}`);
  const n = (existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0) + 1;
  writeFileSync(counter, String(n));
  const kind = scenario.build?.sessions?.[n] ?? null;
  const session = randomUUID();
  const out = [];
  const tool = (name, input, output) => {
    const id = `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    out.push({ type: 'assistant', message: { id: `msg_${id}`, role: 'assistant', model: PINS.model, content: [{ type: 'tool_use', id, name, input }] }, session_id: session });
    out.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: false, content: output }] }, session_id: session });
  };
  const sh = (command) => spawnSync(process.env.CLAUDE_CODE_GIT_BASH_PATH, ['-c', command], { cwd: brain, encoding: 'utf8', windowsHide: true });
  const state = () => {
    try {
      return JSON.parse(readFileSync(join(brain, '.exposurie', 'state.json'), 'utf8'));
    } catch {
      return null;
    }
  };

  let read = 0;
  let limited = false;
  for (let i = 0; kind !== 'idle' && i < 12; i += 1) {
    const s = sh('exposurie sync');
    tool('Bash', { command: 'exposurie sync' }, s.stdout);
    const batch = state()?.pendingBatch;
    if (!batch) break;
    const conv = join(brain, '.exposurie', 'staged', batch.id, 'conversations.md');
    const text = existsSync(conv) ? readFileSync(conv, 'utf8') : '';
    if (!text) problems.push(`batch ${batch.id} has no conversations.md`);
    read += text.length;
    tool('Read', { file_path: conv }, text.slice(0, 300));
    // Numbered rather than named after the batch: the fake stages batches within the same second, and a batch's ID is the second it was staged.
    const pages = join(brain, 'wiki', 'sources');
    mkdirSync(pages, { recursive: true });
    const title = `The ${user}, batch ${readdirSync(pages).length + 1}`;
    const page = join(pages, `${title}.md`);
    const body = `---\ntype: source\n---\n\n# ${title}\n\nThis brain belongs to the ${user}. Batch ${batch.id}, ${(text.match(/^## /gm) ?? []).length} sessions.\n`;
    writeFileSync(page, body);
    tool('Write', { file_path: page, content: body }, `File created successfully at: ${page}`);
    if (kind === 'limit') {
      limited = true;
      break;
    }
    const d = sh('exposurie sync --done');
    tool('Bash', { command: 'exposurie sync --done' }, d.stdout);
    if (d.status !== 0) problems.push(`exposurie sync --done exited ${d.status}: ${d.stdout.slice(0, 300)}`);
    if (kind === 'stop-early') break;
  }
  if (kind === 'outside') tool('Read', { file_path: join(REPO, 'users', user, 'facts.json') }, '{"facts": []}');
  if (kind === 'read-history') {
    const first = readdirSync(join(CONFIG, 'projects'))[0];
    const file = join(CONFIG, 'projects', first, readdirSync(join(CONFIG, 'projects', first))[0]);
    tool('Read', { file_path: file }, readFileSync(file, 'utf8').slice(0, 300));
  }
  if (kind === 'persist') {
    mkdirSync(join(CONFIG, 'projects', 'fake-build'), { recursive: true });
    writeFileSync(join(CONFIG, 'projects', 'fake-build', `${session}.jsonl`), '{}\n');
  }

  const has = (rel) => existsSync(join(HOME, rel));
  const skills = [...BUILT_IN_SKILLS, ...(has('.claude/skills/exposurie/SKILL.md') ? ['exposurie'] : [])];
  print({
    type: 'system', subtype: 'init', cwd: brain, session_id: session, tools: (arg('--tools') ?? '').split(',').filter(Boolean),
    mcp_servers: [], model: arg('--model'), permissionMode: arg('--permission-mode') ?? 'default',
    slash_commands: [...skills, 'compact', 'context', ...(has('.claude/commands/exposurie-sync.md') ? ['exposurie-sync'] : [])],
    apiKeySource: 'none', claude_code_version: PINS.claudeCode, output_style: 'default',
    agents: ['claude', 'Explore', 'general-purpose', 'Plan', 'statusline-setup'], skills,
    plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin', source: 'cc-plugin-agents-md@builtin' }],
  });
  for (const m of out) print(m);
  const said = `${problems.length ? `FAKE-PROBLEM: ${problems.join('; ')}\n\n` : ''}The brain is synced.`;
  print({ type: 'assistant', message: { id: `msg_${randomUUID()}`, role: 'assistant', model: PINS.model, content: [{ type: 'text', text: said }] }, session_id: session });
  print({ type: 'rate_limit_event', rate_limit_info: { status: limited ? 'rejected' : 'allowed', rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: limited ? 1 : 0.5 }, seven_day: { utilization: 0.2 } } }, session_id: session });
  const spent = usage(6400 + Math.ceil(read / 4), 300 + 200 * out.length);
  if (limited) {
    print({
      type: 'result', subtype: 'success', is_error: true, terminal_reason: 'api_error', num_turns: out.length / 2 + 1, session_id: session,
      api_error_status: 429, api_error: 'usage_limit_reached', result: "You've hit your session limit · resets 5pm", permission_denials: [], ...spent,
    });
    process.exit(1);
  }
  print({
    type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', num_turns: out.length / 2 + 1, duration_ms: 60,
    session_id: session, result: said, permission_denials: [], ...spent,
  });
  process.exit(0);
}

// ---------------------------------------------------------------- a run

const ask = arg('-p');
const task = readJson('tasks', 'index.json').tasks.find((t) => t.ask === ask);
const problems = [];
if (!task) {
  problems.push(`no task asks ${JSON.stringify(ask)}`);
}

// The arguments every run gets.
const want = {
  '--model': PINS.model, '--output-format': 'stream-json', '--tools': TOOLS.join(','),
  '--allowedTools': 'Bash(exposurie:*)', '--permission-mode': 'acceptEdits',
};
for (const [k, v] of Object.entries(want)) if (arg(k) !== v) problems.push(`${k} is ${arg(k)}, not ${v}`);
for (const f of ['--verbose', '--strict-mcp-config', '--no-session-persistence']) if (!args.includes(f)) problems.push(`no ${f}`);

// The environment is built, never inherited: nothing but what sandboxEnv gives, and the scenario.
const own = new Set([...Object.keys(sandboxEnv()), 'EXPOSURIE_BENCH_FAKE'].map((k) => k.toUpperCase()));
const inherited = Object.keys(process.env).filter((k) => !own.has(k.toUpperCase()));
if (inherited.length) problems.push(`inherited ${inherited.join(', ')}`);
if (process.env.USERPROFILE !== HOME || resolve(CONFIG) !== resolve(HOME, '.claude')) problems.push('HOME, USERPROFILE and CLAUDE_CONFIG_DIR disagree');

// Its own folder, named as the task says, holding its starter or nothing.
const cwd = process.cwd();
const filesIn = (dir) => {
  const out = [];
  const walk = (d, rel) => {
    for (const n of readdirSync(d)) {
      if (statSync(join(d, n)).isDirectory()) walk(join(d, n), `${rel}${n}/`);
      else out.push(`${rel}${n}`);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out.sort();
};
if (task) {
  if (basename(cwd) !== task.folder) problems.push(`runs in ${basename(cwd)}, not ${task.folder}`);
  const starter = task.starter ? filesIn(join(REPO, 'tasks', task.starter)) : [];
  if (JSON.stringify(filesIn(cwd)) !== JSON.stringify(starter)) problems.push('its folder does not hold exactly its starter');
}

// The condition, read off the home the way Claude Code would meet it.
const md = existsSync(join(CONFIG, 'CLAUDE.md')) ? readFileSync(join(CONFIG, 'CLAUDE.md'), 'utf8') : null;
const conditionFile = (name) => readFileSync(join(REPO, 'tasks', 'conditions', name), 'utf8');
let condition = '?';
if (md === null) condition = 'A';
else if (md.includes('<!-- exposurie:start -->')) condition = 'C';
else if (task && md === conditionFile(`history-${task.user}.md`)) condition = 'B';
else if (task && existsSync(join(REPO, 'tasks', 'conditions', `facts-${task.id}.md`)) && md === conditionFile(`facts-${task.id}.md`)) condition = 'D';
else problems.push("the instructions file is no condition's, or another user's or task's");

const has = (rel) => existsSync(join(HOME, rel));
const exposurieParts = ['.claude/skills/exposurie/SKILL.md', '.claude/commands/exposurie-sync.md', '.exposurie/config.json', 'brain'];
if (condition === 'C') {
  for (const rel of exposurieParts) if (!has(rel)) problems.push(`C without ${rel}`);
} else {
  for (const rel of exposurieParts) if (has(rel)) problems.push(`${condition} with ${rel}`);
}

// What the agent's shell finds: Git Bash, with the PATH the run was given.
const bash = (command) => spawnSync(process.env.CLAUDE_CODE_GIT_BASH_PATH, ['-c', command], { encoding: 'utf8', windowsHide: true });
const found = bash('command -v exposurie').status === 0;
if (found !== (condition === 'C')) problems.push(`exposurie is ${found ? '' : 'not '}on the PATH in ${condition}`);

// ---------------------------------------------------------------- what it says

const behaviour = task ? scenario.runs?.[`${task.id}/${condition}`] ?? null : null;
const session = randomUUID();
const calls = [];
let turns = 1;
let extraInput = 0;
const denials = [];

/** A tool call and its result, printed the way Claude Code streams them. */
function tool(name, input, output, { denied = false } = {}) {
  const id = `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  calls.push({ type: 'assistant', message: { id: `msg_${id}`, role: 'assistant', model: PINS.model, content: [{ type: 'tool_use', id, name, input }] }, session_id: session });
  calls.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: denied, content: denied ? 'Permission to use this tool has been denied.' : output }] }, session_id: session });
  if (denied) denials.push({ tool_name: name, tool_use_id: id, tool_input: input });
  turns += 1;
}

const examples = readJson('tasks', 'examples.json').examples.filter((e) => task && e.task === task.id);
let answer;
let files = [];
if (task?.score === 'judge') {
  answer = `A made-up answer to "${task.ask}" [[judge:${condition === 'A' ? 'wrong' : 'right'}]]`;
} else if (task) {
  const kind = behaviour?.example ?? (condition === 'A' ? 'wrong' : 'right');
  const e = examples.find((x) => x.expect === kind);
  if (!e) problems.push(`${task.id} has no example scored ${kind}`);
  answer = `${e?.answer ?? 'no example'}${kind === 'judge' ? ` [[judge:${behaviour?.judge ?? 'right'}]]` : ''}`;
  files = e?.files ?? [];
}

if (condition === 'C') {
  const r = bash('exposurie read --search "belongs"');
  tool('Bash', { command: 'exposurie read --search "belongs"' }, r.stdout);
  extraInput += 2000;
  const other = task?.user === 'developer' ? 'delegator' : 'developer';
  if (task && (!r.stdout.includes(task.user) || r.stdout.includes(other))) {
    problems.push(`exposurie read did not find the ${task.user}'s brain alone: ${r.stdout.slice(0, 300)}`);
  }
}
for (const f of files) {
  const to = join(cwd, f.path);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, f.text);
  tool('Write', { file_path: to, content: f.text }, `File created successfully at: ${to}`);
}

const kind = typeof behaviour === 'string' ? behaviour : behaviour?.do;
if (kind === 'outside' || kind === 'outside-denied') {
  const file = join(REPO, 'tasks', 'index.json');
  tool('Read', { file_path: file }, kind === 'outside' ? readFileSync(file, 'utf8').slice(0, 200) : '', { denied: kind === 'outside-denied' });
}
if (kind === 'shell') tool('Bash', { command: 'ls -la' }, 'total 0');
if (kind === 'persist') {
  mkdirSync(join(CONFIG, 'projects', 'fake'), { recursive: true });
  writeFileSync(join(CONFIG, 'projects', 'fake', `${session}.jsonl`), '{}\n');
}
if (kind === 'stray') mkdirSync(join(HOME, 'AppData', 'Local', 'Stray'), { recursive: true });
if (kind === 'edit-condition' && md !== null) writeFileSync(join(CONFIG, 'CLAUDE.md'), `${md}\nedited\n`);
if (kind === 'email') answer = `${answer} Questions to ${scenario.identity}.`;
if (problems.length) answer = `FAKE-PROBLEM: ${problems.join('; ')}\n\n${answer}`;

// ---------------------------------------------------------------- the stream

const skills = [...BUILT_IN_SKILLS, ...(has('.claude/skills/exposurie/SKILL.md') ? ['exposurie'] : [])];
print({
  type: 'system', subtype: 'init', cwd, session_id: session,
  tools: [...(arg('--tools') ?? '').split(',').filter(Boolean), ...(kind === 'wrong-tools' ? ['WebSearch'] : [])],
  mcp_servers: kind === 'mcp' ? [{ name: 'claude.ai Gmail', status: 'connected' }] : [],
  model: arg('--model'), permissionMode: arg('--permission-mode') ?? 'default',
  slash_commands: [...skills, 'compact', 'context', ...(has('.claude/commands/exposurie-sync.md') ? ['exposurie-sync'] : [])],
  apiKeySource: 'none', claude_code_version: PINS.claudeCode, output_style: 'default',
  agents: ['claude', 'Explore', 'general-purpose', 'Plan', 'statusline-setup'], skills,
  plugins: [{ name: 'cc-plugin-agents-md', path: 'builtin', source: 'cc-plugin-agents-md@builtin' }],
});

if (kind === 'wrong-tools' || kind === 'mcp' || kind === 'hang') {
  // The runner stops a run like this itself. Wait the way a busy run would.
  setInterval(() => {}, 1000);
} else if (kind === 'crash') {
  process.exit(3);
} else {
  const limit = kind === 'limit';
  const rate = { type: 'rate_limit_event', rate_limit_info: { status: limit ? 'rejected' : 'allowed', rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: limit ? 1 : 0.4 }, seven_day: { utilization: 0.1 } } }, session_id: session };
  if (limit || kind === 'api-error') {
    print(rate);
    print({
      type: 'result', subtype: 'success', is_error: true, terminal_reason: 'api_error', num_turns: 1, session_id: session,
      api_error_status: limit ? 429 : 529, api_error: limit ? 'usage_limit_reached' : 'overloaded_error',
      result: limit ? "You've hit your session limit · resets 5pm" : 'API Error: 529 Overloaded', permission_denials: [], ...usage(0, 0),
    });
    process.exit(1);
  }
  for (const c of calls) print(c);
  print({ type: 'assistant', message: { id: `msg_${randomUUID()}`, role: 'assistant', model: PINS.model, content: [{ type: 'text', text: answer }] }, session_id: session });
  print(rate);
  let input = 6400 + extraInput;
  if (condition === 'B' || condition === 'D') input += Math.ceil(md.length / 4);
  if (condition === 'C') input += Math.ceil(md.length / 4);
  print({
    type: 'result', subtype: 'success', is_error: false, terminal_reason: 'completed', num_turns: turns, duration_ms: 40, session_id: session,
    result: answer, permission_denials: denials, ...usage(input, 150 + Math.ceil(answer.length / 4)),
  });
}
