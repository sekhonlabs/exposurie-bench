import { html } from 'hono/html'
import { listServices } from '../import/services.js'

export const importPage = (services = listServices()) => html`<section class="import">
  <h1>Import</h1>
  <p>Bring your links over from another read-later service: choose it, then its export file.
    A file import runs in the background, and we email you when it's done.</p>
  <form hx-post="/import" hx-target="#import-result" hx-encoding="multipart/form-data"
    hx-indicator="#importing">
    <label>Service
      <select name="service">
        ${services.map((s) => html`<option value="${s.id}">${s.label}</option>`)}
      </select>
    </label>
    <input type="file" name="file" accept=".csv,.json,text/csv,application/json" />
    <button type="submit">Import</button>
  </form>
  <h2>Or paste links</h2>
  <p>Paste links, one per line, or choose a text file of them. Links you already have are skipped.</p>
  <form hx-post="/import" hx-target="#import-result" hx-encoding="multipart/form-data"
    hx-indicator="#importing">
    <textarea name="links" rows="10" placeholder="https://…"></textarea>
    <input type="file" name="file" accept=".txt,text/plain" />
    <button type="submit">Import</button>
  </form>
  <span id="importing" class="htmx-indicator">Importing…</span>
  <div id="import-result"></div>
</section>`

export const importResult = ({ saved, duplicates, overLimit, untitled }) => html`<p class="notice">
  Imported ${saved} ${saved === 1 ? 'link' : 'links'}.
  ${duplicates ? html`${duplicates} you already had.` : ''}
  ${untitled ? html`${untitled} kept their address as the title.` : ''}
  ${overLimit ? html`${overLimit} left out: the free plan keeps 100 links. <a href="/upgrade">Upgrade</a>.` : ''}
</p>`
