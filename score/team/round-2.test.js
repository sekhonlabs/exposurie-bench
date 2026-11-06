// Round 2's merged work (part 13), one test per decision round 1 was told for
// it, each named by the decision's ID so score/team.mjs can read it off. Both
// exports are the developer's own, as tasks/team/team-1.mjs writes them, and
// data/expect.json says what each holds.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allTags, count, data, expect, highlights, link, runImport, satchel, tagsOf, textOf } from './helpers.js'

const instapaper = data('instapaper-export.csv')
const omnivore = data('omnivore-export.json')
const I = expect.instapaper
const O = expect.omnivore

/** The texts a reader should have found: Instapaper's Selections and Omnivore's quotes. */
const selections = () => I.selections
const quotes = () => JSON.parse(omnivore).flatMap((item) => item.highlights.map((h) => h.quote))

test('K4 instapaper: folders become folder:<name> tags, except Unread and Archive', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  assert.equal(count(s.db, 'links'), I.links)
  const tags = allTags(s.db)
  for (const [tag, n] of Object.entries(I.folder_tags)) {
    assert.ok(tags.includes(tag), `${tag} is a tag`)
    const on = s.db
      .prepare('SELECT count(*) AS n FROM link_tags lt JOIN tags t ON t.id = lt.tag_id WHERE t.name = ?')
      .get(tag).n
    assert.equal(on, n, `${tag} is on ${n} links`)
  }
  for (const tag of I.never_tags) assert.ok(!tags.includes(tag), `${tag} is not a tag`)
  for (const name of ['Unread', 'Archive']) assert.ok(!tags.includes(name), `${name} is not a tag either`)
})

test('K4 instapaper: Archive means archived and read, and Unread neither', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  for (const url of I.archived_and_read) {
    const l = link(s.db, url)
    assert.ok(l?.archived_at && l?.read_at, `${url} is archived and read`)
  }
  for (const url of I.unread) {
    const l = link(s.db, url)
    assert.ok(l && !l.archived_at && !l.read_at, `${url} is neither`)
  }
})

test('K5 omnivore: an item read 90% or more counts as read, archived or not', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  assert.equal(count(s.db, 'links'), O.links)
  for (const url of O.read) assert.ok(link(s.db, url)?.read_at, `${url} is read`)
  for (const url of O.unread) assert.ok(!link(s.db, url)?.read_at, `${url} is not read`)
})

test("K1 instapaper: its Selections reach the database as highlights", async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  const texts = highlights(s.db).map((h) => h.text)
  assert.equal(texts.length, I.highlights, `${I.highlights} highlights`)
  for (const t of selections()) assert.ok(texts.includes(t), `"${t}" is a highlight`)
})

test('K1 omnivore: its highlights reach the database, with their notes', async () => {
  const s = await satchel()
  await runImport(s, 'omnivore', omnivore)
  const rows = highlights(s.db)
  assert.equal(rows.length, O.highlights, `${O.highlights} highlights`)
  for (const q of quotes()) assert.ok(rows.some((h) => h.text === q), `"${q}" is a highlight`)
  assert.equal(rows.filter((h) => h.note).length, O.notes, `${O.notes} of them have a note`)
})

test('K2: imported highlights have source import', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  await runImport(s, 'omnivore', omnivore)
  const rows = highlights(s.db)
  assert.ok(rows.length > 0, 'some highlights came in')
  for (const h of rows) assert.equal(h.source, 'import', `"${h.text}" has source import`)
})

test('K3: an export run again adds no highlight twice', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  const before = count(s.db, 'highlights')
  assert.ok(before > 0, 'some highlights came in')
  await runImport(s, 'instapaper', instapaper)
  assert.equal(count(s.db, 'highlights'), before)
})

test('K3: a newer export adds its new highlights, on links already saved too', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  const before = count(s.db, 'highlights')
  assert.ok(before > 0, 'some highlights came in')
  const [header, first, ...rest] = instapaper.split('\n')
  const newer = [header, first.replace(',,Long reads,', `,${I.newer_selection},Long reads,`), ...rest].join('\n')
  await runImport(s, 'instapaper', newer)
  assert.equal(count(s.db, 'highlights'), before + 1)
  const twice = s.db.prepare('SELECT count(*) AS n FROM (SELECT link_id, text FROM highlights GROUP BY link_id, text HAVING count(*) > 1)').get().n
  assert.equal(twice, 0, 'no highlight is there twice')
})

test('K6: the summary email says how many highlights came in', async () => {
  const s = await satchel()
  const { sent } = await runImport(s, 'instapaper', instapaper)
  const n = I.highlights
  assert.match(textOf(sent), new RegExp(`\\b${n}\\b[^\\n]*highlight|highlight[^\\n]*\\b${n}\\b`, 'i'))
})

test('round-2 tags: Instapaper keeps its own tags', async () => {
  const s = await satchel()
  await runImport(s, 'instapaper', instapaper)
  assert.ok(tagsOf(s.db, 'https://example.com/recipes/miso-butter-corn').includes('summer'))
})
