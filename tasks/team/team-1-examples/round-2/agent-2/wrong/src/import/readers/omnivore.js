// Omnivore's export is a JSON array. Archived items come in archived and read,
// labels as tags, and the highlights as Omnivore gives them.
export function read(text) {
  return JSON.parse(text).map((item) => {
    const archived = item.state === 'Archived'
    return {
      url: item.url,
      title: item.title || null,
      savedAt: item.savedAt ?? new Date().toISOString(),
      tags: item.labels ?? [],
      archived,
      read: archived,
      highlights: item.highlights ?? [],
    }
  })
}
