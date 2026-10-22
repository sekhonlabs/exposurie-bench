import { html } from 'hono/html'

export const layout = (title, content, { user } = {}) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#B4462F" />
    <title>${title} · Satchel</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icons/satchel-192.png" />
    <link rel="stylesheet" href="/css/app.css" />
    <script src="/htmx.min.js" defer></script>
    <script type="module">
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { type: 'module' })
    </script>
  </head>
  <body>
    <header class="top">
      <a class="brand" href="/">Satchel</a>
      ${
        user
          ? html`<nav>
              <a href="/">Unread</a>
              <a href="/done">Done</a>
              <a href="/archive">Archive</a>
              <a href="/search">Search</a>
              <a href="/account">Account</a>
            </nav>`
          : ''
      }
    </header>
    <main>${content}</main>
  </body>
</html>`
