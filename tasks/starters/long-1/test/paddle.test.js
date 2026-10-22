import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

const secret = 'pdl_ntfset_test_secret'
process.env.PADDLE_WEBHOOK_SECRET = secret

const { verifyPaddleSignature } = await import('../src/billing/signature.js')
const { paddleEvent } = await import('../src/jobs/handlers/paddle-event.js')
const { jobsOf, setup, signIn } = await import('./helpers.js')

const sign = (body, ts = Math.floor(Date.now() / 1000)) =>
  `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`

const event = (id, type, occurredAt, data) =>
  JSON.stringify({ event_id: id, event_type: type, occurred_at: occurredAt, data })

test('a good signature passes, and a changed body does not', () => {
  const body = event('evt_1', 'subscription.activated', '2026-09-01T10:00:00Z', {})
  assert.equal(verifyPaddleSignature(body, sign(body), secret), true)
  assert.equal(verifyPaddleSignature(`${body} `, sign(body), secret), false)
})

test('a signature more than five minutes old does not pass', () => {
  const body = event('evt_1', 'subscription.activated', '2026-09-01T10:00:00Z', {})
  const old = Math.floor(Date.now() / 1000) - 6 * 60
  assert.equal(verifyPaddleSignature(body, sign(body, old), secret), false)
})

test('a delivery that comes twice is recorded and queued once', async () => {
  const { app, db } = setup()
  const body = event('evt_2', 'subscription.activated', '2026-09-01T10:00:00Z', { id: 'sub_1' })
  for (let i = 0; i < 2; i += 1) {
    const res = await app.request('/webhooks/paddle', {
      method: 'POST',
      body,
      headers: { 'paddle-signature': sign(body) },
    })
    assert.equal(res.status, 200)
  }
  assert.equal(db.prepare('SELECT count(*) AS n FROM webhook_events').get().n, 1)
  assert.equal(jobsOf(db, 'paddle_event').length, 1)
})

test('an older event never undoes a newer one', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const record = db.prepare(
    'INSERT INTO webhook_events (id, type, occurred_at, payload, received_at) VALUES (?, ?, ?, ?, ?)',
  )
  const sub = (status) => ({
    id: 'sub_1',
    customer_id: 'ctm_1',
    status,
    custom_data: { user_id: user.id },
  })
  record.run(
    'evt_new',
    'subscription.activated',
    '2026-09-02T10:00:00Z',
    event('evt_new', 'subscription.activated', '2026-09-02T10:00:00Z', sub('active')),
    'now',
  )
  record.run(
    'evt_old',
    'subscription.canceled',
    '2026-09-01T10:00:00Z',
    event('evt_old', 'subscription.canceled', '2026-09-01T10:00:00Z', sub('canceled')),
    'now',
  )
  await paddleEvent({ eventId: 'evt_new' }, { db })
  await paddleEvent({ eventId: 'evt_old' }, { db })
  assert.equal(db.prepare('SELECT plan FROM users WHERE id = ?').get(user.id).plan, 'paid')
})
