import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { requireUser } from '../auth/session.js'
import { config } from '../config.js'
import { enqueue } from '../jobs/queue.js'
import { ulid } from '../lib/ulid.js'
import { importPage, importResult } from '../views/import.js'
import { layout } from '../views/layout.js'
import { fetchTitle as fetchPageTitle } from './fetch-title.js'
import { runImport } from './run.js'

const SERVICE = /^[a-z]+$/

export function importRoutes(db, { fetchTitle = fetchPageTitle } = {}) {
  const app = new Hono()

  app.get('/import', requireUser, (c) =>
    c.html(layout('Import', importPage(), { user: c.get('user') })),
  )

  // A service's export goes to disk and into a job; a pasted list of links
  // still runs inside the request.
  app.post('/import', requireUser, async (c) => {
    const form = await c.req.parseBody()
    const service = String(form.service ?? '')
    if (form.file instanceof File && form.file.size > 0 && SERVICE.test(service)) {
      const dir = resolve(config.dataDir, 'imports')
      mkdirSync(dir, { recursive: true })
      const path = join(dir, ulid())
      writeFileSync(path, Buffer.from(await form.file.arrayBuffer()))
      enqueue(db, 'import_file', { userId: c.get('user').id, service, path })
      return c.html(html`<p class="notice">Your import has started. We'll email you when it's done.</p>`)
    }
    const text = form.file instanceof File ? await form.file.text() : String(form.links ?? '')
    const result = await runImport(db, c.get('user'), text, { fetchTitle })
    return c.html(importResult(result))
  })

  return app
}
