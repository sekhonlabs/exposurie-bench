import express from 'express';
import request from 'supertest';
import { prisma } from '../db/client';
import { LIMIT_PER_MINUTE, rateLimit } from '../middleware/rateLimit';

jest.mock('../db/client', () => ({ prisma: { rateLimitWindow: { upsert: jest.fn() } } }));

const upsert = prisma.rateLimitWindow.upsert as jest.Mock;

function app() {
  const a = express();
  a.use((_req, res, next) => {
    res.locals.apiKey = { id: 'k1' };
    next();
  });
  a.use(rateLimit);
  a.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  return a;
}

beforeEach(() => upsert.mockReset());

it('counts the request and says how many are left', async () => {
  upsert.mockResolvedValueOnce({ count: 10 });

  const res = await request(app()).get('/');

  expect(res.status).toBe(200);
  expect(res.headers['x-ratelimit-limit']).toBe(String(LIMIT_PER_MINUTE));
  expect(res.headers['x-ratelimit-remaining']).toBe(String(LIMIT_PER_MINUTE - 10));
});

it('answers 429 with Retry-After once past the limit', async () => {
  upsert.mockResolvedValueOnce({ count: LIMIT_PER_MINUTE + 1 });

  const res = await request(app()).get('/');

  expect(res.status).toBe(429);
  expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
});
