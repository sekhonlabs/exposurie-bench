import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { sql } from '../sql.js'
import { layout } from '../views/layout.js'
import { searchPage, searchResults } from '../views/search.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

// FTS5 reads quotes and operators as syntax, so each word is quoted on its
// own: a stray apostrophe in a search must not become a query error.
export const ftsTerms = (q) =>
  q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `"${w.replaceAll('"', '""')}"`)
    .join(' ')

export function searchRoutes(db) {
  const app = new Hono()

  app.get('/search', requireUser, (c) => {
    const q = (c.req.query('q') ?? '').trim()
    const terms = ftsTerms(q)
    const results = terms ? query(db, 'search').all({ terms, user_id: c.get('user').id }) : []
    if (c.req.header('hx-request')) return c.html(searchResults(results, q))
    return c.html(layout('Search', searchPage(q, results), { user: c.get('user') }))
  })

  return app
}
