import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { countLinks, FREE_LINKS, isPaid } from '../billing/limits.js'
import { sql } from '../sql.js'
import { accountPage } from '../views/account.js'
import { layout } from '../views/layout.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export function accountRoutes(db) {
  const app = new Hono()

  app.get('/account', requireUser, (c) => {
    const user = c.get('user')
    const links = countLinks(db, user)
    return c.html(
      layout('Account', accountPage({ user, links, paid: isPaid(user), freeLinks: FREE_LINKS }), {
        user,
      }),
    )
  })

  app.post('/account/digest', requireUser, async (c) => {
    const on = (await c.req.parseBody()).digest === 'on'
    query(db, 'set-digest').run({ id: c.get('user').id, digest: on ? 1 : 0 })
    return c.redirect('/account')
  })

  return app
}
