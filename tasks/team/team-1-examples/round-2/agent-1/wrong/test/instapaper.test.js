import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { read } from '../src/import/readers/instapaper.js'

const items = read(readFileSync(new URL('./fixtures/instapaper.csv', import.meta.url), 'utf8'))

test('each folder comes in as a tag', () => {
  assert.ok(items.flatMap((i) => i.tags).includes('Long reads'))
})

test('the Archive folder marks an item archived', () => {
  assert.ok(items.some((i) => i.archived))
})
