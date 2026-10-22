UPDATE jobs
SET claimed_at = :now, attempts = attempts + 1
WHERE id = (
  SELECT id FROM jobs
  WHERE done_at IS NULL
    AND run_at <= :now
    AND (claimed_at IS NULL OR claimed_at < strftime('%Y-%m-%dT%H:%M:%fZ', :now, '-10 minutes'))
  ORDER BY run_at, id
  LIMIT 1
)
RETURNING id, kind, payload, attempts, run_at;
