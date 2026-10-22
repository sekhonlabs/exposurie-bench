import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export const FREE_LINKS = 100

export const isPaid = (user, now = new Date()) =>
  user.plan === 'paid' && (!user.plan_ends_at || user.plan_ends_at > now.toISOString())

export const countLinks = (db, user) => query(db, 'count-links').get({ user_id: user.id }).n

export const canSaveMore = (db, user) => isPaid(user) || countLinks(db, user) < FREE_LINKS

export const roomLeft = (db, user) =>
  isPaid(user) ? Number.POSITIVE_INFINITY : Math.max(0, FREE_LINKS - countLinks(db, user))
