// Part 13's hand read: what the hidden tests could not show, driven through
// the same contract and helpers. The hidden K5 test also expects an archived
// item read 40% to count as read, which K5 as told does not say, and stopped
// there; these test K5 as told. The hidden K3 and K6 tests use Instapaper's
// export, so where Instapaper's reader brings no highlights they cannot reach
// agent 3's code; these run them on Omnivore's export instead.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, data, expect, highlights, link, runImport, satchel, textOf } from './helpers.js'

const omnivore = data('omnivore-export.json')
const O = expect.omnivore
const items = JSON.parse(omnivore)
const atLeast90 = items.filter((i) => i.readingProgress >= 90).map((i) => i.url)
const openBelow90 = items.filter((i) => i.readingProgress < 90 && i.state !== 'Archived').map((i) => i.url)
const archivedBelow90 = items.filter((i) => i.readingProgress < 90 && i.state === 'Archived').map((i) => i.url)

test('HAND K5a: every Omnivore item read 90% or more is read', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  for (const url of atLeast90) assert.ok(link(s.db, url)?.read_at, `${url} is read`)
})

test('HAND K5b: no Omnivore item under 90% that is not archived is read', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  for (const url of openBelow90) assert.ok(!link(s.db, url)?.read_at, `${url} is not read`)
})

test('HAND info: archived Omnivore items under 90%', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  for (const url of archivedBelow90) {
    const l = link(s.db, url)
    console.log(`HAND-INFO ${url}: archived ${Boolean(l?.archived_at)}, read ${Boolean(l?.read_at)}`)
  }
})

test('HAND K3a omnivore: an export run again adds no highlight twice', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  const before = count(s.db, 'highlights')
  assert.ok(before > 0, 'some highlights came in')
  await runImport(s, 'omnivore', omnivore)
  assert.equal(count(s.db, 'highlights'), before)
})

test('HAND K3b omnivore: a newer export adds its new highlights, on links already saved too', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  const before = count(s.db, 'highlights')
  assert.ok(before > 0, 'some highlights came in')
  const newer = JSON.parse(omnivore)
  const item = newer.find((i) => i.highlights.length > 0)
  item.highlights.push({ ...item.highlights[0], id: 'hand-newer-1', quote: 'A newer highlight, made after the first export.', annotation: null })
  await runImport(s, 'omnivore', JSON.stringify(newer, null, 2))
  assert.equal(count(s.db, 'highlights'), before + 1)
  const twice = s.db.prepare('SELECT count(*) AS n FROM (SELECT link_id, text FROM highlights GROUP BY link_id, text HAVING count(*) > 1)').get().n
  assert.equal(twice, 0, 'no highlight is there twice')
})

test('HAND K6 omnivore: the summary email says how many highlights came in', async () => {
  const s = await satchel()
  const { sent } = await runImport(s, 'omnivore', omnivore)
  const n = O.highlights
  console.log(`HAND-INFO email: ${JSON.stringify(textOf(sent))}`)
  assert.match(textOf(sent), new RegExp(`\\b${n}\\b[^\\n]*highlight|highlight[^\\n]*\\b${n}\\b`, 'i'))
})

test('HAND K2 omnivore: its highlights have source import', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  const rows = highlights(s.db)
  assert.ok(rows.length > 0, 'some highlights came in')
  for (const h of rows) assert.equal(h.source, 'import', `"${h.text}" has source import`)
})
