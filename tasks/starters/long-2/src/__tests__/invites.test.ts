import { prisma } from '../db/client';
import { enqueue } from '../jobs/queue';
import { createInvites } from '../services/invites';

jest.mock('../db/client', () => ({ prisma: { invite: { findMany: jest.fn(), create: jest.fn() } } }));
jest.mock('../jobs/queue', () => ({ enqueue: jest.fn() }));

const invite = prisma.invite as unknown as { findMany: jest.Mock; create: jest.Mock };
const enqueued = enqueue as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  let n = 0;
  invite.create.mockImplementation(async () => ({ id: `i${(n += 1)}` }));
});

it('skips addresses already invited, duplicates and anything that is not an address', async () => {
  invite.findMany.mockResolvedValueOnce([{ email: 'lee@example.com' }]);

  const result = await createInvites(
    'org-1',
    ['Lee@Example.com', ' bo@example.com', 'bo@example.com', 'not-an-address'],
    'member',
  );

  expect(result).toEqual({ invited: 1, skipped: 3 });
  expect(invite.create).toHaveBeenCalledTimes(1);
  expect(invite.create.mock.calls[0][0].data.email).toBe('bo@example.com');
});

it('sends them in batches of 50', async () => {
  invite.findMany.mockResolvedValueOnce([]);

  await createInvites(
    'org-1',
    Array.from({ length: 120 }, (_, i) => `person${i}@example.com`),
    'member',
  );

  expect(enqueued.mock.calls.map((c) => c[0])).toEqual(['send_invite_emails', 'send_invite_emails', 'send_invite_emails']);
  expect(enqueued.mock.calls.map((c) => c[1].invites.length)).toEqual([50, 50, 20]);
});
