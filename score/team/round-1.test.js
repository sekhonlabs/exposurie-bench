// The gate after round 1 (part 13): round 1's merged code imports a Pocket
// export through the import_file job, as the contract says. Round 2 starts from
// this code in every condition, so it must work before round 2 runs. The same
// tests run again on round 2's merged work, to see that it kept working.

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { count, data, link, runImport, satchel, tagsOf } from './helpers.js'

const FIRST = 'https://www.sqlite.org/testing.html'

test('round-1 pocket: an export comes in through the import_file job', async () => {
  const s = await satchel()
  const { sent, path } = await runImport(s, 'pocket', data('pocket.csv'))
  assert.equal(count(s.db, 'links'), 8, 'every row of the export is a link')
  assert.deepEqual(tagsOf(s.db, FIRST), ['sqlite', 'testing'], "Pocket's tags, split on |")
  const first = link(s.db, FIRST)
  assert.ok(first.archived_at && first.read_at, 'archive means archived and read')
  assert.equal(String(first.saved_at).slice(0, 10), '2019-01-03', 'the date Pocket saved it')
  assert.equal(existsSync(path), false, 'the upload is deleted once the job is done')
  assert.equal(sent.length, 1, 'one summary email')
})

test('round-1 pocket: a second run adds nothing, and counts the duplicates', async () => {
  const s = await satchel()
  await runImport(s, 'pocket', data('pocket.csv'))
  const { sent } = await runImport(s, 'pocket', data('pocket.csv'))
  assert.equal(count(s.db, 'links'), 8)
  assert.match(sent.map((m) => m.text ?? '').join('\n'), /\b8\b/, 'the email counts the 8 already saved')
})

test('round-1 page: the import page offers Pocket', async () => {
  const { setup, signIn } = await import('../test/helpers.js')
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  const page = await (await request('/import')).text()
  assert.match(page, /Pocket/)
})
