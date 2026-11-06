// A small CSV reader, with no dependency: RFC 4180 quoting, a byte order mark,
// and either line ending. A quoted field may hold commas, line breaks and
// doubled quotes.
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (s[i + 1] === '"') {
        field += '"'
        i += 1
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

// The rows after the header, as objects keyed by the header's names.
export function readCsv(text) {
  const [header = [], ...rows] = parseCsv(text)
  return rows.map((r) => Object.fromEntries(header.map((name, i) => [name.trim(), r[i] ?? ''])))
}
