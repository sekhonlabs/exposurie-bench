import { config } from '../config.js'
import { serviceLabel } from '../import/services.js'

export function importSummaryEmail({ service, added, duplicates, overLimit, highlights = 0 }) {
  const name = serviceLabel(service)
  const lines = [`${added} ${added === 1 ? 'link' : 'links'} came in.`]
  if (duplicates) lines.push(`${duplicates} ${duplicates === 1 ? 'was' : 'were'} already saved.`)
  if (highlights) lines.push(`${highlights} ${highlights === 1 ? 'highlight' : 'highlights'} came in with them.`)
  if (overLimit) {
    lines.push(
      `${overLimit} didn't fit in the free plan's 100 links. Upgrade to bring them in: ${config.baseUrl}/upgrade`,
    )
  }
  return {
    subject: `Your ${name} import is done`,
    text: `Your ${name} import is done.\n\n${lines.join('\n')}\n`,
  }
}

// An import that added nothing and found nothing already saved was an empty
// file, and sends no email.
export async function sendImportSummary(user, counts, { sendEmail }) {
  if (!counts.added && !counts.duplicates) return { skipped: true }
  return sendEmail({ to: user.email, ...importSummaryEmail(counts), tag: 'import' })
}
