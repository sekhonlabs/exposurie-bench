import { ulid } from '../lib/ulid.js'
import { sql } from '../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

export const cleanTag = (name) =>
  String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 64)

export function tagLink(db, user, linkId, name) {
  const tag = query(db, 'ensure').get({ id: ulid(), user_id: user.id, name })
  query(db, 'tag-link').run({ link_id: linkId, tag_id: tag.id, user_id: user.id })
  return tag
}

export function untagLink(db, user, linkId, name) {
  query(db, 'untag-link').run({ link_id: linkId, user_id: user.id, name })
}

export const linksWithTag = (db, user, name) =>
  query(db, 'links-with-tag').all({ user_id: user.id, name })
