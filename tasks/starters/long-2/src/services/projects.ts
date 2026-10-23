import type { Project, ProjectStatus } from '@prisma/client';
import { prisma } from '../db/client';

/** A project as the API returns it. */
export function toApi(p: Project) {
  return {
    id: p.id,
    organization_id: p.organizationId,
    name: p.name,
    description: p.description,
    status: p.status.toLowerCase(),
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    archived_at: p.archivedAt?.toISOString() ?? null,
  };
}

export type ApiProject = ReturnType<typeof toApi>;

export async function listProjects(
  organizationId: string,
  { page, pageSize, status }: { page: number; pageSize: number; status?: ProjectStatus },
) {
  const where = { organizationId, ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.project.count({ where }),
  ]);
  return { items: rows.map(toApi), total };
}

export async function getProject(organizationId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  return p && toApi(p);
}

/** ENG-301: names are trimmed; the route refuses an empty one. */
export async function createProject(organizationId: string, input: { name: string; description?: string | null }) {
  const p = await prisma.project.create({
    data: { organizationId, name: input.name.trim(), description: input.description ?? null },
  });
  return toApi(p);
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  changes: { name?: string; description?: string | null },
) {
  const data = { ...changes, ...(changes.name !== undefined ? { name: changes.name.trim() } : {}) };
  const { count } = await prisma.project.updateMany({ where: { id: projectId, organizationId }, data });
  return count ? getProject(organizationId, projectId) : null;
}

/** Archiving an archived project changes nothing. */
export async function archiveProject(organizationId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  if (!p || p.status === 'ARCHIVED') return p && toApi(p);
  const archived = await prisma.project.update({
    where: { id: p.id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
  return toApi(archived);
}
