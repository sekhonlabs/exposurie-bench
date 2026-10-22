SELECT u.id, u.email
FROM users u
WHERE u.digest = 1
  AND EXISTS (
    SELECT 1 FROM links l
    WHERE l.user_id = u.id AND l.saved_at >= :since AND l.read_at IS NULL AND l.archived_at IS NULL
  );
