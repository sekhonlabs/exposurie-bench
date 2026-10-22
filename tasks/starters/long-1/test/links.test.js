import assert from 'node:assert/strict'
import { test } from 'node:test'
import { form, jobsOf, setup, signIn } from './helpers.js'

test('a saved link shows on the unread page, and its page gets fetched', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  const res = await request(
    '/links',
    form({ url: 'https://example.org/essay?utm_source=feed#notes' }),
  )
  assert.equal(res.status, 201)
  assert.equal(db.prepare('SELECT url FROM links').get().url, 'https://example.org/essay')
  assert.match(await (await request('/')).text(), /example\.org\/essay/)
  assert.equal(jobsOf(db, 'fetch_article').length, 1)
})

test('something that is not a link is refused', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  assert.equal((await request('/links', form({ url: 'javascript:alert(1)' }))).status, 422)
})

test('the free plan keeps 100 links', async () => {
  const { app, db } = setup()
  const { request, user } = await signIn(app, db)
  const insert = db.prepare('INSERT INTO links (id, user_id, url, saved_at) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < 100; i += 1)
    insert.run(`L${i}`, user.id, `https://example.org/${i}`, new Date().toISOString())
  const res = await request('/links', form({ url: 'https://example.org/one-more' }))
  assert.equal(res.status, 402)
  assert.match(await res.text(), /free plan keeps 100 links/)
})

test('a paid account has no limit', async () => {
  const { app, db } = setup()
  const { request, user } = await signIn(app, db)
  db.prepare(`UPDATE users SET plan = 'paid' WHERE id = ?`).run(user.id)
  const insert = db.prepare('INSERT INTO links (id, user_id, url, saved_at) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < 100; i += 1)
    insert.run(`L${i}`, user.id, `https://example.org/${i}`, new Date().toISOString())
  assert.equal((await request('/links', form({ url: 'https://example.org/one-more' }))).status, 201)
})

test('done and archive take a link off the unread page', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  await request('/links', form({ url: 'https://example.org/a' }))
  await request('/links', form({ url: 'https://example.org/b' }))
  const [a, b] = db.prepare('SELECT id FROM links ORDER BY url').all()
  await request(`/links/${a.id}/read`, { method: 'POST' })
  await request(`/links/${b.id}/archived`, { method: 'POST' })
  const unread = await (await request('/')).text()
  assert.doesNotMatch(unread, /example\.org\/[ab]"/)
  assert.match(await (await request('/done')).text(), /example\.org\/a/)
  assert.match(await (await request('/archive')).text(), /example\.org\/b/)
})

test('saving a link again brings it back as unread', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  await request('/links', form({ url: 'https://example.org/again' }))
  const { id } = db.prepare('SELECT id FROM links').get()
  await request(`/links/${id}/read`, { method: 'POST' })
  await request('/links', form({ url: 'https://example.org/again' }))
  const link = db.prepare('SELECT * FROM links').get()
  assert.equal(link.id, id)
  assert.equal(link.read_at, null)
})
