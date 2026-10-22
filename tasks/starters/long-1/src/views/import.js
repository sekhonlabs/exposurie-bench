import { html } from 'hono/html'

export const importPage = () => html`<section class="import">
  <h1>Import</h1>
  <p>Paste links, one per line, or choose a text file of them. Links you already have are skipped.</p>
  <form hx-post="/import" hx-target="#import-result" hx-encoding="multipart/form-data"
    hx-indicator="#importing">
    <textarea name="links" rows="10" placeholder="https://…"></textarea>
    <input type="file" name="file" accept=".txt,text/plain" />
    <button type="submit">Import</button>
    <span id="importing" class="htmx-indicator">Importing…</span>
  </form>
  <div id="import-result"></div>
</section>`

export const importResult = ({ saved, duplicates, overLimit, untitled }) => html`<p class="notice">
  Imported ${saved} ${saved === 1 ? 'link' : 'links'}.
  ${duplicates ? html`${duplicates} you already had.` : ''}
  ${untitled ? html`${untitled} kept their address as the title.` : ''}
  ${overLimit ? html`${overLimit} left out: the free plan keeps 100 links. <a href="/upgrade">Upgrade</a>.` : ''}
</p>`
