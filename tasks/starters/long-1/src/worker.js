import { setTimeout as sleep } from 'node:timers/promises'
import { openDatabase } from './db.js'
import { handlers } from './jobs/handlers/index.js'
import { claimNext, complete, retryOrGiveUp } from './jobs/queue.js'
import { log } from './log.js'
import { sendEmail } from './mail/postmark.js'

const POLL_MS = 5000

const db = openDatabase()
let stopping = false
process.on('SIGTERM', () => {
  stopping = true
})

log.info('worker started', { poll_ms: POLL_MS })
while (!stopping) {
  const job = claimNext(db)
  if (!job) {
    await sleep(POLL_MS)
    continue
  }
  const started = performance.now()
  log.info('job claimed', { id: job.id, kind: job.kind, attempts: job.attempts })
  try {
    const handler = handlers[job.kind]
    if (!handler) throw new Error(`no handler for job kind ${job.kind}`)
    await handler(job.payload, { db, sendEmail, job })
    complete(db, job.id)
    log.info('job done', {
      id: job.id,
      kind: job.kind,
      ms: Math.round(performance.now() - started),
    })
  } catch (error) {
    const gaveUp = retryOrGiveUp(db, job, error)
    log.error('job failed', {
      id: job.id,
      kind: job.kind,
      attempts: job.attempts,
      gave_up: gaveUp,
      error,
    })
  }
}
db.close()
log.info('worker stopped')
