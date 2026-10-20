import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

export function openDatabase(path = process.env.DATABASE_PATH ?? 'commonplace.db') {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  db.exec(schema)
  return db
}
