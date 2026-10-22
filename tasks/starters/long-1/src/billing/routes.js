import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { config } from '../config.js'
import { enqueue } from '../jobs/queue.js'
import { log } from '../log.js'
import { sql } from '../sql.js'
import { paymentStatus, upgradePage } from '../views/billing.js'
import { layout } from '../views/layout.js'
import { isPaid } from './limits.js'
import { portalUrl } from './paddle.js'
import { verifyPaddleSignature } from './signature.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export function billingRoutes() {
  const app = new Hono()

  app.get('/upgrade', requireUser, (c) => {
    const user = c.get('user')
    if (isPaid(user)) return c.redirect('/account')
    return c.html(layout('Upgrade', upgradePage({ user, paddle: config.paddle }), { user }))
  })

  app.get('/billing/status', requireUser, (c) => c.html(paymentStatus(isPaid(c.get('user')))))

  app.post('/billing/portal', requireUser, async (c) => {
    const url = await portalUrl(c.get('user'))
    return url ? c.redirect(url) : c.redirect('/upgrade')
  })

  return app
}

// Webhooks arrive at least once and in any order. Each is recorded once by its
// event id, and only a new one becomes a job, so Paddle never waits on our writes.
export function webhookRoutes(db) {
  const app = new Hono()

  app.post('/paddle', async (c) => {
    const raw = await c.req.text()
    if (
      !verifyPaddleSignature(raw, c.req.header('paddle-signature'), config.paddle.webhookSecret)
    ) {
      log.warn('paddle webhook rejected', { reason: 'signature' })
      return c.text('bad signature', 400)
    }
    const event = JSON.parse(raw)
    db.transaction(() => {
      const added = query(db, 'record-event').run({
        id: event.event_id,
        type: event.event_type,
        occurred_at: event.occurred_at,
        payload: raw,
        now: new Date().toISOString(),
      }).changes
      if (added) enqueue(db, 'paddle_event', { eventId: event.event_id })
    })()
    return c.text('ok')
  })

  return app
}
