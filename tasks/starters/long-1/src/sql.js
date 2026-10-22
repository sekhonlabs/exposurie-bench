import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Prepared once per database and file. Outside production a changed file is
// prepared again, since node --watch restarts only when JavaScript changes.
const reload = process.env.NODE_ENV !== 'production'
const prepared = new WeakMap()

export function sql(db, url) {
  let byFile = prepared.get(db)
  if (!byFile) {
    byFile = new Map()
    prepared.set(db, byFile)
  }
  const path = fileURLToPath(url)
  const mtime = reload ? statSync(path).mtimeMs : 0
  const hit = byFile.get(path)
  if (hit && hit.mtime === mtime) return hit.statement
  const statement = db.prepare(readFileSync(path, 'utf8'))
  byFile.set(path, { statement, mtime })
  return statement
}
