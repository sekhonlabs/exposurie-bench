import { readFileSync, rmSync } from 'node:fs'
import { roomLeft } from '../../billing/limits.js'
import { chunk } from '../../lib/chunk.js'
import { ulid } from '../../lib/ulid.js'
import { normalizeUrl } from '../../lib/urls.js'
import { log } from '../../log.js'
import { sendImportSummary } from '../../mail/import-summary.js'
import { sql } from '../../sql.js'
import { cleanTag, tagLink } from '../../tags/tags.js'
import { enqueue, MAX_ATTEMPTS } from '../queue.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const BATCH = 500
const SERVICE = /^[a-z]+$/

export async function importFile({ userId, service, path }, { db, sendEmail, job }) {
  let finished = false
  try {
    if (!SERVICE.test(String(service))) throw new Error(`no reader for ${service}`)
    const { read } = await import(`../../import/readers/${service}.js`)
    const user = query(db, 'user-by-id').get({ id: userId })
    if (!user) throw new Error(`no user ${userId}`)
    const counts = saveItems(db, user, read(readFileSync(path, 'utf8')), service)
    await sendImportSummary(user, { service, ...counts }, { sendEmail })
    log.info('import finished', { user: user.id, service, ...counts })
    finished = true
  } finally {
    if (finished || (job?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS) rmSync(path, { force: true })
  }
}

// Highlights are kept with the service they came from.
export function saveItems(db, user, items, service = 'import') {
  let room = roomLeft(db, user)
  const counts = { added: 0, duplicates: 0, overLimit: 0 }
  const seen = new Set()
  const write = db.transaction((batch) => {
    for (const item of batch) {
      const url = normalizeUrl(item.url)
      if (!url || seen.has(url)) continue
      seen.add(url)
      if (room <= 0) {
        if (query(db, 'find-link').get({ user_id: user.id, url })) counts.duplicates += 1
        else counts.overLimit += 1
        continue
      }
      const savedAt = item.savedAt ?? new Date().toISOString()
      const row = query(db, 'import-link').get({
        id: ulid(),
        user_id: user.id,
        url,
        title: item.title ?? null,
        saved_at: savedAt,
        read_at: item.read ? savedAt : null,
        archived_at: item.archived ? savedAt : null,
      })
      if (!row) {
        counts.duplicates += 1
        continue
      }
      counts.added += 1
      room -= 1
      for (const name of item.tags ?? []) {
        const tag = cleanTag(name)
        if (tag) tagLink(db, user, row.id, tag)
      }
      for (const h of item.highlights ?? []) {
        if (!h.text) continue
        query(db, 'import-highlight').get({
          id: ulid(),
          link_id: row.id,
          user_id: user.id,
          text: h.text,
          note: h.note ?? null,
          created_at: savedAt,
          source: service,
        })
      }
      enqueue(db, 'fetch_article', { linkId: row.id })
    }
  })
  for (const batch of chunk(items, BATCH)) write.immediate(batch)
  return counts
}
