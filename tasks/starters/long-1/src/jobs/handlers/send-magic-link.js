import { config } from '../../config.js'
import { magicLinkEmail } from '../../mail/magic-link.js'

export async function sendMagicLink({ email, token }, { sendEmail }) {
  const { subject, text } = magicLinkEmail(`${config.baseUrl}/auth/${token}`)
  await sendEmail({ to: email, subject, text, tag: 'magic-link' })
}
