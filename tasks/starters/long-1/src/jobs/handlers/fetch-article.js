import { extract } from 'pagesift'
import { sql } from '../../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024
const USER_AGENT = 'Mozilla/5.0 (compatible; Satchel/1.0; +read-later)'

async function readCapped(res) {
  const reader = res.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error(`page over ${MAX_BYTES} bytes`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const countWords = (text) => (text.match(/\S+/g) ?? []).length

export async function fetchArticle({ linkId }, { db }) {
  const link = query(db, 'link-to-fetch').get({ id: linkId })
  if (!link) return
  const res = await fetch(link.url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
  })
  if (!res.ok) throw new Error(`fetch ${res.status} ${link.url}`)
  if (!(res.headers.get('content-type') ?? '').includes('html')) return
  const page = extract(await readCapped(res), { url: res.url })
  query(db, 'save-article').run({
    link_id: link.id,
    title: page.title || null,
    byline: page.byline || null,
    site_name: page.siteName || null,
    text: page.text,
    word_count: countWords(page.text),
    now: new Date().toISOString(),
  })
  if (!link.title && page.title) query(db, 'set-title').run({ id: link.id, title: page.title })
}
