import { html } from 'hono/html'

export const layout = (title, content) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <script src="/htmx.min.js" defer></script>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <form hx-post="/passages" hx-target="#passages" hx-swap="afterbegin" hx-on::after-request="this.reset()">
        <textarea name="body" rows="4" required placeholder="The passage"></textarea>
        <input name="source" required placeholder="Where it came from" />
        <input name="page" placeholder="Page" />
        <button type="submit">Keep it</button>
      </form>
      <input type="search" name="q" placeholder="Search" hx-get="/search" hx-trigger="input changed delay:300ms" hx-target="#passages" />
      ${content}
    </main>
  </body>
</html>`

export const passageItem = (p) => html`<li>
  <blockquote>${p.body}</blockquote>
  <p>${p.source}${p.page ? html`, p. ${p.page}` : ''}</p>
</li>`

export const passageList = (passages) => html`<ul id="passages">
  ${passages.map(passageItem)}
</ul>`
