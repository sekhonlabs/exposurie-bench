import { randomBytes } from 'node:crypto'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { config } from '../config.js'
import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const COOKIE = 'satchel_session'
const SESSION_DAYS = 60

export function currentUser(db) {
  return async (c, next) => {
    const id = await getSignedCookie(c, config.sessionSecret, COOKIE)
    const user = id ? query(db, 'find-session').get({ id, now: new Date().toISOString() }) : null
    c.set('user', user ?? null)
    await next()
  }
}

export async function requireUser(c, next) {
  if (!c.get('user')) {
    if (c.req.header('hx-request')) {
      c.header('hx-redirect', '/sign-in')
      return c.body(null, 401)
    }
    return c.redirect('/sign-in')
  }
  await next()
}

export async function startSession(c, db, userId) {
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000)
  const id = randomBytes(24).toString('base64url')
  query(db, 'create-session').run({
    id,
    user_id: userId,
    now: now.toISOString(),
    expires_at: expires.toISOString(),
  })
  await setSignedCookie(c, COOKIE, id, config.sessionSecret, {
    httpOnly: true,
    secure: config.baseUrl.startsWith('https:'),
    sameSite: 'Lax',
    path: '/',
    expires,
  })
}

export async function endSession(c, db) {
  const id = await getSignedCookie(c, config.sessionSecret, COOKIE)
  if (id) query(db, 'delete-session').run({ id })
  deleteCookie(c, COOKIE, { path: '/' })
}
