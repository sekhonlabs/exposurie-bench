import { Hono } from 'hono'
import { ulid } from 'ulid'
import { query } from './sql.js'
import { layout, passageItem, passageList } from './views.js'

export function createApp(db) {
  const app = new Hono()

  app.get('/', (c) => {
    const passages = query(db, 'recent-passages').all({ limit: 30 })
    return c.html(layout('commonplace', passageList(passages)))
  })

  app.post('/passages', async (c) => {
    const form = await c.req.parseBody()
    const body = String(form.body ?? '').trim()
    const source = String(form.source ?? '').trim()
    if (!body || !source) return c.text('A passage needs its text and where it came from.', 400)
    const page = String(form.page ?? '').trim() || null
    const passage = query(db, 'add-passage').get({ id: ulid(), body, source, page })
    return c.html(passageItem(passage), 201)
  })

  app.get('/search', (c) => {
    const q = (c.req.query('q') ?? '').trim()
    // FTS5 reads quotes and operators as syntax; each word is quoted so a
    // stray apostrophe in a search can't turn into a query error.
    const terms = q.split(/\s+/).filter(Boolean).map((w) => `"${w.replaceAll('"', '""')}"`).join(' ')
    const passages = terms ? query(db, 'search-passages').all({ terms }) : []
    return c.html(passageList(passages))
  })

  app.get('/health', (c) => {
    db.prepare('SELECT 1').get()
    return c.text('ok')
  })

  return app
}
