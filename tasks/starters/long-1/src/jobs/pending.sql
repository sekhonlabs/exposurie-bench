SELECT id, run_at FROM jobs WHERE kind = :kind AND done_at IS NULL ORDER BY run_at LIMIT 1;
