import { readCsv } from '../../lib/csv.js'

const isoFromSeconds = (s) => {
  const t = Number(s)
  return Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : new Date().toISOString()
}

const tagsOf = (cell) => {
  try {
    const tags = JSON.parse(cell || '[]')
    return Array.isArray(tags) ? tags.map(String) : []
  } catch {
    return []
  }
}

// Instapaper's export: each folder comes in as a tag, and its Selection is kept
// on the item for the highlights work.
export function read(text) {
  return readCsv(text).map((row) => {
    const folder = String(row.Folder ?? '').trim()
    return {
      url: row.URL,
      title: String(row.Title ?? '').trim() || null,
      savedAt: isoFromSeconds(row.Timestamp),
      tags: [...tagsOf(row.Tags), ...(folder ? [folder] : [])],
      archived: folder === 'Archive',
      read: false,
      highlights: row.Selection ? [{ quote: row.Selection }] : [],
    }
  })
}
