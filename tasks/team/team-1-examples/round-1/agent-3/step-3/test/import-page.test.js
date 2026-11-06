import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listServices } from '../src/import/services.js'
import { setup, signIn } from './helpers.js'

test('the page offers a service for each reader', async () => {
  const { app, db } = setup()
  const { request } = await signIn(app, db)
  const page = await (await request('/import')).text()
  for (const { id, label } of listServices()) assert.match(page, new RegExp(`value="${id}">${label}<`))
  assert.match(page, /email you when it's done/)
})
