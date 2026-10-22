import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_SECONDS = 5 * 60

// Paddle-Signature: ts=<unix seconds>;h1=<hex HMAC-SHA256 of "<ts>:<raw body>">
export function verifyPaddleSignature(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false
  const fields = new Map(header.split(';').map((part) => part.split('=', 2)))
  const ts = Number(fields.get('ts'))
  const h1 = fields.get('h1')
  if (!Number.isInteger(ts) || !h1) return false
  if (Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest()
  const given = Buffer.from(h1, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
