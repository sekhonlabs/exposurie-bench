import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldCache } from '../public/sw-cache.js'

test('reading pages, the API and the pages themselves are never cached', () => {
  assert.equal(shouldCache('/read/01J9ZK3M4Q8V7T6R5W2X1Y0Z9A'), false)
  assert.equal(shouldCache('/api/links'), false)
  assert.equal(shouldCache('/'), false)
  assert.equal(shouldCache('/search?q=x'), false)
})

test('static files are', () => {
  assert.equal(shouldCache('/css/app.css'), true)
  assert.equal(shouldCache('/icons/satchel-192.png'), true)
  assert.equal(shouldCache('/htmx.min.js'), true)
})
