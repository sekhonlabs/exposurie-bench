import type { Job } from '@prisma/client';
import { purgeExpiredInvites } from './purgeExpiredInvites';
import { sendInviteEmails } from './sendInviteEmails';

export type Handler = (job: Job) => Promise<void>;

/** One handler for each kind of job. */
export const handlers: Record<string, Handler> = {
  send_invite_emails: sendInviteEmails,
  purge_expired_invites: purgeExpiredInvites,
};
