INSERT INTO links (id, user_id, url, title, saved_at, read_at, archived_at)
VALUES (:id, :user_id, :url, :title, :saved_at, :read_at, :archived_at)
ON CONFLICT (user_id, url) DO NOTHING
RETURNING id;
