INSERT INTO tags (id, user_id, name)
VALUES (:id, :user_id, :name)
ON CONFLICT (user_id, name) DO UPDATE SET name = tags.name
RETURNING id, name;
