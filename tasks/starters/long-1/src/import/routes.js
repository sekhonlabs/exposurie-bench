import { Hono } from 'hono'
import { requireUser } from '../auth/session.js'
import { importPage, importResult } from '../views/import.js'
import { layout } from '../views/layout.js'
import { fetchTitle as fetchPageTitle } from './fetch-title.js'
import { runImport } from './run.js'

export function importRoutes(db, { fetchTitle = fetchPageTitle } = {}) {
  const app = new Hono()

  app.get('/import', requireUser, (c) =>
    c.html(layout('Import', importPage(), { user: c.get('user') })),
  )

  app.post('/import', requireUser, async (c) => {
    const form = await c.req.parseBody()
    const text = form.file instanceof File ? await form.file.text() : String(form.links ?? '')
    const result = await runImport(db, c.get('user'), text, { fetchTitle })
    return c.html(importResult(result))
  })

  return app
}
