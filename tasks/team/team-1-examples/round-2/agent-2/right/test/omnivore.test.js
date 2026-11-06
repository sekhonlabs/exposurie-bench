import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { read } from '../src/import/readers/omnivore.js'

const items = read(readFileSync(new URL('./fixtures/omnivore.json', import.meta.url), 'utf8'))

test('every item becomes an item, labels as tags', () => {
  assert.equal(items.length, 5)
  assert.deepEqual(items[0].tags, ['web', 'essays'])
})

test('archived items are read, and so is anything read 90% or more', () => {
  const [item] = read(JSON.stringify([{ url: 'https://example.org/a', state: 'Succeeded', readingProgress: 95 }]))
  assert.equal(item.read, true)
  assert.equal(item.archived, false)
})

test('highlights keep their quote as text and their annotation as note', () => {
  assert.deepEqual(items[0].highlights[0], {
    text: 'A page that loads fast is a page that gets read.',
    note: 'Use this in the talk.',
    createdAt: '2024-03-20T21:04:51.000Z',
  })
})
