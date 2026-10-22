SELECT l.id, l.url, coalesce(l.title, a.title, l.url) AS title, l.saved_at, l.read_at, l.archived_at,
  a.word_count,
  (SELECT group_concat(t.name, char(31)) FROM link_tags lt JOIN tags t ON t.id = lt.tag_id
    WHERE lt.link_id = l.id) AS tags
FROM links l
LEFT JOIN articles a ON a.link_id = l.id
WHERE l.user_id = :user_id
  AND CASE :view
    WHEN 'unread' THEN l.read_at IS NULL AND l.archived_at IS NULL
    WHEN 'read' THEN l.read_at IS NOT NULL AND l.archived_at IS NULL
    WHEN 'archived' THEN l.archived_at IS NOT NULL
  END
ORDER BY l.saved_at DESC
LIMIT :limit OFFSET :offset;
