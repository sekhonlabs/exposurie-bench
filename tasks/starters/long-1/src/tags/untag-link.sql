DELETE FROM link_tags
WHERE link_id = :link_id
  AND tag_id = (SELECT id FROM tags WHERE user_id = :user_id AND name = :name);
