// The prompt Sonnet writes one session from: how to write, then the session's
// brief. Everything in it comes from users/<user>/facts.json and plan.json and
// the rules in check/history.mjs, so the prompt and the checker cannot disagree.

import { rulesFor, sourceOf } from '../check/history.mjs';

const WORDS_PER_TOKEN = 0.75;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Monday 25 May 2026, 20:40", read off the local time the plan gives. */
function when(at) {
  const [, y, mo, d, h, mi] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  const day = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  return `${day} ${+d} ${MONTHS[+mo - 1]} ${y}, ${h}:${mi}`;
}

const HOW = {
  user: 'the person says it themselves',
  agent: 'the assistant proposes it and the person accepts',
  correction: 'the assistant first suggests something else, and the person corrects it to this',
};

const quote = (list) => list.map((m) => `"${m}"`).join(', ');

function surface(u, s) {
  const folder = s.project ? u.plan.machine.folders[s.project] : null;
  const agent =
    `The person works on a ${u.plan.machine.os === 'macOS' ? 'Mac' : u.plan.machine.os}, and the assistant is Claude Code,` +
    ` a coding agent working in the project folder \`${folder}\`; any path it mentions is on that machine.` +
    ' It reads files, runs commands and edits code, but this history keeps only what was said,' +
    ' so its work shows only in what it says: it may say in one line what it is about to check, and after' +
    ' working it reports what it did and found, naming files and the decisions that matter, the way Claude' +
    ' Code does. It never narrates tool calls and never pastes whole files.';
  switch (s.surface) {
    case 'terminal':
      return `Claude Code in a terminal, at home, on one of their own projects. ${agent}`;
    case 'vscode':
      return `Claude Code in VS Code, at work, in the company's repository. ${agent}`;
    case 'desktop':
      return `Claude Code in the Claude desktop app, on a folder of their own. ${agent} The person is not a developer, so it explains in plain words, and when they have to do something themselves it gives numbered click-by-click steps.`;
    default:
      return 'A chat in the claude.ai app. The assistant is Claude: a conversation, with no files and no commands. The person thinks out loud here, in longer messages than they type anywhere else.';
  }
}

const MEMORY = {
  'claude-code':
    'The assistant remembers nothing from earlier sessions. It knows only what is said in this one and what it' +
    ' finds in the project\'s files. So an earlier decision that matters here is either said again by the' +
    ' person or found by the assistant in the code, and the assistant never claims to remember the person.' +
    ' It never tells them "you said" about anything they have not said in this session.',
  'claude.ai':
    'Claude remembers nothing from their other chats or their coding sessions. It knows only what the person' +
    ' says in this chat, so anything earlier that matters here, the person says again.',
};

/** Earlier facts the session should not contradict, from its project and the person's matching context. */
function background(u, s, skip) {
  const project = s.project ? u.sheet.projects.find((p) => p.id === s.project) : null;
  return [...u.facts.values()]
    .filter((f) => u.order(f.first_session) < s.order && u.live(f, s) && !skip.has(f.id))
    .filter((f) => !(sourceOf(s) === 'claude-code' && u.chatOnly.includes(f)))
    .filter((f) => (project ? f.project === project.id || (f.project === null && f.context === project.context) : f.project === null))
    .map((f) => f.value);
}

/**
 * `scale` sets the session's length as a share of its brief's: the generator
 * aims each new session at the history's remaining budget (see gen/generate.mjs).
 */
