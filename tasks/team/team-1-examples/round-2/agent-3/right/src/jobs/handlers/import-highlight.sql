INSERT INTO highlights (id, link_id, user_id, text, note, created_at, source)
SELECT :id, :link_id, :user_id, :text, :note, :created_at, 'import'
WHERE NOT EXISTS (SELECT 1 FROM highlights WHERE link_id = :link_id AND text = :text)
RETURNING id;
