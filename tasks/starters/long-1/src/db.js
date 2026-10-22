import { readdirSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

const migrations = new URL('../migrations/', import.meta.url)

export function openDatabase(path = process.env.DATABASE_PATH ?? 'satchel.db') {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL')
  db.pragma('busy_timeout = 3000')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true })
  const files = readdirSync(migrations)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
  for (const file of files) {
    const version = Number(file.slice(0, 4))
    if (version <= current) continue
    db.transaction(() => {
      db.exec(readFileSync(new URL(file, migrations), 'utf8'))
      db.pragma(`user_version = ${version}`)
    })()
  }
}
