import { config } from '../config.js'
import { escapeHtml } from '../lib/html.js'
import { hostOf } from '../lib/urls.js'

const ACCENT = '#B4462F'

const minutes = (words) => (words ? `${Math.max(1, Math.round(words / 230))} min` : '')

export function renderDigest({ links }) {
  const subject =
    links.length === 1 ? 'One link waiting in Satchel' : `${links.length} links waiting in Satchel`
  const text = [
    'Saved this week and still unread:',
    '',
    ...links.map((l) => `- ${l.title}\n  ${config.baseUrl}/read/${l.id}`),
    '',
    'The digest goes out on Saturdays. Turn it off on your account page.',
  ].join('\n')
  const html = `<div style="max-width:560px;margin:0 auto;font-family:Georgia,serif;color:#2b2b2b">
<h1 style="font-size:20px;border-bottom:2px solid ${ACCENT};padding-bottom:8px">Saved this week</h1>
${links
  .map(
    (
      l,
    ) => `<p style="margin:16px 0"><a style="color:${ACCENT}" href="${config.baseUrl}/read/${l.id}">${escapeHtml(l.title)}</a><br>
<span style="color:#6b6b6b;font-size:13px">${escapeHtml(l.site_name ?? hostOf(l.url))} ${minutes(l.word_count)}</span></p>`,
  )
  .join('\n')}
<p style="color:#6b6b6b;font-size:12px">The digest goes out on Saturdays. <a style="color:#6b6b6b" href="${config.baseUrl}/account">Turn it off</a>.</p>
</div>`
  return { subject, text, html }
}
