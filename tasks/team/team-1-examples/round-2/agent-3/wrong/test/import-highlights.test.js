import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saveItems } from '../src/jobs/handlers/import-file.js'
import { setup, signIn } from './helpers.js'

test('highlights come in with the service they came from', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  saveItems(
    db,
    user,
    [{ url: 'https://example.org/a', title: 'A', savedAt: '2024-01-01T00:00:00.000Z', tags: [], highlights: [{ text: 'one' }] }],
    'instapaper',
  )
  assert.deepEqual(db.prepare('SELECT text, source FROM highlights').all(), [{ text: 'one', source: 'instapaper' }])
})
