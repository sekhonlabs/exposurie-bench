const TIMEOUT_MS = 5000
const MAX_BYTES = 64 * 1024

export async function fetchTitle(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'text/html', 'user-agent': 'Satchel/1.0 (+read-later)' },
  })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
  const reader = res.body.getReader()
  let html = ''
  const decoder = new TextDecoder()
  while (html.length < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
    if (/<\/title>/i.test(html)) break
  }
  await reader.cancel().catch(() => {})
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() || null : null
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
