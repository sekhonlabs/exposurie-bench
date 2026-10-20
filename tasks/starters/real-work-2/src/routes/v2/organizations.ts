import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { prisma } from '../../db/client';
import { requireOrgAccess } from '../../middleware/auth';
import { exportProjects } from '../../services/exportProjects';

export const organizations = Router();

organizations.get('/:id', requireOrgAccess, async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, createdAt: true },
  });
  if (!org) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(org);
});

organizations.get('/:id/export', requireOrgAccess, async (req, res) => {
  const orgId = req.params.id;
  const latest = await prisma.project.aggregate({
    where: { organizationId: orgId },
    _max: { updatedAt: true },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="projects-${orgId}.csv"`);
  res.setHeader('Last-Modified', latest._max.updatedAt!.toUTCString());

  try {
    await pipeline(Readable.from(exportProjects(orgId)), res);
  } catch (err) {
    // Headers are already sent, so a JSON error body would land in the middle
    // of the CSV. A cut connection tells the client the file is incomplete.
    res.destroy(err as Error);
  }
});
