import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../db/client';

jest.mock('../db/client', () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock('../middleware/auth', () => ({
  requireOrgAccess: (
    req: { params: { id: string } },
    res: { locals: Record<string, unknown> },
    next: () => void,
  ) => {
    res.locals.organizationId = req.params.id;
    next();
  },
}));
jest.mock('../middleware/rateLimit', () => ({
  rateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const project = prisma.project as unknown as Record<
  'findMany' | 'count' | 'create' | 'findFirst' | 'updateMany' | 'update',
  jest.Mock
>;

const row = {
  id: 'p1',
  organizationId: 'org-1',
  name: 'Website',
  description: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-10-01T09:00:00Z'),
  updatedAt: new Date('2026-10-01T09:00:00Z'),
  archivedAt: null,
};

beforeEach(() => jest.resetAllMocks());

it('lists active projects, newest first, a page at a time', async () => {
  project.findMany.mockResolvedValueOnce([row]);
  project.count.mockResolvedValueOnce(51);

  const res = await request(createApp()).get('/v2/organizations/org-1/projects?page=2&page_size=50');

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ page: 2, page_size: 50, total: 51, items: [{ id: 'p1', status: 'active' }] });
  expect(project.findMany.mock.calls[0][0]).toMatchObject({
    where: { organizationId: 'org-1', status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    skip: 50,
    take: 50,
  });
});

it('trims a new name, and refuses an empty one', async () => {
  project.create.mockResolvedValueOnce(row);

  const ok = await request(createApp()).post('/v2/organizations/org-1/projects').send({ name: '  Website  ' });
  const empty = await request(createApp()).post('/v2/organizations/org-1/projects').send({ name: '   ' });

  expect(ok.status).toBe(201);
  expect(project.create.mock.calls[0][0].data).toMatchObject({ organizationId: 'org-1', name: 'Website' });
  expect(empty.status).toBe(422);
});

it('changes a name, trimmed', async () => {
  project.updateMany.mockResolvedValueOnce({ count: 1 });
  project.findFirst.mockResolvedValueOnce({ ...row, name: 'Marketing site' });

  const res = await request(createApp())
    .patch('/v2/organizations/org-1/projects/p1')
    .send({ name: 'Marketing site ' });

  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Marketing site');
  expect(project.updateMany.mock.calls[0][0]).toEqual({
    where: { id: 'p1', organizationId: 'org-1' },
    data: { name: 'Marketing site' },
  });
});

it('archives a project only once', async () => {
  project.findFirst.mockResolvedValueOnce(row);
  project.update.mockResolvedValueOnce({ ...row, status: 'ARCHIVED', archivedAt: new Date('2026-10-02T10:00:00Z') });

  const first = await request(createApp()).post('/v2/organizations/org-1/projects/p1/archive');

  expect(first.body).toMatchObject({ status: 'archived', archived_at: '2026-10-02T10:00:00.000Z' });

  project.findFirst.mockResolvedValueOnce({ ...row, status: 'ARCHIVED' });
  const again = await request(createApp()).post('/v2/organizations/org-1/projects/p1/archive');

  expect(again.status).toBe(200);
  expect(project.update).toHaveBeenCalledTimes(1);
});
