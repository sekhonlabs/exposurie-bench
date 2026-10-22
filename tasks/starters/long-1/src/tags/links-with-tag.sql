SELECT l.id, l.url, coalesce(l.title, a.title, l.url) AS title, l.saved_at, l.read_at, l.archived_at,
  a.word_count,
  (SELECT group_concat(t2.name, char(31)) FROM link_tags lt2 JOIN tags t2 ON t2.id = lt2.tag_id
    WHERE lt2.link_id = l.id) AS tags
FROM tags t
JOIN link_tags lt ON lt.tag_id = t.id
JOIN links l ON l.id = lt.link_id
LEFT JOIN articles a ON a.link_id = l.id
WHERE t.user_id = :user_id AND t.name = :name
ORDER BY l.saved_at DESC
LIMIT 200;
