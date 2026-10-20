import { prisma } from '../db/client';
import { toCsvRow } from '../lib/csv';

export const EXPORT_PAGE_SIZE = 500;

const HEADER = ['id', 'name', 'status', 'created_at', 'task_count'];

export async function* exportProjects(organizationId: string): AsyncGenerator<string> {
  yield toCsvRow(HEADER);
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.project.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
      take: EXPORT_PAGE_SIZE,
      // skip: 1 steps past the cursor row itself; this is not offset paging.
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        _count: { select: { tasks: true } },
      },
    });
    for (const p of page) {
      yield toCsvRow([p.id, p.name, p.status, p.createdAt.toISOString(), String(p._count.tasks)]);
    }
    if (page.length < EXPORT_PAGE_SIZE) return;
    cursor = page[page.length - 1].id;
  }
}
