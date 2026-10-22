import { html } from 'hono/html'

const plan = ({ paid, links, freeLinks }) =>
  paid
    ? html`<p>Satchel, $4 a month. Thank you.</p>
        <form method="post" action="/billing/portal"><button type="submit">Manage billing</button></form>`
    : html`<p>Free plan: ${links} of ${freeLinks} links.</p>
        <p><a href="/upgrade">Upgrade for $4 a month</a> to keep everything you save.</p>`

export const accountPage = ({ user, links, paid, freeLinks }) => html`<section class="account">
  <h1>Account</h1>
  <p>Signed in as ${user.email}.</p>
  ${plan({ paid, links, freeLinks })}
  <h2>Weekly digest</h2>
  <form method="post" action="/account/digest">
    <label><input type="checkbox" name="digest" ${user.digest ? 'checked' : ''} /> Email me on Saturday mornings with what I saved that week and haven't read.</label>
    <button type="submit">Save</button>
  </form>
  <h2>Import</h2>
  <p><a href="/import">Bring in a list of links</a>, one per line.</p>
  <form method="post" action="/sign-out"><button type="submit">Sign out</button></form>
</section>`
