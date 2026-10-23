const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 8080),
  logLevel: process.env.LOG_LEVEL === 'debug' ? ('debug' as const) : ('info' as const),
  unleashUrl: process.env.UNLEASH_URL ?? 'http://localhost:4242/api',
  unleashApiToken: process.env.UNLEASH_API_TOKEN ?? '',
  adminTokenHashes: list(process.env.ADMIN_TOKEN_HASHES),
  mailFrom: process.env.MAIL_FROM ?? 'Tidewell <no-reply@tidewell.example>',
  inviteBaseUrl: process.env.INVITE_BASE_URL ?? 'http://localhost:3000/invites',
  awsRegion: process.env.AWS_REGION ?? 'eu-west-1',
};
