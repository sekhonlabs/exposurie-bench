export function inviteEmail(organization: string, link: string) {
  return [
    `You've been invited to join ${organization}.`,
    '',
    `Accept the invite: ${link}`,
    '',
    'The link works for 7 days.',
  ].join('\n');
}
