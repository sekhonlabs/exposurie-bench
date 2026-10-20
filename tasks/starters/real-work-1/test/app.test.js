import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createApp } from '../src/app.js'
import { openDatabase } from '../src/db.js'

let app

beforeEach(() => {
  app = createApp(openDatabase(':memory:'))
})

const keep = (fields) =>
  app.request('/passages', { method: 'POST', body: new URLSearchParams(fields) })

test('a kept passage shows on the front page', async () => {
  const res = await keep({ body: 'Attention is the rarest form of generosity.', source: 'a letter' })
  assert.equal(res.status, 201)
  const page = await (await app.request('/')).text()
  assert.match(page, /rarest form of generosity/)
})

test('a passage needs its source', async () => {
  const res = await keep({ body: 'No source given.' })
  assert.equal(res.status, 400)
})

test('search finds a passage by a word in it', async () => {
  await keep({ body: 'Slow is smooth, and smooth is fast.', source: 'a notebook' })
  await keep({ body: 'Something else entirely.', source: 'a notebook' })
  const found = await (await app.request('/search?q=smooth')).text()
  assert.match(found, /smooth is fast/)
  assert.doesNotMatch(found, /else entirely/)
})

test('a quote in a search is not a syntax error', async () => {
  const res = await app.request(`/search?q=${encodeURIComponent('"don\'t')}`)
  assert.equal(res.status, 200)
})

test('health reads the database', async () => {
  const res = await app.request('/health')
  assert.equal(await res.text(), 'ok')
})
