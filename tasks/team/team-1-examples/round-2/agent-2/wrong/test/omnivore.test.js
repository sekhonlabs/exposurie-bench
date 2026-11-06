import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { read } from '../src/import/readers/omnivore.js'

const items = read(readFileSync(new URL('./fixtures/omnivore.json', import.meta.url), 'utf8'))

test('every item becomes an item, labels as tags', () => {
  assert.equal(items.length, 5)
  assert.deepEqual(items[0].tags, ['web', 'essays'])
})

test('archived items come in read', () => {
  assert.ok(items.filter((i) => i.archived).every((i) => i.read))
})
