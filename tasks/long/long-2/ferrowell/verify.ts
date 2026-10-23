import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

// One verifier for every provider that signs its webhooks with an HMAC.
// Each provider gives us its header name, how it lays out the signed
// string, and its secret.

type Provider = {
  name: string;
  header: string;
  signed: (t: string, raw: string) => string;
  secret: string;
};

type RawRequest = Request & { rawBody: Buffer };

const TOLERANCE_SECONDS = 300;

function parseHeader(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(',')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function equal(a: string, b: string) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyWebhook(provider: Provider): RequestHandler {
  return (req, res, next) => {
    const header = parseHeader(req.header(provider.header) ?? '');
    const raw = (req as RawRequest).rawBody.toString('utf8');
    const expected = createHmac('sha256', provider.secret).update(provider.signed(header.t, raw)).digest('hex');
    if (!header.v1 || !equal(expected, header.v1)) {
      res.status(401).json({ error: 'bad_signature' });
      return;
    }
    // Refuse anything old, so a captured request cannot be replayed later.
    const event = JSON.parse(raw);
    const sent = Date.parse(event.created_at ?? event.timestamp) / 1000;
    const age = Math.round(Date.now() / 1000 - sent);
    if (age > TOLERANCE_SECONDS) {
      res.status(401).json({ error: 'stale_timestamp', age });
      return;
    }
    res.locals.event = event;
    next();
  };
}

export const tidewell = verifyWebhook({
  name: 'tidewell',
  header: 'tidewell-signature',
  signed: (t, raw) => `${t}.${raw}`,
  secret: process.env.TIDEWELL_WEBHOOK_SECRET!,
});

export const ledgerly = verifyWebhook({
  name: 'ledgerly',
  header: 'ledgerly-signature',
  signed: (t, raw) => `${t}.${raw}`,
  secret: process.env.LEDGERLY_WEBHOOK_SECRET!,
});
