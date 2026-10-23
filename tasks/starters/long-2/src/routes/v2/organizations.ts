import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { prisma } from '../../db/client';
import { requireOrgAccess } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { exportProjects } from '../../services/exportProjects';
import { invites } from './invites';
import { projects } from './projects';

export const organizations = Router();

organizations.use('/:id/projects', projects);
organizations.use('/:id/invites', invites);

organizations.get('/:id', requireOrgAccess, rateLimit, async (_req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: res.locals.organizationId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!org) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ id: org.id, name: org.name, created_at: org.createdAt.toISOString() });
});

organizations.get('/:id/export', requireOrgAccess, rateLimit, async (_req, res) => {
  const orgId: string = res.locals.organizationId;
  const latest = await prisma.project.aggregate({
    where: { organizationId: orgId },
    _max: { updatedAt: true },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="projects-${orgId}.csv"`);
  // ENG-431: an organisation with no projects has no last change to report.
  if (latest._max?.updatedAt) res.setHeader('Last-Modified', latest._max.updatedAt.toUTCString());

  try {
    await pipeline(Readable.from(exportProjects(orgId)), res);
  } catch (err) {
    // Headers are already sent, so a JSON error body would land in the middle
    // of the CSV. A cut connection tells the client the file is incomplete.
    res.destroy(err as Error);
  }
});
