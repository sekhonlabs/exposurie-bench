import { config } from '../config.js'

const base = () =>
  config.paddle.env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'

async function paddle(path, body) {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.paddle.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`paddle ${path}: ${res.status} ${json.error?.code ?? ''}`)
  return json.data
}

export async function portalUrl(user) {
  if (!user.paddle_customer_id) return null
  const session = await paddle(`/customers/${user.paddle_customer_id}/portal-sessions`)
  return session.urls.general.overview
}
