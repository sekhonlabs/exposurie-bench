export const config = {
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET ?? 'development only',
  mailFrom: process.env.MAIL_FROM ?? 'Satchel <hello@localhost>',
  postmarkToken: process.env.POSTMARK_TOKEN ?? null,
  paddle: {
    env: process.env.PADDLE_ENV ?? 'sandbox',
    apiKey: process.env.PADDLE_API_KEY ?? null,
    clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null,
    priceId: process.env.PADDLE_PRICE_ID ?? null,
    webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? null,
  },
}

if (process.env.NODE_ENV === 'production') {
  for (const name of [
    'BASE_URL',
    'SESSION_SECRET',
    'MAIL_FROM',
    'POSTMARK_TOKEN',
    'PADDLE_WEBHOOK_SECRET',
  ]) {
    if (!process.env[name]) throw new Error(`${name} must be set in production`)
  }
}
