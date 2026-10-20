import { readFileSync } from 'node:fs'

const cache = new Map()

// Statements are prepared once per database, so a test's in-memory database
// never reuses a statement prepared against another one.
export function query(db, name) {
  let byName = cache.get(db)
  if (!byName) {
    byName = new Map()
    cache.set(db, byName)
  }
  if (!byName.has(name)) {
    const text = readFileSync(new URL(`./queries/${name}.sql`, import.meta.url), 'utf8')
    byName.set(name, db.prepare(text))
  }
  return byName.get(name)
}
