import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { sql } from '../sql.js'
import { layout } from '../views/layout.js'
import { linkItem, linksPage, overLimit } from '../views/links.js'
import { saveLink } from './save.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const PAGE = 50
const VIEWS = { '/': 'unread', '/done': 'read', '/archive': 'archived' }
const TITLES = { unread: 'Unread', read: 'Done', archived: 'Archive' }

export function linkRoutes(db) {
  const app = new Hono()

  for (const [path, view] of Object.entries(VIEWS)) {
    app.get(path, requireUser, (c) => {
      const page = Math.max(1, Number(c.req.query('page')) || 1)
      const links = query(db, 'list').all({
        user_id: c.get('user').id,
        view,
        limit: PAGE + 1,
        offset: (page - 1) * PAGE,
      })
      const more = links.length > PAGE
      return c.html(
        layout(TITLES[view], linksPage({ view, links: links.slice(0, PAGE), page, more }), {
          user: c.get('user'),
        }),
      )
    })
  }

  app.post('/links', requireUser, async (c) => {
    const form = await c.req.parseBody()
    const result = saveLink(db, c.get('user'), { url: form.url, title: form.title })
    if (result.error === 'invalid') return c.text('That is not a link Satchel can save.', 422)
    if (result.error === 'limit') return c.html(overLimit(), 402)
    return c.html(linkItem({ ...result.link, tags: null }), 201)
  })

  for (const state of ['read', 'unread', 'archived']) {
    app.post(`/links/:id/${state}`, requireUser, (c) => {
      const row = query(db, 'set-state').get({
        id: c.req.param('id'),
        user_id: c.get('user').id,
        state,
        now: new Date().toISOString(),
      })
      return row ? c.body(null, 200) : c.notFound()
    })
  }

  app.delete('/links/:id', requireUser, (c) => {
    query(db, 'delete').run({ id: c.req.param('id'), user_id: c.get('user').id })
    return c.body(null, 200)
  })

  return app
}
