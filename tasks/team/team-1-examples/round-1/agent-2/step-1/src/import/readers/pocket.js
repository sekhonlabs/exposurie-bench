import { readCsv } from '../../lib/csv.js'

const isoFromSeconds = (s) => {
  const t = Number(s)
  return Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : new Date().toISOString()
}

// Pocket's export: time_added is Unix seconds, tags are split on |, and a
// status of archive means archived and read.
export function read(text) {
  return readCsv(text).map((row) => {
    const archived = row.status === 'archive'
    return {
      url: row.url,
      title: row.title || null,
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
