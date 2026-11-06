import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { read } from '../src/import/readers/instapaper.js'

const items = read(readFileSync(new URL('./fixtures/instapaper.csv', import.meta.url), 'utf8'))

test('folders become folder tags, but Unread and Archive do not', () => {
  const tags = items.flatMap((i) => i.tags)
  assert.ok(tags.includes('folder:Long reads'))
  assert.ok(!tags.includes('folder:Unread'))
  assert.ok(!tags.includes('folder:Archive'))
})

test('Archive means archived and read', () => {
  for (const item of items) assert.equal(item.read, item.archived)
})

test('a Selection comes in as a highlight', () => {
  const withSelection = items.filter((i) => i.highlights.length)
  assert.ok(withSelection.length > 0)
  for (const item of withSelection) assert.equal(typeof item.highlights[0].text, 'string')
})
