import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { read } from '../src/import/readers/pocket.js'

const items = read(readFileSync(new URL('./fixtures/pocket.csv', import.meta.url), 'utf8'))

test("every row of Pocket's export becomes an item", () => {
  assert.equal(items.length, 8)
  assert.deepEqual(items[0], {
    url: 'https://www.sqlite.org/testing.html',
    title: 'How SQLite Is Tested',
    savedAt: '2019-01-03T11:00:00.000Z',
    tags: ['sqlite', 'testing'],
    archived: true,
    read: true,
  })
})

test('unread items are neither archived nor read', () => {
  for (const item of items.filter((i) => !i.archived)) assert.equal(item.read, false)
})

test('a title that is only the address comes in as null', () => {
  const [item] = read('title,url,time_added,tags,status\nhttps://example.org/x,https://example.org/x,1,,unread\n')
  assert.equal(item.title, null)
})
