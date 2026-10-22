SELECT l.id, l.url, coalesce(l.title, a.title, l.url) AS title, l.saved_at, l.read_at, l.archived_at,
  a.byline, a.site_name, a.text, a.word_count, a.fetched_at
FROM links l
LEFT JOIN articles a ON a.link_id = l.id
WHERE l.id = :id AND l.user_id = :user_id;
