import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saveItems } from '../src/jobs/handlers/import-file.js'
import { importSummaryEmail } from '../src/mail/import-summary.js'
import { setup, signIn } from './helpers.js'

const item = (highlights) => ({
  url: 'https://example.org/a',
  title: 'A',
  savedAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  archived: false,
  read: false,
  highlights,
})

test('highlights come in with source import, once', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const first = saveItems(db, user, [item([{ text: 'one', note: 'n', createdAt: '2024-01-02T00:00:00.000Z' }])])
  assert.equal(first.highlights, 1)
  const again = saveItems(db, user, [item([{ text: 'one', note: 'n' }, { text: 'two', note: null }])])
  assert.equal(again.highlights, 1)
  const rows = db.prepare('SELECT text, source FROM highlights ORDER BY text').all()
  assert.deepEqual(rows, [
    { text: 'one', source: 'import' },
    { text: 'two', source: 'import' },
  ])
})

test('the email says how many highlights came in', () => {
  const { text } = importSummaryEmail({ service: 'instapaper', added: 3, duplicates: 0, overLimit: 0, highlights: 2 })
  assert.match(text, /2 highlights came in/)
})
