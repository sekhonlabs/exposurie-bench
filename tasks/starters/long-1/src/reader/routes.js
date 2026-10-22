import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { highlightsFor } from '../highlights/routes.js'
import { sql } from '../sql.js'
import { layout } from '../views/layout.js'
import { readerPage } from '../views/reader.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export function readerRoutes(db) {
  const app = new Hono()

  app.get('/read/:id', requireUser, (c) => {
    const user = c.get('user')
    const article = query(db, 'article').get({ id: c.req.param('id'), user_id: user.id })
    if (!article) return c.notFound()
    const highlights = highlightsFor(db, user, article.id)
    return c.html(layout(article.title, readerPage(article, highlights), { user }))
  })

  return app
}
