INSERT INTO links (id, user_id, url, title, saved_at)
VALUES (:id, :user_id, :url, :title, :now)
ON CONFLICT (user_id, url) DO UPDATE SET
  saved_at = excluded.saved_at,
  title = coalesce(excluded.title, links.title),
  read_at = NULL,
  archived_at = NULL
RETURNING id, url, title, saved_at,
  EXISTS (SELECT 1 FROM articles a WHERE a.link_id = links.id) AS fetched;
