UPDATE links
SET read_at = CASE :state WHEN 'read' THEN :now WHEN 'unread' THEN NULL ELSE read_at END,
  archived_at = CASE :state WHEN 'archived' THEN :now WHEN 'unread' THEN NULL ELSE archived_at END
WHERE id = :id AND user_id = :user_id
RETURNING id;
