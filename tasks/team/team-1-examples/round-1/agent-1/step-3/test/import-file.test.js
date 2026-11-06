import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { importFile } from '../src/jobs/handlers/import-file.js'
import { jobsOf, setup, signIn } from './helpers.js'

const pocket = readFileSync(new URL('./fixtures/pocket.csv', import.meta.url), 'utf8')

function upload(text) {
  const path = join(mkdtempSync(join(tmpdir(), 'satchel-import-')), 'upload')
  writeFileSync(path, text)
  return path
}

async function run(db, user, path, attempts = 1) {
  const sent = []
  await importFile(
    { userId: user.id, service: 'pocket', path },
    { db, sendEmail: async (m) => sent.push(m), job: { id: 'job', attempts } },
  )
  return sent
}

test('a Pocket export comes in through the job, and its upload is deleted', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const path = upload(pocket)
  const sent = await run(db, user, path)
  assert.equal(db.prepare('SELECT count(*) AS n FROM links').get().n, 8)
  assert.equal(jobsOf(db, 'fetch_article').length, 8)
  assert.equal(existsSync(path), false)
  assert.equal(sent.length, 1)
})

test('running the same export again counts every link as a duplicate', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  await run(db, user, upload(pocket))
  const sent = await run(db, user, upload(pocket))
  assert.equal(db.prepare('SELECT count(*) AS n FROM links').get().n, 8)
  assert.match(sent[0].text, /8 were already saved/)
})

test('an imported link keeps the date Pocket saved it', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  await run(db, user, upload(pocket))
  const row = db
    .prepare('SELECT saved_at FROM links WHERE url = ?')
    .get('https://www.sqlite.org/testing.html')
  assert.equal(row.saved_at, '2019-01-03T11:00:00.000Z')
})

test('a failed attempt keeps the upload for the retry, and the last one deletes it', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const path = upload(pocket)
  const fail = (attempts) =>
    importFile(
      { userId: user.id, service: 'nope', path },
      { db, sendEmail: async () => {}, job: { id: 'job', attempts } },
    )
  await assert.rejects(fail(1))
  assert.equal(existsSync(path), true)
  await assert.rejects(fail(5))
  assert.equal(existsSync(path), false)
})
