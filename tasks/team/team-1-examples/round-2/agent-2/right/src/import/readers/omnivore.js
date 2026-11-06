// Omnivore's export is a JSON array. Archived means archived and read, and an
// item read 90% or more counts as read, archived or not. Its labels become tags,
// and its highlights come in with their annotations as notes.
export function read(text) {
  const items = JSON.parse(text)
  return (Array.isArray(items) ? items : []).map((item) => {
    const archived = item.state === 'Archived'
    return {
      url: item.url,
      title: String(item.title ?? '').trim() || null,
      savedAt: item.savedAt ?? new Date().toISOString(),
      tags: (item.labels ?? []).map(String),
      archived,
      read: archived || Number(item.readingProgress ?? 0) >= 90,
      highlights: (item.highlights ?? [])
        .filter((h) => String(h.quote ?? '').trim())
        .map((h) => ({ text: h.quote.trim(), note: h.annotation ?? null, createdAt: h.createdAt ?? null })),
    }
  })
}
