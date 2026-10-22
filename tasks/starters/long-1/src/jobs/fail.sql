UPDATE jobs
SET claimed_at = NULL, last_error = :error, run_at = :run_at, done_at = :done_at
WHERE id = :id;
