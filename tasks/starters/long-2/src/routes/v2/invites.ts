import { Router } from 'express';
import { isEnabled } from '../../flags';
import { requireOrgAccess } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rateLimit';
import { MAX_BULK, createInvites } from '../../services/invites';

export const invites = Router({ mergeParams: true });

invites.use(requireOrgAccess, rateLimit);

/** ENG-402: invite up to 500 people at once. It shipped dark, behind its flag. */
invites.post('/bulk', async (req, res) => {
  const organizationId: string = res.locals.organizationId;
  if (!isEnabled('eng-402-bulk-invite', organizationId)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const emails: unknown = req.body?.emails;
  const role = req.body?.role === 'owner' ? 'owner' : 'member';
  if (
    !Array.isArray(emails) ||
    emails.length === 0 ||
    emails.length > MAX_BULK ||
    !emails.every((e) => typeof e === 'string')
  ) {
    res.status(422).json({ error: 'emails_invalid', max: MAX_BULK });
    return;
  }
  res.status(202).json(await createInvites(organizationId, emails, role));
});
