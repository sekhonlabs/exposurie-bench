import { readCsv } from '../../lib/csv.js'

// Unread and Archive are Instapaper's states, not folders: Archive means
// archived and read, and Unread means neither. Every other folder becomes a
// folder:<name> tag.
const STATES = new Set(['Unread', 'Archive'])

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

export function read(text) {
  return readCsv(text).map((row) => {
    const savedAt = isoFromSeconds(row.Timestamp)
    const folder = String(row.Folder ?? '').trim()
    const archived = folder === 'Archive'
    const selection = String(row.Selection ?? '').trim()
    return {
      url: row.URL,
      title: String(row.Title ?? '').trim() || null,
      savedAt,
      tags: [...tagsOf(row.Tags), ...(folder && !STATES.has(folder) ? [`folder:${folder}`] : [])],
      archived,
      read: archived,
      highlights: selection ? [{ text: selection, note: null, createdAt: savedAt }] : [],
    }
  })
}
