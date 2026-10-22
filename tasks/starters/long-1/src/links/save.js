import { canSaveMore } from '../billing/limits.js'
import { enqueue } from '../jobs/queue.js'
import { ulid } from '../lib/ulid.js'
import { normalizeUrl } from '../lib/urls.js'
import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export function saveLink(db, user, { url, title = null }) {
  const normalized = normalizeUrl(url)
  if (!normalized) return { error: 'invalid' }
  if (!canSaveMore(db, user)) return { error: 'limit' }
  const link = db.transaction(() => {
    const row = query(db, 'save').get({
      id: ulid(),
      user_id: user.id,
      url: normalized,
      title: title?.trim() || null,
      now: new Date().toISOString(),
    })
    if (!row.fetched) enqueue(db, 'fetch_article', { linkId: row.id })
    return row
  })()
  return { link }
}
