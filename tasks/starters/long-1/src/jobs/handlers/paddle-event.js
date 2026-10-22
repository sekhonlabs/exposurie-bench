import { sql } from '../../sql.js'

const query = (db, name) => sql(db, new URL(`./${name}.sql`, import.meta.url))

const PAID = new Set(['active', 'trialing', 'past_due'])

// Events can arrive out of order, so one older than the last applied is ignored.
export async function paddleEvent({ eventId }, { db }) {
  const event = query(db, 'webhook-event').get({ id: eventId })
  if (!event || !event.type.startsWith('subscription.')) return
  const subscription = JSON.parse(event.payload).data
  const userId = subscription.custom_data?.user_id
  const user = userId
    ? query(db, 'user-by-id').get({ id: userId })
    : query(db, 'user-by-customer').get({ customer_id: subscription.customer_id })
  if (!user) throw new Error(`no user for paddle customer ${subscription.customer_id}`)
  if (user.plan_updated_at && user.plan_updated_at >= event.occurred_at) return
  const paid = PAID.has(subscription.status)
  query(db, 'apply-subscription').run({
    id: user.id,
    plan: paid ? 'paid' : 'free',
    plan_ends_at: paid ? null : (subscription.canceled_at ?? event.occurred_at),
    customer_id: subscription.customer_id,
    subscription_id: subscription.id,
    updated_at: event.occurred_at,
  })
}
