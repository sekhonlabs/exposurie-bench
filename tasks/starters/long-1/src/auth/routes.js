import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { enqueue } from '../jobs/queue.js'
import { ulid } from '../lib/ulid.js'
import { sql } from '../sql.js'
import { layout } from '../views/layout.js'
import { checkYourEmail, linkExpired, signInPage } from '../views/sign-in.js'
import { endSession, startSession } from './session.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export const LINK_MINUTES = 15
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function authRoutes(db) {
  const app = new Hono()

  app.get('/sign-in', (c) => c.html(layout('Sign in', signInPage(), { user: null })))

  app.post('/sign-in', async (c) => {
    const form = await c.req.parseBody()
    const email = String(form.email ?? '').trim()
    if (!EMAIL.test(email)) {
      return c.html(
        layout(
          'Sign in',
          signInPage({ email, error: 'That does not look like an email address.' }),
          { user: null },
        ),
        400,
      )
    }
    const now = new Date()
    const user = query(db, 'find-or-create-user').get({ id: ulid(), email, now: now.toISOString() })
    const token = randomBytes(32).toString('base64url')
    db.transaction(() => {
      query(db, 'create-link').run({
        token,
        user_id: user.id,
        now: now.toISOString(),
        expires_at: new Date(now.getTime() + LINK_MINUTES * 60_000).toISOString(),
      })
      enqueue(db, 'send_magic_link', { email: user.email, token })
    })()
    return c.html(layout('Check your email', checkYourEmail(user.email), { user: null }))
  })

  app.get('/auth/:token', async (c) => {
    const row = query(db, 'consume-link').get({
      token: c.req.param('token'),
      now: new Date().toISOString(),
    })
    if (!row) return c.html(layout('Link expired', linkExpired(), { user: null }), 410)
    await startSession(c, db, row.user_id)
    return c.redirect('/')
  })

  app.post('/sign-out', async (c) => {
    await endSession(c, db)
    return c.redirect('/sign-in')
  })

  return app
}
