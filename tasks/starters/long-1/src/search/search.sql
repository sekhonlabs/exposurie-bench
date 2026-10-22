SELECT l.id, l.url, coalesce(l.title, a.title, l.url) AS title, l.saved_at, l.read_at,
  snippet(articles_fts, 1, char(2), char(3), '…', 16) AS snippet
FROM articles_fts
JOIN articles a ON a.rowid = articles_fts.rowid
JOIN links l ON l.id = a.link_id
WHERE articles_fts MATCH :terms
  AND l.user_id = :user_id
  AND l.archived_at IS NULL
ORDER BY bm25(articles_fts, 10.0, 1.0)
LIMIT 50;
