import { log } from '../../log.js'
import { renderDigest } from '../../mail/digest.js'
import { sql } from '../../sql.js'
import { complete, enqueue } from '../queue.js'
import { nextDigestTime } from '../schedule.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const PER_USER = 10

// The next digest is scheduled only after this one has gone out, in the same
// transaction that marks it done: a retry must never leave two pending.
export async function weeklyDigest(_payload, { db, sendEmail, job }) {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const users = query(db, 'digest-users').all({ since })
  let sent = 0
  for (const user of users) {
    const links = query(db, 'digest-links').all({ user_id: user.id, since, limit: PER_USER })
    const email = renderDigest({ user, links })
    try {
      await sendEmail({ to: user.email, ...email, tag: 'digest', stream: 'broadcast' })
      sent += 1
    } catch (error) {
      log.error('digest not sent', { user: user.id, error })
    }
  }
  db.transaction(() => {
    enqueue(db, 'weekly_digest', {}, { runAt: nextDigestTime(new Date()) })
    complete(db, job.id)
  })()
  log.info('digest sent', { users: users.length, sent })
}
