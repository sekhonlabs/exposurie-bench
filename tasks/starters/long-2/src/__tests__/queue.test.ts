import type { Job } from '@prisma/client';
import { prisma } from '../db/client';
import { LOCK_MS, MAX_ATTEMPTS, claimNext, retryOrGiveUp } from '../jobs/queue';

jest.mock('../db/client', () => ({
  prisma: { job: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() } },
}));

const job = prisma.job as unknown as { findFirst: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
const now = new Date('2026-10-20T09:00:00Z');

const row = (over: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'send_invite_emails',
  payload: {},
  runAt: new Date('2026-10-20T08:59:00Z'),
  attempts: 0,
  lockedBy: null,
  lockedAt: null,
  doneAt: null,
  failedAt: null,
  lastError: null,
  dedupeKey: null,
  createdAt: now,
  ...over,
});

const lastUpdate = () => job.update.mock.calls[job.update.mock.calls.length - 1][0].data;

beforeEach(() => jest.resetAllMocks());

it('claims the due job with the earliest run_at', async () => {
  job.findFirst.mockResolvedValueOnce(row());
  job.updateMany.mockResolvedValueOnce({ count: 1 });

  const claimed = await claimNext('w1', now);

  expect(claimed).toMatchObject({ id: 'j1', lockedBy: 'w1', attempts: 1 });
  expect(job.findFirst.mock.calls[0][0].orderBy).toEqual([{ runAt: 'asc' }, { id: 'asc' }]);
  expect(job.updateMany).toHaveBeenCalledWith({
    where: { id: 'j1', lockedAt: null },
    data: { lockedAt: now, lockedBy: 'w1', attempts: { increment: 1 } },
  });
});

it('looks again when another worker claimed the row first', async () => {
  job.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ id: 'j2' }));
  job.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

  expect((await claimNext('w1', now))?.id).toBe('j2');
});

it('counts a row locked longer than LOCK_MS as abandoned', async () => {
  job.findFirst.mockResolvedValueOnce(null);

  await claimNext('w1', now);

  expect(job.findFirst.mock.calls[0][0].where.OR).toEqual([
    { lockedAt: null },
    { lockedAt: { lt: new Date(now.getTime() - LOCK_MS) } },
  ]);
});

it('backs off 1, 2, 4 and 8 minutes, then gives up', async () => {
  jest.useFakeTimers({ now });
  try {
    for (const [attempts, minutes] of [
      [1, 1],
      [2, 2],
      [3, 4],
      [4, 8],
    ]) {
      job.update.mockResolvedValueOnce({});
      expect(await retryOrGiveUp(row({ attempts }), new Error('boom'))).toBe(false);
      expect(lastUpdate().runAt).toEqual(new Date(now.getTime() + minutes * 60_000));
    }
    job.update.mockResolvedValueOnce({});
    expect(await retryOrGiveUp(row({ attempts: MAX_ATTEMPTS }), new Error('boom'))).toBe(true);
    expect(lastUpdate()).toMatchObject({ failedAt: now, lastError: 'boom' });
  } finally {
    jest.useRealTimers();
  }
});
