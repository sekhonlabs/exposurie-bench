import { prisma } from '../db/client';
import { EXPORT_PAGE_SIZE, exportProjects } from '../services/exportProjects';

jest.mock('../db/client', () => ({ prisma: { project: { findMany: jest.fn() } } }));

const findMany = prisma.project.findMany as jest.Mock;

const project = (i: number, name = `Project ${i}`) => ({
  id: `p${String(i).padStart(5, '0')}`,
  name,
  status: 'ACTIVE',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  _count: { tasks: 2 },
});

async function collect(lines: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

beforeEach(() => findMany.mockReset());

it('yields only the header for an organisation with no projects', async () => {
  findMany.mockResolvedValueOnce([]);
  expect(await collect(exportProjects('org-1'))).toEqual(['id,name,status,created_at,task_count\n']);
});

it('quotes a name containing a comma and a quote', async () => {
  findMany.mockResolvedValueOnce([project(1, 'Acme, "Phase 2"')]);
  const lines = await collect(exportProjects('org-1'));
  expect(lines[1]).toBe('p00001,"Acme, ""Phase 2""",ACTIVE,2026-08-01T00:00:00.000Z,2\n');
});

it('pages through with a cursor on id', async () => {
  findMany
    .mockResolvedValueOnce(Array.from({ length: EXPORT_PAGE_SIZE }, (_, i) => project(i)))
    .mockResolvedValueOnce(Array.from({ length: 120 }, (_, i) => project(EXPORT_PAGE_SIZE + i)));
  const lines = await collect(exportProjects('org-1'));
  expect(lines).toHaveLength(1 + EXPORT_PAGE_SIZE + 120);
  expect(findMany).toHaveBeenCalledTimes(2);
  expect(findMany.mock.calls[1][0]).toMatchObject({
    cursor: { id: project(EXPORT_PAGE_SIZE - 1).id },
    skip: 1,
  });
});
