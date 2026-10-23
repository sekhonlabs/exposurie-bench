import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../../db/client';
import { enqueue } from '../../../jobs/queue';

export const adminOrganizations = Router();

/** What support needs to see about an organisation: its API keys by prefix, and its counts. */
adminOrganizations.get('/:id', async (req, res) => {
  const org = await prisma.organization.findUnique({
    where: { id: req.params.id },
    include: {
      apiKeys: { select: { prefix: true, createdAt: true } },
      _count: { select: { projects: true, invites: true } },
    },
  });
  if (!org) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({
    id: org.id,
    name: org.name,
    billing_email: org.billingEmail,
    created_at: org.createdAt.toISOString(),
    api_keys: org.apiKeys.map((k) => ({ prefix: k.prefix, created_at: k.createdAt.toISOString() })),
    projects: org._count.projects,
    invites: org._count.invites,
  });
});

/**
 * Issue new links for an organisation's open invites and email them again.
 * Only a hash of each token is kept, so every invite gets a new token, and the
 * old link stops working.
 */
adminOrganizations.post('/:id/invites/reissue', async (req, res) => {
  const open = await prisma.invite.findMany({
    where: { organizationId: req.params.id, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  const issued: { id: string; token: string }[] = [];
  for (const { id } of open) {
    const token = randomBytes(24).toString('base64url');
    await prisma.invite.update({
      where: { id },
      data: { tokenHash: createHash('sha256').update(token).digest('hex'), sentAt: null },
    });
    issued.push({ id, token });
  }
  for (let i = 0; i < issued.length; i += 50) {
    await enqueue('send_invite_emails', { invites: issued.slice(i, i + 50) });
  }
  res.status(202).json({ reissued: issued.length });
});
