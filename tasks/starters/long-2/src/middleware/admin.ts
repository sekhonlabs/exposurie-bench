import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../config';

/** Is this one of the staff tokens the support console uses? Only their hashes are configured. */
export function isStaffToken(token: string): boolean {
  const given = createHash('sha256').update(token).digest();
  return config.adminTokenHashes.some((hex) => {
    const want = Buffer.from(hex, 'hex');
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

/**
 * Tidewell's own staff only: the support console sends its token in
 * X-Admin-Token. Anyone else gets a 404, as if the route did not exist.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const token = req.header('x-admin-token');
  if (!token || !isStaffToken(token)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  next();
};
