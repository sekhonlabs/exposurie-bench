SELECT l.id, l.url, coalesce(l.title, a.title, l.url) AS title, a.site_name, a.word_count
FROM links l
LEFT JOIN articles a ON a.link_id = l.id
WHERE l.user_id = :user_id AND l.saved_at >= :since AND l.read_at IS NULL AND l.archived_at IS NULL
ORDER BY l.saved_at DESC
LIMIT :limit;
