import { html } from 'hono/html'
import { hostOf } from '../lib/urls.js'

const TAG_SEPARATOR = '\x1f'
const day = (iso) => iso.slice(0, 10)
const minutes = (words) =>
  words ? html`<span class="meta">${Math.max(1, Math.round(words / 230))} min</span>` : ''

export const tagChip = (linkId, name) =>
  html`<a class="tag" href="/tags/${encodeURIComponent(name)}" data-link="${linkId}">${name}</a>`

export const linkItem = (link) => html`<li class="link" id="link-${link.id}">
  <a class="title" href="/read/${link.id}">${link.title ?? link.url}</a>
  <span class="meta">${hostOf(link.url)} · ${day(link.saved_at)}</span>
  ${minutes(link.word_count)}
  <span class="tags">${(link.tags ? link.tags.split(TAG_SEPARATOR) : []).map((t) => tagChip(link.id, t))}</span>
  <span class="actions">
    ${link.read_at ? '' : html`<button hx-post="/links/${link.id}/read" hx-target="#link-${link.id}" hx-swap="delete">Done</button>`}
    ${link.archived_at ? '' : html`<button hx-post="/links/${link.id}/archived" hx-target="#link-${link.id}" hx-swap="delete">Archive</button>`}
    <button hx-delete="/links/${link.id}" hx-target="#link-${link.id}" hx-swap="delete" hx-confirm="Delete this link?">Delete</button>
  </span>
</li>`

const saveForm =
  () => html`<form class="save" hx-post="/links" hx-target="#links" hx-swap="afterbegin"
  hx-on::after-request="if (event.detail.successful) this.reset()">
  <input type="url" name="url" required placeholder="Paste a link to save" />
  <button type="submit">Save</button>
</form>
<div id="save-error"></div>`

const empty = {
  unread: 'Nothing waiting. Save a link above, or bring in a list from the import page.',
  read: 'Links you finish show up here.',
  archived: 'Links you archive leave search and show up here.',
  tag: 'No links with this tag.',
}

export const linksPage = ({ view, tag, links, page, more }) => html`
  ${view === 'unread' ? saveForm() : ''}
  ${view === 'tag' ? html`<h1>Tagged ${tag}</h1>` : ''}
  ${links.length ? '' : html`<p class="empty">${empty[view]}</p>`}
  <ul id="links" class="links">
    ${links.map(linkItem)}
  </ul>
  ${more ? html`<a class="more" href="?page=${page + 1}">Older</a>` : ''}`

export const overLimit = () => html`<p class="notice" id="save-error" hx-swap-oob="true">
  The free plan keeps 100 links. <a href="/upgrade">Upgrade for $4 a month</a> to keep saving.
</p>`
