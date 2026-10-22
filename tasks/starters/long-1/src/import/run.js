import { roomLeft } from '../billing/limits.js'
import { enqueue } from '../jobs/queue.js'
import { chunk } from '../lib/chunk.js'
import { ulid } from '../lib/ulid.js'
import { normalizeUrl } from '../lib/urls.js'
import { log } from '../log.js'
import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const CHUNK = 50

export function parseLinks(text) {
  const urls = new Set()
  for (const line of String(text).split(/\r?\n/)) {
    const url = normalizeUrl(line)
    if (url) urls.add(url)
  }
  return [...urls]
}

// Titles are fetched before any transaction opens: a write lock held across
// network calls is what made the worker and the web process fail with
// "database is locked". Each chunk takes the lock up front and holds it for
// milliseconds.
export async function runImport(db, user, text, { fetchTitle }) {
  const urls = parseLinks(text)
  const take = urls.slice(0, roomLeft(db, user))
  const links = []
  let untitled = 0
  for (const url of take) {
    const title = await fetchTitle(url).catch(() => null)
    if (!title) untitled += 1
    links.push({ url, title: title ?? url })
  }

  let saved = 0
  const write = db.transaction((batch) => {
    for (const link of batch) {
      const row = query(db, 'insert-link').get({
        id: ulid(),
        user_id: user.id,
        url: link.url,
        title: link.title,
        now: new Date().toISOString(),
      })
      if (!row) continue
      saved += 1
      enqueue(db, 'fetch_article', { linkId: row.id })
    }
  })
  for (const batch of chunk(links, CHUNK)) write.immediate(batch)

  const result = {
    saved,
    duplicates: take.length - saved,
    overLimit: urls.length - take.length,
    untitled,
  }
  log.info('import finished', { user: user.id, ...result })
  return result
}
