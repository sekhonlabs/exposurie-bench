INSERT INTO magic_links (token, user_id, created_at, expires_at)
VALUES (:token, :user_id, :now, :expires_at);
