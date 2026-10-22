INSERT INTO highlights (id, link_id, user_id, text, note, created_at)
SELECT :id, l.id, l.user_id, :text, :note, :now
FROM links l
WHERE l.id = :link_id AND l.user_id = :user_id
RETURNING id, link_id, text, note, created_at;
