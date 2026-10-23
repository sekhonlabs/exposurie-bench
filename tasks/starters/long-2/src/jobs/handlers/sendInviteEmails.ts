import type { Job } from '@prisma/client';
import { config } from '../../config';
import { prisma } from '../../db/client';
import { log } from '../../log';
import { inviteEmail } from '../../mail/invite';
import { sendEmail } from '../../mail/ses';

type Payload = { invites: { id: string; token: string }[] };

/** ENG-402: send one batch of invite emails, up to 50, one SES call each. */
export async function sendInviteEmails(job: Job) {
  const { invites } = job.payload as Payload;
  const tokens = new Map(invites.map((i) => [i.id, i.token]));
  const rows = await prisma.invite.findMany({
    where: { id: { in: invites.map((i) => i.id) } },
    include: { organization: { select: { name: true } } },
  });
  for (const invite of rows) {
    await sendEmail({
      to: invite.email,
      subject: `You're invited to join ${invite.organization.name}`,
      text: inviteEmail(invite.organization.name, `${config.inviteBaseUrl}/${tokens.get(invite.id)}`),
    });
    await prisma.invite.update({ where: { id: invite.id }, data: { sentAt: new Date() } });
  }
  log.info('invites sent', { job: job.id, count: rows.length });
}
