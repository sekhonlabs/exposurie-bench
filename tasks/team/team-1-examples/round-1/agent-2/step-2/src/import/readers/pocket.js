import { readCsv } from '../../lib/csv.js'

const isoFromSeconds = (s) => {
  const t = Number(s)
  return Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : new Date().toISOString()
}

// Pocket's export: time_added is Unix seconds, tags are split on |, and a
// status of archive means archived and read. A title that is blank, or only
// the link's address, comes in as null, and the fetch job fills it in.
export function read(text) {
  return readCsv(text).map((row) => {
    const archived = row.status === 'archive'
    const title = String(row.title ?? '').trim()
    return {
      url: row.url,
      title: title && title !== String(row.url ?? '').trim() ? title : null,
      savedAt: isoFromSeconds(row.time_added),
      tags: String(row.tags ?? '')
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean),
      archived,
      read: archived,
    }
  })
}
