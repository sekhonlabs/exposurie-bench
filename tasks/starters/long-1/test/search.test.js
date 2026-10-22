import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ulid } from '../src/lib/ulid.js'
import { setup, signIn } from './helpers.js'

function addArticle(db, user, { url, title, text, archived = false }) {
  const id = ulid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO links (id, user_id, url, title, saved_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, user.id, url, title, now, archived ? now : null)
  db.prepare(
    'INSERT INTO articles (link_id, title, text, word_count, fetched_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, title, text, text.split(/\s+/).length, now)
  return id
}

test('a match in the title ranks above a match in the text', async () => {
  const { app, db } = setup()
  const { request, user } = await signIn(app, db)
  addArticle(db, user, {
    url: 'https://example.org/1',
    title: 'Gardening notes',
    text: 'Some words about compost.',
  })
  addArticle(db, user, {
    url: 'https://example.org/2',
    title: 'Compost, properly',
    text: 'Leaves and patience.',
  })
  const html = await (
    await request('/search?q=compost', { headers: { 'hx-request': 'true' } })
  ).text()
  assert.ok(html.indexOf('Compost, properly') < html.indexOf('Gardening notes'))
})

test('archived links are left out', async () => {
  const { app, db } = setup()
  const { request, user } = await signIn(app, db)
  addArticle(db, user, {
    url: 'https://example.org/old',
    title: 'Old news',
    text: 'Tidal energy.',
    archived: true,
  })
  const html = await (await request('/search?q=tidal')).text()
  assert.doesNotMatch(html, /Old news/)
})

test("one account never sees another's results", async () => {
  const { app, db } = setup()
  const { user: other } = await signIn(app, db, 'other@example.com')
  const { request } = await signIn(app, db, 'reader@example.com')
  addArticle(db, other, {
    url: 'https://example.org/theirs',
    title: 'Theirs',
    text: 'Private lighthouse.',
  })
  assert.doesNotMatch(await (await request('/search?q=lighthouse')).text(), /Theirs/)
})

test('a quote in a search is not a syntax error', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  const res = await request(`/search?q=${encodeURIComponent(`"don't`)}`)
  assert.equal(res.status, 200)
})

test('page text in a snippet is escaped', async () => {
  const { app, db } = setup()
  const { request, user } = await signIn(app, db)
  addArticle(db, user, {
    url: 'https://example.org/x',
    title: 'Markup',
    text: 'Write <script> tags carefully.',
  })
  const html = await (await request('/search?q=carefully')).text()
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /<mark>carefully<\/mark>/)
})
