import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLinks, runImport } from '../src/import/run.js'
import { jobsOf, setup, signIn } from './helpers.js'

test('one of each link, and nothing that is not a link', () => {
  const text =
    'https://example.org/a\r\nnot a link\n\nhttps://example.org/a#again\nhttps://example.org/b?utm_medium=x\n'
  assert.deepEqual(parseLinks(text), ['https://example.org/a', 'https://example.org/b'])
})

test('links already saved are skipped, and every new one is fetched', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  db.prepare(`UPDATE users SET plan = 'paid' WHERE id = ?`).run(user.id)
  const fetchTitle = async (url) => `Title of ${url}`
  await runImport(db, { ...user, plan: 'paid' }, 'https://example.org/a', { fetchTitle })
  const result = await runImport(
    db,
    { ...user, plan: 'paid' },
    'https://example.org/a\nhttps://example.org/b',
    { fetchTitle },
  )
  assert.deepEqual(result, { saved: 1, duplicates: 1, overLimit: 0, untitled: 0 })
  assert.equal(jobsOf(db, 'fetch_article').length, 2)
})

test('a title that cannot be fetched leaves the address as the title', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const fetchTitle = async (url) => {
    if (url.endsWith('/down')) throw new Error('timeout')
    return 'Fine'
  }
  const result = await runImport(db, user, 'https://example.org/ok\nhttps://example.org/down', {
    fetchTitle,
  })
  assert.equal(result.untitled, 1)
  const titles = db.prepare('SELECT url, title FROM links ORDER BY url').all()
  assert.deepEqual(titles, [
    { url: 'https://example.org/down', title: 'https://example.org/down' },
    { url: 'https://example.org/ok', title: 'Fine' },
  ])
})

test('a free account is filled to 100 links, and the rest are counted', async () => {
  const { app, db } = setup()
  const { user } = await signIn(app, db)
  const text = Array.from({ length: 130 }, (_, i) => `https://example.org/${i}`).join('\n')
  const result = await runImport(db, user, text, { fetchTitle: async () => 'x' })
  assert.equal(result.saved, 100)
  assert.equal(result.overLimit, 30)
})

test('the import page answers with what happened', async () => {
  const { app, db } = setup({ fetchTitle: async () => 'A title' })
  const { request } = await signIn(app, db)
  const body = new FormData()
  body.set('links', 'https://example.org/one\nhttps://example.org/two')
  const res = await request('/import', { method: 'POST', body })
  assert.match(await res.text(), /Imported 2 links/)
})
