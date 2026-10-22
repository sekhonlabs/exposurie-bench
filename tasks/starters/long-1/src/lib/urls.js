const TRACKING = /^(?:utm_\w+|fbclid|gclid|mc_cid|mc_eid)$/

export function normalizeUrl(input) {
  let url
  try {
    url = new URL(String(input ?? '').trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
