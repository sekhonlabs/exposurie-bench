import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// Not monotonic within one millisecond; nothing here needs it to be.
export function ulid(now = Date.now()) {
  let time = ''
  for (let t = now, i = 0; i < 10; i += 1, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time
  let random = ''
  for (const byte of randomBytes(16)) random += ALPHABET[byte % 32]
  return time + random
}
