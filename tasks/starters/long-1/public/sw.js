import { shouldCache } from './sw-cache.js'

const CACHE = 'satchel-static-v3'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !shouldCache(event.request.url)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request)
      const fresh = fetch(event.request).then((res) => {
        if (res.ok) cache.put(event.request, res.clone())
        return res
      })
      return hit ?? fresh
    }),
  )
})
