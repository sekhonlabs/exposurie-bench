import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDatabase } from '../src/db.js'
import { claimNext, complete, enqueue, MAX_ATTEMPTS, retryOrGiveUp } from '../src/jobs/queue.js'

const at = (iso) => new Date(iso)

test('jobs are claimed oldest first, and only once they are due', () => {
  const db = openDatabase(':memory:')
  enqueue(db, 'later', {}, { runAt: at('2026-10-10T10:00:00Z') })
  enqueue(db, 'first', {}, { runAt: at('2026-10-10T08:00:00Z') })
  assert.equal(claimNext(db, at('2026-10-10T07:00:00Z')), null)
  assert.equal(claimNext(db, at('2026-10-10T11:00:00Z')).kind, 'first')
})

test('a claimed job is not claimed again while it runs', () => {
  const db = openDatabase(':memory:')
  enqueue(db, 'slow', {}, { runAt: at('2026-10-10T08:00:00Z') })
  const job = claimNext(db, at('2026-10-10T08:00:01Z'))
  assert.equal(claimNext(db, at('2026-10-10T08:05:00Z')), null)
  assert.equal(claimNext(db, at('2026-10-10T08:20:00Z')).id, job.id)
})

test('a finished job is never claimed again', () => {
  const db = openDatabase(':memory:')
  enqueue(db, 'once', { n: 1 }, { runAt: at('2026-10-10T08:00:00Z') })
  const job = claimNext(db, at('2026-10-10T08:00:01Z'))
  assert.deepEqual(job.payload, { n: 1 })
  complete(db, job.id)
  assert.equal(claimNext(db, at('2026-10-11T08:00:00Z')), null)
})

test('a failing job backs off, and the fifth failure is final', () => {
  const db = openDatabase(':memory:')
  enqueue(db, 'flaky', {}, { runAt: at('2026-10-10T08:00:00Z') })
  let now = at('2026-10-10T08:00:00Z')
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const job = claimNext(db, now)
    assert.equal(job.attempts, attempt)
    const gaveUp = retryOrGiveUp(db, job, new Error('boom'), now)
    assert.equal(gaveUp, attempt === MAX_ATTEMPTS)
    now = new Date(now.getTime() + 2 ** (attempt - 1) * 60_000 + 1000)
  }
  assert.equal(claimNext(db, at('2026-10-12T00:00:00Z')), null)
  assert.match(db.prepare('SELECT last_error FROM jobs').get().last_error, /boom/)
})