export function promptFor(u, id, feedback = [], scale = 1) {
  const s = u.sessions.get(id);
  const b = s.brief;
  const rules = rulesFor(u, id);
  const out = [];
  const say = (...lines) => out.push(...lines);

  say(
    '# Writing one session for exposurie-bench',
    '',
    "You are writing one session of a made-up person's history with Claude. It is for a public benchmark:" +
      ' a memory tool will be built from this history, and then agents will be asked about the person. So' +
      ' the session must read like a real one, and it must say exactly what this brief plans: every planned' +
      ' fact, in its exact words, and nothing the brief does not plan. A program checks your output against' +
      ' this brief before it is kept, and sends it back if anything is missing or forbidden.',
    '',
    'Nothing in the session mentions benchmarks, made-up people, memory tools, or that it was written from a brief.',
    '',
    '## Output format',
    '',
    'Output only the session. The first line is `## User`. Then the turns alternate, `## User` and' +
      ' `## Assistant`, each heading on a line of its own, starting with the person and ending with the' +
      ' assistant. Nothing before the first `## User` and nothing after the last reply: no title, no notes,' +
      ' no closing remarks, no code fence around the whole thing.',
    '',
    'Inside a turn, write the way that side would: plain text, lists, inline code, short code blocks,' +
      ' `###` headings or bold. Outside code blocks, never start a line with `# ` or `## `. Inside a code' +
      ' block, such as a README or a pull request description, any heading is fine. A code block opens' +
      ' with three backticks and nothing after them: no language name.',
    '',
    '## Where this happens',
    '',
    surface(u, s),
    '',
    MEMORY[sourceOf(s)],
    '',
    'Let it read like a real session: concrete details of the work (file names, error messages, a small' +
      ' fix along the way) are welcome; new decisions, products, people or facts about the person are not.',
    '',
    '## The person',
    '',
    u.sheet.voice,
    '',
    '## This session',
    '',
    `${when(s.at)}, their local time. ${s.surface === 'claude.ai' ? `A chat titled "${s.title}".` : `Project: ${s.project}.`}`,
    '',
    `What happens: ${b.story}`,
    '',
  );

  const told = b.facts || {};
  const newIds = new Set(rules.required.map((r) => r.id));
  if (rules.required.length || rules.rejected.length) {
    say(
      '## Must come up in this session',
      '',
      'Each item appears in this session. Write each quoted spelling exactly as given, as whole words: a' +
        ' plural or any other ending does not count ("exclamation marks" is not "exclamation mark"), and' +
        ' where it says the case must match, it must. Backticks may go around a whole spelling but never' +
        ' inside one ("`save` button" is not "save button"). Where a reason is given, it is said in the' +
        ' conversation.',
      '',
    );
    rules.required.forEach((r, i) => {
      say(`${i + 1}. ${r.value}.`);
      say(`   How it comes up: ${told[r.id]}`);
      say(`   Who says it: ${HOW[r.how]}.`);
      const spell = r.all
        ? `every one of ${quote(r.spellings)}`
        : r.spellings.length === 1
          ? quote(r.spellings)
          : `at least one of ${quote(r.spellings)}`;
      say(`   Write: ${spell}${r.exact ? ' (case must match)' : ''}.`);
      if (r.why) say(`   The reason, said in the conversation: ${r.why}.`);
      if (r.whyMatch) say(`   In giving the reason, write at least one of ${quote(r.whyMatch)}.`);
      const turned = rules.rejected.filter((x) => x.fact === r.id);
      for (const x of turned) say(`   Named here and turned down: ${x.value}. Write ${quote(x.spellings)}.`);
    });
    const loose = rules.rejected.filter((x) => !newIds.has(x.fact));
    for (const x of loose) say(`- Named here and turned down: ${x.value}. Write ${quote(x.spellings)}.`);
    say('');
  }

  const again = (b.again || []).map((fid) => u.facts.get(fid));
  if (again.length) {
    say(
      '## Comes up again',
      '',
      'Already true from earlier sessions. Bring these in where the conversation naturally reaches them,' +
        ' said again by the person or found by the assistant in the files:',
      '',
      ...again.map((f) => `- ${f.value}`),
      '',
    );
  }
  const bg = background(u, s, new Set([...newIds, ...(b.again || [])]));
  if (bg.length) {
    say(
      '## Background',
      '',
      'Also true, and never to be contradicted. Use these only where the conversation needs them, and only' +
        ' as the assistant could know them. In Claude Code it can see what the project\'s files show (its' +
        ' tools, config and code). Everything else, such as the person\'s habits and rules or their team\'s' +
        ' conventions and templates, it knows only once the person says it in this session, and until then it' +
        ' asks rather than assumes. In claude.ai, Claude knows none of it unless the person says it:',
      '',
      ...bg.map((v) => `- ${v}`),
      '',
    );
  }

  const words = rules.forbidden.filter((f) => f.mode === 'word');
  const parts = rules.forbidden.filter((f) => f.mode === 'substring');
  const target = b.tokens * WORDS_PER_TOKEN * scale;
  say(
    '## Rules',
    '',
    '- Never write any of these words or names, in any case, anywhere in the session, not even in code,' +
      ` file names, examples or asides. They belong to other sessions or are not this person's choices: ${words.map((f) => f.term).join(', ')}.`,
  );
  say('- That includes file names and extensions. Where a file\'s name holds one of those words, call the file something else, such as "the lockfile".');
  if (parts.length) say(`- Never write these letters in a row, even inside a longer word: ${quote(parts.map((f) => f.term))}.`);
  say(
    rules.colours.size
      ? `- The only colour codes allowed are ${[...rules.colours].join(', ')}. Describe any other colour in words.`
      : '- No colour codes at all. Describe colours in words.',
    "- Don't name any product, service, library, host, person or colour that this brief doesn't name. Where" +
      ' something has to be referred to, use a plain description ("a hosted CI service", "a teammate").',
    "- Don't add facts about the person beyond this brief: where they live, their job, family, habits and" +
      ' plans come up only where a brief plans them.',
    '- Any email address in the session is made up, at example.com. Never use an address or a name from' +
      ' anywhere outside this brief.',
    "- Don't re-decide anything already decided, and don't plan anything the brief doesn't.",
    '- Code: short snippets only, under 15 lines, and only where they make a point.',
    `- Length: at least ${Math.round(target * 0.9)} and at most ${Math.round(target * 1.15)} words in all, across about ${b.turns} exchanges (an exchange is one message from the person and one reply). A session far outside that is sent back.`,
  );

  if (feedback.length) {
    say(
      '',
      '## A previous attempt was sent back',
      '',
      'The checker found these problems in your last attempt:',
      '',
      ...feedback.map((p) => `- ${p}`),
      '',
      'Write the whole session again from the start, fixing every one of them.',
    );
  }
  return out.join('\n') + '\n';
}
