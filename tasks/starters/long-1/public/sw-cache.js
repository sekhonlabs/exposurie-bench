const STATIC = /^\/(?:css|icons)\/|^\/htmx\.min\.js$|^\/manifest\.webmanifest$/

export function shouldCache(url) {
  const { pathname } = new URL(url, 'https://satchel.invalid')
  if (pathname.startsWith('/read/') || pathname.startsWith('/api/')) return false
  return STATIC.test(pathname)
}
