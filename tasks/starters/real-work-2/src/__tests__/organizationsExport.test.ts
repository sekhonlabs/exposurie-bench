import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../db/client';

jest.mock('../db/client', () => ({
  prisma: { project: { findMany: jest.fn(), aggregate: jest.fn() } },
}));
jest.mock('../middleware/auth', () => ({
  requireOrgAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const findMany = prisma.project.findMany as jest.Mock;
const aggregate = prisma.project.aggregate as jest.Mock;

beforeEach(() => {
  findMany.mockReset();
  aggregate.mockReset();
});

it('streams the projects as a CSV download', async () => {
  aggregate.mockResolvedValue({ _max: { updatedAt: new Date('2026-09-30T12:00:00Z') } });
  findMany.mockResolvedValueOnce([
    {
      id: 'p1',
      name: 'Website',
      status: 'ACTIVE',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      _count: { tasks: 3 },
    },
  ]);

  const res = await request(createApp()).get('/v2/organizations/org-1/export');

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
  expect(res.headers['content-disposition']).toBe('attachment; filename="projects-org-1.csv"');
  expect(res.headers['last-modified']).toBe('Wed, 30 Sep 2026 12:00:00 GMT');
  expect(res.text).toBe(
    'id,name,status,created_at,task_count\np1,Website,ACTIVE,2026-08-01T00:00:00.000Z,3\n',
  );
});
