import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.js'
import { openDatabase } from './db.js'

const db = openDatabase()
const app = createApp(db)
app.get('/htmx.min.js', serveStatic({ path: './node_modules/htmx.org/dist/htmx.min.js' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, () => {
  console.log(`commonplace listening on :${port}`)
})
