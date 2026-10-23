import type { RequestHandler } from 'express';
import { prisma } from '../db/client';

/** TW-1182: requests per API key per minute. */
export const LIMIT_PER_MINUTE = 600;

/**
 * Fixed one-minute windows per API key, counted in Postgres so every API task
 * sees the same count. Runs after requireOrgAccess, which finds the key.
 */
export const rateLimit: RequestHandler = async (_req, res, next) => {
  const key = (res.locals.apiKey as { id: string } | undefined)?.id;
  if (!key) {
    next();
    return;
  }
  const now = Date.now();
  const windowStart = new Date(now - (now % 60_000));
  const { count } = await prisma.rateLimitWindow.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  const reset = Math.ceil((windowStart.getTime() + 60_000) / 1000);
  res.setHeader('X-RateLimit-Limit', String(LIMIT_PER_MINUTE));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, LIMIT_PER_MINUTE - count)));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (count > LIMIT_PER_MINUTE) {
    res.setHeader('Retry-After', String(Math.max(1, reset - Math.floor(now / 1000))));
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  next();
};
