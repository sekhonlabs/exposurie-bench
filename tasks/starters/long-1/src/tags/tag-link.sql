INSERT INTO link_tags (link_id, tag_id)
SELECT l.id, :tag_id FROM links l WHERE l.id = :link_id AND l.user_id = :user_id
ON CONFLICT DO NOTHING;
