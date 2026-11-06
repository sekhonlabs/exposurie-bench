import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importSummaryEmail, sendImportSummary } from '../src/mail/import-summary.js'

test('the email says what came in and what was already saved', () => {
  const { subject, text } = importSummaryEmail({ service: 'pocket', added: 12, duplicates: 3, overLimit: 0 })
  assert.equal(subject, 'Your Pocket import is done')
  assert.match(text, /12 links came in\./)
  assert.match(text, /3 were already saved\./)
  assert.doesNotMatch(text, /free plan/)
})

test('links that did not fit in the free plan are counted', () => {
  const { text } = importSummaryEmail({ service: 'pocket', added: 100, duplicates: 0, overLimit: 7 })
  assert.match(text, /7 didn't fit in the free plan's 100 links/)
})

test('an empty file sends no email', async () => {
  const sent = []
  const user = { email: 'reader@example.com' }
  await sendImportSummary(user, { service: 'pocket', added: 0, duplicates: 0, overLimit: 0 }, {
    sendEmail: async (m) => sent.push(m),
  })
  assert.equal(sent.length, 0)
})
