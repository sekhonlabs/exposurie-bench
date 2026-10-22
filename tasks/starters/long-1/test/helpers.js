import { createApp } from '../src/app.js'
import { openDatabase } from '../src/db.js'

export function setup({ fetchTitle = async () => null } = {}) {
  const db = openDatabase(':memory:')
  return { db, app: createApp({ db, fetchTitle }) }
}

export async function signIn(app, db, email = 'reader@example.com') {
  await app.request('/sign-in', form({ email }))
  const { token } = db.prepare('SELECT token FROM magic_links ORDER BY rowid DESC LIMIT 1').get()
  const res = await app.request(`/auth/${token}`)
  const cookie = res.headers.get('set-cookie').split(';')[0]
  const request = (path, init = {}) =>
    app.request(path, { ...init, headers: { ...init.headers, cookie } })
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  return { request, user }
}

export const form = (fields) => ({ method: 'POST', body: new URLSearchParams(fields) })

export const jobsOf = (db, kind) =>
  db
    .prepare('SELECT * FROM jobs WHERE kind = ? ORDER BY run_at, id')
    .all(kind)
    .map((job) => ({ ...job, payload: JSON.parse(job.payload) }))
