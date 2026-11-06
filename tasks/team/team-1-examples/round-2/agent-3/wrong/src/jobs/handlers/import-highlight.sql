INSERT INTO highlights (id, link_id, user_id, text, note, created_at, source)
VALUES (:id, :link_id, :user_id, :text, :note, :created_at, :source)
RETURNING id;
