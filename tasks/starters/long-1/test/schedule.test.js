import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openDatabase } from '../src/db.js'
import { nextDigestTime, scheduleFirstDigest } from '../src/jobs/schedule.js'

const next = (iso) => nextDigestTime(new Date(iso)).toISOString()

test('Saturday at 07:59 in Lisbon goes out at 08:00 the same day', () => {
  assert.equal(next('2026-08-29T06:59:00Z'), '2026-08-29T07:00:00.000Z')
})

test('Saturday at 08:01 waits a week', () => {
  assert.equal(next('2026-08-29T07:01:00Z'), '2026-09-05T07:00:00.000Z')
})

test('the week the clocks go back, it is still 08:00 in Lisbon', () => {
  assert.equal(next('2026-10-24T07:30:00Z'), '2026-10-31T08:00:00.000Z')
})

test('the first digest is scheduled once', () => {
  const db = openDatabase(':memory:')
  assert.ok(scheduleFirstDigest(db))
  assert.equal(scheduleFirstDigest(db), null)
})
