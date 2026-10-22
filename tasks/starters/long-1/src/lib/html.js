const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ESCAPES[ch])
