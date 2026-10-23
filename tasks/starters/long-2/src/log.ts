import { config } from './config';

type Fields = Record<string, unknown>;

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function write(level: Level, msg: string, fields: Fields = {}) {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  process.stdout.write(`${JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields })}\n`);
}

/** One JSON object per line on stdout; ECS ships it to CloudWatch. */
export const log = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

/** An error the way a log line carries it, with Prisma's error code when there is one. */
export function errorFields(err: unknown) {
  if (!(err instanceof Error)) return { message: String(err) };
  const code = (err as { code?: unknown }).code;
  return { name: err.name, ...(typeof code === 'string' ? { code } : {}), message: err.message };
}
