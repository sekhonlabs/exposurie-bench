import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCsv, readCsv } from '../src/lib/csv.js'

test('quoted fields keep their commas, line breaks and doubled quotes', () => {
  const text = 'a,b\r\n"one, two","say ""hi""\nthere"\r\n'
  assert.deepEqual(parseCsv(text), [
    ['a', 'b'],
    ['one, two', 'say "hi"\nthere'],
  ])
})

test('a byte order mark and blank lines are dropped', () => {
  assert.deepEqual(parseCsv('﻿x,y\n1,2\n\n'), [
    ['x', 'y'],
    ['1', '2'],
  ])
})

test('rows come back keyed by the header', () => {
  assert.deepEqual(readCsv('title,url\nHello,https://example.org/\n'), [
    { title: 'Hello', url: 'https://example.org/' },
  ])
})
