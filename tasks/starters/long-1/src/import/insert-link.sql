INSERT INTO links (id, user_id, url, title, saved_at)
VALUES (:id, :user_id, :url, :title, :now)
ON CONFLICT (user_id, url) DO NOTHING
RETURNING id;
