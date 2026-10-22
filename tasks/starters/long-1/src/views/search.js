import { html, raw } from 'hono/html'
import { escapeHtml } from '../lib/html.js'
import { hostOf } from '../lib/urls.js'

// The snippet marks its matches with control characters, so the page text can
// be escaped first and the marks put in after.
const marked = (snippet) =>
  raw(
    escapeHtml(snippet ?? '')
      .replaceAll('\x02', '<mark>')
      .replaceAll('\x03', '</mark>'),
  )

export const searchResults = (results, q) => html`<ol id="results" class="results">
  ${
    q && !results.length
      ? html`<li class="empty">Nothing saved mentions "${q}". Archived links are left out.</li>`
      : results.map(
          (r) => html`<li>
            <a href="/read/${r.id}">${r.title}</a>
            <span class="meta">${hostOf(r.url)}${r.read_at ? ' · read' : ''}</span>
            <p class="snippet">${marked(r.snippet)}</p>
          </li>`,
        )
  }
</ol>`

export const searchPage = (q, results) => html`<form class="search" action="/search" method="get">
  <input type="search" name="q" value="${q}" placeholder="Search everything you saved" autofocus
    hx-get="/search" hx-trigger="input changed delay:250ms, search" hx-target="#results"
    hx-swap="outerHTML" hx-push-url="true" />
</form>
${searchResults(results, q)}`
