import { html } from 'hono/html'
import { hostOf } from '../lib/urls.js'

export const highlightItem = (h) => html`<li class="highlight" id="highlight-${h.id}">
  <blockquote>${h.text}</blockquote>
  ${h.note ? html`<p class="note">${h.note}</p>` : ''}
  <button hx-delete="/highlights/${h.id}" hx-target="#highlight-${h.id}" hx-swap="delete">Remove</button>
</li>`

const body = (article) => {
  if (article.text == null) return html`<p class="empty">Satchel hasn't fetched this page yet.</p>`
  if (!article.text.trim()) {
    return html`<p class="empty">Satchel couldn't find the article on this page. <a href="${article.url}">Read it on the site</a>.</p>`
  }
  return article.text.split(/\n{2,}/).map((p) => html`<p>${p}</p>`)
}

export const readerPage = (article, highlights) => html`<article class="reader">
  <header>
    <h1>${article.title}</h1>
    <p class="meta">
      ${article.byline ? html`${article.byline} · ` : ''}<a href="${article.url}">${article.site_name ?? hostOf(article.url)}</a>
    </p>
  </header>
  <div class="text">${body(article)}</div>
  <section class="highlights">
    <h2>Highlights</h2>
    <ul id="highlights">${highlights.map(highlightItem)}</ul>
    <form hx-post="/read/${article.id}/highlights" hx-target="#highlights" hx-swap="beforeend"
      hx-on::after-request="if (event.detail.successful) this.reset()">
      <textarea name="text" rows="3" required placeholder="Paste the passage"></textarea>
      <input name="note" placeholder="A note, if you like" />
      <button type="submit">Keep it</button>
    </form>
  </section>
  <footer class="actions">
    <button hx-post="/links/${article.id}/read" hx-on::after-request="location.href = '/'">Done</button>
    <button hx-post="/links/${article.id}/archived" hx-on::after-request="location.href = '/'">Archive</button>
  </footer>
</article>`
