import { html, raw } from 'hono/html'

// Values inside a script are JSON, never HTML-escaped, and can't close the tag.
const js = (value) => raw(JSON.stringify(value).replaceAll('<', '\\u003c'))

export const upgradePage = ({ user, paddle }) => html`<section class="upgrade">
  <h1>Keep everything</h1>
  <p>The free plan keeps 100 links. Satchel is $4 a month for as many as you like, with search and the weekly digest.</p>
  <button id="checkout" type="button">Upgrade for $4 a month</button>
  <p class="meta">Payments by Paddle, who also handle VAT.</p>
  <div id="confirming" hidden hx-get="/billing/status" hx-trigger="every 2s [!this.hidden]" hx-swap="innerHTML">
    Confirming your payment…
  </div>
  <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
  <script>
    if (${js(paddle.env)} !== 'production') Paddle.Environment.set('sandbox')
    Paddle.Initialize({
      token: ${js(paddle.clientToken)},
      eventCallback: (e) => {
        if (e.name === 'checkout.completed') document.getElementById('confirming').hidden = false
      },
    })
    document.getElementById('checkout').addEventListener('click', () =>
      Paddle.Checkout.open({
        items: [{ priceId: ${js(paddle.priceId)}, quantity: 1 }],
        customer: { email: ${js(user.email)} },
        customData: { user_id: ${js(user.id)} },
      }),
    )
  </script>
</section>`

export const paymentStatus = (paid) =>
  paid
    ? html`<p>Payment confirmed. <a href="/">Back to your links</a>.</p>`
    : html`Confirming your payment…`
