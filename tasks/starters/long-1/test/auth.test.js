import assert from 'node:assert/strict'
import { test } from 'node:test'
import { form, jobsOf, setup } from './helpers.js'

test('signing in emails a link that expires after 15 minutes', async () => {
  const { app, db } = setup()
  const res = await app.request('/sign-in', form({ email: 'reader@example.com' }))
  assert.equal(res.status, 200)
  const link = db.prepare('SELECT * FROM magic_links').get()
  assert.equal(Date.parse(link.expires_at) - Date.parse(link.created_at), 15 * 60_000)
  const [job] = jobsOf(db, 'send_magic_link')
  assert.deepEqual(job.payload, { email: 'reader@example.com', token: link.token })
})

test('a link signs in once', async () => {
  const { app, db } = setup()
  await app.request('/sign-in', form({ email: 'reader@example.com' }))
  const { token } = db.prepare('SELECT token FROM magic_links').get()
  assert.equal((await app.request(`/auth/${token}`)).status, 302)
  assert.equal((await app.request(`/auth/${token}`)).status, 410)
})

test('an expired link is refused', async () => {
  const { app, db } = setup()
  await app.request('/sign-in', form({ email: 'reader@example.com' }))
  db.prepare(`UPDATE magic_links SET expires_at = '2000-01-01T00:00:00.000Z'`).run()
  const { token } = db.prepare('SELECT token FROM magic_links').get()
  assert.equal((await app.request(`/auth/${token}`)).status, 410)
})

test('the same address signs in to the same account', async () => {
  const { app, db } = setup()
  await app.request('/sign-in', form({ email: 'reader@example.com' }))
  await app.request('/sign-in', form({ email: 'Reader@Example.com' }))
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
})

test('pages need a signed-in user', async () => {
  const { app } = setup()
  const res = await app.request('/')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/sign-in')
})
