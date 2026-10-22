export const magicLinkEmail = (url) => ({
  subject: 'Your Satchel sign-in link',
  text: `Sign in to Satchel:

${url}

The link works once, for 15 minutes. If you didn't ask for it, ignore this email.
`,
})
