// The condition files (part 4): what B and D put in the sandbox's
// ~/.claude/CLAUDE.md, the global instructions file. A gets no file, and C gets
// what exposurie writes there itself when its brain is built (part 6).
//
//   node tasks/conditions.mjs     write every file into tasks/conditions/
//
// B gets the whole history: every session and chat, oldest first, as exposurie
// reads it. That is only what was said, with each session headed by what
// exposurie also knows about it: when it started, the surface, and the folder
// it ran in or the chat's title.
//
// D gets only the facts a task needs: the facts that answer it, or for area 4
// the facts closest to what was never discussed, which is what perfect
// retrieval would return. Area 8 needs no past, so it has no D.
//
// The files are committed, so each condition's input can be read as it was
// run. check/tasks.mjs fails when one differs from what this would write.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USERS, loadUser, parseSession, sessionFile } from '../check/history.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONDITIONS = join(REPO, 'tasks', 'conditions');
const readJson = (...p) => JSON.parse(readFileSync(join(REPO, ...p), 'utf8'));

const SURFACE = {
  terminal: 'Claude Code in the terminal',
  vscode: 'Claude Code in VS Code',
  desktop: 'Claude Code in the desktop app',
  'claude.ai': 'claude.ai',
};

/** A session's start on the user's own clock: "2026-05-25T20:40:00+01:00" is "2026-05-25 20:40". */
const local = (at) => at.slice(0, 16).replace('T', ' ');

/** B: the user's whole history. */
export function historyFile(user) {
  const u = loadUser(user);
  const sessions = [...u.sessions.values()];
  const chats = sessions.filter((s) => s.surface === 'claude.ai').length;
  const out = [
    "# The user's earlier conversations with Claude",
    '',
    `Every earlier conversation the user has had with Claude, oldest first: ${sessions.length - chats} Claude Code sessions` +
      (chats ? ` and ${chats} claude.ai chats` : '') +
      `. Each one is headed by when it started, where, and ${chats ? "the folder a Claude Code session ran in or a chat's title" : 'the folder it ran in'}.` +
      ' Only what was said is kept: no tool calls, tool output or files.',
    '',
  ];
  for (const s of sessions) {
    const { turns } = parseSession(readFileSync(sessionFile(user, s.id), 'utf8'));
    const where = s.surface === 'claude.ai' ? `"${s.title}"` : u.plan.machine.folders[s.project];
    out.push('---', '', `## ${local(s.at)} · ${SURFACE[s.surface]} · ${where}`, '');
    for (const t of turns) out.push(t.role === 'user' ? '**User:**' : '**Claude:**', '', t.text, '');
  }
  return out.join('\n');
}

/** The facts D gets for a task, in order. Empty for a task that needs no past. */
export function factsFor(task) {
  const sheet = readJson('users', task.user, 'facts.json');
  const ids = task.area === 4
    ? sheet.never_discussed.find((n) => n.tasks.includes(task.id))?.near ?? []
    : [...new Set((task.required ?? []).map((c) => c.fact).filter(Boolean))];
  return ids.map((id) => sheet.facts.find((f) => f.id === id));
}

const sentence = (s) => (/[.!?…'"]$/.test(s) ? s : `${s}.`);
const where = (f) => (f.project ? (f.context === 'work' ? `${f.project} (work)` : f.project) : f.context);

/** D: the facts one task needs. */
export function factsFile(task) {
  const out = ['# Notes about the user', '', "From the user's earlier conversations with Claude.", ''];
  for (const f of factsFor(task)) {
    out.push(`- ${where(f)} · ${f.kind.replace(/-/g, ' ')}: ${sentence(f.value)}` + (f.why ? ` Why: ${sentence(f.why)}` : ''));
  }
  return out.join('\n') + '\n';
}

/** Every condition file, by its path under tasks/conditions/. */
export function conditionFiles() {
  const files = new Map();
  for (const user of USERS) files.set(`history-${user}.md`, historyFile(user));
  for (const task of readJson('tasks', 'index.json').tasks) {
    if (factsFor(task).length) files.set(`facts-${task.id}.md`, factsFile(task));
  }
  return files;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  mkdirSync(CONDITIONS, { recursive: true });
  for (const [name, text] of conditionFiles()) {
    writeFileSync(join(CONDITIONS, name), text);
    console.log(`${name}: ${text.length.toLocaleString('en-US')} characters`);
  }
}
