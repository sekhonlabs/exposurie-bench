import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { ulid } from '../lib/ulid.js'
import { sql } from '../sql.js'
import { highlightItem } from '../views/reader.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export const highlightsFor = (db, user, linkId) =>
  query(db, 'for-link').all({ link_id: linkId, user_id: user.id })

export function highlightRoutes(db) {
  const app = new Hono()

  app.post('/read/:id/highlights', requireUser, async (c) => {
    const form = await c.req.parseBody()
    const text = String(form.text ?? '').trim()
    if (!text) return c.text('A highlight needs its text.', 422)
    const highlight = query(db, 'add').get({
      id: ulid(),
      link_id: c.req.param('id'),
      user_id: c.get('user').id,
      text,
      note: String(form.note ?? '').trim() || null,
      now: new Date().toISOString(),
    })
    return highlight ? c.html(highlightItem(highlight), 201) : c.notFound()
  })

  app.delete('/highlights/:id', requireUser, (c) => {
    query(db, 'delete').run({ id: c.req.param('id'), user_id: c.get('user').id })
    return c.body(null, 200)
  })

  return app
}
