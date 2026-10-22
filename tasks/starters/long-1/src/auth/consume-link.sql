UPDATE magic_links
SET used_at = :now
WHERE token = :token AND used_at IS NULL AND expires_at > :now
RETURNING user_id;
