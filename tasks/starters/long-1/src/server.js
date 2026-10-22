import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.js'
import { config } from './config.js'
import { openDatabase } from './db.js'
import { log } from './log.js'

const db = openDatabase()
const app = createApp({ db })
app.use('/css/*', serveStatic({ root: './public' }))
app.use('/icons/*', serveStatic({ root: './public' }))
app.get('/manifest.webmanifest', serveStatic({ path: './public/manifest.webmanifest' }))
app.get('/sw.js', serveStatic({ path: './public/sw.js' }))
app.get('/sw-cache.js', serveStatic({ path: './public/sw-cache.js' }))
app.get('/htmx.min.js', serveStatic({ path: './node_modules/htmx.org/dist/htmx.min.js' }))

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  log.info('listening', { port: config.port })
})

process.on('SIGTERM', () => {
  server.close(() => {
    db.close()
    process.exit(0)
  })
})
