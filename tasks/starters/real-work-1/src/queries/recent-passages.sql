SELECT id, body, source, page, created_at
FROM passages
ORDER BY id DESC
LIMIT :limit;
