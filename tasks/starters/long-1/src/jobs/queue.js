import { ulid } from '../lib/ulid.js'
import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export const MAX_ATTEMPTS = 5

export function enqueue(db, kind, payload = {}, { runAt = new Date() } = {}) {
  const id = ulid()
  query(db, 'enqueue').run({
    id,
    kind,
    payload: JSON.stringify(payload),
    run_at: runAt.toISOString(),
  })
  return id
}

export function claimNext(db, now = new Date()) {
  const row = query(db, 'claim').get({ now: now.toISOString() })
  return row ? { ...row, payload: JSON.parse(row.payload) } : null
}

export function complete(db, id, now = new Date()) {
  query(db, 'complete').run({ id, now: now.toISOString() })
}

// Backoff of 1, 2, 4 and 8 minutes; the fifth failure is final and keeps its error.
export function retryOrGiveUp(db, job, error, now = new Date()) {
  const gaveUp = job.attempts >= MAX_ATTEMPTS
  query(db, 'fail').run({
    id: job.id,
    error: String(error?.stack ?? error).slice(0, 2000),
    run_at: new Date(now.getTime() + 2 ** (job.attempts - 1) * 60_000).toISOString(),
    done_at: gaveUp ? now.toISOString() : null,
  })
  return gaveUp
}

export const pending = (db, kind) => query(db, 'pending').get({ kind })
