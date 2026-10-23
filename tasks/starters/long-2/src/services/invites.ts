import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db/client';
import { enqueue } from '../jobs/queue';

export const MAX_BULK = 500;
const BATCH = 50;
const VALID_DAYS = 7;

const normalise = (email: string) => email.trim().toLowerCase();
const looksLikeEmail = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

/** ENG-402: create the invites that don't exist yet, and one job per 50 to send them. */
export async function createInvites(organizationId: string, emails: string[], role: string) {
  const wanted = [...new Set(emails.map(normalise))].filter(looksLikeEmail);
  const existing = await prisma.invite.findMany({
    where: { organizationId, email: { in: wanted } },
    select: { email: true },
  });
  const have = new Set(existing.map((i) => i.email));
  const expiresAt = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);
  const created: { id: string; token: string }[] = [];
  for (const email of wanted.filter((e) => !have.has(e))) {
    const token = randomBytes(24).toString('base64url');
    const invite = await prisma.invite.create({
      data: { organizationId, email, role, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt },
      select: { id: true },
    });
    created.push({ id: invite.id, token });
  }
  for (let i = 0; i < created.length; i += BATCH) {
    await enqueue('send_invite_emails', { invites: created.slice(i, i + BATCH) });
  }
  return { invited: created.length, skipped: emails.length - created.length };
}
