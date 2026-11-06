// Part 13's hidden tests share this. score/team.mjs copies the folder, with
// data/ beside it, into a merged copy of Satchel as hidden-tests/, runs it with
// `node --test`, and takes it out again. Nothing here is the agents' to see.
//
// Every test drives the merged code through the contract round 1 was given:
// the import_file job's handler, called the way Satchel's worker calls it,
// with { userId, service, path } and { db, sendEmail, job }.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const data = (name) => readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8')
export const expect = JSON.parse(data('expect.json'))

/** A fresh database with one paid user, so the free plan never decides a test. */
export async function satchel() {
  const { openDatabase } = await import('../src/db.js')
  const { handlers } = await import('../src/jobs/handlers/index.js')
  const db = openDatabase(':memory:')
  const userId = '01HIDDENTESTUSER000000000'
  db.prepare("INSERT INTO users (id, email, created_at, plan) VALUES (?, ?, ?, 'paid')").run(
    userId,
    'reader@example.com',
    new Date().toISOString(),
  )
  return { db, handlers, userId }
}

/** One import, through the job's handler, and the emails it sent. */
export async function runImport({ db, handlers, userId }, service, text) {
  const handler = handlers.import_file
  if (typeof handler !== 'function') throw new Error('there is no import_file handler')
  const path = join(mkdtempSync(join(tmpdir(), 'team-hidden-')), 'upload')
  writeFileSync(path, text)
  const sent = []
  await handler(
    { userId, service, path },
    {
      db,
      sendEmail: async (m) => {
        sent.push(m)
        return {}
      },
      job: { id: 'hidden', attempts: 1 },
    },
  )
  return { sent, path }
}

export const count = (db, table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n
export const link = (db, url) => db.prepare('SELECT * FROM links WHERE url = ?').get(url)
export const tagsOf = (db, url) =>
  db
    .prepare(
      'SELECT t.name FROM tags t JOIN link_tags lt ON lt.tag_id = t.id JOIN links l ON l.id = lt.link_id WHERE l.url = ? ORDER BY t.name',
    )
    .all(url)
    .map((r) => r.name)
export const allTags = (db) => db.prepare('SELECT name FROM tags ORDER BY name').all().map((r) => r.name)
export const highlights = (db) => db.prepare('SELECT * FROM highlights ORDER BY text').all()
export const textOf = (sent) => sent.map((m) => `${m.subject ?? ''}\n${m.text ?? ''}`).join('\n')
