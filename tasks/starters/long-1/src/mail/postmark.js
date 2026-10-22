import { config } from '../config.js'
import { log } from '../log.js'

const API = 'https://api.postmarkapp.com/email'

export async function sendEmail({ to, subject, text, html, tag, stream = 'outbound' }) {
  if (!config.postmarkToken) {
    log.info('email not sent: no POSTMARK_TOKEN', { to, subject })
    return { skipped: true }
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-postmark-server-token': config.postmarkToken,
    },
    body: JSON.stringify({
      From: config.mailFrom,
      To: to,
      Subject: subject,
      TextBody: text,
      HtmlBody: html,
      Tag: tag,
      MessageStream: stream,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ErrorCode) {
    throw new Error(
      `postmark ${res.status} ${body.ErrorCode ?? ''}: ${body.Message ?? 'no message'}`,
    )
  }
  return { messageId: body.MessageID }
}
