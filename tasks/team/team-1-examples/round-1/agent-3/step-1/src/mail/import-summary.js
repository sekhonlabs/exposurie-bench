import { config } from '../config.js'
import { serviceLabel } from '../import/services.js'

export function importSummaryEmail({ service, added, duplicates, overLimit }) {
  const name = serviceLabel(service)
  const lines = [`${added} ${added === 1 ? 'link' : 'links'} came in.`]
  if (duplicates) lines.push(`${duplicates} ${duplicates === 1 ? 'was' : 'were'} already saved.`)
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

export function sendImportSummary(user, counts, { sendEmail }) {
  return sendEmail({ to: user.email, ...importSummaryEmail(counts), tag: 'import' })
}
