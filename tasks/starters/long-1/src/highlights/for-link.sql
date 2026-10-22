SELECT id, link_id, text, note, created_at
FROM highlights
WHERE link_id = :link_id AND user_id = :user_id
ORDER BY created_at;
