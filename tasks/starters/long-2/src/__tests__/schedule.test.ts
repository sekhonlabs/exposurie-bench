import { prisma } from '../db/client';
import { enqueueDue } from '../jobs/schedule';

jest.mock('../db/client', () => ({ prisma: { job: { upsert: jest.fn() } } }));

const upsert = prisma.job.upsert as jest.Mock;

beforeEach(() => upsert.mockReset());

it('enqueues nothing before a nightly job is due', async () => {
  await enqueueDue(new Date('2026-10-20T02:29:59Z'));

  expect(upsert).not.toHaveBeenCalled();
});

it("enqueues today's row once it is due, keyed by kind and date", async () => {
  await enqueueDue(new Date('2026-10-20T02:30:00Z'));

  expect(upsert).toHaveBeenCalledWith({
    where: { dedupeKey: 'purge_expired_invites:2026-10-20' },
    create: {
      kind: 'purge_expired_invites',
      runAt: new Date('2026-10-20T02:30:00Z'),
      dedupeKey: 'purge_expired_invites:2026-10-20',
    },
    update: {},
  });
});
