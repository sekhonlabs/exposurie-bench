SELECT p.id, p.body, p.source, p.page, p.created_at
FROM passages_fts f
JOIN passages p ON p.rowid = f.rowid
WHERE passages_fts MATCH :terms
ORDER BY rank
LIMIT 50;
