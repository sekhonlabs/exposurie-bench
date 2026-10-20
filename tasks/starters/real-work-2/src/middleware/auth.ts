import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { prisma } from '../db/client';

export const requireOrgAccess: RequestHandler = async (req, res, next) => {
  const key = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const hashedKey = createHash('sha256').update(key).digest('hex');
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey },
    select: { organizationId: true },
  });
  // A key for another organisation gets the same answer as a missing one, so
  // the API never confirms that an organisation id exists.
  if (!apiKey || apiKey.organizationId !== req.params.id) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  next();
};
