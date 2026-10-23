import { prisma } from '../../db/client';
import { log } from '../../log';

/** How long an expired invite that was never accepted is kept before the nightly purge deletes it. */
export const KEEP_EXPIRED_DAYS = 7;

export async function purgeExpiredInvites() {
  const before = new Date(Date.now() - KEEP_EXPIRED_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.invite.deleteMany({
    where: { acceptedAt: null, expiresAt: { lt: before } },
  });
  log.info('expired invites purged', { count, before: before.toISOString() });
}
