import { html } from 'hono/html'

export const signInPage = ({ email = '', error = null } = {}) => html`<section class="sign-in">
  <h1>Sign in to Satchel</h1>
  <p>Satchel emails you a link. No password, ever.</p>
  ${error ? html`<p class="notice">${error}</p>` : ''}
  <form method="post" action="/sign-in">
    <input type="email" name="email" value="${email}" required autofocus placeholder="you@example.com" />
    <button type="submit">Email me a link</button>
  </form>
</section>`

export const checkYourEmail = (email) => html`<section class="sign-in">
  <h1>Check your email</h1>
  <p>A sign-in link is on its way to ${email}. It works once, for 15 minutes.</p>
</section>`

export const linkExpired = () => html`<section class="sign-in">
  <h1>That link has expired</h1>
  <p>Sign-in links work once, for 15 minutes. <a href="/sign-in">Get a new one</a>.</p>
</section>`
