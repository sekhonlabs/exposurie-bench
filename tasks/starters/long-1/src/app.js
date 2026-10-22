import { Hono } from 'hono'
import { accountRoutes } from './account/routes.js'
import { authRoutes } from './auth/routes.js'
import { currentUser } from './auth/session.js'
import { billingRoutes, webhookRoutes } from './billing/routes.js'
import { highlightRoutes } from './highlights/routes.js'
import { importRoutes } from './import/routes.js'
import { linkRoutes } from './links/routes.js'
import { log } from './log.js'
import { readerRoutes } from './reader/routes.js'
import { searchRoutes } from './search/routes.js'
import { tagRoutes } from './tags/routes.js'

export function createApp({ db, fetchTitle }) {
  const app = new Hono()

  app.use(async (c, next) => {
    const started = performance.now()
    await next()
    log.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
      user: c.get('user')?.id ?? null,
    })
  })

  app.get('/health', (c) => {
    db.prepare('SELECT 1').get()
    return c.text('ok')
  })

  app.route('/webhooks', webhookRoutes(db))

  app.use(currentUser(db))
  app.route('/', authRoutes(db))
  app.route('/', linkRoutes(db))
  app.route('/', readerRoutes(db))
  app.route('/', highlightRoutes(db))
  app.route('/', tagRoutes(db))
  app.route('/', searchRoutes(db))
  app.route('/', importRoutes(db, { fetchTitle }))
  app.route('/', billingRoutes())
  app.route('/', accountRoutes(db))

  app.onError((error, c) => {
    log.error('request failed', { method: c.req.method, path: c.req.path, error })
    return c.text('Something went wrong on our side.', 500)
  })

  return app
}
